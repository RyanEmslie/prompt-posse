import { describe, expect, mock, test } from 'claude-code/testing'

import { LEGEND } from '../hooks/looks'
import { TICK_MS } from '../hooks/walker'
import { SPAWN, START, agent, band, engine, host, posse } from './kit'

describe('/posse', () => {
  test('is registered at session start, to run even mid-turn', async ($, on) => {
    engine(on)
    const { commands } = host(on)
    await $.session.start(START)
    expect(commands).toEqual([
      expect.objectContaining({ name: 'posse', argumentHint: '[on|off|legend]', immediate: true }),
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
})
