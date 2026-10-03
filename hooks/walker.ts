import { SPRITE_WIDTH } from './sprite'
import type { Pose } from './sprite'

export const TICK_MS = 50
// Ticks spent facing the person at each edge before turning around.
export const PAUSE_TICKS = Math.round(800 / TICK_MS)
// Ticks spent standing still after bumping into another creature.
export const BUMP_TICKS = Math.round(200 / TICK_MS)
export const BLINK_EVERY = Math.round(3200 / TICK_MS)
export const BLINK_TICKS = Math.round(160 / TICK_MS)
// The fewest free pixels between two creatures side by side: a column, so
// no cell holds both.
export const MIN_GAP = 2

export type Walker = {
  /** The sprite's left edge, in pixels: two per terminal column. */
  x: number
  heading: 1 | -1
  /** Ticks left standing still. */
  pause: number
  /** Pixels walked so far; drives the legs. */
  travelled: number
  ticks: number
  /** Pixels a tick, on average. */
  speed: number
  /** The part of a pixel walked toward the next. */
  progress: number
  /** The sprite's width, in pixels. */
  width: number
}

export const createWalker = (
  x = 0,
  heading: 1 | -1 = 1,
  speed = 1,
  width = SPRITE_WIDTH,
): Walker => ({ x, heading, pause: 0, travelled: 0, ticks: 0, speed, progress: 0, width })

/** The furthest left edge that keeps a sprite `width` wide in `columns`. */
export const lastX = (columns: number, width = SPRITE_WIDTH) =>
  Math.max(0, columns * 2 - width)

/**
 * Free pixels between a sprite at `x`, `width` wide, and another; below 0
 * they overlap, by less the closer they are to pulling apart either way.
 */
const gapTo = (x: number, width: number, other: Walker) =>
  Math.max(other.x - (x + width), x - (other.x + other.width))

/** One tick: `speed` pixels along, stopping to turn at an edge or a bump. */
export function step(
  walker: Walker,
  columns: number,
  others: readonly Walker[] = [],
): void {
  walker.ticks += 1

  if (walker.pause > 0) {
    walker.pause -= 1
    if (walker.pause === 0) {
      walker.heading = walker.heading === 1 ? -1 : 1
    }
    return
  }

  // A strip too crowded for everyone to keep their distance lets them walk
  // through each other, as on the desktop, rather than stand stuck.
  const needed = others.reduce(
    (sum, other) => sum + other.width + MIN_GAP,
    walker.width + MIN_GAP,
  )
  const blocking = needed > columns * 2 ? [] : others

  walker.progress += walker.speed
  while (walker.progress >= 1 && walker.pause === 0) {
    walker.progress -= 1
    advance(walker, columns, blocking)
  }
}

function advance(walker: Walker, columns: number, others: readonly Walker[]) {
  const end = lastX(columns, walker.width)
  const x = Math.min(Math.max(walker.x + walker.heading, 0), end)

  // Only a step that closes in on someone too near is a bump, so two
  // creatures that start out overlapping can still walk apart.
  const isBump = others.some(other => {
    const gap = gapTo(x, walker.width, other)
    return gap < MIN_GAP && gap < gapTo(walker.x, walker.width, other)
  })
  if (isBump) {
    walker.pause = BUMP_TICKS
    walker.progress = 0
    return
  }

  walker.x = x
  walker.travelled += 1

  const isAtEdge = walker.heading === 1 ? x >= end : x <= 0
  if (isAtEdge) {
    walker.pause = PAUSE_TICKS
    walker.progress = 0
  }
}

/** Where a newcomer `width` wide starts: as far from everyone already walking as it can. */
export function freeSpot(
  columns: number,
  width: number,
  others: readonly Walker[],
): number {
  let best = 0
  let bestGap = -Infinity
  for (let x = 0; x <= lastX(columns, width); x++) {
    const gap = Math.min(...others.map(other => gapTo(x, width, other)))
    if (gap > bestGap) {
      best = x
      bestGap = gap
    }
  }

  return best
}

export function pose(walker: Walker): Pose {
  const isStanding = walker.pause > 0

  return {
    facing: isStanding ? 0 : walker.heading,
    step: isStanding ? 0 : Math.floor(walker.travelled / 2) % 2 === 0 ? 1 : 2,
    isBlinking: walker.ticks % BLINK_EVERY >= BLINK_EVERY - BLINK_TICKS,
  }
}
