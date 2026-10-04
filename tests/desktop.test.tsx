import { describe, expect, mock, test } from 'claude-code/testing'
import type { AgentStatus } from 'claude-code'

import { BOSS, lookFor } from '../hooks/looks'
import { LIST_EVERY } from '../hooks/register'
import { TICK_MS } from '../hooks/walker'
import { TURN_END, agent, animations, band, engine, hex } from './kit'

describe('desktop band', () => {
  test('draws the boss as one self-animating SVG', async ($, on) => {
    mock.clock(on)
    engine(on)
    const ui = await $.ui.mount(band(true, 'desktop'))
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()

    const svg = await ui.find({ type: 'Svg' })
    expect(svg?.props).toMatchObject({
      alt: 'The boss walking above the prompt',
      isInteractive: true,
    })
    const source = String(svg?.props.source)
    expect(source.startsWith('<svg')).toBe(true)
    expect(animations(source)).toBe(1)
    expect(source).toContain(hex(BOSS.color))
  })

  test('is never repainted tick by tick', async ($, on) => {
    const clock = mock.clock(on)
    const blits = engine(on)
    await $.ui.mount(band(true, 'desktop'))

    await $.turn.start({ text: 'go', turnId: 't1' })
    await clock.advance(TICK_MS * 20)
    expect(blits).toHaveLength(0)
  })

  test('steps aside when the strip is too narrow', async ($, on) => {
    mock.clock(on)
    engine(on)
    const ui = await $.ui.mount(band(true, 'desktop', { bodyColumns: 5 }))
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
  })

  test('only pending, running and waiting agents join the posse', async ($, on) => {
    const clock = mock.clock(on)
    const statuses: AgentStatus[] = ['pending', 'running', 'waiting', 'idle', 'completed', 'failed', 'killed']
    engine(on, statuses.map((status, i) => agent(`a${i}`, 'Explore', status)))
    const ui = await $.ui.mount(band(true, 'desktop'))

    await $.turn.start({ text: 'go', turnId: 't1' })
    await clock.advance(TICK_MS * LIST_EVERY)
    await ui.redraw(band(true, 'desktop').props)

    const svg = await ui.find({ type: 'Svg' })
    expect(svg?.props.alt).toBe('The boss and 3 agents walking above the prompt: Explore, Explore and Explore')
    expect(animations(String(svg?.props.source))).toBe(4)
  })

  test('the boss leads a background subagent after the turn ends', async ($, on) => {
    const clock = mock.clock(on)
    const agents = [agent('a1', 'Explore')]
    engine(on, agents)
    const ui = await $.ui.mount(band(true, 'desktop'))

    await $.turn.start({ text: 'go', turnId: 't1' })
    await clock.advance(TICK_MS * LIST_EVERY)
    await $.turn.complete(TURN_END)
    await ui.redraw(band(false, 'desktop').props)

    const svg = await ui.find({ type: 'Svg' })
    expect(svg?.props.alt).toBe('The boss and 1 agent walking above the prompt: Explore')
    expect(animations(String(svg?.props.source))).toBe(2)
    expect(String(svg?.props.source)).toContain(hex(BOSS.color))
    expect(String(svg?.props.source)).toContain(hex(lookFor('Explore').color))

    agents.length = 0
    await clock.advance(TICK_MS * LIST_EVERY)
    await ui.redraw(band(false, 'desktop').props)
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  })

  test("a busy agent's creature is drawn again at a faster pace", async ($, on) => {
    const clock = mock.clock(on)
    engine(on, [agent('a1', 'Explore')])
    on('turn.step', async function* (_$, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn' as const,
        usage: {
          input_tokens: 0,
          output_tokens: 1000,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          model: 'test',
        },
      }
    })
    const props = { bodyColumns: 200 }
    const ui = await $.ui.mount(band(true, 'desktop', props))
    await $.turn.start({ text: 'go', turnId: 't1' })
    await clock.advance(TICK_MS * LIST_EVERY * 2)

    // The Explore creature's walk, after the boss's: how long one period takes.
    const period = async () => {
      await ui.redraw(band(true, 'desktop', props).props)
      const source = String((await ui.find({ type: 'Svg' }))?.props.source)
      const durs = [...source.matchAll(/<animateTransform[^>]*dur="([\d.]+)s"/g)].map(m => Number(m[1]))
      expect(durs).toHaveLength(2)
      return durs[1] ?? 0
    }
    const idle = await period()

    for await (const _ of $.turn.step({ turnId: 't2', index: 0, model: 'test', messageCount: 1, agentId: 'a1' })) {
      // The test's response arrives whole: nothing streams.
    }
    await clock.advance(3000)
    expect(await period()).toBeLessThan(idle * 0.7)
  })
})

