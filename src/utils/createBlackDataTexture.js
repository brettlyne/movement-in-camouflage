import * as THREE from 'three'

/**
 * Opaque black RGBA grid (for seeding random state).
 * @param {number} gridWidth
 * @param {number} gridHeight
 * @returns {THREE.DataTexture}
 */
export function createBlackDataTexture(gridWidth, gridHeight) {
  const w = Math.max(1, gridWidth | 0)
  const h = Math.max(1, gridHeight | 0)
  const data = new Uint8Array(w * h * 4)
  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.needsUpdate = true
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  return texture
}
