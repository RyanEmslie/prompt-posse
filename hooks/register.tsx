import type { EngineInterface, Register, Timer } from 'claude-code'

import { BOSS, hash, lookFor } from './looks'
import { SPRITE_ROWS, SPRITE_WIDTH, rasterCells } from './sprite'
import type { Look } from './sprite'
import { posseSvg } from './svg'
import { TICK_MS, createWalker, freeSpot, lastX, pose, step } from './walker'
import type { Walker } from './walker'

const KEY = 'posse'
const GROUND = '▔'
// The columns the engine keeps at the band's right for its `[-]`, beside the
// first row, the creatures' headwear row; the creatures and the ground reach
// under the mark's columns to span the prompt.
const MARK_COLUMNS = 5
const BAND_ROWS = SPRITE_ROWS + 1
// How often, in ticks, the session's agents are listed again.
const LIST_EVERY = 10
const ACTIVE = new Set(['pending', 'running', 'waiting'])

type Creature = {
  walker: Walker
  look: Look
  /** When it started walking: the desktop's animation runs from it. */
  since: number
}

type Walk = {
  boss: Creature
  /** A creature for each active subagent, by agent id; background ones keep walking after the main turn ends. */
  subagents: Map<string, Creature>
  isMainTurn: boolean
  /** The band while it shows creatures, so the timer knows where to repaint. */
  band: {
    requestId: string
    columns: number
    hasBoss: boolean
    surface: 'terminal' | 'desktop'
  } | null
  timer: Timer | null
  ticks: number
}

const shown = (walk: Walk, hasBoss: boolean) =>
  hasBoss
    ? [walk.boss, ...walk.subagents.values()]
    : [...walk.subagents.values()]

const frame = (columns: number, creatures: readonly Creature[]) =>
  rasterCells(
    columns,
    creatures.map(({ walker, look }) => ({ x: walker.x, pose: pose(walker), look })),
  )

/** What the desktop's SVG shows, for a reader that cannot see it. */
function describe(hasBoss: boolean, subagents: number) {
  const posse = `${subagents} subagent creature${subagents === 1 ? '' : 's'}`
  const who = [hasBoss ? 'The boss' : '', subagents > 0 ? posse : '']
    .filter(Boolean)
    .join(' and ')

  return `${who} walking above the prompt`
}

function stop(walk: Walk) {
  walk.timer?.cancel()
  walk.timer = null
}

function wake($: EngineInterface, walk: Walk) {
  walk.timer ??= $.clock.every(TICK_MS, () => tick($, walk))
}

/** Brings the creatures in line with the session's active agents. */
async function list($: EngineInterface, walk: Walk) {
  const agents = await $.agent.list()
  const active = new Map(
    agents.filter(agent => ACTIVE.has(agent.status)).map(agent => [agent.id, agent]),
  )

  let isChanged = false
  for (const id of walk.subagents.keys()) {
    if (!active.has(id)) {
      walk.subagents.delete(id)
      isChanged = true
    }
  }

  const columns = walk.band?.columns ?? 80
  const now = await $.clock.now()
  for (const agent of active.values()) {
    if (walk.subagents.has(agent.id)) {
      continue
    }
    const others = shown(walk, walk.band?.hasBoss ?? walk.isMainTurn).map(c => c.walker)
    const x = freeSpot(columns, others)
    const heading = x < lastX(columns) / 2 ? 1 : -1
    const speed = 0.7 + (hash(agent.id) % 6) / 10
    walk.subagents.set(agent.id, {
      walker: createWalker(x, heading, speed),
      look: lookFor(agent.type),
      since: now,
    })
    isChanged = true
  }

  if (isChanged) {
    $.ui.invalidate('ui.render')
  }
  if (walk.subagents.size > 0) {
    wake($, walk)
  } else if (!walk.isMainTurn) {
    stop(walk)
  }
}

function tick($: EngineInterface, walk: Walk) {
  walk.ticks += 1
  if (walk.ticks % LIST_EVERY === 0) {
    void list($, walk)
  }
  // The desktop's SVG animates itself; only the terminal is repainted.
  if (walk.band === null || walk.band.surface !== 'terminal') {
    return
  }

  const { requestId, columns, hasBoss } = walk.band
  const creatures = shown(walk, hasBoss)
  for (const creature of creatures) {
    const others = creatures.filter(c => c !== creature).map(c => c.walker)
    step(creature.walker, columns, others)
  }
  void $.ui.blit({ requestId, key: KEY, cells: frame(columns, creatures) })
}

export const register: Register = on => {
  const walk: Walk = {
    boss: { walker: createWalker(), look: BOSS, since: 0 },
    subagents: new Map(),
    isMainTurn: false,
    band: null,
    timer: null,
    ticks: 0,
  }

  on('turn.start', async ($, e, next) => {
    walk.isMainTurn = true
    walk.boss.since = await $.clock.now()
    wake($, walk)
    $.ui.invalidate('ui.render')

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    // A subagent's run ends with a turn.complete of its own: its creature
    // leaves once the listing no longer shows it active.
    if (e.agentId === undefined) {
      walk.isMainTurn = false
      if (walk.subagents.size === 0) {
        stop(walk)
      }
      $.ui.invalidate('ui.render')
    }
    void list($, walk)

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result.agentId !== undefined) {
      void list($, walk)
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Only the terminal's band reaches under the engine's columns.
    const reach = e.surface === 'terminal' ? MARK_COLUMNS : 0
    const columns = Math.min(e.props.bodyColumns + reach, 512)
    const hasBoss = e.props.isWorking

    if (
      (e.surface !== 'terminal' && e.surface !== 'desktop') ||
      (!hasBoss && walk.subagents.size === 0) ||
      e.props.hasSurvey ||
      e.props.maxRows < BAND_ROWS ||
      columns < SPRITE_WIDTH / 2
    ) {
      walk.band = null
      return next(e)
    }

    const creatures = shown(walk, hasBoss)
    for (const { walker } of creatures) {
      walker.x = Math.min(walker.x, lastX(columns))
    }
    walk.band = { requestId: e.requestId, columns, hasBoss, surface: e.surface }

    if (e.surface === 'desktop') {
      const now = await $.clock.now()
      const strides = creatures.map(({ walker, look, since }) => ({
        x: walker.x,
        heading: walker.heading,
        speed: walker.speed,
        elapsedMs: now - since,
        look,
      }))
      const { Svg } = $.ui.resolve(e)

      return (
        <Svg
          source={posseSvg(columns, strides)}
          alt={describe(hasBoss, walk.subagents.size)}
          isInteractive
        />
      )
    }

    const { Box, Raster, Text } = $.ui.resolve(e)

    // Each row is placed absolutely so it can reach under the engine's
    // columns; the ground sits at the top of its row, so feet touch it.
    return (
      <Box flexDirection="column">
        <Box height={SPRITE_ROWS}>
          <Box position="absolute" left={0} width={columns}>
            <Raster
              key={KEY}
              columns={columns}
              rows={SPRITE_ROWS}
              cells={frame(columns, creatures)}
            />
          </Box>
        </Box>
        <Box height={1}>
          <Box position="absolute" left={0} width={columns}>
            <Text dimColor wrap="truncate">
              {GROUND.repeat(columns)}
            </Text>
          </Box>
        </Box>
      </Box>
    )
  })
}
