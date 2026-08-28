/**
 * Money.
 *
 * A balance is an integer number of cents. Never a float, and never a
 * decimal-looking float: `0.1 + 0.2` is `0.30000000000000004`, and a ledger
 * that adds a thousand of those is a ledger that does not reconcile. Every
 * amount that a person could be owed or charged travels through this module as
 * `Cents`, and is converted to a display string only at the edge.
 *
 * The rest of the platform carries analytical figures — NOI, projections, cap
 * rates — as ordinary numbers, and that is correct: those are estimates where
 * a cent of drift means nothing. This module is for the amounts that have to
 * balance exactly, which is cash and only cash.
 *
 * `Cents` is a branded type so a raw number cannot be passed where an amount
 * is expected. The brand costs nothing at runtime and catches the one mistake
 * that matters: a dollar value used where a cent value was meant, which is an
 * error of one hundred times.
 */

declare const CENTS: unique symbol
export type Cents = number & { readonly [CENTS]: true }

export const ZERO = 0 as Cents

/** Largest amount representable without losing integer precision. */
const MAX_CENTS = Number.MAX_SAFE_INTEGER

function assertSafe(value: number, what: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${what} is not a finite amount.`)
  if (!Number.isInteger(value)) throw new RangeError(`${what} is not a whole number of cents.`)
  if (Math.abs(value) > MAX_CENTS) throw new RangeError(`${what} exceeds the representable range.`)
}

/** Builds an amount from a whole number of cents. */
export function cents(value: number): Cents {
  assertSafe(value, 'Amount')
  return value as Cents
}

/**
 * Builds an amount from dollars.
 *
 * Rounds half away from zero at the cent, which is the convention a person
 * checking the arithmetic by hand will expect. Banker's rounding is defensible
 * for statistics and wrong for a single transaction someone is looking at.
 */
export function fromDollars(value: number): Cents {
  if (!Number.isFinite(value)) throw new RangeError('Amount is not a finite number.')
  // `1.005 * 100` is 100.49999999999999, so rounding it gives 100 and a cent
  // vanishes. The multiplication is re-rounded at four decimal places first,
  // which is far past any real precision but close enough to pull the
  // representation error back to the value a person meant.
  //
  // This only recovers what the caller's own float still holds. A number
  // literal is exact to about fifteen significant digits, which is ample for
  // any amount of money; a string typed by a person should go through
  // `parseAmount`, which never multiplies at all.
  const scaled = Number((value * 100).toFixed(4))
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled)
  assertSafe(rounded, 'Amount')
  return rounded as Cents
}

/**
 * Parses what a person typed: "25,000", "$25,000.50", "25000".
 *
 * Returns null rather than a guess. A field that silently reads "1o,000" as
 * 10,000 is worse than one that refuses it.
 */
export function parseAmount(raw: string): Cents | null {
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (cleaned === '' || !/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [whole, fraction = ''] = cleaned.split('.')
  const negative = whole!.startsWith('-')
  const digits = negative ? whole!.slice(1) : whole!
  const padded = (fraction + '00').slice(0, 2)
  const value = Number(digits) * 100 + Number(padded)
  if (!Number.isSafeInteger(value)) return null
  return (negative ? -value : value) as Cents
}

/** For display and for the analytical engines, which work in dollars. */
export function toDollars(value: Cents): number {
  return value / 100
}

export function add(...values: Cents[]): Cents {
  return cents(values.reduce<number>((total, value) => total + value, 0))
}

export function subtract(a: Cents, b: Cents): Cents {
  return cents(a - b)
}

export function negate(value: Cents): Cents {
  return cents(-value)
}

/**
 * A share of an amount, rounded to the cent.
 *
 * Use `allocate` instead wherever the parts must sum back to the whole.
 */
export function multiply(value: Cents, factor: number): Cents {
  if (!Number.isFinite(factor)) throw new RangeError('Factor is not a finite number.')
  const scaled = value * factor
  return cents(scaled < 0 ? -Math.round(-scaled) : Math.round(scaled))
}

/**
 * Splits an amount across weights so the parts sum back to exactly the whole.
 *
 * The naive approach — round each share independently — loses or invents cents.
 * On a $1,000,000 distribution across forty investors that is a real amount of
 * money going somewhere nobody can account for. This gives every part its
 * floor and then hands the remaining cents out one at a time, largest
 * fractional remainder first, so the total is exact and the allocation is
 * deterministic for a given input.
 */
export function allocate(total: Cents, weights: number[]): Cents[] {
  if (weights.length === 0) return []
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new RangeError('Weights must be finite and non-negative.')
  }
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) throw new RangeError('Weights must not all be zero.')

  const exact = weights.map((weight) => (total * weight) / sum)
  const floors = exact.map((value) => Math.floor(value))
  let remainder = total - floors.reduce((a, b) => a + b, 0)

  // Ties broken by index so the same input always produces the same split.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => (b.fraction - a.fraction) || (a.index - b.index))

  const result = [...floors]
  for (let i = 0; remainder > 0; i += 1, remainder -= 1) {
    result[order[i % order.length]!.index]! += 1
  }
  return result.map((value) => cents(value))
}

export function isZero(value: Cents): boolean {
  return value === 0
}

export function isNegative(value: Cents): boolean {
  return value < 0
}

export function compare(a: Cents, b: Cents): number {
  return a === b ? 0 : a < b ? -1 : 1
}

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
})

const USD_WHOLE = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
})

/** "$25,000.00". Use `formatWhole` where the cents are noise. */
export function format(value: Cents): string {
  return USD.format(toDollars(value))
}

/** "$25,000" — and "$25,000.50" when there are cents worth showing. */
export function formatWhole(value: Cents): string {
  return value % 100 === 0 ? USD_WHOLE.format(toDollars(value)) : USD.format(toDollars(value))
}
