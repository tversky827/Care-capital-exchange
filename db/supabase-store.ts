import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Query, Where } from './query'
import { APPEND_ONLY_TABLES, type TableName } from './tables'
import { StoreError, type Insert, type Row, type Store } from './store'

/**
 * Supabase driver. Uses the service-role key on the server so that the
 * application policy layer (`lib/policy.ts`) is the single authority on access
 * in request handlers, while the SQL RLS policies in
 * `supabase/migrations/0002_rls.sql` remain the backstop for any client that
 * talks to PostgREST directly with an anon/user token.
 */
export class SupabaseStore implements Store {
  readonly driver = 'supabase' as const
  private client: SupabaseClient

  constructor(url: string, key: string) {
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  private build(table: TableName, query?: Query) {
    let builder = this.client.from(table).select('*')
    for (const [field, condition] of Object.entries(query?.where ?? {})) {
      if (condition === null) {
        builder = builder.is(field, null)
      } else if (Array.isArray(condition)) {
        builder = builder.in(field, condition)
      } else if (typeof condition === 'object') {
        if ('eq' in condition) builder = condition.eq === null ? builder.is(field, null) : builder.eq(field, condition.eq)
        if ('neq' in condition) builder = builder.neq(field, condition.neq)
        if ('gt' in condition) builder = builder.gt(field, condition.gt)
        if ('gte' in condition) builder = builder.gte(field, condition.gte)
        if ('lt' in condition) builder = builder.lt(field, condition.lt)
        if ('lte' in condition) builder = builder.lte(field, condition.lte)
        if ('in' in condition) builder = builder.in(field, condition.in)
        if ('contains' in condition) builder = builder.ilike(field, `%${condition.contains}%`)
        if ('isNull' in condition) builder = condition.isNull ? builder.is(field, null) : builder.not(field, 'is', null)
        if ('arrayContains' in condition) builder = builder.contains(field, [condition.arrayContains])
      } else {
        builder = builder.eq(field, condition)
      }
    }
    const orderBy = query?.orderBy
    if (orderBy) {
      for (const clause of Array.isArray(orderBy) ? orderBy : [orderBy]) {
        builder = builder.order(clause.field, { ascending: clause.dir !== 'desc' })
      }
    }
    if (query?.limit !== undefined) {
      const offset = query.offset ?? 0
      builder = builder.range(offset, offset + query.limit - 1)
    } else if (query?.offset) {
      builder = builder.range(query.offset, query.offset + 999)
    }
    return builder
  }

  async select<T extends TableName>(table: T, query?: Query): Promise<Row<T>[]> {
    const { data, error } = await this.build(table, query)
    if (error) throw new StoreError(`select ${table}: ${error.message}`)
    return (data ?? []) as Row<T>[]
  }

  async selectOne<T extends TableName>(table: T, query: Query): Promise<Row<T> | null> {
    const rows = await this.select(table, { ...query, limit: 1 })
    return rows[0] ?? null
  }

  async findById<T extends TableName>(table: T, id: string): Promise<Row<T> | null> {
    return this.selectOne(table, { where: { id } })
  }

  async insert<T extends TableName>(table: T, row: Insert<T>): Promise<Row<T>> {
    const [inserted] = await this.insertMany(table, [row])
    return inserted
  }

  async insertMany<T extends TableName>(table: T, rows: Insert<T>[]): Promise<Row<T>[]> {
    const { data, error } = await this.client.from(table).insert(rows as object[]).select('*')
    if (error) throw new StoreError(`insert ${table}: ${error.message}`)
    return (data ?? []) as Row<T>[]
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T>> {
    if (APPEND_ONLY_TABLES.includes(table)) throw new StoreError(`${table} is append-only`)
    const { data, error } = await this.client.from(table).update(patch as object).eq('id', id).select('*')
    if (error) throw new StoreError(`update ${table}: ${error.message}`)
    if (!data?.length) throw new StoreError(`${table} row ${id} not found`, 'not_found')
    return data[0] as Row<T>
  }

  async updateWhere<T extends TableName>(table: T, where: Where, patch: Partial<Row<T>>): Promise<number> {
    if (APPEND_ONLY_TABLES.includes(table)) throw new StoreError(`${table} is append-only`)
    const rows = await this.select(table, { where })
    for (const row of rows) await this.update(table, (row as { id: string }).id, patch)
    return rows.length
  }

  async remove<T extends TableName>(table: T, id: string): Promise<void> {
    if (APPEND_ONLY_TABLES.includes(table)) throw new StoreError(`${table} is append-only`)
    const { error } = await this.client.from(table).delete().eq('id', id)
    if (error) throw new StoreError(`delete ${table}: ${error.message}`)
  }

  async count<T extends TableName>(table: T, query?: Query): Promise<number> {
    const rows = await this.select(table, { ...query, limit: undefined, offset: undefined })
    return rows.length
  }

  async reset(): Promise<void> {
    throw new StoreError('reset() is not available against Supabase; use `supabase db reset`.')
  }
}
