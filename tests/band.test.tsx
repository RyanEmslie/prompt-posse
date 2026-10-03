import { describe, expect, mock, test } from 'claude-code/testing'

import { BOSS, lookFor } from '../hooks/looks'
import { SPRITE_ROWS } from '../hooks/sprite'
import { TICK_MS } from '../hooks/walker'
import { SPAWN, TURN_END, agent, band, decodeCells, engine } from './kit'

describe('terminal band', () => {
  test('leaves the band to the engine while idle', async ($, on) => {
    engine(on)
    const ui = await $.ui.mount(band(false, 'terminal'))
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
  })

  test('steps aside for a survey, a short strip or a narrow one', async ($, on) => {
    engine(on)
    for (const props of [{ hasSurvey: true }, { maxRows: SPRITE_ROWS }, { bodyColumns: 0 }]) {
      const ui = await $.ui.mount(band(true, 'terminal', props))
      expect(await ui.find({ type: 'Raster' })).toBeUndefined()
      expect(await ui.find({ text: 'engine band' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('draws nothing of its own in VS Code', async ($, on) => {
    engine(on)
    const ui = await $.ui.mount(band(true, 'vscode'))
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
  })

  test('walks while a turn runs and stops when it ends', async ($, on) => {
    const clock = mock.clock(on)
    const blits = engine(on)
    const ui = await $.ui.mount(band(true, 'terminal'))
    const raster = await ui.find({ type: 'Raster' })
    expect(raster?.props).toMatchObject({
      key: 'posse',
      columns: 45,
      rows: SPRITE_ROWS,
    })
    const ground = await ui.find({ type: 'Text', text: '▔' })
    expect(ground?.text).toBe('▔'.repeat(45))

    await $.turn.start({ text: 'go', turnId: 't1' })
    await clock.advance(TICK_MS * 10)
    expect(blits).toHaveLength(10)
    expect(new Set(blits).size).toBeGreaterThan(1)

    await $.turn.complete(TURN_END)
    await clock.advance(TICK_MS * 10)
    expect(blits).toHaveLength(10)
  })

  test('keeps the boss on the strip when the strip narrows', async ($, on) => {
    const clock = mock.clock(on)
    engine(on)
    const ui = await $.ui.mount(band(true, 'terminal'))
    await $.turn.start({ text: 'go', turnId: 't1' })
    await clock.advance(TICK_MS * 80)

    await ui.redraw(band(true, 'terminal', { bodyColumns: 10 }).props)
    const raster = await ui.find({ type: 'Raster' })
    expect(raster?.props.columns).toBe(15)
    const cells = decodeCells(String(raster?.props.cells))
    expect(cells.some(cell => cell.fg === BOSS.color)).toBe(true)
  })

  test("keeps walking through a subagent's turn", async ($, on) => {
    const clock = mock.clock(on)
    const blits = engine(on)
    await $.ui.mount(band(true, 'terminal'))

    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.turn.complete({ ...TURN_END, turnId: 't2', agentId: 'helper' })
    await clock.advance(TICK_MS * 5)
    expect(blits).toHaveLength(5)
  })

  test('the boss walks with a background subagent until it finishes', async ($, on) => {
    const clock = mock.clock(on)
    const agents = [agent('a1', 'Explore')]
    const blits = engine(on, agents)
    const ui = await $.ui.mount(band(true, 'terminal'))

    await $.turn.start({ text: 'go', turnId: 't1' })
    await clock.advance(TICK_MS * 10)
    await $.turn.complete(TURN_END)
    await ui.redraw(band(false, 'terminal').props)
    const raster = await ui.find({ type: 'Raster' })
    const colors = new Set(decodeCells(String(raster?.props.cells)).map(cell => cell.fg))
    expect(colors.has(BOSS.color)).toBe(true)
    expect(colors.has(lookFor('Explore').color)).toBe(true)

    const walking = blits.length
    await clock.advance(TICK_MS * 4)
    expect(blits).toHaveLength(walking + 4)

    agents.length = 0
    await clock.advance(TICK_MS * 10)
    const finished = blits.length
    await clock.advance(TICK_MS * 10)
    expect(blits).toHaveLength(finished)
    await ui.redraw(band(false, 'terminal').props)
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  })

  test('a subagent started while nothing walks wakes the walk', async ($, on) => {
    const clock = mock.clock(on)
    const agents = [agent('a1', 'Explore')]
    const blits = engine(on, agents)
    on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }))
    const ui = await $.ui.mount(band(false, 'terminal'))
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()

    await $.agent.spawn(SPAWN)
    await clock.settle()
    await ui.redraw(band(false, 'terminal').props)
    expect(await ui.find({ type: 'Raster' })).toBeDefined()

    await clock.advance(TICK_MS * 4)
    expect(blits).toHaveLength(4)
  })

  test('a refused spawn adds no one', async ($, on) => {
    const clock = mock.clock(on)
    const blits = engine(on)
    on('agent.spawn', () => ({ deny: 'not now' }))
    const ui = await $.ui.mount(band(false, 'terminal'))

    await $.agent.spawn(SPAWN)
    await clock.advance(TICK_MS * 10)
    await ui.redraw(band(false, 'terminal').props)
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
    expect(blits).toHaveLength(0)
  })
})
