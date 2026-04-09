/**
 * Procedural camouflage pattern (CPU): discrete bands 1–5 mapped to a palette.
 * Not shader-based; suitable for ImageData / 2D canvas export.
 *
 * Generation rules (each pixel is one of five bands):
 * - (0,0): random band.
 * - First row (y === 0, x > 0): 50% copy left neighbor, else random.
 * - Later rows (y > 0):
 *   - Interior (x > 0): single draw r in [0,1) — see COPY_*_CHANCE and cumulative
 *     THRESH_AFTER_* below.
 *   - First column (x === 0): no up-left or left; those probability mass → random;
 *     top copy uses the same interval as interior (r in [THRESH_AFTER_LEFT, THRESH_AFTER_TOP)).
 */

/** First row (y === 0, x > 0): P(copy left neighbor). */
const FIRST_ROW_COPY_LEFT_CHANCE = 0.25

/** Later rows (y > 0) Ignored at x === 0. */
const COPY_UP_LEFT_CHANCE = 0.15
const COPY_LEFT_CHANCE = 0.25

/** Later rows (y > 0) */
const COPY_TOP_CHANCE = 0.25

/** Cumulative r thresholds for interior: up-left | left | top | random. */
const THRESH_AFTER_UP_LEFT = COPY_UP_LEFT_CHANCE
const THRESH_AFTER_LEFT = COPY_UP_LEFT_CHANCE + COPY_LEFT_CHANCE
const THRESH_AFTER_TOP = COPY_UP_LEFT_CHANCE + COPY_LEFT_CHANCE + COPY_TOP_CHANCE

/** Default five-tone palette; band k uses index k - 1. */
export const DEFAULT_CAMO_PALETTE = [
  '#ffe169',
  '#edc531',
  '#c9a227',
  '#a47e1b',
  '#805b10'
]

/** Parse #RRGGBB into [r, g, b] bytes. */
function hexToRgb(hex) {
  const n = parseInt(hex.replace(/^#/, ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Uniform random integer in 1..5. */
function randomBand() {
  return (Math.floor(Math.random() * 5) + 1) | 0
}

/**
 * Fills a width×height grid with band indices 1–5 using neighbor-weighted rules.
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array} length width*height, row-major, values 1–5
 */
export function generateProceduralCamoGrid(width, height) {
  const w = Math.max(1, width | 0)
  const h = Math.max(1, height | 0)
  const grid = new Uint8Array(w * h)
  const idx = (x, y) => y * w + x

  // Seed: top-left is unconstrained.
  grid[idx(0, 0)] = randomBand()

  // First row: horizontal cohesion vs noise.
  for (let x = 1; x < w; x++) {
    grid[idx(x, 0)] =
      Math.random() < FIRST_ROW_COPY_LEFT_CHANCE ? grid[idx(x - 1, 0)] : randomBand()
  }

  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.random()
      let v
      if (x === 0) {
        // r < THRESH_AFTER_LEFT: would be up-left or left → random.
        // r in [THRESH_AFTER_LEFT, THRESH_AFTER_TOP): copy top (same window as interior).
        // else: random.
        if (r < THRESH_AFTER_LEFT) {
          v = randomBand()
        } else if (r < THRESH_AFTER_TOP) {
          v = grid[idx(0, y - 1)]
        } else {
          v = randomBand()
        }
      } else {
        if (r < THRESH_AFTER_UP_LEFT) {
          v = grid[idx(x - 1, y - 1)]
        } else if (r < THRESH_AFTER_LEFT) {
          v = grid[idx(x - 1, y)]
        } else if (r < THRESH_AFTER_TOP) {
          v = grid[idx(x, y - 1)]
        } else {
          v = randomBand()
        }
      }
      grid[idx(x, y)] = v
    }
  }

  return grid
}

/**
 * Maps a band grid to RGBA ImageData (opaque alpha).
 * @param {Uint8Array} grid — values 1–5, row-major; length should be width*height
 * @param {number} width
 * @param {number} height
 * @param {string[]} palette — five CSS hex colors, index 0 → band 1
 * @returns {ImageData}
 */
export function proceduralCamoGridToImageData(grid, width, height, palette = DEFAULT_CAMO_PALETTE) {
  const w = Math.max(1, width | 0)
  const h = Math.max(1, height | 0)
  const rgbs = palette.map(hexToRgb)
  const data = new Uint8ClampedArray(w * h * 4)
  let p = 0
  for (let i = 0, n = w * h; i < n; i++) {
    const band = grid[i]
    // Clamp so bad inputs still produce a valid palette index.
    const b = Math.min(5, Math.max(1, band)) - 1
    const [r, g, bch] = rgbs[b]
    data[p++] = r
    data[p++] = g
    data[p++] = bch
    data[p++] = 255
  }
  return new ImageData(data, w, h)
}

/**
 * One-shot: build grid + ImageData. Uses Math.random (not seeded).
 * @param {number} width
 * @param {number} height
 * @param {{ colors?: string[] }} [options] — optional palette override (five hex strings)
 * @returns {ImageData}
 */
export function generateProceduralCamoImageData(width, height, options = {}) {
  const colors = options.colors ?? DEFAULT_CAMO_PALETTE
  const grid = generateProceduralCamoGrid(width, height)
  return proceduralCamoGridToImageData(grid, width, height, colors)
}
