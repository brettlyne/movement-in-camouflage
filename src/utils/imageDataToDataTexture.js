import * as THREE from 'three'

/**
 * @param {ImageData} imageData
 * @returns {THREE.DataTexture}
 */
export function imageDataToDataTexture(imageData) {
  const w = Math.max(1, imageData.width | 0)
  const h = Math.max(1, imageData.height | 0)
  const data = new Uint8Array(w * h * 4)
  data.set(imageData.data)
  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.needsUpdate = true
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  return texture
}
