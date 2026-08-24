/**
 * A deliberately small query language. Every operator here has a direct
 * PostgREST equivalent, which is what keeps the local driver and the Supabase
 * driver honest: if it cannot be expressed here, it is not expressible in both.
 */
export type Scalar = string | number | boolean | null

export type Comparison =
  | { eq: Scalar }
  | { neq: Scalar }
  | { gt: number | string }
  | { gte: number | string }
  | { lt: number | string }
  | { lte: number | string }
  | { in: Scalar[] }
  | { contains: string }
  | { isNull: boolean }
  /** Membership of a scalar inside an array-typed column (e.g. text[] / jsonb). */
  | { arrayContains: Scalar }

export type Condition = Scalar | Scalar[] | Comparison

export type Where = Record<string, Condition>

export interface OrderBy {
  field: string
  dir?: 'asc' | 'desc'
}

export interface Query {
  where?: Where
  orderBy?: OrderBy | OrderBy[]
  limit?: number
  offset?: number
}

function isComparison(c: Condition): c is Comparison {
  return typeof c === 'object' && c !== null && !Array.isArray(c)
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a) < String(b) ? -1 : 1
}

/** Evaluates a `Where` clause against a plain row. Used by the local driver. */
export function matchesWhere(row: Record<string, unknown>, where?: Where): boolean {
  if (!where) return true
  for (const [field, condition] of Object.entries(where)) {
    const value = row[field]
    if (!isComparison(condition)) {
      if (Array.isArray(condition)) {
        if (!condition.includes(value as Scalar)) return false
      } else if (value !== condition) {
        return false
      }
      continue
    }
    if ('eq' in condition && value !== condition.eq) return false
    if ('neq' in condition && value === condition.neq) return false
    if ('gt' in condition && !(cmp(value, condition.gt) > 0)) return false
    if ('gte' in condition && !(cmp(value, condition.gte) >= 0)) return false
    if ('lt' in condition && !(cmp(value, condition.lt) < 0)) return false
    if ('lte' in condition && !(cmp(value, condition.lte) <= 0)) return false
    if ('in' in condition && !condition.in.includes(value as Scalar)) return false
    if ('contains' in condition) {
      if (typeof value !== 'string') return false
      if (!value.toLowerCase().includes(condition.contains.toLowerCase())) return false
    }
    if ('isNull' in condition) {
      const isNull = value === null || value === undefined
      if (isNull !== condition.isNull) return false
    }
    if ('arrayContains' in condition) {
      if (!Array.isArray(value)) return false
      if (!value.includes(condition.arrayContains)) return false
    }
  }
  return true
}

export function applyQuery<T extends Record<string, unknown>>(rows: T[], query?: Query): T[] {
  let out = rows.filter((row) => matchesWhere(row, query?.where))
  const orderBy = query?.orderBy
  if (orderBy) {
    const clauses = Array.isArray(orderBy) ? orderBy : [orderBy]
    out = [...out].sort((a, b) => {
      for (const clause of clauses) {
        const direction = clause.dir === 'desc' ? -1 : 1
        const result = cmp(a[clause.field], b[clause.field])
        if (result !== 0) return result * direction
      }
      return 0
    })
  }
  const offset = query?.offset ?? 0
  const limit = query?.limit
  return limit === undefined ? out.slice(offset) : out.slice(offset, offset + limit)
}
