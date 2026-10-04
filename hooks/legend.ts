// The row under the ground that says what each creature walks for: a mark in
// its hat color, then its agent's task in its body color, in the order they
// joined. Long tasks are cut short, the longest first, so more of them fit;
// what doesn't fit even then is counted at the end.

export type Entry = {
  /** The agent's task, as the Agent call described it. */
  text: string
  /** The creature's hat color. */
  mark: number
  /** The creature's body color. */
  color: number
}

/** A run of the row's text, in one color or dim. */
export type Segment = { text: string; color?: number; isDim?: boolean }

const GAP = '  '
const MARK = '■'

// The fewest characters a task is cut to, so it can still be told apart.
const MIN_CHARS = 10

const more = (count: number) => `+${count} more`

const cut = (text: string, chars: number) =>
  text.length <= chars ? text : `${text.slice(0, chars - 1)}…`

const widthAt = (entries: readonly Entry[], chars: number) =>
  entries.reduce((sum, { text }) => sum + MARK.length + 1 + Math.min(text.length, chars), 0) +
  GAP.length * Math.max(0, entries.length - 1)

/**
 * The legend's row, `columns` wide at most. Tasks are cut to the most
 * characters at which every entry fits, but no fewer than `MIN_CHARS`; what
 * still doesn't fit is counted as `+N more`.
 */
export function legendRow(columns: number, entries: readonly Entry[]): Segment[] {
  let chars = Math.max(0, ...entries.map(({ text }) => text.length))
  while (chars > MIN_CHARS && widthAt(entries, chars) > columns) {
    chars -= 1
  }

  return fit(columns, entries.map(entry => ({ ...entry, text: cut(entry.text, chars) })))
}

/** As many entries as fit whole, then `+N more`. */
function fit(columns: number, entries: readonly Entry[]): Segment[] {
  const row: Segment[] = []
  let used = 0
  for (const [i, entry] of entries.entries()) {
    const gap = i === 0 ? '' : GAP
    const after = entries.length - i - 1
    // Room is kept after each entry for the count of those that follow.
    const reserve = after > 0 ? GAP.length + more(after).length : 0
    const width = gap.length + MARK.length + 1 + entry.text.length
    if (used + width + reserve <= columns) {
      row.push({ text: gap }, { text: MARK, color: entry.mark }, { text: ` ${entry.text}`, color: entry.color })
      used += width
      continue
    }

    if (i > 0) {
      row.push({ text: `${GAP}${more(entries.length - i)}`, isDim: true })
      return row
    }
    // Not even the first fits whole: it's cut short.
    const room = columns - MARK.length - 1 - reserve
    if (room < 2) {
      return [{ text: more(entries.length), isDim: true }]
    }
    row.push(
      { text: MARK, color: entry.mark },
      { text: ` ${entry.text.slice(0, room - 1)}…`, color: entry.color },
    )
    if (after > 0) {
      row.push({ text: `${GAP}${more(after)}`, isDim: true })
    }
    return row
  }

  return row
}

/** A color as the `Text` element takes it. */
export const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`
