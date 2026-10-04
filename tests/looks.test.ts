import { describe, expect, test } from 'claude-code/testing'

import { BOSS, LEGEND, SPARE_HATS, hatFor, isNear, legendText, lookFor } from '../hooks/looks'

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

  test('the legend describes exactly the looks the posse draws', () => {
    for (const { type, look } of LEGEND) {
      expect(lookFor(type)).toEqual(look)
    }
    expect(legendText().split('\n')).toHaveLength(LEGEND.length + 4)
  })

  test("an agent's first of a kind wears its own hat; later ones each wear another", () => {
    expect(hatFor('Explore', [])).toEqual(lookFor('Explore'))

    const worn: number[] = []
    for (let i = 0; i <= SPARE_HATS.length; i++) {
      const look = hatFor('Explore', worn)
      const hat = look.hatColor ?? 0
      // Its own hat and the spares unlike its body: six that tell apart.
      if (worn.length < 6) {
        expect(worn.some(other => isNear(hat, other))).toBe(false)
      }
      expect(isNear(hat, look.color)).toBe(false)
      expect(look.color).toBe(lookFor('Explore').color)
      expect(look.headwear).toBe(lookFor('Explore').headwear)
      worn.push(hat)
    }
  })

  test('a hat another kind of agent wears is passed over too', () => {
    const plan = lookFor('Plan').hatColor ?? 0
    const explore = lookFor('Explore').hatColor ?? 0
    const second = hatFor('Explore', [explore, plan])
    expect(isNear(second.hatColor ?? 0, plan)).toBe(false)
    expect(isNear(second.hatColor ?? 0, explore)).toBe(false)
  })

  test('a later agent of another kind still gets its own hat', () => {
    const worn: number[] = []
    for (const type of ['Explore', 'Explore', 'Plan']) {
      const look = hatFor(type, worn)
      worn.push(look.hatColor ?? 0)
    }
    expect(worn[2]).toBe(lookFor('Plan').hatColor)
  })
})
