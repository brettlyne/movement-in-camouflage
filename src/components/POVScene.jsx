import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { useThree, useFrame, createPortal } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { useControls, button } from 'leva'
import * as THREE from 'three'
import { MaskScene } from './MaskScene'
import { DisplayPlane } from './DisplayPlane'
import { createNoiseTexture } from '../utils/createNoiseTexture'
import { createSixNoisePatternTextures } from '../utils/createNoisePatternTextures'
import { generateProceduralCamoImageData } from '../utils/generateProceduralCamo'
import { imageDataToDataTexture } from '../utils/imageDataToDataTexture'
import { createBlackDataTexture } from '../utils/createBlackDataTexture'

/** Runs after other useFrame hooks (mount last) and before R3F's gl.render. */
function CanvasPresentPassGuard() {
  const { gl, setSize } = useThree()
  const scratchRef = useRef(new THREE.Vector2())
  useFrame(() => {
    if (gl.getRenderTarget() !== null) {
      gl.setRenderTarget(null)
    }

    const el = gl.domElement
    const cw = el.clientWidth
    const ch = el.clientHeight
    let dpr = gl.getPixelRatio()
    gl.getDrawingBufferSize(scratchRef.current)
    let lw = scratchRef.current.x / dpr
    let lh = scratchRef.current.y / dpr

    if (cw > 0 && ch > 0 && (Math.abs(lw - cw) > 1 || Math.abs(lh - ch) > 1)) {
      setSize(cw, ch)
      dpr = gl.getPixelRatio()
      gl.getDrawingBufferSize(scratchRef.current)
      lw = scratchRef.current.x / dpr
      lh = scratchRef.current.y / dpr
    }

    gl.setViewport(0, 0, lw, lh)
    gl.setScissor(0, 0, lw, lh)
    gl.setScissorTest(false)
  })
  return null
}

export function POVScene() {
  const { size, gl } = useThree()
  const maskScene = useMemo(() => new THREE.Scene(), [])
  const maskCameraRef = useRef()
  const drawingBufferScratchRef = useRef(new THREE.Vector2())
  /* eslint-disable react-hooks/exhaustive-deps -- R3F `size` updates when canvas resizes; eslint treats size as redundant to `gl` */
  const drawingBufferSize = useMemo(() => {
    const buffer = new THREE.Vector2()
    gl.getDrawingBufferSize(buffer)
    return {
      width: Math.max(1, Math.floor(buffer.x)),
      height: Math.max(1, Math.floor(buffer.y))
    }
  }, [gl, size.width, size.height])
  /* eslint-enable react-hooks/exhaustive-deps */

  const [{
    pixelSize,
    speedX,
    speedY,
    isPaused,
    followCursor,
    shapeMode,
    shapeSize,
    strokeThickness,
    debugMode,
    blendMode,
    background,
    experimentColorBuffersEnabled
  }, set] = useControls(() => ({
    pixelSize: { value: 4, min: 1, max: 50, step: 1, label: 'Pixel Size' },
    speedX: { value: 2, min: 0, max: 10, step: 0.1, label: 'Speed X' },
    speedY: { value: 1.5, min: 0, max: 10, step: 0.1, label: 'Speed Y' },
    isPaused: { value: false, label: 'Paused' },
    followCursor: { value: false, label: 'Follow Cursor' },
    shapeMode: {
      value: 'cube wireframe',
      options: [
        'cube',
        'cube wireframe',
        'tetrahedron',
        'tetrahedron wireframe',
        'torus',
        'sphere',
        'arrow'
      ],
      label: 'Shape'
    },
    shapeSize: { value: 3, min: 0.1, max: 5, step: 0.1, label: 'Shape Size' },
    strokeThickness: {
      value: 0.1,
      min: 0.01,
      max: 1.0,
      step: 0.01,
      label: 'Wireframe width',
      render: (get) => {
        const mode = get('shapeMode')
        return mode === 'cube wireframe' || mode === 'tetrahedron wireframe'
      }
    },
    background: {
      value: 'noise',
      options: ['noise', 'black', 'camouflage'],
      label: 'Background'
    },
    blendMode: {
      value: 'toggle',
      options: ['toggle', 'random'],
      label: 'Blend Mode'
    },
    debugMode: { value: false, label: 'Debug: Show FBO' },
    experimentColorBuffersEnabled: { value: false, label: '🌈' }
  }))

  const [resetExperimentToken, setResetExperimentToken] = useState(0)

  useControls({
    'Reset Buffers': button(() => setResetExperimentToken((value) => value + 1))
  })

  const togglePause = useCallback(() => {
    set({ isPaused: !isPaused })
  }, [isPaused, set])

  useEffect(() => {
    const canvas = gl.domElement
    canvas.addEventListener('click', togglePause)
    return () => canvas.removeEventListener('click', togglePause)
  }, [gl.domElement, togglePause])

  const fboResolution = useMemo(() => {
    const width = Math.max(1, Math.ceil(drawingBufferSize.width / pixelSize))
    const height = Math.max(1, Math.ceil(drawingBufferSize.height / pixelSize))
    return { width, height }
  }, [drawingBufferSize.width, drawingBufferSize.height, pixelSize])
  const renderResetKey = useMemo(
    () => `${pixelSize}-${fboResolution.width}x${fboResolution.height}`,
    [pixelSize, fboResolution.width, fboResolution.height]
  )

  const renderTarget = useMemo(() => {
    if (fboResolution.width < 1 || fboResolution.height < 1) {
      console.warn('Invalid FBO dimensions, using 1x1')
    }
    const target = new THREE.WebGLRenderTarget(
      Math.max(1, fboResolution.width),
      Math.max(1, fboResolution.height),
      {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        generateMipmaps: false
      }
    )
    return target
  }, [fboResolution.width, fboResolution.height])

  const noiseTexture = useMemo(() => {
    const width = drawingBufferSize.width
    const height = drawingBufferSize.height
    const pSize = Math.max(1, pixelSize)
    return createNoiseTexture(pSize, width, height)
  }, [pixelSize, drawingBufferSize.width, drawingBufferSize.height])

  const dummyRgbTexture = useMemo(() => {
    const d = new Uint8Array([0, 0, 0, 255])
    const t = new THREE.DataTexture(d, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType)
    t.needsUpdate = true
    t.minFilter = THREE.NearestFilter
    t.magFilter = THREE.NearestFilter
    t.generateMipmaps = false
    return t
  }, [])

  const noisePatternTextures = useMemo(
    () => createSixNoisePatternTextures(fboResolution.width, fboResolution.height),
    [fboResolution.width, fboResolution.height]
  )

  const camoPatternTextures = useMemo(() => {
    if (background !== 'camouflage') return null
    const { width, height } = fboResolution
    return Array.from({ length: 6 }, () =>
      imageDataToDataTexture(generateProceduralCamoImageData(width, height))
    )
  }, [background, fboResolution])

  const blackSeedTexture = useMemo(() => {
    if (background !== 'black' || blendMode !== 'random') return null
    return createBlackDataTexture(fboResolution.width, fboResolution.height)
  }, [background, blendMode, fboResolution.width, fboResolution.height])

  const seedTexture = useMemo(() => {
    if (blendMode === 'random') {
      if (background === 'black' && blackSeedTexture) return blackSeedTexture
      if (background === 'camouflage' && camoPatternTextures) return camoPatternTextures[0]
      return noisePatternTextures[0]
    }
    if (background === 'camouflage' && camoPatternTextures) return camoPatternTextures[0]
    return noisePatternTextures[0]
  }, [
    blendMode,
    background,
    blackSeedTexture,
    camoPatternTextures,
    noisePatternTextures
  ])

  const camoBaseTexture =
    background === 'camouflage' && camoPatternTextures ? camoPatternTextures[0] : dummyRgbTexture
  const camoAltTexture =
    background === 'camouflage' && camoPatternTextures ? camoPatternTextures[1] : dummyRgbTexture

  const bounds = useMemo(() => {
    const safeHeight = Math.max(1, size.height)
    const aspect = size.width / safeHeight
    const frustumHeight = 10
    const frustumWidth = frustumHeight * aspect

    return {
      left: -frustumWidth / 2,
      right: frustumWidth / 2,
      top: frustumHeight / 2,
      bottom: -frustumHeight / 2
    }
  }, [size.width, size.height])

  useFrame(({ gl }) => {
    if (maskCameraRef.current && maskScene) {
      const dpr = gl.getPixelRatio()
      gl.setViewport(0, 0, fboResolution.width / dpr, fboResolution.height / dpr)
      gl.setScissor(0, 0, fboResolution.width / dpr, fboResolution.height / dpr)
      gl.setScissorTest(true)
      gl.setRenderTarget(renderTarget)
      gl.clear()
      gl.render(maskScene, maskCameraRef.current)
      gl.setRenderTarget(null)
      gl.setScissorTest(false)
      gl.getDrawingBufferSize(drawingBufferScratchRef.current)
      const bufW = drawingBufferScratchRef.current.x
      const bufH = drawingBufferScratchRef.current.y
      const lw = bufW / dpr
      const lh = bufH / dpr
      gl.setViewport(0, 0, lw, lh)
      gl.setScissor(0, 0, lw, lh)
      gl.setScissorTest(false)

      if (debugMode && maskScene.children.length === 0) {
        console.warn('Mask scene has no children!')
      }
    }
  }, -1)

  useEffect(() => {
    return () => {
      renderTarget.dispose()
      noiseTexture.dispose()
      dummyRgbTexture.dispose()
      noisePatternTextures.forEach((t) => t.dispose())
      camoPatternTextures?.forEach((t) => t.dispose())
      blackSeedTexture?.dispose()
    }
  }, [
    renderTarget,
    noiseTexture,
    dummyRgbTexture,
    noisePatternTextures,
    camoPatternTextures,
    blackSeedTexture
  ])

  useEffect(() => {
    if (maskCameraRef.current) {
      maskCameraRef.current.left = bounds.left
      maskCameraRef.current.right = bounds.right
      maskCameraRef.current.top = bounds.top
      maskCameraRef.current.bottom = bounds.bottom
      maskCameraRef.current.updateProjectionMatrix()
    }
  }, [bounds.left, bounds.right, bounds.top, bounds.bottom])

  const statePassResetKey = `${background}-${blendMode}-${renderResetKey}`

  return (
    <>
      {createPortal(
        <>
          <OrthographicCamera
            ref={maskCameraRef}
            position={[0, 0, 10]}
            left={bounds.left}
            right={bounds.right}
            top={bounds.top}
            bottom={bounds.bottom}
            near={0.1}
            far={100}
          />
          <color attach="background" args={['black']} />
          <MaskScene
            key={`mask-${renderResetKey}`}
            shapeMode={shapeMode}
            size={shapeSize}
            strokeThickness={strokeThickness}
            speed={{ x: speedX, y: speedY }}
            isPaused={isPaused}
            followCursor={followCursor}
            bounds={bounds}
          />
        </>,
        maskScene
      )}

      <OrthographicCamera
        makeDefault
        position={[0, 0, 1]}
        left={bounds.left}
        right={bounds.right}
        top={bounds.top}
        bottom={bounds.bottom}
        near={0.1}
        far={10}
      />
      {debugMode ? (
        <>
          <color attach="background" args={['black']} />
          <mesh>
            <planeGeometry args={[bounds.right - bounds.left, bounds.top - bounds.bottom]} />
            <meshBasicMaterial map={renderTarget.texture} />
          </mesh>
        </>
      ) : (
        <DisplayPlane
          key={`display-${renderResetKey}`}
          maskTexture={renderTarget.texture}
          noiseTexture={noiseTexture}
          seedTexture={seedTexture}
          noisePatternTextures={noisePatternTextures}
          camoPatternTextures={camoPatternTextures}
          camoBaseTexture={camoBaseTexture}
          camoAltTexture={camoAltTexture}
          gridWidth={fboResolution.width}
          gridHeight={fboResolution.height}
          background={background}
          pixelSize={pixelSize}
          blendMode={blendMode}
          debugMode={false}
          isPaused={isPaused}
          experimentColorBuffersEnabled={experimentColorBuffersEnabled}
          resetExperimentToken={resetExperimentToken}
          statePassResetKey={statePassResetKey}
          bounds={bounds}
        />
      )}
      <CanvasPresentPassGuard />
    </>
  )
}
