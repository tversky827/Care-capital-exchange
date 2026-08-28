import { describe, expect, it } from 'vitest'
import {
  add, allocate, cents, format, formatWhole, fromDollars, multiply, negate, parseAmount,
  subtract, toDollars,
} from '@/lib/money'

/**
 * Money tests.
 *
 * Written as the arithmetic that goes wrong when money is a float, because
 * that is the only reason this module exists.
 */

describe('constructing an amount', () => {
  it('refuses a fractional cent rather than rounding one silently', () => {
    expect(() => cents(10.5)).toThrow(/whole number of cents/)
  })

  it('refuses infinity and NaN', () => {
    expect(() => cents(Infinity)).toThrow()
    expect(() => cents(NaN)).toThrow()
  })

  it('refuses an amount past the safe integer range', () => {
    expect(() => cents(Number.MAX_SAFE_INTEGER + 2)).toThrow(/representable range/)
  })

  it('rounds dollars half away from zero', () => {
    expect(fromDollars(0.005)).toBe(1)
    expect(fromDollars(-0.005)).toBe(-1)
    expect(fromDollars(1.005)).toBe(101)
  })

  it('survives the float that motivates the whole module', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in floating point.
    expect(add(fromDollars(0.1), fromDollars(0.2))).toBe(fromDollars(0.3))
    // A thousand additions of a third of a dollar drift visibly as floats.
    let total = cents(0)
    for (let i = 0; i < 1000; i += 1) total = add(total, fromDollars(0.33))
    expect(total).toBe(33_000)
    expect(toDollars(total)).toBe(330)
  })
})

describe('parsing what a person typed', () => {
  it('accepts the shapes people actually type', () => {
    expect(parseAmount('25000')).toBe(2_500_000)
    expect(parseAmount('25,000')).toBe(2_500_000)
    expect(parseAmount('$25,000')).toBe(2_500_000)
    expect(parseAmount(' $25,000.50 ')).toBe(2_500_050)
    expect(parseAmount('0.07')).toBe(7)
    expect(parseAmount('.5')).toBeNull()
  })

  it('refuses rather than guessing', () => {
    // The letter o for a zero: a plausible typo, and reading it as 10,000
    // would move ten thousand dollars nobody asked to move.
    expect(parseAmount('1o,000')).toBeNull()
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('1.234')).toBeNull()
    expect(parseAmount('1e5')).toBeNull()
  })
})

describe('arithmetic', () => {
  it('adds, subtracts and negates exactly', () => {
    expect(add(cents(100), cents(250), cents(1))).toBe(351)
    expect(subtract(cents(100), cents(250))).toBe(-150)
    expect(negate(cents(100))).toBe(-100)
  })

  it('multiplies to the nearest cent', () => {
    expect(multiply(cents(10_000), 0.0725)).toBe(725)
    expect(multiply(cents(333), 1 / 3)).toBe(111)
    expect(multiply(cents(100), 0.005)).toBe(1)
  })
})

describe('allocating an amount across investors', () => {
  it('splits so the parts sum back to exactly the whole', () => {
    const parts = allocate(cents(100), [1, 1, 1])
    expect(parts).toEqual([34, 33, 33])
    expect(add(...parts)).toBe(100)
  })

  it('keeps a million-dollar distribution whole across forty investors', () => {
    const weights = Array.from({ length: 40 }, (_, i) => i + 1)
    expect(add(...allocate(cents(100_000_000), weights))).toBe(100_000_000)
  })

  it('does not lose the cents that independent rounding loses', () => {
    // Three equal shares of a dollar: rounding each on its own gives 99 cents
    // and the last one is simply gone.
    const naive = [1, 1, 1].map(() => Math.round(100 / 3)).reduce((a, b) => a + b, 0)
    expect(naive).toBe(99)
    expect(add(...allocate(cents(100), [1, 1, 1]))).toBe(100)
  })

  it('is deterministic for the same input', () => {
    const a = allocate(cents(1_000_001), [3, 3, 3, 1])
    const b = allocate(cents(1_000_001), [3, 3, 3, 1])
    expect(a).toEqual(b)
  })

  it('handles one recipient and a zero total', () => {
    expect(allocate(cents(500), [1])).toEqual([500])
    expect(allocate(cents(0), [1, 2, 3])).toEqual([0, 0, 0])
  })

  it('refuses weights that cannot describe a split', () => {
    expect(() => allocate(cents(100), [0, 0])).toThrow(/must not all be zero/)
    expect(() => allocate(cents(100), [-1, 2])).toThrow(/non-negative/)
    expect(allocate(cents(100), [])).toEqual([])
  })
})

describe('display', () => {
  it('formats with and without cents', () => {
    expect(format(cents(2_500_000))).toBe('$25,000.00')
    expect(formatWhole(cents(2_500_000))).toBe('$25,000')
    expect(formatWhole(cents(2_500_050))).toBe('$25,000.50')
    expect(format(cents(-150))).toBe('-$1.50')
  })
})
