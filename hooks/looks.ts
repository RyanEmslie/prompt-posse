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

export const BOSS: Look = {
  color: 0xd77757,
  shadeColor: 0xb05a3e,
  eyeColor: 0x1f1e1d,
  headwear: null,
  isBoss: true,
}

/** The built-in agent kinds' looks, with the words `/posse legend` uses for them. */
export const LEGEND = [
  { type: 'Explore', look: { color: 0x61afef, headwear: ANTENNAE, hatColor: 0xbcbcbc }, says: 'blue, with light gray antennae' },
  { type: 'Plan', look: { color: 0x98c379, headwear: TOP_HAT, hatColor: 0xe06c75 }, says: 'green, with a red top hat' },
  { type: 'general-purpose', look: { color: 0xc678dd, headwear: PROPELLER, hatColor: 0x56b6c2 }, says: 'purple, with a cyan propeller cap' },
  { type: 'claude', look: { color: 0xe06c9f, headwear: CROWN, hatColor: 0xe5c07b }, says: 'pink, with a gold crown' },
  { type: 'fork', look: { color: 0xf4a582, headwear: HALO, hatColor: 0xffe9a8 }, says: 'peach, with a pale yellow halo' },
] as const satisfies readonly { type: string; look: Look; says: string }[]

const BY_TYPE = new Map<string, Look>(LEGEND.map(({ type, look }) => [type, look]))

// Bodies and hats for the other types, two lists that share no color.
const COLORS = [0xb5cc5c, 0xb39ddb, 0xd19a66, 0xa0a8b7, 0x7ec699]
const HAT_COLORS = [0xbcbcbc, 0xffd75f, 0x56b6c2, 0xe06c75]
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
    hatColor: HAT_COLORS[(h >>> 16) % HAT_COLORS.length] ?? 0xbcbcbc,
  }
}

// Hats for a creature whose own hat color another one on the strip already
// wears, so that two agents of a type, and their legend marks, tell apart.
// Strong colors that read on a dark terminal and a light one; the first three
// are no kind's own, so a spare rarely takes a hat a later agent wants.
export const SPARE_HATS = [0xff8c42, 0xc678dd, 0x98c379, 0xe06c75, 0xe5c07b, 0x56b6c2]

/** Whether two colors are close enough to pass for one another. */
export function isNear(a: number, b: number): boolean {
  const channel = (color: number, shift: number) => (color >> shift) & 255
  const distance = Math.hypot(
    ...[16, 8, 0].map(shift => channel(a, shift) - channel(b, shift)),
  )

  return distance < 60
}

/**
 * A subagent's look, with a hat color unlike any of `worn`, the ones on the
 * strip already: its type's own if that's free, otherwise the first spare
 * that is free and unlike its body. With every spare taken, its own.
 */
export function hatFor(type: string, worn: readonly number[]): Look {
  const look = lookFor(type)
  const own = look.hatColor ?? look.color
  const isFree = (color: number) => !worn.some(other => isNear(color, other))
  if (isFree(own)) {
    return look
  }
  const spare = SPARE_HATS.find(color => isFree(color) && !isNear(color, look.color))

  return spare === undefined ? look : { ...look, hatColor: spare }
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
    '- **Two or more of one kind** at once: the later ones wear hats in other colors, so each can be told apart',
  ].join('\n')
}
