// The boss and the subagents' creatures, 12 by 6 pixels each, drawn two by two
// in quadrant block characters: 6 terminal columns by 3 rows (7 at an odd
// pixel offset). The top row holds headwear; the boss wears none.

export const SPRITE_WIDTH = 12
export const SPRITE_ROWS = 3

export type Pose = {
  facing: -1 | 0 | 1
  /** 0 stands on all four legs; 1 and 2 lift alternate legs. */
  step: 0 | 1 | 2
  isBlinking: boolean
}

/** Two rows of pixels worn above the head, `#` filled. */
export type Headwear = readonly [string, string]

export type Look = { color: number; headwear: Headwear | null }

/** One creature where it stands: its left edge in pixels, two per column. */
export type Figure = { x: number; pose: Pose; look: Look }

const BARE: Headwear = ['............', '............']
const BODY = '..########..'
const ARMS = '############'
const EYES = {
  [-1]: '..#.##.###..',
  0: '..##.##.##..',
  1: '..###.##.#..',
} as const
const LEGS = {
  0: '..#.#..#.#..',
  1: '..#....#....',
  2: '....#....#..',
} as const

// Indexed by the filled quadrants: top-left 1, top-right 2, bottom-left 4,
// bottom-right 8.
const QUADRANTS = [...' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█']

const PIXEL_ROWS = SPRITE_ROWS * 2
const EMPTY = -1
const TERMINAL_DEFAULT = 0x01000000

type Cell = { glyph: string; color: number }

function spritePixels(pose: Pose, headwear: Headwear | null): readonly string[] {
  const eyes = pose.isBlinking ? BODY : EYES[pose.facing]
  const [crown, brim] = headwear ?? BARE

  return [crown, brim, BODY, eyes, ARMS, LEGS[pose.step]]
}

function paint(columns: number, figures: readonly Figure[]): Cell[][] {
  // Each pixel holds the color of the last figure to fill it.
  const width = columns * 2
  const canvas = Array.from({ length: PIXEL_ROWS }, () =>
    new Array<number>(width).fill(EMPTY),
  )
  for (const { x, pose, look } of figures) {
    spritePixels(pose, look.headwear).forEach((row, py) => {
      for (let i = 0; i < row.length; i++) {
        const px = x + i
        if (row[i] === '#' && px >= 0 && px < width) {
          canvas[py]![px] = look.color
        }
      }
    })
  }

  const cells: Cell[][] = []
  for (let cy = 0; cy < SPRITE_ROWS; cy++) {
    const top = canvas[cy * 2]!
    const bottom = canvas[cy * 2 + 1]!
    const row: Cell[] = []
    for (let cx = 0; cx < columns; cx++) {
      const quadrants = [top[cx * 2], top[cx * 2 + 1], bottom[cx * 2], bottom[cx * 2 + 1]]
      let bits = 0
      quadrants.forEach((color, i) => {
        if (color !== EMPTY) {
          bits |= 1 << i
        }
      })
      const color = quadrants.find(c => c !== EMPTY) ?? TERMINAL_DEFAULT
      row.push({ glyph: QUADRANTS[bits] ?? ' ', color })
    }
    cells.push(row)
  }

  return cells
}

/** The band's rows as text, each figure drawn where it stands. */
export function glyphRows(columns: number, figures: readonly Figure[]): string[] {
  return paint(columns, figures).map(row => row.map(cell => cell.glyph).join(''))
}

/** The figures packed as a Raster's `cells`, on the terminal's own background. */
export function rasterCells(columns: number, figures: readonly Figure[]): string {
  const cells = paint(columns, figures).flat()
  const view = new DataView(new ArrayBuffer(cells.length * 12))

  cells.forEach(({ glyph, color }, i) => {
    view.setUint32(i * 12, glyph.codePointAt(0) ?? 0x20, true)
    view.setUint32(i * 12 + 4, color, true)
    view.setUint32(i * 12 + 8, TERMINAL_DEFAULT, true)
  })

  return toBase64(new Uint8Array(view.buffer))
}

const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: Uint8Array): string {
  const out: string[] = []
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    const n = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0)
    out.push(
      BASE64[(n >> 18) & 63] ?? '',
      BASE64[(n >> 12) & 63] ?? '',
      b1 === undefined ? '=' : (BASE64[(n >> 6) & 63] ?? ''),
      b2 === undefined ? '=' : (BASE64[n & 63] ?? ''),
    )
  }

  return out.join('')
}
