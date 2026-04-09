import * as THREE from 'three'

/**
 * Creates a static noise texture with random pattern
 * @param {number} pixelSize - Size of each noise square (default 8px)
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @returns {THREE.DataTexture}
 */
export function createNoiseTexture(pixelSize, width, height) {
  // Ensure minimum valid dimensions
  const safePixelSize = Math.max(1, pixelSize)
  const safeWidth = Math.max(1, width)
  const safeHeight = Math.max(1, height)

  const gridWidth = Math.max(1, Math.ceil(safeWidth / safePixelSize))
  const gridHeight = Math.max(1, Math.ceil(safeHeight / safePixelSize))

  const size = gridWidth * gridHeight
  const data = new Uint8Array(size)

  // Create random noise pattern: random black (0) or white (255)
  for (let i = 0; i < gridHeight; i++) {
    for (let j = 0; j < gridWidth; j++) {
      const index = i * gridWidth + j
      // Random black or white
      data[index] = Math.random() > 0.5 ? 255 : 0
    }
  }

  const texture = new THREE.DataTexture(
    data,
    gridWidth,
    gridHeight,
    THREE.RedFormat,
    THREE.UnsignedByteType
  )

  texture.needsUpdate = true
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false

  return texture
}
