import { describe, expect, mock, test } from 'claude-code/testing'
import type { AgentStatus } from 'claude-code'

import { TICK_MS } from '../hooks/walker'
import { TURN_END, agent, animations, band, engine } from './kit'

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
    expect(source).toContain('#d77757')
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
    await clock.advance(TICK_MS * 10)
    await ui.redraw(band(true, 'desktop').props)

    const svg = await ui.find({ type: 'Svg' })
    expect(svg?.props.alt).toBe('The boss and 3 subagent creatures walking above the prompt')
    expect(animations(String(svg?.props.source))).toBe(4)
  })

  test('the boss leads a background subagent after the turn ends', async ($, on) => {
    const clock = mock.clock(on)
    const agents = [agent('a1', 'Explore')]
    engine(on, agents)
    const ui = await $.ui.mount(band(true, 'desktop'))

    await $.turn.start({ text: 'go', turnId: 't1' })
    await clock.advance(TICK_MS * 10)
    await $.turn.complete(TURN_END)
    await ui.redraw(band(false, 'desktop').props)

    const svg = await ui.find({ type: 'Svg' })
    expect(svg?.props.alt).toBe('The boss and 1 subagent creature walking above the prompt')
    expect(animations(String(svg?.props.source))).toBe(2)
    expect(String(svg?.props.source)).toContain('#d77757')
    expect(String(svg?.props.source)).toContain('#61afef')

    agents.length = 0
    await clock.advance(TICK_MS * 10)
    await ui.redraw(band(false, 'desktop').props)
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  })
})
