// The desktop draws the posse as one SVG that animates itself: the same
// sprites, each pixel a rect twice as tall as it is wide (a terminal
// quadrant's shape), walking on SMIL animations the desktop plays on its
// own, so nothing is sent per frame. Their phase comes from how long each
// creature has been walking, so a redraw picks up where the last one was.

import { SPRITE_ROWS, spritePixels } from './sprite'
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

const seconds = (ms: number) => `${(ms / 1000).toFixed(3)}s`
const keyTimes = (...times: number[]) => times.map(t => t.toFixed(4)).join(';')
const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`

/** A row of pixels as rects, each run of filled pixels one rect. */
function rects(row: string, py: number): string {
  let out = ''
  for (let i = 0; i < row.length; ) {
    if (row[i] !== '#') {
      i += 1
      continue
    }
    let j = i
    while (row[j] === '#') {
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
  const rowOf = (pose: Partial<Pose>, py: number) =>
    spritePixels({ ...STANDING, ...pose }, null)[py] ?? ''
  const bare = spritePixels(STANDING, stride.look.headwear)
  const fixed = [0, 1, 2, 4].map(py => rects(bare[py] ?? '', py)).join('')
  const legs = (step: Pose['step']) => rects(rowOf({ step }, 5), 5)

  // Eyes are holes in the body; a blink fills them for a moment.
  const blinkDur = seconds(BLINK_EVERY * TICK_MS)
  const blinkAt = keyTimes(0, (BLINK_EVERY - BLINK_TICKS) / BLINK_EVERY)
  const eyes = (facing: Pose['facing']) => {
    const open = rowOf({ facing }, 3)
    const shut = rowOf({ facing, isBlinking: true }, 3)
    const lids = [...shut].map((p, i) => (p === '#' && open[i] !== '#' ? '#' : '.')).join('')
    const blink = toggle('0;1', blinkAt, blinkDur, seconds(-stride.elapsedMs))
    return rects(open, 3) + layer(rects(lids, 3), 0, blink)
  }

  const end = lastX(columns)
  const fill = hex(stride.look.color)
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
  const walking = toggle('1;0;1;0', keyTimes(0, a, b, c), dur, begin)
  const pausing = toggle('0;1;0;1', keyTimes(0, a, b, c), dur, begin)

  const move = `<animateTransform attributeName="transform" type="translate" values="0 0;${end} 0;${end} 0;0 0;0 0" keyTimes="${keyTimes(0, a, b, c, 1)}" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>`
  const facing =
    layer(eyes(1), 1, toggle('1;0', keyTimes(0, a), dur, begin)) +
    layer(eyes(0), 0, pausing) +
    layer(eyes(-1), 0, toggle('0;1;0', keyTimes(0, b, c), dur, begin))

  // Two pixels a step, as on the terminal.
  const stepDur = seconds((4 / stride.speed) * TICK_MS)
  const stepBegin = seconds(-stride.elapsedMs)
  const stepping =
    layer(legs(1), 1, toggle('1;0', '0;0.5', stepDur, stepBegin)) +
    layer(legs(2), 0, toggle('0;1', '0;0.5', stepDur, stepBegin))
  const feet = layer(legs(0), 0, pausing) + layer(stepping, 1, walking)

  return `<g fill="${fill}">${move}${fixed}${facing}${feet}</g>`
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
