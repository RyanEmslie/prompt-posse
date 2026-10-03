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

export const BOSS: Look = { color: 0xd77757, headwear: null, isBoss: true }

/** The built-in agent kinds' looks, with the words `/posse legend` uses for them. */
export const LEGEND = [
  { type: 'Explore', look: { color: 0x61afef, headwear: ANTENNAE, hatColor: 0xf0f0f0 }, says: 'blue, with white antennae' },
  { type: 'Plan', look: { color: 0x98c379, headwear: TOP_HAT, hatColor: 0xe06c75 }, says: 'green, with a red top hat' },
  { type: 'general-purpose', look: { color: 0xc678dd, headwear: PROPELLER, hatColor: 0x56b6c2 }, says: 'purple, with a cyan propeller cap' },
  { type: 'claude', look: { color: 0xe06c9f, headwear: CROWN, hatColor: 0xe5c07b }, says: 'pink, with a gold crown' },
  { type: 'fork', look: { color: 0xf4a582, headwear: HALO, hatColor: 0xffe9a8 }, says: 'peach, with a pale yellow halo' },
] as const satisfies readonly { type: string; look: Look; says: string }[]

const BY_TYPE = new Map<string, Look>(LEGEND.map(({ type, look }) => [type, look]))

// Bodies and hats for the other types, two lists that share no color.
const COLORS = [0xb5cc5c, 0xb39ddb, 0xd19a66, 0xa0a8b7, 0x7ec699]
const HAT_COLORS = [0xf0f0f0, 0xffd75f, 0x56b6c2, 0xe06c75]
const HEADWEAR = [EARS, HORNS, MOHAWK, SPROUT]

/** A subagent's look: its type's own, or one its type's name always picks. */
export function lookFor(type: string): Look {
  const known = BY_TYPE.get(type)
  if (known !== undefined) {
    return known
  }

  const h = hash(type)
  return {
    color: COLORS[h % COLORS.length] ?? BOSS.color,
    headwear: HEADWEAR[(h >>> 8) % HEADWEAR.length] ?? EARS,
    hatColor: HAT_COLORS[(h >>> 16) % HAT_COLORS.length] ?? 0xf0f0f0,
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

/** Which creature is which, as `/posse legend` prints it. */
export function legendText(): string {
  return [
    "Who's who in the posse:",
    '- **The boss** is Claude itself: orange, bareheaded, and bigger than the rest',
    ...LEGEND.map(({ type, says }) => `- \`${type}\` agents: ${says}`),
    '- **Any other agent**: ears, horns, a mohawk or a sprout, in colors that stay the same for each kind of agent',
  ].join('\n')
}
