import { describe, expect, test } from 'claude-code/testing'

import { ANTENNAE, BOSS, lookFor } from '../hooks/looks'
import { BOSS_WIDTH, SPRITE_WIDTH, glyphRows, rasterCells, spritePixels, spriteWidth, toBase64 } from '../hooks/sprite'
import { decodeCells } from './kit'

const STANDING = { facing: 0, step: 0, isBlinking: false } as const
const TERMINAL_DEFAULT = 0x01000000
const SMALL = { color: BOSS.color, headwear: null }

describe('sprite', () => {
  test('the boss stands as the mascot, the biggest of the posse', () => {
    const rows = glyphRows(9, [{ x: 1, pose: STANDING, look: BOSS }])
    expect(rows).toEqual([' ▐▛██▛▌▌ ', '▝▜████▌▛▘', ' ▝▛▜▀▛▜▘ '])
    expect(spriteWidth(BOSS)).toBe(BOSS_WIDTH)
    expect(BOSS_WIDTH).toBeGreaterThan(SPRITE_WIDTH)
  })

  test('the boss lifts alternate legs as he walks', () => {
    const at = (step: 1 | 2) =>
      glyphRows(9, [{ x: 1, pose: { ...STANDING, facing: 1, step }, look: BOSS }])
    expect(at(1)[2]).toBe(' ▝▀▜▀▀▜▘ ')
    expect(at(2)[2]).toBe(' ▝▛▀▀▛▀▘ ')
  })

  test("the boss's shaded side stays at its back", () => {
    const rows = (facing: -1 | 0 | 1) => spritePixels({ ...STANDING, facing }, BOSS)
    expect(rows(-1)[0]).toBe('..##########%%..')
    expect(rows(0)[0]).toBe('..##########%%..')
    expect(rows(1)[0]).toBe('..%%##########..')
    expect(rows(1)).toEqual(rows(-1).map(row => [...row].reverse().join('')))
  })

  test('a subagent creature stands on four legs below its headwear row', () => {
    const rows = glyphRows(7, [{ x: 1, pose: STANDING, look: SMALL }])
    expect(rows).toEqual(['       ', ' ▐▛█▜▌ ', '▝▜▜▀▛▛▘'])
  })

  test('a subagent creature lifts alternate legs as it walks', () => {
    const at = (step: 1 | 2) =>
      glyphRows(7, [{ x: 1, pose: { ...STANDING, facing: 1, step }, look: SMALL }])
    expect(at(1)[2]).toBe('▝▜▀▀▛▀▘')
    expect(at(2)[2]).toBe('▝▀▜▀▀▛▘')
  })

  test('an Explore agent wears antennae', () => {
    const look = lookFor('Explore')
    expect(look.headwear).toBe(ANTENNAE)
    expect(glyphRows(7, [{ x: 1, pose: STANDING, look }])[0]).toBe('  ▚ ▞  ')
  })

  test('a creature half off either edge draws only the part that shows', () => {
    const whole = glyphRows(8, [{ x: 0, pose: STANDING, look: BOSS }])
    const offLeft = glyphRows(4, [{ x: -8, pose: STANDING, look: BOSS }])
    const offRight = glyphRows(4, [{ x: 0, pose: STANDING, look: BOSS }])
    expect(offLeft).toEqual(whole.map(row => row.slice(4)))
    expect(offRight).toEqual(whole.map(row => row.slice(0, 4)))
  })
})

describe('raster cells', () => {
  test('pack each glyph in its color on the terminal background', () => {
    const figures = [{ x: 1, pose: STANDING, look: SMALL }]
    const cells = decodeCells(rasterCells(9, figures))
    expect(cells).toHaveLength(9 * 3)

    const rows = glyphRows(9, figures)
    expect(cells.map(cell => cell.glyph).join('')).toBe(rows.join(''))
    for (const cell of cells) {
      expect(cell.bg).toBe(TERMINAL_DEFAULT)
      expect(cell.fg).toBe(cell.glyph === ' ' ? TERMINAL_DEFAULT : BOSS.color)
    }
  })

  test("the boss's shade and dark eyes show behind the glyph where a cell has no hole", () => {
    const cells = decodeCells(rasterCells(9, [{ x: 1, pose: STANDING, look: BOSS }]))
    const colors = [BOSS.color, BOSS.shadeColor, BOSS.eyeColor, TERMINAL_DEFAULT]
    for (const cell of cells) {
      expect(colors).toContain(cell.fg)
      expect(colors).toContain(cell.bg)
    }

    const eyes = cells.filter(cell => cell.bg === BOSS.eyeColor)
    expect(eyes).toHaveLength(2)
    for (const cell of eyes) expect(cell.fg).toBe(BOSS.color)
    expect(cells.some(cell => cell.bg === BOSS.shadeColor)).toBe(true)
  })

  test("both of the boss's eyes show whichever way it faces, at either pixel offset", () => {
    for (const facing of [-1, 0, 1] as const) {
      for (const x of [0, 1]) {
        const cells = decodeCells(rasterCells(9, [{ x, pose: { ...STANDING, facing }, look: BOSS }]))
        const eyes = cells.filter(cell => cell.fg === BOSS.eyeColor || cell.bg === BOSS.eyeColor)
        expect(eyes).toHaveLength(2)
      }
    }
  })

  test('headwear is drawn in its own color, apart from the body', () => {
    const explore = lookFor('Explore')
    const cells = decodeCells(rasterCells(7, [{ x: 1, pose: STANDING, look: explore }]))
    const drawn = (row: number) =>
      cells.slice(row * 7, row * 7 + 7).filter(cell => cell.glyph !== ' ')
    expect(drawn(0).length).toBeGreaterThan(0)
    for (const cell of drawn(0)) expect(cell.fg).toBe(explore.hatColor)
    for (const cell of [...drawn(1), ...drawn(2)]) expect(cell.fg).toBe(explore.color)
  })

  test('where two creatures overlap, the later one is drawn on top', () => {
    const explore = lookFor('Explore')
    const cells = decodeCells(
      rasterCells(6, [
        { x: 0, pose: STANDING, look: SMALL },
        { x: 0, pose: STANDING, look: explore },
      ]),
    )
    const drawn = cells.filter(cell => cell.glyph !== ' ')
    expect(drawn.length).toBeGreaterThan(0)
    for (const cell of drawn) {
      expect([explore.color, explore.hatColor]).toContain(cell.fg)
    }
  })

  test('base64 encodes like the standard, padding included', () => {
    const encode = (text: string) => toBase64(new TextEncoder().encode(text))
    expect(encode('')).toBe('')
    expect(encode('f')).toBe('Zg==')
    expect(encode('fo')).toBe('Zm8=')
    expect(encode('foo')).toBe('Zm9v')
    expect(encode('foobar')).toBe('Zm9vYmFy')
    expect(toBase64(Uint8Array.of(0, 255, 254, 253))).toBe('AP/+/Q==')
  })
})
