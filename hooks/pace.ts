// How fast a subagent's creature walks follows how hard its agent works: the
// tokens its model wrote over the last few seconds. A busy agent's creature
// runs; one waiting on a tool slows to a stroll. Times are the walk's own
// milliseconds, which run as its timer fires: every tick on the terminal,
// less often on the desktop.

import { TICK_MS } from './walker'

/** How far back an agent's work counts. */
export const WINDOW_MS = 10_000
/** Output tokens a second at which a creature walks its fastest. */
export const FULL_RATE = 50
/** The slowest and fastest a creature walks, as a share of its own speed. */
export const MIN_PACE = 0.5
export const MAX_PACE = 1.5
// How much of the way to its new pace a creature goes in a tick: about a
// second to settle.
const EASE = 0.05

/** One model response an agent got: when it ended, in the walk's milliseconds, and the tokens it wrote. */
export type Work = { at: number; tokens: number }

/** A creature's pace for its agent's output tokens a second. */
export const paceFor = (rate: number) =>
  MIN_PACE + (MAX_PACE - MIN_PACE) * Math.min(Math.max(rate, 0) / FULL_RATE, 1)

/** Output tokens a second over the window ending at `now`; older work is dropped. */
export function rateAt(work: Work[], now: number): number {
  const since = now - WINDOW_MS
  while (work.length > 0 && (work[0]?.at ?? 0) <= since) {
    work.shift()
  }

  return work.reduce((sum, { tokens }) => sum + tokens, 0) / (WINDOW_MS / 1000)
}

/** The step from `pace` toward `target` that `ms` milliseconds make. */
export const ease = (pace: number, target: number, ms = TICK_MS) =>
  pace + (target - pace) * (1 - (1 - EASE) ** (ms / TICK_MS))
