// The desktop draws the posse as one SVG that animates itself: the same
// sprites, each pixel a rect twice as tall as it is wide (a terminal
// quadrant's shape), walking on SMIL animations the desktop plays on its
// own, so nothing is sent per frame. Their phase comes from how long each
// creature has been walking, so a redraw picks up where the last one was.

import { SPRITE_ROWS, pixelColor, spriteWidth, spritePixels } from './sprite'
import type { Look, Pose } from './sprite'
import { BLINK_EVERY, BLINK_TICKS, PAUSE_TICKS, TICK_MS, lastX } from './walker'

/** One creature's walk: where it started, which way, how fast, and for how long. */
export type Stride = {
  x: number
  heading: 1 | -1
  /** Pixels a tick, as the terminal's walker counts them. */
  speed: number
  /** How long it has been walking, in milliseconds. */
  elapsedMs: number
  look: Look
}

const PIXEL_HEIGHT = 2
const GROUND_Y = SPRITE_ROWS * 2 * PIXEL_HEIGHT
const HEIGHT = GROUND_Y + 0.5
const STANDING: Pose = { facing: 0, step: 0, isBlinking: false }
const FACINGS = [-1, 0, 1] as const
const STEPS = [0, 1, 2] as const

const seconds = (ms: number) => `${(ms / 1000).toFixed(3)}s`
const keyTimes = (...times: number[]) => times.map(t => t.toFixed(4)).join(';')
const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`

/** A row's `pixel`s as rects, each run of them one rect. */
function rects(row: string, py: number, pixel: string): string {
  let out = ''
  for (let i = 0; i < row.length; ) {
    if (row[i] !== pixel) {
      i += 1
      continue
    }
    let j = i
    while (row[j] === pixel) {
      j += 1
    }
    out += `<rect x="${i}" y="${py * PIXEL_HEIGHT}" width="${j - i}" height="${PIXEL_HEIGHT}"/>`
    i = j
  }
  return out
}

function toggle(values: string, times: string, dur: string, begin: string) {
  return `<animate attributeName="opacity" calcMode="discrete" values="${values}" keyTimes="${times}" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>`
}

const layer = (content: string, opacity: 0 | 1, animation = '') =>
  `<g opacity="${opacity}">${animation}${content}</g>`

function creature(columns: number, stride: Stride): string {
  const { look } = stride
  const rowsFor = (pose: Partial<Pose>) => spritePixels({ ...STANDING, ...pose }, look)
  const standing = rowsFor({})

  // Body pixels in the creature's fill; headwear, shade and eyes in their own colors.
  const draw = (rows: readonly (readonly [string, number])[]) => {
    const body = rows.map(([row, py]) => rects(row, py, '#')).join('')
    const rest = ['+', '%', 'o'].map(pixel => {
      const drawn = rows.map(([row, py]) => rects(row, py, pixel)).join('')
      const color = pixelColor(pixel, look)
      return drawn === '' || color === null ? '' : `<g fill="${hex(color)}">${drawn}</g>`
    })
    return body + rest.join('')
  }

  // Which rows change with the legs, and which other rows with the eyes or
  // the way it faces; the rest stay put. The legs too may differ by facing.
  const legRows = standing.flatMap((row, py) =>
    STEPS.some(step => rowsFor({ step })[py] !== row) ? [py] : [],
  )
  const eyeRows = standing.flatMap((row, py) =>
    !legRows.includes(py) &&
    (FACINGS.some(facing => rowsFor({ facing })[py] !== row) ||
      rowsFor({ isBlinking: true })[py] !== row)
      ? [py]
      : [],
  )
  const fixed = draw(
    standing.flatMap((row, py) =>
      eyeRows.includes(py) || legRows.includes(py) ? [] : [[row, py] as const],
    ),
  )
  const legs = (step: Pose['step'], facing: Pose['facing'] = 0) =>
    draw(legRows.map(py => [rowsFor({ step, facing })[py] ?? '', py] as const))

  // Eyes are holes in the body, or the boss's dark pixels; a blink covers them for a moment.
  const blinkDur = seconds(BLINK_EVERY * TICK_MS)
  const blinkAt = keyTimes(0, (BLINK_EVERY - BLINK_TICKS) / BLINK_EVERY)
  const eyes = (facing: Pose['facing']) => {
    const open = eyeRows.map(py => [rowsFor({ facing })[py] ?? '', py] as const)
    const lids = eyeRows.map(py => {
      const shut = rowsFor({ facing, isBlinking: true })[py] ?? ''
      const row = rowsFor({ facing })[py] ?? ''
      return [[...shut].map((p, i) => (p === '#' && row[i] !== '#' ? '#' : '.')).join(''), py] as const
    })
    const blink = toggle('0;1', blinkAt, blinkDur, seconds(-stride.elapsedMs))
    return draw(open) + layer(draw(lids), 0, blink)
  }

  const end = lastX(columns, spriteWidth(look))
  const fill = hex(look.color)
  if (end === 0) {
    return `<g fill="${fill}">${fixed}${eyes(0)}${legs(0)}</g>`
  }

  // Right across, a pause facing out, back left, a pause: one period.
  const travelMs = (end / stride.speed) * TICK_MS
  const pauseMs = PAUSE_TICKS * TICK_MS
  const periodMs = 2 * (travelMs + pauseMs)
  const a = travelMs / periodMs
  const b = (travelMs + pauseMs) / periodMs
  const c = (2 * travelMs + pauseMs) / periodMs
  const startMs =
    stride.heading === 1
      ? (stride.x / end) * travelMs
      : travelMs + pauseMs + ((end - stride.x) / end) * travelMs
  const dur = seconds(periodMs)
  const begin = seconds(-(startMs + stride.elapsedMs))
  const pausing = toggle('0;1;0;1', keyTimes(0, a, b, c), dur, begin)
  const goingRight = toggle('1;0', keyTimes(0, a), dur, begin)
  const goingLeft = toggle('0;1;0', keyTimes(0, b, c), dur, begin)

  const move = `<animateTransform attributeName="transform" type="translate" values="0 0;${end} 0;${end} 0;0 0;0 0" keyTimes="${keyTimes(0, a, b, c, 1)}" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>`
  const facing =
    layer(eyes(1), 1, goingRight) + layer(eyes(0), 0, pausing) + layer(eyes(-1), 0, goingLeft)

  // Two pixels a step, as on the terminal.
  const stepDur = seconds((4 / stride.speed) * TICK_MS)
  const stepBegin = seconds(-stride.elapsedMs)
  const stepping = (facing: 1 | -1) =>
    layer(legs(1, facing), 1, toggle('1;0', '0;0.5', stepDur, stepBegin)) +
    layer(legs(2, facing), 0, toggle('0;1', '0;0.5', stepDur, stepBegin))
  const feet =
    layer(legs(0), 0, pausing) +
    layer(stepping(1), 1, goingRight) +
    layer(stepping(-1), 0, goingLeft)

  return `<g fill="${fill}">${move}${fixed}${facing}${feet}</g>`
}

/**
 * Where a creature walking `stride` is once `stride.elapsedMs` have gone by,
 * as the SVG draws it: its left edge in pixels, which way it heads, and
 * whether it is pausing at an edge.
 */
export function strideAt(
  columns: number,
  stride: Stride,
): { x: number; heading: 1 | -1; isPausing: boolean } {
  const end = lastX(columns, spriteWidth(stride.look))
  if (end === 0) {
    return { x: 0, heading: stride.heading, isPausing: false }
  }

  const travelMs = (end / stride.speed) * TICK_MS
  const pauseMs = PAUSE_TICKS * TICK_MS
  const periodMs = 2 * (travelMs + pauseMs)
  const startMs =
    stride.heading === 1
      ? (stride.x / end) * travelMs
      : travelMs + pauseMs + ((end - stride.x) / end) * travelMs
  const t = (startMs + stride.elapsedMs) % periodMs
  if (t < travelMs) {
    return { x: (t / travelMs) * end, heading: 1, isPausing: false }
  }
  if (t < travelMs + pauseMs) {
    return { x: end, heading: -1, isPausing: true }
  }
  if (t < 2 * travelMs + pauseMs) {
    return { x: end - ((t - travelMs - pauseMs) / travelMs) * end, heading: -1, isPausing: false }
  }

  return { x: 0, heading: 1, isPausing: true }
}

/** The posse walking on a ground line, `columns` wide at two pixels a column. */
export function posseSvg(columns: number, strides: readonly Stride[]): string {
  const width = columns * 2

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${HEIGHT}" width="100%" preserveAspectRatio="xMinYMax meet" shape-rendering="crispEdges">` +
    `<rect x="0" y="${GROUND_Y}" width="${width}" height="0.5" fill="#8a8a8a" opacity="0.6"/>` +
    strides.map(stride => creature(columns, stride)).join('') +
    '</svg>'
  )
}
