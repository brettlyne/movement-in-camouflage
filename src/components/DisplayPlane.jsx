import { useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { vertexShader, fragmentShader, updateStateVertexShader, updateStateFragmentShader, updateAccumulationFragmentShader } from '../shaders/displayShader'

/** Fixed inversion / random-state update rate (Hz). */
const TOGGLE_FREQUENCY_HZ = 30

/** uBackgroundMode in display shader: noise=0, black=1, camouflage=2, lines=3 */
function backgroundToUniform(background) {
  if (background === 'black') return 1.0
  if (background === 'camouflage') return 2.0
  if (background === 'lines') return 3.0
  return 0.0
}

/** Vertical stripe width (px) for lines background vs Pixel Size control. */
function lineStripeWidthPx(pixelSize) {
  const ps = Math.max(1, pixelSize | 0)
  if (ps === 2 || ps === 4) return 4
  if (ps === 3 || ps === 1) return 3
  return ps
}

export function DisplayPlane({
  maskTexture,
  noiseTexture,
  seedTexture,
  noisePatternTextures,
  camoPatternTextures,
  camoBaseTexture,
  camoAltTexture,
  gridWidth,
  gridHeight,
  background,
  pixelSize,
  debugMode,
  blendMode,
  isPaused,
  bounds,
  experimentColorBuffersEnabled,
  resetExperimentToken,
  statePassResetKey
}) {
  const displayMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uMaskTexture: { value: null },
          uNoiseTexture: { value: null },
          uStateTexture: { value: null },
          uAccumTexture: { value: null },
          uCamoBase: { value: null },
          uCamoAlt: { value: null },
          uTime: { value: 0 },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uNoiseResolution: { value: new THREE.Vector2(1, 1) },
          uPixelSize: { value: 1 },
          uDebugMode: { value: 0 },
          uBlendMode: { value: 0 },
          uExperimentMode: { value: 0 },
          uBackgroundMode: { value: 0 },
          uLineStripeWidth: { value: 4 }
        }
      }),
    []
  )
  const updateShaderRef = useRef()
  const accumulationShaderRef = useRef()
  const frozenTimeRef = useRef(0)
  const lastRandomTickRef = useRef(0)
  const lastAccumulationTickRef = useRef(0)
  const colorIndexRef = useRef(0)
  const patternIndexRef = useRef(0)
  const drawingBufferScratchRef = useRef(new THREE.Vector2())
  const { gl } = useThree()

  const gridResolution = useMemo(
    () => new THREE.Vector2(Math.max(1, gridWidth | 0), Math.max(1, gridHeight | 0)),
    [gridWidth, gridHeight]
  )

  const stateTargetA = useMemo(
    () =>
      new THREE.WebGLRenderTarget(Math.max(1, gridResolution.x), Math.max(1, gridResolution.y), {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        generateMipmaps: false
      }),
    [gridResolution.x, gridResolution.y]
  )

  const stateTargetB = useMemo(
    () =>
      new THREE.WebGLRenderTarget(Math.max(1, gridResolution.x), Math.max(1, gridResolution.y), {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        generateMipmaps: false
      }),
    [gridResolution.x, gridResolution.y]
  )

  const readTargetRef = useRef(stateTargetA)
  const writeTargetRef = useRef(stateTargetB)

  const accumulationTargetA = useMemo(
    () =>
      new THREE.WebGLRenderTarget(Math.max(1, gridResolution.x), Math.max(1, gridResolution.y), {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        generateMipmaps: false
      }),
    [gridResolution.x, gridResolution.y]
  )

  const accumulationTargetB = useMemo(
    () =>
      new THREE.WebGLRenderTarget(Math.max(1, gridResolution.x), Math.max(1, gridResolution.y), {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        generateMipmaps: false
      }),
    [gridResolution.x, gridResolution.y]
  )

  const accumulationReadTargetRef = useRef(accumulationTargetA)
  const accumulationWriteTargetRef = useRef(accumulationTargetB)

  const colorTextures = useMemo(() => {
    const width = Math.max(1, gridResolution.x)
    const height = Math.max(1, gridResolution.y)
    const palette = ['#ec8a83', '#ffad85', '#f9f176', '#8be59d', '#6ab4f1', '#a983d8']

    return palette.map((hex) => {
      const color = new THREE.Color(hex)
      const r = Math.round(color.r * 255)
      const g = Math.round(color.g * 255)
      const b = Math.round(color.b * 255)
      const a = 255
      const data = new Uint8Array(width * height * 4)
      for (let i = 0; i < width * height; i += 1) {
        const idx = i * 4
        data[idx] = r
        data[idx + 1] = g
        data[idx + 2] = b
        data[idx + 3] = a
      }
      const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
      texture.needsUpdate = true
      texture.minFilter = THREE.NearestFilter
      texture.magFilter = THREE.NearestFilter
      texture.generateMipmaps = false
      return texture
    })
  }, [gridResolution.x, gridResolution.y])

  const defaultPattern = noisePatternTextures[0]

  const updateScene = useMemo(() => {
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const geometry = new THREE.PlaneGeometry(2, 2)
    const material = new THREE.ShaderMaterial({
      vertexShader: updateStateVertexShader,
      fragmentShader: updateStateFragmentShader,
      uniforms: {
        uPrevState: { value: null },
        uMaskTexture: { value: maskTexture },
        uPatternTexture: { value: defaultPattern },
        uPatternIsRgb: { value: 0.0 }
      }
    })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    return { scene, camera, mesh, material }
  }, [maskTexture, defaultPattern])

  const seedScene = useMemo(() => {
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const geometry = new THREE.PlaneGeometry(2, 2)
    const material = new THREE.MeshBasicMaterial({ map: seedTexture })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    return { scene, camera, mesh, material }
  }, [seedTexture])

  const accumulationScene = useMemo(() => {
    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const geometry = new THREE.PlaneGeometry(2, 2)
    const material = new THREE.ShaderMaterial({
      vertexShader: updateStateVertexShader,
      fragmentShader: updateAccumulationFragmentShader,
      uniforms: {
        uPrevAccum: { value: null },
        uMaskTexture: { value: maskTexture },
        uColorTexture: { value: colorTextures[0] || null }
      }
    })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    return { scene, camera, mesh, material }
  }, [maskTexture, colorTextures])

  useEffect(() => {
    updateShaderRef.current = updateScene.material
    accumulationShaderRef.current = accumulationScene.material
  }, [updateScene, accumulationScene])

  useEffect(() => {
    readTargetRef.current = stateTargetA
    writeTargetRef.current = stateTargetB
    lastRandomTickRef.current = 0
    patternIndexRef.current = 0

    gl.setRenderTarget(stateTargetA)
    gl.clear()
    gl.render(seedScene.scene, seedScene.camera)
    gl.setRenderTarget(stateTargetB)
    gl.clear()
    gl.render(seedScene.scene, seedScene.camera)
    gl.setRenderTarget(null)
  }, [gl, stateTargetA, stateTargetB, seedScene, statePassResetKey, resetExperimentToken])

  useEffect(() => {
    accumulationReadTargetRef.current = accumulationTargetA
    accumulationWriteTargetRef.current = accumulationTargetB
    lastAccumulationTickRef.current = 0
    colorIndexRef.current = 0

    gl.setRenderTarget(accumulationTargetA)
    gl.clearColor(0, 0, 0, 1)
    gl.clear()
    gl.setRenderTarget(accumulationTargetB)
    gl.clearColor(0, 0, 0, 1)
    gl.clear()
    gl.setRenderTarget(null)
    gl.clearColor(0, 0, 0, 1)
  }, [gl, accumulationTargetA, accumulationTargetB, resetExperimentToken])

  useEffect(() => {
    return () => {
      stateTargetA.dispose()
      stateTargetB.dispose()
      accumulationTargetA.dispose()
      accumulationTargetB.dispose()
      colorTextures.forEach((texture) => texture.dispose())
      seedScene.material.dispose()
      seedScene.mesh.geometry.dispose()
      updateScene.mesh.material.dispose()
      updateScene.mesh.geometry.dispose()
      accumulationScene.mesh.material.dispose()
      accumulationScene.mesh.geometry.dispose()
    }
  }, [stateTargetA, stateTargetB, accumulationTargetA, accumulationTargetB, colorTextures, seedScene, updateScene, accumulationScene])

  useEffect(() => {
    return () => {
      displayMaterial.dispose()
    }
  }, [displayMaterial])

  useLayoutEffect(() => {
    if (blendMode === 'random') {
      lastRandomTickRef.current = 0
    }
  }, [blendMode])

  useLayoutEffect(() => {
    patternIndexRef.current = 0
    lastRandomTickRef.current = 0
  }, [statePassResetKey])

  useFrame((state) => {
    if (!isPaused) frozenTimeRef.current = state.clock.elapsedTime
    const time = frozenTimeRef.current

    if (!isPaused && blendMode === 'random' && updateShaderRef.current) {
      const patterns =
        background === 'camouflage' && camoPatternTextures?.length
          ? camoPatternTextures
          : noisePatternTextures
      const interval = 1 / Math.max(0.001, TOGGLE_FREQUENCY_HZ)
      if (time - lastRandomTickRef.current >= interval) {
        const idx = patternIndexRef.current % patterns.length
        const pat = patterns[idx]
        updateShaderRef.current.uniforms.uPrevState.value = readTargetRef.current.texture
        updateShaderRef.current.uniforms.uMaskTexture.value = maskTexture
        updateShaderRef.current.uniforms.uPatternTexture.value = pat
        updateShaderRef.current.uniforms.uPatternIsRgb.value =
          background === 'camouflage' && camoPatternTextures?.length ? 1.0 : 0.0

        gl.setRenderTarget(writeTargetRef.current)
        gl.clear()
        gl.render(updateScene.scene, updateScene.camera)
        gl.setRenderTarget(null)

        const temp = readTargetRef.current
        readTargetRef.current = writeTargetRef.current
        writeTargetRef.current = temp
        patternIndexRef.current = (patternIndexRef.current + 1) % patterns.length
        lastRandomTickRef.current = time
      }
    }

    if (!isPaused && experimentColorBuffersEnabled && accumulationShaderRef.current) {
      const interval = 1 / Math.max(0.001, TOGGLE_FREQUENCY_HZ)
      if (time - lastAccumulationTickRef.current >= interval) {
        const colorTexture = colorTextures[colorIndexRef.current]
        accumulationShaderRef.current.uniforms.uPrevAccum.value = accumulationReadTargetRef.current.texture
        accumulationShaderRef.current.uniforms.uMaskTexture.value = maskTexture
        accumulationShaderRef.current.uniforms.uColorTexture.value = colorTexture

        gl.setRenderTarget(accumulationWriteTargetRef.current)
        gl.clear()
        gl.render(accumulationScene.scene, accumulationScene.camera)
        gl.setRenderTarget(null)

        const temp = accumulationReadTargetRef.current
        accumulationReadTargetRef.current = accumulationWriteTargetRef.current
        accumulationWriteTargetRef.current = temp
        colorIndexRef.current = (colorIndexRef.current + 1) % colorTextures.length
        lastAccumulationTickRef.current = time
      }
    }

    /* Three.js: mutate uniform `.value` entries every frame (not a React state update). */
    /* eslint-disable react-hooks/immutability -- ShaderMaterial.uniforms are imperative */
    const du = displayMaterial.uniforms
    du.uMaskTexture.value = maskTexture
    du.uNoiseTexture.value = noiseTexture
    du.uCamoBase.value = camoBaseTexture
    du.uCamoAlt.value = camoAltTexture
    du.uTime.value = time
    du.uPixelSize.value = pixelSize
    gl.getDrawingBufferSize(drawingBufferScratchRef.current)
    du.uResolution.value.set(drawingBufferScratchRef.current.x, drawingBufferScratchRef.current.y)
    du.uNoiseResolution.value.copy(gridResolution)
    du.uDebugMode.value = debugMode ? 1.0 : 0.0
    du.uStateTexture.value = readTargetRef.current.texture
    du.uAccumTexture.value = accumulationReadTargetRef.current.texture
    du.uBlendMode.value = blendMode === 'random' ? 1.0 : 0.0
    du.uExperimentMode.value = experimentColorBuffersEnabled ? 1.0 : 0.0
    du.uBackgroundMode.value = backgroundToUniform(background)
    du.uLineStripeWidth.value = lineStripeWidthPx(pixelSize)
    /* eslint-enable react-hooks/immutability */
  })

  const planeWidth = bounds.right - bounds.left
  const planeHeight = bounds.top - bounds.bottom

  return (
    <mesh>
      <planeGeometry args={[planeWidth, planeHeight]} />
      <primitive object={displayMaterial} attach="material" />
    </mesh>
  )
}
