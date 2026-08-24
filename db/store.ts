import type { Query, Where } from './query'
import type { TableName, Tables } from './tables'

export type Row<T extends TableName> = Tables[T]
export type Insert<T extends TableName> = Omit<Row<T>, 'id' | 'created_at' | 'updated_at'> &
  Partial<Pick<Row<T>, Extract<keyof Row<T>, 'id' | 'created_at' | 'updated_at'>>>

/**
 * The single data-access contract used by every service. Two drivers implement
 * it: a file-backed local store (default, zero configuration) and Supabase.
 */
export interface Store {
  readonly driver: 'local' | 'supabase'
  select<T extends TableName>(table: T, query?: Query): Promise<Row<T>[]>
  selectOne<T extends TableName>(table: T, query: Query): Promise<Row<T> | null>
  findById<T extends TableName>(table: T, id: string): Promise<Row<T> | null>
  insert<T extends TableName>(table: T, row: Insert<T>): Promise<Row<T>>
  insertMany<T extends TableName>(table: T, rows: Insert<T>[]): Promise<Row<T>[]>
  update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T>>
  updateWhere<T extends TableName>(table: T, where: Where, patch: Partial<Row<T>>): Promise<number>
  remove<T extends TableName>(table: T, id: string): Promise<void>
  count<T extends TableName>(table: T, query?: Query): Promise<number>
  /** Truncates every table. Test/seed use only. */
  reset(): Promise<void>
}

export class StoreError extends Error {
  constructor(message: string, readonly code: 'not_found' | 'conflict' | 'driver' = 'driver') {
    super(message)
    this.name = 'StoreError'
  }
}
