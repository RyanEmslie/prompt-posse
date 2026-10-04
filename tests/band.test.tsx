import { describe, expect, mock, test } from 'claude-code/testing'

import { BOSS, lookFor } from '../hooks/looks'
import { SPRITE_ROWS } from '../hooks/sprite'
import { TICK_MS } from '../hooks/walker'
import type { AgentInfo } from 'claude-code'

import { IDLE_RETRIES, LIST_EVERY, PANE_STALE_MS } from '../hooks/register'
import { SPAWN, TURN_END, agent, band, decodeCells, engine } from './kit'

describe('terminal band', () => {
  test('leaves the band to the engine while idle', async ($, on) => {
    mock.clock(on)
    engine(on)
    const ui = await $.ui.mount(band(false, 'terminal'))
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
  })

  test('steps aside for a survey, a short strip or a narrow one', async ($, on) => {
    mock.clock(on)
    engine(on)
    for (const props of [{ hasSurvey: true }, { maxRows: SPRITE_ROWS }, { bodyColumns: 0 }]) {
      const ui = await $.ui.mount(band(true, 'terminal', props))
      expect(await ui.find({ type: 'Raster' })).toBeUndefined()
      expect(await ui.find({ text: 'engine band' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('draws nothing of its own in VS Code', async ($, on) => {
    mock.clock(on)
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
    await clock.advance(TICK_MS * LIST_EVERY)
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
    await clock.advance(TICK_MS * LIST_EVERY)
    const finished = blits.length
    await clock.advance(TICK_MS * 10)
    expect(blits).toHaveLength(finished)
    await ui.redraw(band(false, 'terminal').props)
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  })

  test('a subagent started while nothing walks wakes the walk', async ($, on) => {
    const clock = mock.clock(on)
    const agents: AgentInfo[] = []
    const blits = engine(on, agents)
    on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }))
    const ui = await $.ui.mount(band(false, 'terminal'))
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()

    agents.push(agent('a1', 'Explore'))
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

  test('a listing that started first but answers last is ignored', async ($, on) => {
    const clock = mock.clock(on)
    // Each listing after the first answers this late, with these agents.
    const script: [number, AgentInfo[]][] = [
      [0, []],
      [300, [agent('a1', 'Explore')]],
      [100, []],
    ]
    let calls = 0
    engine(on, async () => {
      const [late, agents] = script[calls++] ?? [0, []]
      await clock.sleep(late)
      return agents
    })
    on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }))
    const ui = await $.ui.mount(band(false, 'terminal'))
    await clock.settle()

    void $.agent.spawn(SPAWN)
    await clock.settle()
    await $.turn.complete({ ...TURN_END, turnId: 't2', agentId: 'a1' })
    await clock.advance(350)
    await ui.redraw(band(false, 'terminal').props)
    expect(calls).toBe(3)
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  })

  test('a failed listing is tried again on the next check', async ($, on) => {
    const clock = mock.clock(on)
    const agents: AgentInfo[] = []
    let isDown = false
    engine(on, () => {
      if (isDown) throw new Error('agents unavailable')
      return [...agents]
    })
    on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }))
    const ui = await $.ui.mount(band(false, 'terminal'))
    await clock.settle()

    isDown = true
    agents.push(agent('a1', 'Explore'))
    await $.agent.spawn(SPAWN)
    await clock.settle()
    isDown = false
    await clock.advance(TICK_MS * LIST_EVERY)
    await ui.redraw(band(false, 'terminal').props)
    expect(await ui.find({ type: 'Raster' })).toBeDefined()
  })

  test('a load mid-turn catches up with the turn and its subagents', async ($, on) => {
    const clock = mock.clock(on)
    const blits = engine(on, [agent('a1', 'Explore')])
    const ui = await $.ui.mount(band(true, 'terminal'))

    await clock.advance(TICK_MS * 10)
    expect(blits).toHaveLength(10)
    await ui.redraw(band(true, 'terminal').props)
    const raster = await ui.find({ type: 'Raster' })
    const colors = new Set(decodeCells(String(raster?.props.cells)).map(cell => cell.fg))
    expect(colors.has(BOSS.color)).toBe(true)
    expect(colors.has(lookFor('Explore').color)).toBe(true)
  })

  test('a load after the turn still finds background subagents', async ($, on) => {
    const clock = mock.clock(on)
    const blits = engine(on, [agent('a1', 'Explore')])
    const ui = await $.ui.mount(band(false, 'terminal'))

    await clock.settle()
    await ui.redraw(band(false, 'terminal').props)
    expect(await ui.find({ type: 'Raster' })).toBeDefined()
    await clock.advance(TICK_MS * 4)
    expect(blits).toHaveLength(4)
  })

  test(
    'a pane teammate stuck at running is retired after a while',
    async ($, on) => {
      const clock = mock.clock(on)
      const pane = { ...agent('scout@crew', 'teammate'), teammateId: 'scout@crew' }
      const inProcess = { ...agent('a7', 'teammate'), teammateId: 'helper@crew' }
      engine(on, [pane, inProcess])
      const ui = await $.ui.mount(band(false, 'desktop'))
      await clock.settle()
      await ui.redraw(band(false, 'desktop').props)
      expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe(
        'The boss and 2 agents walking above the prompt: teammate and teammate',
      )

      await clock.advance(PANE_STALE_MS + TICK_MS * LIST_EVERY * 2)
      await ui.redraw(band(false, 'desktop').props)
      expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe(
        'The boss and 1 agent walking above the prompt: teammate',
      )
    },
  )

  test('listings slower than the check interval still get applied', async ($, on) => {
    const clock = mock.clock(on)
    // Every listing takes longer than the gap before the next one starts.
    engine(on, async () => {
      await clock.sleep(TICK_MS * LIST_EVERY + 100)
      return [agent('a1', 'Explore')]
    })
    const ui = await $.ui.mount(band(true, 'terminal'))

    await clock.advance(TICK_MS * LIST_EVERY * 6)
    await ui.redraw(band(true, 'terminal').props)
    const raster = await ui.find({ type: 'Raster' })
    const colors = new Set(decodeCells(String(raster?.props.cells)).map(cell => cell.fg))
    expect(colors.has(lookFor('Explore').color)).toBe(true)
  })

  test('listing that keeps failing while idle gives up after a few tries', async ($, on) => {
    const clock = mock.clock(on)
    let calls = 0
    let isDown = false
    engine(on, () => {
      calls += 1
      if (isDown) throw new Error('agents unavailable')
      return []
    })
    on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }))
    await $.ui.mount(band(false, 'terminal'))
    await clock.settle()
    const before = calls

    isDown = true
    await $.agent.spawn(SPAWN)
    await clock.advance(5_000)
    const after = calls
    expect(after - before).toBe(1 + IDLE_RETRIES)
    await clock.advance(20_000)
    expect(calls).toBe(after)
  })

  test('a retired pane teammate comes back once it has been out of sight', async ($, on) => {
    const clock = mock.clock(on)
    const pane = { ...agent('scout@crew', 'teammate'), teammateId: 'scout@crew' }
    engine(on, [pane])
    const ui = await $.ui.mount(band(false, 'desktop'))
    await clock.settle()
    await ui.redraw(band(false, 'desktop').props)

    await clock.advance(PANE_STALE_MS + TICK_MS * LIST_EVERY * 2)
    await ui.redraw(band(false, 'desktop').props)
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()

    // Nothing walks, so nothing checks; it may have gone idle and come back.
    await clock.advance(60_000)
    await $.turn.start({ text: 'go', turnId: 't1' })
    await clock.advance(TICK_MS * LIST_EVERY)
    await ui.redraw(band(true, 'desktop').props)
    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe(
      'The boss and 1 agent walking above the prompt: teammate',
    )
  })
})

describe('legend row', () => {
  const explore = (id: string, description: string) => ({ ...agent(id, 'Explore'), description })

  test('two agents of a kind wear different hats, and the legend names their tasks', async ($, on) => {
    const clock = mock.clock(on)
    engine(on, [explore('a1', 'Find sprite code'), explore('a2', 'Explore posse hooks')])
    const ui = await $.ui.mount(band(true, 'terminal', { bodyColumns: 75 }))
    await $.turn.start({ text: 'go', turnId: 't1' })
    await clock.advance(TICK_MS * LIST_EVERY)
    await ui.redraw(band(true, 'terminal', { bodyColumns: 75 }).props)

    expect(await ui.find({ type: 'Text', text: 'Find sprite code' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Explore posse hooks' })).toBeDefined()

    const raster = await ui.find({ type: 'Raster' })
    const colors = new Set(decodeCells(String(raster?.props.cells)).map(cell => cell.fg))
    const own = lookFor('Explore').hatColor
    expect(colors.has(own)).toBe(true)
    const hats = [...colors].filter(
      color => color !== own && color !== BOSS.color && color !== lookFor('Explore').color,
    )
    expect(hats.length).toBeGreaterThan(0)
  })

  test('gives up its row first when the strip is short', async ($, on) => {
    const clock = mock.clock(on)
    engine(on, [explore('a1', 'Find sprite code')])
    const ui = await $.ui.mount(band(true, 'terminal', { maxRows: SPRITE_ROWS + 1 }))
    await $.turn.start({ text: 'go', turnId: 't1' })
    await clock.advance(TICK_MS * LIST_EVERY)
    await ui.redraw(band(true, 'terminal', { maxRows: SPRITE_ROWS + 1 }).props)

    expect(await ui.find({ type: 'Raster' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Find sprite code' })).toBeUndefined()
  })
})
