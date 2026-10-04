import { describe, expect, test } from 'claude-code/testing'

import { legendRow } from '../hooks/legend'
import type { Entry } from '../hooks/legend'

const BLUE = 0x61afef
const GREEN = 0x98c379
const ENTRIES: Entry[] = [
  { text: 'Find sprite code', mark: 0xbcbcbc, color: BLUE },
  { text: 'Explore posse hooks', mark: 0xe06c75, color: BLUE },
  { text: 'Plan a sprite tweak', mark: 0xe5c07b, color: GREEN },
  { text: 'Search walker tests', mark: 0xff8c42, color: BLUE },
  { text: 'Plan legend layout', mark: 0xc678dd, color: GREEN },
]
const text = (columns: number, entries = ENTRIES) =>
  legendRow(columns, entries).map(segment => segment.text).join('')

describe('legend', () => {
  test('lists every task with a mark in its hat color when there is room', () => {
    expect(text(120)).toBe(
      '■ Find sprite code  ■ Explore posse hooks  ■ Plan a sprite tweak  ■ Search walker tests  ■ Plan legend layout',
    )
    const row = legendRow(120, ENTRIES)
    expect(row.filter(s => s.text === '■').map(s => s.color)).toEqual(ENTRIES.map(e => e.mark))
    expect(row.find(s => s.text === ' Plan a sprite tweak')?.color).toBe(GREEN)
  })

  test('cuts the longest tasks short so every one fits', () => {
    expect(text(80)).toBe(
      '■ Find sprite…  ■ Explore pos…  ■ Plan a spri…  ■ Search walk…  ■ Plan legend…',
    )
    // One column more than that row needs keeps the same cut; one less cuts deeper.
    expect(text(79)).toBe(text(78))
    expect(text(77)).not.toBe(text(78))
  })

  test('cuts only as far as it must', () => {
    const short = { text: 'Plan', mark: 0xe06c75, color: GREEN }
    const long = { text: 'Explore every hook file', mark: 0xbcbcbc, color: BLUE }
    expect(text(26, [short, long])).toBe('■ Plan  ■ Explore every h…')
  })

  test('counts the tasks that do not fit even when cut short', () => {
    expect(text(50)).toBe('■ Find spri…  ■ Explore p…  ■ Plan a sp…  +2 more')
    expect(legendRow(50, ENTRIES).at(-1)).toEqual({ text: '  +2 more', isDim: true })
  })

  test('never runs wider than the strip', () => {
    for (let columns = 10; columns <= 140; columns++) {
      expect(text(columns).length).toBeLessThanOrEqual(columns)
    }
  })

  test('cuts a task short when not even the first fits', () => {
    expect(text(14, ENTRIES.slice(0, 1))).toBe('■ Find sprite…')
    expect(text(20)).toBe('■ Find spr…  +4 more')
    expect(text(5)).toBe('+5 more')
  })
})
