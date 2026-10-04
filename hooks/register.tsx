import type { EngineInterface, Register, Timer } from 'claude-code'

import { hex, legendRow } from './legend'
import { BOSS, hash, hatFor, legendText } from './looks'
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
// The legend takes a row of its own under the ground, while subagents walk
// and there's room for it.
const LEGEND_ROWS = 1
// How often, in ticks, the session's agents are listed again.
export const LIST_EVERY = 10
const ACTIVE = new Set(['pending', 'running', 'waiting'])
// A teammate in a terminal pane of its own reports running by what it last
// wrote, which a pane that died leaves standing; after this long its
// creature is retired until the teammate goes idle or ends.
export const PANE_STALE_MS = 10 * 60_000
// Checks this far apart may have missed a retired teammate going idle, so
// it gets a fresh start.
const UNSEEN_MS = TICK_MS * LIST_EVERY * 4
// Times a failed listing is retried while nothing walks to keep retrying it.
export const IDLE_RETRIES = 3
// Where `/posse` remembers being switched off, across sessions.
const STORE_KEY = 'isOn'
const OPTIONS =
  '`/posse` to switch the posse on or off, `/posse on` or `/posse off` to pick one, `/posse legend` to see which creature is which, or `/posse demo` to watch them walk.'
// How long `/posse demo` walks, and who walks in it: one of each kind of
// agent and a second Explore, to show the spare hat a newcomer wears.
export const DEMO_MS = 20_000
const DEMO = [
  ['Explore', 'Explore'],
  ['Plan', 'Plan'],
  ['general-purpose', 'general-purpose'],
  ['claude', 'claude'],
  ['fork', 'fork'],
  ['Explore', 'a second Explore'],
  ['my-agent', 'any other type'],
] as const

type Creature = {
  walker: Walker
  look: Look
  /** The kind of agent it walks for (`Explore`, `Plan`, ...); the boss's is empty. */
  type: string
  /** What its agent is doing, as the Agent call described it; the boss's is empty. */
  description: string
  /** When it started walking: the desktop's animation runs from it. */
  since: number
}

type Walk = {
  boss: Creature
  /** A creature for each active subagent, by agent id; background ones keep walking after the main turn ends. */
  subagents: Map<string, Creature>
  /** The creatures `/posse demo` brought out, until its time is up. */
  demo: Map<string, Creature>
  demoTimer: Timer | null
  isMainTurn: boolean
  /** Whether `/posse` has it switched on. */
  isOn: boolean
  /** Listings started so far. */
  listings: number
  /** The newest listing applied: an older one that answers later is ignored. */
  applied: number
  /** Failed listings in a row. */
  failures: number
  /** When the last listing that read the time was applied. */
  listedAt: number
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
  /** How often the timer fires: every tick on the terminal, only to list agents on the desktop. */
  timerMs: number
  ticks: number
}

const shown = (walk: Walk, hasBoss: boolean) => [
  ...(hasBoss ? [walk.boss] : []),
  ...walk.subagents.values(),
  ...walk.demo.values(),
]

/** Whether anyone besides the boss is out walking. */
const hasCompany = (walk: Walk) => walk.subagents.size > 0 || walk.demo.size > 0

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

// The desktop's SVG animates itself, so its timer only wakes to list agents.
const periodFor = (walk: Walk) =>
  walk.band?.surface === 'desktop' ? TICK_MS * LIST_EVERY : TICK_MS

/** Starts the timer, or restarts it when the band moved to a surface that wants another pace. */
function wake($: EngineInterface, walk: Walk) {
  const ms = periodFor(walk)
  if (!walk.isOn || (walk.timer !== null && walk.timerMs === ms)) {
    return
  }
  walk.timer?.cancel()
  walk.timerMs = ms
  walk.timer = $.clock.every(ms, () => tick($, walk))
}

/**
 * Lists the agents again. A failure is retried on the timer while anything
 * walks, and otherwise a few times on its own before giving up.
 */
function relist($: EngineInterface, walk: Walk) {
  void list($, walk).then(
    () => {
      walk.failures = 0
    },
    (error: unknown) => {
      walk.failures += 1
      if (walk.failures === 1) {
        $.ui.log(
          `prompt-posse: couldn't list the session's agents (${reasonOf(error)}); trying again in half a second`,
          { to: 'debug' },
        )
      }
      if (walk.isMainTurn || hasCompany(walk)) {
        wake($, walk)
      } else if (walk.failures <= IDLE_RETRIES) {
        $.clock.after(TICK_MS * LIST_EVERY, () => relist($, walk))
      }
    },
  )
}

/** Brings the creatures in line with the session's active agents. */
async function list($: EngineInterface, walk: Walk) {
  const listing = ++walk.listings
  const agents = await $.agent.list()
  const active = new Map(
    agents.filter(agent => ACTIVE.has(agent.status)).map(agent => [agent.id, agent]),
  )
  const isPane = (agent: { id: string; teammateId?: string }) => agent.id === agent.teammateId
  const needsTime =
    walk.stale.size > 0 ||
    [...active.values()].some(agent => !walk.subagents.has(agent.id) || isPane(agent))
  const now = needsTime ? await $.clock.now() : 0
  // A listing older than one already applied has nothing newer to say.
  if (listing <= walk.applied) {
    return
  }
  walk.applied = listing

  if (needsTime) {
    if (now - walk.listedAt > UNSEEN_MS) {
      walk.stale.clear()
    }
    walk.listedAt = now
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

  for (const agent of active.values()) {
    if (walk.subagents.has(agent.id)) {
      continue
    }
    walk.subagents.set(
      agent.id,
      join(walk, agent.id, agent.type, agent.description.trim() || agent.type, now),
    )
    isChanged = true
  }

  if (isChanged) {
    $.ui.invalidate('ui.render')
  }
  if (hasCompany(walk)) {
    wake($, walk)
  } else if (!walk.isMainTurn) {
    stop(walk)
  }
}

/** A newcomer's creature, in the freest spot and a hat color no one on the strip wears. */
function join(walk: Walk, id: string, type: string, description: string, now: number): Creature {
  const columns = walk.band?.columns ?? 80
  const creatures = shown(walk, walk.band?.hasBoss ?? walk.isMainTurn)
  const x = freeSpot(columns, SPRITE_WIDTH, creatures.map(c => c.walker))
  const heading = x < lastX(columns) / 2 ? 1 : -1
  const speed = 0.7 + (hash(id) % 6) / 10
  const worn = creatures.filter(c => c !== walk.boss).map(({ look }) => look.hatColor ?? look.color)

  return {
    walker: createWalker(x, heading, speed, SPRITE_WIDTH),
    look: hatFor(type, worn),
    type,
    description,
    since: now,
  }
}

/** Sends the demo's creatures home, and stops the walk if no one else is out. */
function endDemo($: EngineInterface, walk: Walk) {
  walk.demoTimer?.cancel()
  walk.demoTimer = null
  walk.demo.clear()
  $.ui.invalidate('ui.render')
  if (!walk.isMainTurn && !hasCompany(walk)) {
    stop(walk)
  }
}

function tick($: EngineInterface, walk: Walk) {
  walk.ticks += 1
  if (walk.timerMs !== TICK_MS || walk.ticks % LIST_EVERY === 0) {
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
    boss: {
      walker: createWalker(0, 1, 1, BOSS_WIDTH),
      look: BOSS,
      type: '',
      description: '',
      since: 0,
    },
    subagents: new Map(),
    demo: new Map(),
    demoTimer: null,
    isMainTurn: false,
    isOn: true,
    listings: 0,
    applied: 0,
    failures: 0,
    listedAt: 0,
    stale: new Set(),
    isSynced: false,
    band: null,
    timer: null,
    timerMs: TICK_MS,
    ticks: 0,
  }

  on('session.start', async ($, e, next) => {
    walk.isOn = (await $.store.get(STORE_KEY)) !== false
    await $.command.register({
      name: 'posse',
      description: "Show or hide the creatures that walk above the prompt while Claude and its agents work, or see who's who",
      argumentHint: '[on|off|legend|demo]',
      immediate: true,
    })

    return next(e)
  })

  on('command.run', { command: 'posse' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'legend') {
      return { text: legendText() }
    }
    if (arg === 'demo') {
      if (!walk.isOn) {
        return { text: 'The posse is off. Run `/posse on` first, then `/posse demo`.' }
      }
      if (walk.demo.size > 0) {
        endDemo($, walk)
        return { text: 'The demo is over.' }
      }
      const now = await $.clock.now()
      for (const [i, [type, description]] of DEMO.entries()) {
        const id = `demo-${i}`
        walk.demo.set(id, join(walk, id, type, description, now))
      }
      walk.demoTimer = $.clock.after(DEMO_MS, () => endDemo($, walk))
      wake($, walk)
      $.ui.invalidate('ui.render')
      return {
        text: `The posse walks for ${DEMO_MS / 1000} seconds: the boss, a creature for each kind of agent, and a second Explore in a spare hat. The legend under them names each one. Run \`/posse demo\` again to end it sooner.`,
      }
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
      walk.demoTimer?.cancel()
      walk.demoTimer = null
      walk.demo.clear()
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
      if (!hasCompany(walk)) {
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
    const hasBoss = e.props.isWorking || hasCompany(walk)

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
    if (walk.timer !== null) {
      wake($, walk)
    }

    // The subagents' marks and tasks, in the order they joined.
    const entries = [...walk.subagents.values(), ...walk.demo.values()].map(({ look, description }) => ({
      text: description,
      mark: look.hatColor ?? look.color,
      color: look.color,
    }))
    const hasLegend = entries.length > 0 && e.props.maxRows >= BAND_ROWS + LEGEND_ROWS
    const segments = hasLegend ? legendRow(columns, entries) : []

    if (e.surface === 'desktop') {
      const now = await $.clock.now()
      const strides = creatures.map(({ walker, look, since }) => ({
        x: walker.x,
        heading: walker.heading,
        speed: walker.speed,
        elapsedMs: now - since,
        look,
      }))
      const { Box, Svg, Text } = $.ui.resolve(e)
      const svg = (
        <Svg
          source={posseSvg(columns, strides)}
          alt={describe(hasBoss, [...walk.subagents.values(), ...walk.demo.values()].map(c => c.type))}
          isInteractive
        />
      )
      if (!hasLegend) {
        return svg
      }

      return (
        <Box flexDirection="column">
          {svg}
          <Text wrap="truncate">
            {segments.map(({ text, color, isDim }) => (
              <Text color={color === undefined ? undefined : hex(color)} dimColor={isDim}>
                {text}
              </Text>
            ))}
          </Text>
        </Box>
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
        {hasLegend && (
          <Box height={LEGEND_ROWS}>
            <Box position="absolute" left={0} width={columns}>
              <Text wrap="truncate">
                {segments.map(({ text, color, isDim }) => (
                  <Text color={color === undefined ? undefined : hex(color)} dimColor={isDim}>
                    {text}
                  </Text>
                ))}
              </Text>
            </Box>
          </Box>
        )}
      </Box>
    )
  })
}
