import { describe, expect, test } from 'claude-code/testing'

import {
  BLINK_EVERY,
  BLINK_TICKS,
  BUMP_TICKS,
  PAUSE_TICKS,
  MIN_GAP,
  createWalker,
  freeSpot,
  lastX,
  pose,
  step,
} from '../hooks/walker'

describe('walker', () => {
  test('walks to the right edge, looks at you, and turns back', () => {
    const walker = createWalker()
    const end = lastX(20)
    for (let i = 0; i < end; i++) step(walker, 20)
    expect(walker.x).toBe(end)
    expect(pose(walker).facing).toBe(0)

    for (let i = 0; i < PAUSE_TICKS; i++) step(walker, 20)
    expect(walker.heading).toBe(-1)
    step(walker, 20)
    expect(walker.x).toBe(end - 1)
    expect(pose(walker).facing).toBe(-1)
  })

  test('turns at the left edge too', () => {
    const walker = createWalker(2, -1)
    step(walker, 20)
    step(walker, 20)
    expect(walker.x).toBe(0)
    expect(pose(walker)).toMatchObject({ facing: 0, step: 0 })

    for (let i = 0; i < PAUSE_TICKS; i++) step(walker, 20)
    expect(walker.heading).toBe(1)
  })

  test('walks at its own speed', () => {
    const slow = createWalker(0, 1, 0.5)
    const fast = createWalker(0, 1, 1.5)
    for (let i = 0; i < 4; i++) {
      step(slow, 40)
      step(fast, 40)
    }
    expect(slow.x).toBe(2)
    expect(fast.x).toBe(6)
  })

  test('lifts a different pair of legs every two pixels', () => {
    const walker = createWalker(0, 1)
    const steps = Array.from({ length: 6 }, () => {
      step(walker, 40)
      return pose(walker).step
    })
    expect(steps).toEqual([1, 2, 2, 1, 1, 2])
  })

  test('blinks for a moment every few seconds', () => {
    const walker = createWalker()
    let blinks = 0
    for (let i = 0; i < BLINK_EVERY; i++) {
      step(walker, 200)
      if (pose(walker).isBlinking) blinks += 1
    }
    expect(blinks).toBe(BLINK_TICKS)
  })

  test('two that meet bump, pause, and turn around', () => {
    const left = createWalker(0, 1)
    const right = createWalker(40, -1)
    let bumped = false
    for (let i = 0; i < 40; i++) {
      step(left, 60, [right])
      step(right, 60, [left])
      expect(right.x - (left.x + left.width)).toBeGreaterThanOrEqual(MIN_GAP)
      bumped ||= left.pause === BUMP_TICKS
    }
    expect(bumped).toBe(true)
    expect(left.heading).toBe(-1)
    expect(right.heading).toBe(1)
  })

  test('a big creature keeps the same gap from a small one', () => {
    const boss = createWalker(0, 1, 1, 16)
    const small = createWalker(40, -1)
    for (let i = 0; i < 40; i++) {
      step(boss, 60, [small])
      step(small, 60, [boss])
      expect(small.x - (boss.x + boss.width)).toBeGreaterThanOrEqual(MIN_GAP)
    }
    expect(boss.heading).toBe(-1)
    expect(small.heading).toBe(1)
  })

  test('a wider sprite stops sooner at the right edge', () => {
    expect(lastX(20)).toBe(28)
    expect(lastX(20, 16)).toBe(24)
    const boss = createWalker(23, 1, 1, 16)
    step(boss, 20)
    expect(boss.x).toBe(24)
    expect(pose(boss).facing).toBe(0)
  })

  test('a newcomer starts as far from everyone as it can', () => {
    expect(freeSpot(20, 12, [])).toBe(0)
    expect(freeSpot(20, 12, [createWalker(0)])).toBe(lastX(20))
    expect(freeSpot(20, 12, [createWalker(0), createWalker(lastX(20))])).toBe(
      lastX(20) / 2,
    )
    expect(freeSpot(30, 12, [createWalker(0, 1, 1, 16)])).toBe(lastX(30))
  })

  test('creatures of different widths that overlap walk apart', () => {
    const boss = createWalker(0, 1, 1, 16)
    const standing = { ...createWalker(2), pause: 1000 }
    for (let i = 0; i < 20; i++) step(boss, 60, [standing])
    expect(boss.x).toBeGreaterThan(10)

    const sub = createWalker(11, -1)
    const still = { ...createWalker(9, 1, 1, 16), pause: 1000 }
    for (let i = 0; i < 20; i++) step(sub, 60, [still])
    expect(sub.x).toBeLessThan(9)
  })

  test('a newcomer can start at an odd pixel when only that fits', () => {
    const others = [createWalker(1, 1, 1, 16), createWalker(33)]
    expect(freeSpot(23, 12, others)).toBe(19)
  })

  test('a crowd too big to keep its distance walks through itself', () => {
    const crowd = Array.from({ length: 14 }, (_, i) =>
      createWalker(i * 10, i % 2 === 0 ? 1 : -1),
    )
    for (let i = 0; i < 40; i++) {
      for (const walker of crowd) {
        step(walker, 80, crowd.filter(other => other !== walker))
      }
    }
    for (const walker of crowd) {
      expect(walker.travelled).toBeGreaterThanOrEqual(20)
    }
  })
})
