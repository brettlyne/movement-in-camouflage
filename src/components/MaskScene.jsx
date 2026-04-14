import { useRef, useMemo, useEffect, useLayoutEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

function shapeModeToGeometry(shapeMode) {
  switch (shapeMode) {
    case 'cube':
      return { geometryType: 'Box', wireframeMode: false }
    case 'cube wireframe':
      return { geometryType: 'Box', wireframeMode: true }
    case 'tetrahedron':
      return { geometryType: 'Tetrahedron', wireframeMode: false }
    case 'tetrahedron wireframe':
      return { geometryType: 'Tetrahedron', wireframeMode: true }
    case 'torus':
      return { geometryType: 'Torus', wireframeMode: false }
    case 'sphere':
      return { geometryType: 'Sphere', wireframeMode: false }
    case 'arrow':
      return { geometryType: 'Follow Arrow', wireframeMode: false }
    default:
      return { geometryType: 'Box', wireframeMode: true }
  }
}

export function MaskScene({
  shapeMode,
  size,
  strokeThickness,
  speed,
  rotationSpeed = 3,
  isPaused,
  followCursor,
  bounds
}) {
  const { gl } = useThree()
  const meshRef = useRef()
  const velocity = useRef({ x: speed.x, y: speed.y })
  const position = useRef({ x: 0, y: 0 })
  const lastPosition = useRef({ x: 0, y: 0 })
  const pointerNdc = useRef({ x: 0, y: 0 })

  // Track pointer from the actual canvas element to avoid stale/zero state.pointer values.
  useEffect(() => {
    if (!gl?.domElement) return

    const handlePointerMove = (event) => {
      const rect = gl.domElement.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      pointerNdc.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointerNdc.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    }

    gl.domElement.addEventListener('pointermove', handlePointerMove)
    return () => {
      gl.domElement.removeEventListener('pointermove', handlePointerMove)
    }
  }, [gl])

  // Update velocity when speed changes
  useEffect(() => {
    velocity.current = { x: speed.x, y: speed.y }
  }, [speed.x, speed.y])

  const { geometryType, wireframeMode } = useMemo(
    () => shapeModeToGeometry(shapeMode),
    [shapeMode]
  )

  // Create geometry based on shape mode
  const geometry = useMemo(() => {
    let builtGeometry
    switch (geometryType) {
      case 'Box':
        builtGeometry = new THREE.BoxGeometry(size, size, size)
        break
      case 'Torus':
        builtGeometry = new THREE.TorusGeometry(size * 0.5, size * 0.2, 8, 16)
        break
      case 'Sphere':
        builtGeometry = new THREE.SphereGeometry(size * 0.6, 16, 12)
        break
      case 'Tetrahedron':
        builtGeometry = new THREE.TetrahedronGeometry(size * 0.7, 0)
        break
      case 'Follow Arrow': {
        const arrowLength = size * 2.0
        const arrowWidth = size * 1.1
        const tailLength = arrowLength * 0.48
        const tailHalfHeight = arrowWidth * 0.12
        const halfArrowWidth = arrowWidth * 0.5
        const halfLength = arrowLength * 0.5

        const shape = new THREE.Shape()
        shape.moveTo(-halfLength, -tailHalfHeight)
        shape.lineTo(-halfLength, tailHalfHeight)
        shape.lineTo(-halfLength + tailLength, tailHalfHeight)
        shape.lineTo(-halfLength + tailLength, halfArrowWidth)
        shape.lineTo(halfLength, 0)
        shape.lineTo(-halfLength + tailLength, -halfArrowWidth)
        shape.lineTo(-halfLength + tailLength, -tailHalfHeight)
        shape.lineTo(-halfLength, -tailHalfHeight)

        builtGeometry = new THREE.ShapeGeometry(shape)
        break
      }
      default:
        builtGeometry = new THREE.BoxGeometry(size, size, size)
        break
    }
    builtGeometry.center()
    builtGeometry.computeBoundingBox()
    builtGeometry.computeBoundingSphere()
    return builtGeometry
  }, [geometryType, size])

  // Create mesh tubes for clean edges (no internal triangulation)
  const edgeTubes = useMemo(() => {
    // Extract only geometric edges (angle threshold of 1 degree)
    const edges = new THREE.EdgesGeometry(geometry, 1)
    const positions = edges.attributes.position.array
    const tubes = []

    // Process edges in pairs (each edge has 2 vertices)
    for (let i = 0; i < positions.length; i += 6) {
      const start = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2])
      const end = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5])

      // Calculate edge properties
      const direction = new THREE.Vector3().subVectors(end, start)
      const length = direction.length()
      const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)

      // Create cylinder (tube) for this edge
      const tubeGeometry = new THREE.CylinderGeometry(
        strokeThickness,  // radiusTop
        strokeThickness,  // radiusBottom
        length,           // height
        8,                // radialSegments
        1,                // heightSegments
        false             // openEnded
      )

      // Rotate cylinder to align with edge
      const quaternion = new THREE.Quaternion()
      quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize()
      )
      tubeGeometry.applyQuaternion(quaternion)

      // Position at edge center
      tubeGeometry.translate(center.x, center.y, center.z)

      tubes.push(tubeGeometry)
    }

    // Merge all tubes into single geometry for performance
    if (tubes.length > 0) {
      const mergedGeometry = new THREE.BufferGeometry()
      const mergedPositions = []
      const mergedNormals = []
      const mergedIndices = []
      let vertexOffset = 0

      tubes.forEach(tube => {
        const pos = tube.attributes.position.array
        const norm = tube.attributes.normal.array
        const indices = tube.index ? tube.index.array : null

        mergedPositions.push(...pos)
        mergedNormals.push(...norm)

        // Add indices with offset
        if (indices) {
          for (let i = 0; i < indices.length; i++) {
            mergedIndices.push(indices[i] + vertexOffset)
          }
        }

        vertexOffset += pos.length / 3
      })

      mergedGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(mergedPositions, 3)
      )
      mergedGeometry.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(mergedNormals, 3)
      )
      mergedGeometry.setIndex(mergedIndices)
      mergedGeometry.center()
      mergedGeometry.computeBoundingBox()
      mergedGeometry.computeBoundingSphere()

      return mergedGeometry
    }

    return null
  }, [geometry, strokeThickness])
  const activeGeometry = wireframeMode && edgeTubes ? edgeTubes : geometry
  const arrowTipOffset = useMemo(() => {
    if (geometryType !== 'Follow Arrow') return 0
    return size
  }, [geometryType, size])
  const EDGE_EPSILON = 0.001
  const ROTATION_FROM_SPEED_X = 0.12
  const ROTATION_FROM_SPEED_Y = 0.16
  const collisionRadius = useMemo(() => {
    if (!activeGeometry) {
      return Math.max(EDGE_EPSILON, size * 0.6)
    }
    if (!activeGeometry.boundingSphere) {
      activeGeometry.computeBoundingSphere()
    }
    const baseRadius = activeGeometry.boundingSphere?.radius ?? size * 0.6
    return Math.max(EDGE_EPSILON, baseRadius + strokeThickness * 0.5)
  }, [activeGeometry, size, strokeThickness])

  useEffect(() => {
    if (followCursor) return
    const maxRadiusX = Math.max(EDGE_EPSILON, (bounds.right - bounds.left) * 0.5 - EDGE_EPSILON)
    const maxRadiusY = Math.max(EDGE_EPSILON, (bounds.top - bounds.bottom) * 0.5 - EDGE_EPSILON)
    const radiusX = Math.min(collisionRadius, maxRadiusX)
    const radiusY = Math.min(collisionRadius, maxRadiusY)
    position.current.x = THREE.MathUtils.clamp(
      position.current.x,
      bounds.left + radiusX,
      bounds.right - radiusX
    )
    position.current.y = THREE.MathUtils.clamp(
      position.current.y,
      bounds.bottom + radiusY,
      bounds.top - radiusY
    )
  }, [bounds.left, bounds.right, bounds.top, bounds.bottom, collisionRadius, followCursor])

  // Flat arrow is only reliable in the XY plane; clear x/y drift from other shapes.
  useLayoutEffect(() => {
    if (geometryType !== 'Follow Arrow') return
    meshRef.current?.rotation.set(0, 0, 0)
  }, [geometryType])

  useFrame((state, delta) => {
    if (!meshRef.current || isPaused) return

    if (followCursor) {
      const targetX = THREE.MathUtils.mapLinear(pointerNdc.current.x, -1, 1, bounds.left, bounds.right)
      const targetY = THREE.MathUtils.mapLinear(pointerNdc.current.y, -1, 1, bounds.bottom, bounds.top)
      let centerTargetX = targetX
      let centerTargetY = targetY

      if (geometryType === 'Follow Arrow') {
        const toCursorX = targetX - position.current.x
        const toCursorY = targetY - position.current.y

        const desiredAngle = Math.atan2(toCursorY, toCursorX)
        const currentAngle = meshRef.current.rotation.z
        const angleDelta = Math.atan2(
          Math.sin(desiredAngle - currentAngle),
          Math.cos(desiredAngle - currentAngle)
        )
        const maxTurnPerFrame = 20 * delta // 20 radians per second cap to prevent jittering
        const clampedAngleDelta = THREE.MathUtils.clamp(angleDelta, -maxTurnPerFrame, maxTurnPerFrame)
        const nextAngle = currentAngle + clampedAngleDelta
        meshRef.current.rotation.set(0, 0, nextAngle)

        const forwardX = Math.cos(nextAngle)
        const forwardY = Math.sin(nextAngle)
        centerTargetX = targetX - forwardX * arrowTipOffset
        centerTargetY = targetY - forwardY * arrowTipOffset
      }

      position.current.x = THREE.MathUtils.lerp(position.current.x, centerTargetX, 0.05)
      position.current.y = THREE.MathUtils.lerp(position.current.y, centerTargetY, 0.05)
      meshRef.current.position.x = position.current.x
      meshRef.current.position.y = position.current.y

      if (geometryType !== 'Follow Arrow') {
        const frameDistance = Math.hypot(
          position.current.x - lastPosition.current.x,
          position.current.y - lastPosition.current.y
        )
        const movementSpeed = frameDistance / Math.max(delta, EDGE_EPSILON)
        meshRef.current.rotation.x +=
          delta * movementSpeed * ROTATION_FROM_SPEED_X * rotationSpeed
        meshRef.current.rotation.y +=
          delta * movementSpeed * ROTATION_FROM_SPEED_Y * rotationSpeed
      }

      lastPosition.current.x = position.current.x
      lastPosition.current.y = position.current.y
      return
    }

    // Integrate proposed position first, then clamp/reflect per axis.
    const nextX = position.current.x + velocity.current.x * delta
    const nextY = position.current.y + velocity.current.y * delta

    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
      position.current.x = 0
      position.current.y = 0
      velocity.current.x = speed.x
      velocity.current.y = speed.y
    }

    // Bounce off boundaries with axis-safe radius clamping.
    const halfSize = collisionRadius * .75
    const minX = bounds.left + halfSize
    const maxX = bounds.right - halfSize
    const minY = bounds.bottom + halfSize
    const maxY = bounds.top - halfSize

    position.current.x = THREE.MathUtils.clamp(nextX, minX, maxX)
    position.current.y = THREE.MathUtils.clamp(nextY, minY, maxY)

    if (nextX <= minX) {
      velocity.current.x = Math.abs(velocity.current.x)
    } else if (nextX >= maxX) {
      velocity.current.x = -Math.abs(velocity.current.x)
    }

    if (nextY <= minY) {
      velocity.current.y = Math.abs(velocity.current.y)
    } else if (nextY >= maxY) {
      velocity.current.y = -Math.abs(velocity.current.y)
    }

    // Apply position
    meshRef.current.position.x = position.current.x
    meshRef.current.position.y = position.current.y

    if (geometryType !== 'Follow Arrow') {
      const movementSpeed = Math.hypot(velocity.current.x, velocity.current.y)
      meshRef.current.rotation.x +=
        delta * movementSpeed * ROTATION_FROM_SPEED_X * rotationSpeed
      meshRef.current.rotation.y +=
        delta * movementSpeed * ROTATION_FROM_SPEED_Y * rotationSpeed
    }
  })

  // Choose between wireframe tubes or filled shape
  if (wireframeMode) {
    return (
      <mesh ref={meshRef} geometry={edgeTubes}>
        <meshBasicMaterial color="white" />
      </mesh>
    )
  } else {
    return (
      <mesh ref={meshRef} geometry={geometry}>
        <meshBasicMaterial color="white" />
      </mesh>
    )
  }
}
