import * as THREE from 'three'

/**
 * Six independent B/W grid textures (RedFormat) for random-mode cycling.
 * @param {number} gridWidth
 * @param {number} gridHeight
 * @returns {THREE.DataTexture[]}
 */
export function createSixNoisePatternTextures(gridWidth, gridHeight) {
  const w = Math.max(1, gridWidth | 0)
  const h = Math.max(1, gridHeight | 0)
  const size = w * h
  const textures = []
  for (let t = 0; t < 6; t += 1) {
    const data = new Uint8Array(size)
    for (let i = 0; i < size; i += 1) {
      data[i] = Math.random() > 0.5 ? 255 : 0
    }
    const texture = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType)
    texture.needsUpdate = true
    texture.minFilter = THREE.NearestFilter
    texture.magFilter = THREE.NearestFilter
    texture.generateMipmaps = false
    textures.push(texture)
  }
  return textures
}
