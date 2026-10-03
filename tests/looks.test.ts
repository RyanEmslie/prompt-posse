import { describe, expect, test } from 'claude-code/testing'

import { BOSS, lookFor } from '../hooks/looks'

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

  test('every hat is a different color from the body under it', () => {
    const types = ['Explore', 'Plan', 'general-purpose', 'claude', 'fork']
    for (const type of [...types, ...Array.from({ length: 40 }, (_, i) => `custom-${i}`)]) {
      const look = lookFor(type)
      expect(look.hatColor).toBeDefined()
      expect(look.hatColor).not.toBe(look.color)
    }
    expect(BOSS.isBoss).toBe(true)
    expect(BOSS.headwear).toBeNull()
  })
})
