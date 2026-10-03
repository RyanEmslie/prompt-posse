import type { EngineInterface, Register, Timer } from 'claude-code'

import { BOSS, hash, legendText, lookFor } from './looks'
import { BOSS_WIDTH, SPRITE_ROWS, SPRITE_WIDTH, rasterCells } from './sprite'
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
// A teammate in a terminal pane of its own reports running by what it last
// wrote, which a pane that died leaves standing; after this long its
// creature is retired until the teammate goes idle or ends.
export const PANE_STALE_MS = 10 * 60_000
// Where `/posse` remembers being switched off, across sessions.
const STORE_KEY = 'isOn'
const OPTIONS =
  '`/posse` to switch the posse on or off, `/posse on` or `/posse off` to pick one, or `/posse legend` to see which creature is which.'

type Creature = {
  walker: Walker
  look: Look
  /** The kind of agent it walks for (`Explore`, `Plan`, ...); the boss's is empty. */
  type: string
  /** When it started walking: the desktop's animation runs from it. */
  since: number
}

type Walk = {
  boss: Creature
  /** A creature for each active subagent, by agent id; background ones keep walking after the main turn ends. */
  subagents: Map<string, Creature>
  isMainTurn: boolean
  /** Whether `/posse` has it switched on. */
  isOn: boolean
  /** Listings started so far: only the latest one is applied. */
  listings: number
  /** Pane teammates whose creatures were retired, until they stop running. */
  stale: Set<string>
  /** Whether this load has caught up with a turn and agents already under way. */
  isSynced: boolean
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

/** What the desktop's SVG shows, for a reader that can't see it. */
function describe(hasBoss: boolean, types: readonly string[]) {
  const agents = `${types.length} agent${types.length === 1 ? '' : 's'}`
  const who = [hasBoss ? 'The boss' : '', types.length > 0 ? agents : '']
    .filter(Boolean)
    .join(' and ')
  const kinds =
    types.length > 1
      ? `${types.slice(0, -1).join(', ')} and ${types.at(-1)}`
      : (types[0] ?? '')

  return `${who} walking above the prompt${kinds === '' ? '' : `: ${kinds}`}`
}

/** An error's message, whatever was thrown. */
const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error)

function stop(walk: Walk) {
  walk.timer?.cancel()
  walk.timer = null
}

function wake($: EngineInterface, walk: Walk) {
  if (walk.isOn) {
    walk.timer ??= $.clock.every(TICK_MS, () => tick($, walk))
  }
}

/** Lists the agents again, and keeps the timer going to retry if that fails. */
function relist($: EngineInterface, walk: Walk) {
  void list($, walk).catch((error: unknown) => {
    $.ui.log(
      `prompt-posse: couldn't list the session's agents (${reasonOf(error)}); trying again in half a second`,
      { to: 'debug' },
    )
    wake($, walk)
  })
}

/** Brings the creatures in line with the session's active agents. */
async function list($: EngineInterface, walk: Walk) {
  const listing = ++walk.listings
  const agents = await $.agent.list()
  const active = new Map(
    agents.filter(agent => ACTIVE.has(agent.status)).map(agent => [agent.id, agent]),
  )
  const isPane = (agent: { id: string; teammateId?: string }) => agent.id === agent.teammateId
  const needsTime = [...active.values()].some(
    agent => !walk.subagents.has(agent.id) || isPane(agent),
  )
  const now = needsTime ? await $.clock.now() : 0
  // A listing that started before another has nothing newer to say.
  if (listing !== walk.listings) {
    return
  }

  for (const id of walk.stale) {
    if (!active.has(id)) {
      walk.stale.delete(id)
    }
  }
  for (const agent of active.values()) {
    const creature = walk.subagents.get(agent.id)
    if (isPane(agent) && creature !== undefined && now - creature.since > PANE_STALE_MS) {
      walk.stale.add(agent.id)
    }
  }
  for (const id of walk.stale) {
    active.delete(id)
  }

  let isChanged = false
  for (const id of walk.subagents.keys()) {
    if (!active.has(id)) {
      walk.subagents.delete(id)
      isChanged = true
    }
  }

  const columns = walk.band?.columns ?? 80
  for (const agent of active.values()) {
    if (walk.subagents.has(agent.id)) {
      continue
    }
    const others = shown(walk, walk.band?.hasBoss ?? walk.isMainTurn).map(c => c.walker)
    const x = freeSpot(columns, SPRITE_WIDTH, others)
    const heading = x < lastX(columns) / 2 ? 1 : -1
    const speed = 0.7 + (hash(agent.id) % 6) / 10
    walk.subagents.set(agent.id, {
      walker: createWalker(x, heading, speed, SPRITE_WIDTH),
      look: lookFor(agent.type),
      type: agent.type,
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
    relist($, walk)
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
    boss: { walker: createWalker(0, 1, 1, BOSS_WIDTH), look: BOSS, type: '', since: 0 },
    subagents: new Map(),
    isMainTurn: false,
    isOn: true,
    listings: 0,
    stale: new Set(),
    isSynced: false,
    band: null,
    timer: null,
    ticks: 0,
  }

  on('session.start', async ($, e, next) => {
    walk.isOn = (await $.store.get(STORE_KEY)) !== false
    await $.command.register({
      name: 'posse',
      description: "Show or hide the creatures that walk above the prompt while Claude and its agents work, or see who's who",
      argumentHint: '[on|off|legend]',
      immediate: true,
    })

    return next(e)
  })

  on('command.run', { command: 'posse' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'legend') {
      return { text: legendText() }
    }
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: `\`${e.args.trim()}\` isn't a /posse option. Use ${OPTIONS}` }
    }

    walk.isOn = arg === '' ? !walk.isOn : arg === 'on'
    await $.store.set(STORE_KEY, walk.isOn)
    if (walk.isOn) {
      if (walk.isMainTurn) {
        wake($, walk)
      }
      relist($, walk)
    } else {
      stop(walk)
    }
    $.ui.invalidate('ui.render')

    return {
      text: walk.isOn
        ? 'The posse is on. The boss walks above the prompt while Claude works, with a creature for each agent it starts. It stays on in new sessions.'
        : 'The posse is off. It stays off in new sessions. Run `/posse` to bring it back.',
    }
  })

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
    relist($, walk)

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result.agentId !== undefined) {
      relist($, walk)
    }

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Only the terminal's band reaches under the engine's columns.
    const reach = e.surface === 'terminal' ? MARK_COLUMNS : 0
    const columns = Math.min(e.props.bodyColumns + reach, 512)
    // The boss leads the posse: it walks during the turn and for as long
    // as any subagent is still out.
    const hasBoss = e.props.isWorking || walk.subagents.size > 0

    if ((e.surface !== 'terminal' && e.surface !== 'desktop') || !walk.isOn) {
      walk.band = null
      return next(e)
    }

    // A load (a hot reload among them) can come in mid-turn, or while
    // background subagents walk: the first drawing catches up with both.
    if (!walk.isSynced) {
      walk.isSynced = true
      if (e.props.isWorking && !walk.isMainTurn) {
        walk.isMainTurn = true
        walk.boss.since = await $.clock.now()
        wake($, walk)
      }
      relist($, walk)
    }

    if (
      !hasBoss ||
      e.props.hasSurvey ||
      e.props.maxRows < BAND_ROWS ||
      columns < BOSS_WIDTH / 2
    ) {
      walk.band = null
      return next(e)
    }

    const creatures = shown(walk, hasBoss)
    for (const { walker } of creatures) {
      walker.x = Math.min(walker.x, lastX(columns, walker.width))
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
          alt={describe(hasBoss, [...walk.subagents.values()].map(c => c.type))}
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
