import { describe, expect, test } from 'claude-code/testing'

import { FULL_RATE, MAX_PACE, MIN_PACE, WINDOW_MS, ease, paceFor, rateAt } from '../hooks/pace'
import type { Work } from '../hooks/pace'
import { TICK_MS } from '../hooks/walker'

describe('pace', () => {
  test('an idle agent strolls, a busy one runs, and no faster than that', () => {
    expect(paceFor(0)).toBe(MIN_PACE)
    expect(paceFor(FULL_RATE / 2)).toBe((MIN_PACE + MAX_PACE) / 2)
    expect(paceFor(FULL_RATE)).toBe(MAX_PACE)
    expect(paceFor(FULL_RATE * 10)).toBe(MAX_PACE)
  })

  test('only the last few seconds of work count', () => {
    const work: Work[] = [
      { at: 0, tokens: 1000 },
      { at: WINDOW_MS, tokens: 200 },
      { at: WINDOW_MS + 250, tokens: 300 },
    ]
    expect(rateAt(work, WINDOW_MS + 250)).toBe(500 / (WINDOW_MS / 1000))
    expect(work).toHaveLength(2)
    expect(rateAt(work, WINDOW_MS * 3)).toBe(0)
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

  test('a second eases a pace as far in one step as in twenty ticks', () => {
    let ticked = MIN_PACE
    for (let i = 0; i < 1000 / TICK_MS; i++) {
      ticked = ease(ticked, MAX_PACE)
    }
    expect(Math.abs(ease(MIN_PACE, MAX_PACE, 1000) - ticked)).toBeLessThan(1e-9)
  })
})
