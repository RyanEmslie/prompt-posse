import type { Headwear, Look } from './sprite'

export const ANTENNAE: Headwear = ['...#....#...', '....#..#....']
export const TOP_HAT: Headwear = ['....####....', '.##########.']
export const PROPELLER: Headwear = ['..###..###..', '....####....']
export const CROWN: Headwear = ['..#..##..#..', '..########..']
export const HALO: Headwear = ['...######...', '............']
// Worn only by the types without a look of their own.
export const EARS: Headwear = ['..#......#..', '..##....##..']
export const HORNS: Headwear = ['.#........#.', '..#......#..']
export const MOHAWK: Headwear = ['.....##.....', '....####....']
export const SPROUT: Headwear = ['....##.##...', '......#.....']

export const CLAWD: Look = { color: 0xd77757, headwear: null }

const BY_TYPE = new Map<string, Look>([
  ['Explore', { color: 0x61afef, headwear: ANTENNAE }],
  ['Plan', { color: 0x98c379, headwear: TOP_HAT }],
  ['general-purpose', { color: 0xc678dd, headwear: PROPELLER }],
  ['claude', { color: 0xe5c07b, headwear: CROWN }],
  ['fork', { color: 0xf4a582, headwear: HALO }],
])

const COLORS = [0x56b6c2, 0xe06c9f, 0xb5cc5c, 0x7fc8f8, 0xf28b82, 0xb39ddb]
const HEADWEAR = [EARS, HORNS, MOHAWK, SPROUT]

/** A subagent's look: its type's own, or one its type's name always picks. */
export function lookFor(type: string): Look {
  const known = BY_TYPE.get(type)
  if (known !== undefined) {
    return known
  }

  const h = hash(type)
  return {
    color: COLORS[h % COLORS.length] ?? CLAWD.color,
    headwear: HEADWEAR[(h >>> 8) % HEADWEAR.length] ?? EARS,
  }
}

/** FNV-1a: the same text always gives the same number. */
export function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }

  return h >>> 0
}
