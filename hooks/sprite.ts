// The posse in pixels, drawn two by two in quadrant block characters, three
// terminal rows tall. A subagent's creature is 12 pixels wide (6 columns, 7
// at an odd pixel offset) with headwear on its top row; the boss is 16 wide
// and fills all three rows, the biggest of them. A cell shows two colors at
// most: its glyph in one, and the other behind it where the cell has no hole.

export const SPRITE_WIDTH = 12
export const BOSS_WIDTH = 16
export const SPRITE_ROWS = 3

export type Pose = {
  facing: -1 | 0 | 1
  /** 0 stands on all four legs; 1 and 2 lift alternate legs. */
  step: 0 | 1 | 2
  isBlinking: boolean
}

/** Two rows of pixels worn above the head, `#` filled. */
export type Headwear = readonly [string, string]

export type Look = {
  color: number
  headwear: Headwear | null
  /** The headwear's own color, so it stands out from the body. */
  hatColor?: number
  /** The shaded side's color, for a body drawn with one. */
  shadeColor?: number
  /** The eyes' color; without one, eyes are holes in the body. */
  eyeColor?: number
  isBoss?: boolean
}

/** One creature where it stands: its left edge in pixels, two per column. */
export type Figure = { x: number; pose: Pose; look: Look }

export const spriteWidth = (look: Look) => (look.isBoss ? BOSS_WIDTH : SPRITE_WIDTH)

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

// The boss, after Claude Code's mascot: a block with a shaded right side
// (`%`), dark eyes (`o`) and four short legs.
const BOSS_BODY = '..##########%%..'
const BOSS_ARMS = '############%%%%'
const BOSS_EYES = {
  [-1]: '..o######o##%%..',
  0: '..#o######o#%%..',
  1: '..##o######o%%..',
} as const
const BOSS_LEGS = {
  0: '...#..#..#..%...',
  1: '...#.....#......',
  2: '......#.....%...',
} as const

// Indexed by the filled quadrants: top-left 1, top-right 2, bottom-left 4,
// bottom-right 8.
const QUADRANTS = [...' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█']

const PIXEL_ROWS = SPRITE_ROWS * 2
const EMPTY = -1
const TERMINAL_DEFAULT = 0x01000000

type Cell = { glyph: string; color: number; background: number }

/**
 * A creature's rows of pixels: `#` its body, `+` its headwear, `%` its shaded
 * side, `o` its eyes, `.` none of them.
 */
export function spritePixels(pose: Pose, look: Look): readonly string[] {
  if (look.isBoss) {
    const eyes = pose.isBlinking ? BOSS_BODY : BOSS_EYES[pose.facing]
    return [BOSS_BODY, eyes, BOSS_ARMS, BOSS_BODY, BOSS_BODY, BOSS_LEGS[pose.step]]
  }

  const eyes = pose.isBlinking ? BODY : EYES[pose.facing]
  const [crown, brim] = (look.headwear ?? BARE).map(row => row.replaceAll('#', '+'))
  return [crown ?? '', brim ?? '', BODY, eyes, ARMS, LEGS[pose.step]]
}

/** The color a sprite pixel paints in, or none. */
export function pixelColor(pixel: string | undefined, look: Look): number | null {
  if (pixel === '#') return look.color
  if (pixel === '+') return look.hatColor ?? look.color
  if (pixel === '%') return look.shadeColor ?? look.color
  if (pixel === 'o') return look.eyeColor ?? null
  return null
}

function paint(columns: number, figures: readonly Figure[]): Cell[][] {
  // Each pixel holds the color of the last figure to fill it.
  const width = columns * 2
  const canvas = Array.from({ length: PIXEL_ROWS }, () =>
    new Array<number>(width).fill(EMPTY),
  )
  for (const { x, pose, look } of figures) {
    spritePixels(pose, look).forEach((row, py) => {
      for (let i = 0; i < row.length; i++) {
        const px = x + i
        const color = pixelColor(row[i], look)
        if (color !== null && px >= 0 && px < width) {
          canvas[py]![px] = color
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
      // The glyph takes the color most of the cell is. A cell with no hole
      // shows its next color behind the glyph; one with a hole shows the
      // terminal there instead, and paints all its pixels in the glyph's
      // color. A cell can't show a third color.
      const counts = new Map<number, number>()
      for (const color of quadrants) {
        if (color !== undefined && color !== EMPTY) {
          counts.set(color, (counts.get(color) ?? 0) + 1)
        }
      }
      const [color = TERMINAL_DEFAULT, behind] = [...counts.keys()].sort(
        (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0),
      )
      const hasHole = quadrants.includes(EMPTY)
      const background = hasHole || behind === undefined ? TERMINAL_DEFAULT : behind
      let bits = 0
      quadrants.forEach((pixel, i) => {
        if (pixel !== EMPTY && (hasHole || pixel === color)) {
          bits |= 1 << i
        }
      })
      row.push({ glyph: QUADRANTS[bits] ?? ' ', color, background })
    }
    cells.push(row)
  }

  return cells
}

/** The band's rows as text, each figure drawn where it stands. */
export function glyphRows(columns: number, figures: readonly Figure[]): string[] {
  return paint(columns, figures).map(row => row.map(cell => cell.glyph).join(''))
}

/** The figures packed as a Raster's `cells`, on the terminal's own background where they leave a hole. */
export function rasterCells(columns: number, figures: readonly Figure[]): string {
  const cells = paint(columns, figures).flat()
  const view = new DataView(new ArrayBuffer(cells.length * 12))

  cells.forEach(({ glyph, color, background }, i) => {
    view.setUint32(i * 12, glyph.codePointAt(0) ?? 0x20, true)
    view.setUint32(i * 12 + 4, color, true)
    view.setUint32(i * 12 + 8, background, true)
  })

  return toBase64(new Uint8Array(view.buffer))
}

const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function toBase64(bytes: Uint8Array): string {
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
