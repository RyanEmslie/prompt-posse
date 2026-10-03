import { describe, expect, mock, test } from 'claude-code/testing'
import type { AgentInfo, On } from 'claude-code'

import { ANTENNAE, BOSS, lookFor } from '../hooks/looks'
import { SPRITE_ROWS, glyphRows } from '../hooks/sprite'
import {
  PAUSE_TICKS,
  SPACING,
  TICK_MS,
  createWalker,
  lastX,
  pose,
  step,
} from '../hooks/walker'

const band = (isWorking: boolean) => ({
  component: 'AbovePrompt' as const,
  plugin: 'prompt-posse',
  surface: 'terminal' as const,
  requestId: 'band',
  props: {
    hasSurvey: false,
    isWorking,
    maxRows: 10,
    bodyColumns: 40,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
})

const agent = (id: string, type: string): AgentInfo => ({
  id,
  type,
  description: 'a task',
  status: 'running',
})

// What the engine would do beneath the plugin: draw its own band, take every
// redraw request and repaint, recording the cells each repaint carries, and
// list the agents the test says are there.
function engine(on: On, agents: AgentInfo[] = []) {
  const blits: string[] = []
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.blit', (_$, e) => {
    if ('cells' in e) {
      blits.push(e.cells)
    }
    return { value: {} }
  })
  on('agent.list', () => ({ value: [...agents] }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  return blits
}

const TURN_END = {
  answer: '',
  durationMs: 0,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
} as const

const STANDING = { facing: 0, step: 0, isBlinking: false } as const

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
})

describe('looks', () => {
  test('every type always gets the same look, and its own headwear', () => {
    expect(lookFor('superpowers:code-reviewer')).toEqual(
      lookFor('superpowers:code-reviewer'),
    )
    expect(lookFor('constructor').headwear).not.toBeNull()
    expect(lookFor('Plan')).not.toEqual(lookFor('Explore'))

    const builtIn = ['Explore', 'Plan', 'general-purpose', 'claude', 'fork'].map(
      type => lookFor(type).headwear,
    )
    for (const type of ['superpowers:code-reviewer', 'statusline-setup', 'mine']) {
      expect(builtIn).not.toContain(lookFor(type).headwear)
    }
  })
})

describe('walker', () => {
  test('walks to the edge, looks at you, and turns back', () => {
    const walker = createWalker()
    const end = lastX(20)
    for (let i = 0; i < end; i++) step(walker, 20)
    expect(walker.x).toBe(end)
    expect(pose(walker).facing).toBe(0)

    for (let i = 0; i < PAUSE_TICKS; i++) step(walker, 20)
    expect(walker.heading).toBe(-1)
    step(walker, 20)
    expect(walker.x).toBe(end - 1)
    expect(pose(walker).facing).toBe(-1)
  })

  test('two that meet bump and turn around', () => {
    const left = createWalker(0, 1)
    const right = createWalker(40, -1)
    for (let i = 0; i < 40; i++) {
      step(left, 60, [right])
      step(right, 60, [left])
      expect(right.x - left.x).toBeGreaterThanOrEqual(SPACING)
    }
    expect(left.heading).toBe(-1)
    expect(right.heading).toBe(1)
  })
})

describe('band', () => {
  test('leaves the band to the engine while idle', async ($, on) => {
    engine(on)
    const ui = await $.ui.mount(band(false))
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
    expect(await ui.find({ text: 'engine band' })).toBeDefined()
  })

  test('walks while a turn runs and stops when it ends', async ($, on) => {
    const clock = mock.clock(on)
    const blits = engine(on)
    const ui = await $.ui.mount(band(true))
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

  test("keeps walking through a subagent's turn", async ($, on) => {
    const clock = mock.clock(on)
    const blits = engine(on)
    await $.ui.mount(band(true))

    await $.turn.start({ text: 'go', turnId: 't1' })
    await $.turn.complete({ ...TURN_END, turnId: 't2', agentId: 'helper' })
    await clock.advance(TICK_MS * 5)
    expect(blits).toHaveLength(5)
  })

  test('a background subagent walks on until it finishes', async ($, on) => {
    const clock = mock.clock(on)
    const agents = [agent('a1', 'Explore')]
    const blits = engine(on, agents)
    const ui = await $.ui.mount(band(true))

    await $.turn.start({ text: 'go', turnId: 't1' })
    await clock.advance(TICK_MS * 10)
    await $.turn.complete(TURN_END)
    await ui.redraw(band(false).props)
    expect(await ui.find({ type: 'Raster' })).toBeDefined()

    const walking = blits.length
    await clock.advance(TICK_MS * 4)
    expect(blits).toHaveLength(walking + 4)

    agents.length = 0
    await clock.advance(TICK_MS * 10)
    const finished = blits.length
    await clock.advance(TICK_MS * 10)
    expect(blits).toHaveLength(finished)
    await ui.redraw(band(false).props)
    expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  })
})
