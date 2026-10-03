import { describe, expect, test } from 'claude-code/testing'

import { ANTENNAE, BOSS, lookFor } from '../hooks/looks'
import { glyphRows, rasterCells, toBase64 } from '../hooks/sprite'
import { decodeCells } from './kit'

const STANDING = { facing: 0, step: 0, isBlinking: false } as const
const TERMINAL_DEFAULT = 0x01000000

describe('sprite', () => {
  test('the boss stands bareheaded on four legs', () => {
    const rows = glyphRows(7, [{ x: 1, pose: STANDING, look: BOSS }])
    expect(rows).toEqual(['       ', ' ▐▛█▜▌ ', '▝▜▜▀▛▛▘'])
  })

  test('lifts alternate legs as it walks', () => {
    const at = (step: 1 | 2) =>
      glyphRows(7, [{ x: 1, pose: { ...STANDING, facing: 1, step }, look: BOSS }])
    expect(at(1)[2]).toBe('▝▜▀▀▛▀▘')
    expect(at(2)[2]).toBe('▝▀▜▀▀▛▘')
  })

  test('an Explore agent wears antennae', () => {
    const look = lookFor('Explore')
    expect(look.headwear).toBe(ANTENNAE)
    expect(glyphRows(7, [{ x: 1, pose: STANDING, look }])[0]).toBe('  ▚ ▞  ')
  })

  test('a creature half off either edge draws only the part that shows', () => {
    const whole = glyphRows(6, [{ x: 0, pose: STANDING, look: BOSS }])
    const offLeft = glyphRows(3, [{ x: -6, pose: STANDING, look: BOSS }])
    const offRight = glyphRows(3, [{ x: 0, pose: STANDING, look: BOSS }])
    expect(offLeft).toEqual(whole.map(row => row.slice(3)))
    expect(offRight).toEqual(whole.map(row => row.slice(0, 3)))
  })
})

describe('raster cells', () => {
  test('pack each glyph in orange on the terminal background', () => {
    const figures = [{ x: 1, pose: STANDING, look: BOSS }]
    const cells = decodeCells(rasterCells(7, figures))
    expect(cells).toHaveLength(7 * 3)

    const rows = glyphRows(7, figures)
    expect(cells.map(cell => cell.glyph).join('')).toBe(rows.join(''))
    for (const cell of cells) {
      expect(cell.bg).toBe(TERMINAL_DEFAULT)
      expect(cell.fg).toBe(cell.glyph === ' ' ? TERMINAL_DEFAULT : BOSS.color)
    }
  })

  test('where two creatures overlap, the later one is drawn on top', () => {
    const explore = lookFor('Explore')
    const cells = decodeCells(
      rasterCells(6, [
        { x: 0, pose: STANDING, look: BOSS },
        { x: 0, pose: STANDING, look: explore },
      ]),
    )
    const drawn = cells.filter(cell => cell.glyph !== ' ')
    expect(drawn.length).toBeGreaterThan(0)
    for (const cell of drawn) {
      expect(cell.fg).toBe(explore.color)
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
