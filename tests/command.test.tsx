import { describe, expect, mock, test } from 'claude-code/testing'

import { LEGEND, lookFor } from '../hooks/looks'
import { DEMO_MS, LIST_EVERY } from '../hooks/register'
import { TICK_MS } from '../hooks/walker'
import { SPAWN, START, agent, band, decodeCells, engine, host, posse } from './kit'

describe('/posse', () => {
  test('is registered at session start, to run even mid-turn', async ($, on) => {
    engine(on)
    const { commands } = host(on)
    await $.session.start(START)
    expect(commands).toEqual([
      expect.objectContaining({ name: 'posse', argumentHint: '[on|off|legend|demo]', immediate: true }),
    ])
  })

  test('switches the posse off mid-turn, and back on', async ($, on) => {
    const clock = mock.clock(on)
    const blits = engine(on)
    const { stored } = host(on)
    await $.session.start(START)
    const ui = await $.ui.mount(band(true, 'terminal'))
    await $.turn.start({ text: 'go', turnId: 't1' })
    await clock.advance(TICK_MS * 5)
    expect(blits).toHaveLength(5)

    const off = await $.command.run(posse())
    expect(off.text).toBe('The posse is off. It stays off in new sessions. Run `/posse` to bring it back.')
    expect(stored.get('isOn')).toBe(false)
    await clock.advance(TICK_MS * 10)
    expect(blits).toHaveLength(5)
    await ui.redraw(band(true, 'terminal').props)
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
    expect(await ui.find({ text: 'engine band' })).toBeDefined()

    const back = await $.command.run(posse())
    expect(back.text).toContain('The posse is on.')
    expect(back.text).toContain('It stays on in new sessions.')
    expect(stored.get('isOn')).toBe(true)
    await ui.redraw(band(true, 'terminal').props)
    expect(await ui.find({ type: 'Raster' })).toBeDefined()
    await clock.advance(TICK_MS * 4)
    expect(blits).toHaveLength(9)
  })

  test('hides the desktop SVG too', async ($, on) => {
    mock.clock(on)
    engine(on)
    host(on)
    await $.session.start(START)
    const ui = await $.ui.mount(band(true, 'desktop'))
    expect(await ui.find({ type: 'Svg' })).toBeDefined()

    await $.command.run(posse('off'))
    await ui.redraw(band(true, 'desktop').props)
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
  })

  test('stays off in a new session', async ($, on) => {
    const clock = mock.clock(on)
    const blits = engine(on)
    host(on, new Map([['isOn', false]]))
    await $.session.start(START)
    const ui = await $.ui.mount(band(true, 'terminal'))

    await $.turn.start({ text: 'go', turnId: 't1' })
    await clock.advance(TICK_MS * 10)
    expect(blits).toHaveLength(0)
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  })

  test('a subagent starting while it is off brings no one out', async ($, on) => {
    const clock = mock.clock(on)
    const blits = engine(on, [agent('a1', 'Explore')])
    host(on, new Map([['isOn', false]]))
    on('agent.spawn', () => ({ model: 'claude-haiku-4-5', agentId: 'a1' }))
    await $.session.start(START)
    const ui = await $.ui.mount(band(false, 'terminal'))

    await $.agent.spawn(SPAWN)
    await clock.advance(TICK_MS * 10)
    await ui.redraw(band(false, 'terminal').props)
    expect(blits).toHaveLength(0)
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  })

  test('on and off set it either way, whatever it was', async ($, on) => {
    mock.clock(on)
    engine(on)
    const { stored } = host(on)
    await $.session.start(START)

    await $.command.run(posse('off'))
    await $.command.run(posse('off'))
    expect(stored.get('isOn')).toBe(false)
    await $.command.run(posse('ON'))
    await $.command.run(posse('on'))
    expect(stored.get('isOn')).toBe(true)
  })

  test('legend lists who wears what and changes nothing', async ($, on) => {
    mock.clock(on)
    engine(on)
    const { stored } = host(on)
    await $.session.start(START)

    const { text = '' } = await $.command.run(posse('legend'))
    expect(text).toContain('**The boss** is Claude itself')
    for (const { type, says } of LEGEND) {
      expect(text).toContain(`\`${type}\` agents: ${says}`)
    }
    expect(text).toContain('**Any other agent**')
    expect(stored.has('isOn')).toBe(false)
  })

  test('anything else shows how to use it and changes nothing', async ($, on) => {
    mock.clock(on)
    engine(on)
    const { stored } = host(on)
    await $.session.start(START)

    const { text = '' } = await $.command.run(posse('dance'))
    expect(text).toContain("`dance` isn't a /posse option")
    expect(text).toContain('`/posse legend`')
    expect(stored.has('isOn')).toBe(false)
  })

  test('demo brings out one of each kind for a while, even with no turn running', async ($, on) => {
    const clock = mock.clock(on)
    const blits = engine(on)
    host(on)
    await $.session.start(START)
    const ui = await $.ui.mount(band(false, 'terminal', { bodyColumns: 115 }))
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()

    const reply = await $.command.run(posse('demo'))
    expect(reply.text).toContain(`walks for ${DEMO_MS / 1000} seconds`)
    await ui.redraw(band(false, 'terminal', { bodyColumns: 115 }).props)
    const raster = await ui.find({ type: 'Raster' })
    expect(raster).toBeDefined()
    const colors = new Set(decodeCells(String(raster?.props.cells)).map(cell => cell.fg))
    for (const type of ['Explore', 'Plan', 'general-purpose', 'claude', 'fork']) {
      expect(colors.has(lookFor(type).color)).toBe(true)
    }
    for (const name of ['Explore', 'a second Explore', 'any other type']) {
      expect(await ui.find({ type: 'Text', text: name })).toBeDefined()
    }

    // The agent listing finds no one, and leaves the demo walking.
    await clock.advance(TICK_MS * LIST_EVERY * 2)
    expect(blits.length).toBeGreaterThan(0)
    await ui.redraw(band(false, 'terminal', { bodyColumns: 115 }).props)
    expect(await ui.find({ type: 'Text', text: 'a second Explore' })).toBeDefined()

    await clock.advance(DEMO_MS)
    const done = blits.length
    await clock.advance(TICK_MS * 10)
    expect(blits).toHaveLength(done)
    await ui.redraw(band(false, 'terminal', { bodyColumns: 115 }).props)
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
  })

  test('demo again ends it sooner', async ($, on) => {
    const clock = mock.clock(on)
    const blits = engine(on)
    host(on)
    await $.session.start(START)
    const ui = await $.ui.mount(band(false, 'terminal'))
    await $.command.run(posse('demo'))
    await clock.advance(TICK_MS * 4)

    expect((await $.command.run(posse('demo'))).text).toBe('The demo is over.')
    const done = blits.length
    await clock.advance(TICK_MS * 10)
    expect(blits).toHaveLength(done)
    await ui.redraw(band(false, 'terminal').props)
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  })

  test('demo asks for the posse to be on first', async ($, on) => {
    mock.clock(on)
    engine(on)
    host(on, new Map([['isOn', false]]))
    await $.session.start(START)
    const ui = await $.ui.mount(band(false, 'terminal'))

    expect((await $.command.run(posse('demo'))).text).toBe(
      'The posse is off. Run `/posse on` first, then `/posse demo`.',
    )
    await ui.redraw(band(false, 'terminal').props)
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  })
})
