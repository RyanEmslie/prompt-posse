// The row under the ground that says what each creature walks for: a mark in
// its hat color, then its agent's task in its body color, in the order they
// joined. What doesn't fit is counted at the end.

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

const more = (count: number) => `+${count} more`

/** The legend's row, `columns` wide at most: as many entries as fit, then `+N more`. */
export function legendRow(columns: number, entries: readonly Entry[]): Segment[] {
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
