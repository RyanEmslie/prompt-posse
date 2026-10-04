import { describe, expect, test } from 'claude-code/testing'

import { BOSS, lookFor } from '../hooks/looks'
import { BOSS_WIDTH } from '../hooks/sprite'
import { posseSvg } from '../hooks/svg'
import { BLINK_EVERY, PAUSE_TICKS, TICK_MS, lastX } from '../hooks/walker'
import { animations, attributesOf, hex } from './kit'

const COLUMNS = 80
const END = lastX(COLUMNS, BOSS_WIDTH)
const TRAVEL_MS = END * TICK_MS
const PAUSE_MS = PAUSE_TICKS * TICK_MS
const PERIOD_MS = 2 * (TRAVEL_MS + PAUSE_MS)

const stride = (x: number, heading: 1 | -1, elapsedMs = 0, speed = 1) => ({
  x,
  heading,
  speed,
  elapsedMs,
  look: BOSS,
})
const seconds = (ms: number) => `${(ms / 1000).toFixed(3)}s`
const move = (svg: string) => attributesOf(svg, 'animateTransform')

describe('desktop svg', () => {
  test('walks right, pauses, walks back and pauses, once a period', () => {
    const attributes = move(posseSvg(COLUMNS, [stride(0, 1)]))
    const keyTimes = [0, TRAVEL_MS, TRAVEL_MS + PAUSE_MS, 2 * TRAVEL_MS + PAUSE_MS, PERIOD_MS]
      .map(ms => (ms / PERIOD_MS).toFixed(4))
      .join(';')
    expect(attributes).toMatchObject({
      type: 'translate',
      values: `0 0;${END} 0;${END} 0;0 0;0 0`,
      keyTimes,
      dur: seconds(PERIOD_MS),
      repeatCount: 'indefinite',
    })
  })

  test('starts each creature where it stands, heading its way', () => {
    expect(move(posseSvg(COLUMNS, [stride(0, 1)])).begin).toBe('0.000s')
    expect(move(posseSvg(COLUMNS, [stride(END / 2, 1)])).begin).toBe(
      seconds(-TRAVEL_MS / 2),
    )
    expect(move(posseSvg(COLUMNS, [stride(END, -1)])).begin).toBe(
      seconds(-(TRAVEL_MS + PAUSE_MS)),
    )
  })

  test('a redraw resumes the walk by how long it has gone on', () => {
    expect(move(posseSvg(COLUMNS, [stride(END, -1, 1000)])).begin).toBe(
      seconds(-(TRAVEL_MS + PAUSE_MS + 1000)),
    )
  })

  test('steps every two pixels, and blinks whichever way it faces', () => {
    const svg = posseSvg(COLUMNS, [stride(0, 1, 0, 0.8)])
    const stepDur = seconds((4 / 0.8) * TICK_MS)
    // Legs differ by the way a creature walks, so it steps in each direction.
    expect(svg.split(`dur="${stepDur}"`).length - 1).toBe(4)
    const blinkDur = seconds(BLINK_EVERY * TICK_MS)
    expect(svg.split(`dur="${blinkDur}"`).length - 1).toBe(3)
  })

  test('draws each run of pixels as one rect, two units tall', () => {
    const svg = posseSvg(COLUMNS, [stride(0, 1)])
    expect(svg).toContain('<rect x="0" y="4" width="12" height="2"/>')
    expect(svg).toContain('<rect x="2" y="0" width="10" height="2"/>')
  })

  test("draws the boss's shaded side and eyes in their own colors", () => {
    const svg = posseSvg(COLUMNS, [stride(0, 1)])
    expect(svg).toContain(`<g fill="${hex(BOSS.shadeColor)}"><rect x="12" y="0" width="2" height="2"/>`)
    expect(svg).toContain(`<g fill="${hex(BOSS.eyeColor)}">`)
  })

  test('draws headwear in its own color, apart from the body', () => {
    const explore = lookFor('Explore')
    const svg = posseSvg(COLUMNS, [{ ...stride(0, 1), look: explore }])
    expect(svg).toContain(`<g fill="${hex(explore.color)}">`)
    expect(svg).toContain(`<g fill="${hex(explore.hatColor)}">`)
    expect(animations(svg)).toBe(1)
  })

  test('the ground spans the strip, two units a column', () => {
    const svg = posseSvg(COLUMNS, [])
    expect(svg).toContain(`viewBox="0 0 ${COLUMNS * 2} `)
    expect(attributesOf(svg, 'rect')).toMatchObject({ x: '0', width: String(COLUMNS * 2) })
  })

  test('a strip too narrow to walk in stands still', () => {
    expect(animations(posseSvg(6, [stride(0, 1)]))).toBe(0)
  })

  test('a crowd stays well under the SVG size limit', () => {
    const crowd = Array.from({ length: 12 }, (_, i) => ({
      ...stride(i * 14, 1),
      look: lookFor(`type-${i}`),
    }))
    expect(posseSvg(120, crowd).length).toBeLessThan(131072 / 2)
  })
})
