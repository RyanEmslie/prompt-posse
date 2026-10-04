import { describe, expect, test } from 'claude-code/testing'

import { FULL_RATE, MAX_PACE, MIN_PACE, WINDOW_MS, ease, paceFor, rateAt } from '../hooks/pace'
import type { Work } from '../hooks/pace'
import { TICK_MS } from '../hooks/walker'

const WINDOW_TICKS = WINDOW_MS / TICK_MS

describe('pace', () => {
  test('an idle agent strolls, a busy one runs, and no faster than that', () => {
    expect(paceFor(0)).toBe(MIN_PACE)
    expect(paceFor(FULL_RATE / 2)).toBe((MIN_PACE + MAX_PACE) / 2)
    expect(paceFor(FULL_RATE)).toBe(MAX_PACE)
    expect(paceFor(FULL_RATE * 10)).toBe(MAX_PACE)
  })

  test('only the last few seconds of work count', () => {
    const work: Work[] = [
      { tick: 0, tokens: 1000 },
      { tick: WINDOW_TICKS, tokens: 200 },
      { tick: WINDOW_TICKS + 5, tokens: 300 },
    ]
    expect(rateAt(work, WINDOW_TICKS + 5)).toBe(500 / (WINDOW_MS / 1000))
    expect(work).toHaveLength(2)
    expect(rateAt(work, WINDOW_TICKS * 3)).toBe(0)
    expect(work).toHaveLength(0)
  })

  test('a creature eases into a new pace over about a second', () => {
    let pace = MIN_PACE
    pace = ease(pace, MAX_PACE)
    expect(pace).toBeGreaterThan(MIN_PACE)
    expect(pace).toBeLessThan(MAX_PACE)
    for (let i = 0; i < 1000 / TICK_MS; i++) {
      pace = ease(pace, MAX_PACE)
    }
    expect(MAX_PACE - pace).toBeLessThan((MAX_PACE - MIN_PACE) / 2)
  })
})
