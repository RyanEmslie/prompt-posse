// What the tests share: the band as each surface hands it over, the agents
// a listing returns, the engine beneath the plugin, and readers for what the
// plugin draws.

import type { AgentInfo, AgentStatus, CommandSpec, On, RenderSurface } from 'claude-code'

type BandProps = { hasSurvey: boolean; maxRows: number; bodyColumns: number }

export const band = <S extends RenderSurface>(
  isWorking: boolean,
  surface: S,
  props: Partial<BandProps> = {},
) => ({
  component: 'AbovePrompt' as const,
  plugin: 'prompt-posse',
  surface,
  requestId: 'band',
  props: {
    hasSurvey: false,
    isWorking,
    maxRows: 10,
    bodyColumns: 40,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
    ...props,
  },
})

export const agent = (
  id: string,
  type: string,
  status: AgentStatus = 'running',
): AgentInfo => ({ id, type, description: 'a task', status })

export const TURN_END = Object.freeze({
  answer: '',
  durationMs: 0,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
} as const)

export const SPAWN = Object.freeze({
  tool_use_id: 'toolu_1',
  prompt: 'Look around.',
  description: 'a task',
  subagentType: 'Explore',
  provider: Object.freeze({ plugin: 'engine', tier: 'core' as const }),
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
})

/** A look's color as the SVG writes it. */
export const hex = (color = 0) => `#${color.toString(16).padStart(6, '0')}`

/** What a listing answers: the agents, or a function a test scripts it with. */
export type Listing = AgentInfo[] | (() => AgentInfo[] | Promise<AgentInfo[]>)

// What the engine would do beneath the plugin: draw its own band, take every
// redraw request and repaint, recording the cells each repaint carries, and
// list the agents the test says are there.
export function engine(on: On, agents: Listing = []) {
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
  on('agent.list', async () => ({
    value: typeof agents === 'function' ? await agents() : [...agents],
  }))
  on('ui.log', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  return blits
}

export const START = { cwd: '/repo', surface: 'terminal', isInteractive: true } as const

/** `/posse` with `args`, typed at the prompt. */
export const posse = (args = '') => ({
  command: 'posse',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 80 },
})

/**
 * The rest of the engine a command needs: session start, command
 * registration, and a store held in `stored`, standing in for disk.
 */
export function host(on: On, stored = new Map<string, unknown>()) {
  const commands: CommandSpec[] = []
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => {
    commands.push(e)
    return { value: { command: e.name } }
  })
  on('store.get', (_$, e) => ({ value: stored.get(e.key) }))
  on('store.set', (_$, e) => {
    stored.set(e.key, e.value)
    return { value: undefined }
  })
  return { commands, stored }
}

const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export type DecodedCell = { glyph: string; fg: number; bg: number }

/** Reads a Raster's `cells` back, written independently of the plugin's encoder. */
export function decodeCells(cells: string): DecodedCell[] {
  const bytes: number[] = []
  for (let i = 0; i < cells.length; i += 4) {
    const quad = [0, 1, 2, 3].map(k => cells[i + k] ?? '=')
    const [a = 0, b = 0, c = 0, d = 0] = quad.map(ch =>
      ch === '=' ? 0 : BASE64.indexOf(ch),
    )
    const n = (a << 18) | (b << 12) | (c << 6) | d
    bytes.push((n >> 16) & 255)
    if (quad[2] !== '=') {
      bytes.push((n >> 8) & 255)
    }
    if (quad[3] !== '=') {
      bytes.push(n & 255)
    }
  }

  const view = new DataView(Uint8Array.from(bytes).buffer)
  const decoded: DecodedCell[] = []
  for (let i = 0; i + 12 <= bytes.length; i += 12) {
    decoded.push({
      glyph: String.fromCodePoint(view.getUint32(i, true)),
      fg: view.getUint32(i + 4, true),
      bg: view.getUint32(i + 8, true),
    })
  }
  return decoded
}

/** How many creatures an SVG walks: one translate animation each. */
export const animations = (svg: string) => svg.split('<animateTransform').length - 1

/** The attributes of the first `<tag .../>` in `svg`. */
export function attributesOf(svg: string, tag: string): Record<string, string> {
  const element = new RegExp(`<${tag}\\s([^>]*?)/>`).exec(svg)?.[1] ?? ''
  return Object.fromEntries(
    [...element.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name = '', value = '']) => [
      name,
      value,
    ]),
  )
}
