import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { applyQuery, matchesWhere, type Query, type Where } from './query'
import { APPEND_ONLY_TABLES, TABLE_NAMES, type TableName } from './tables'
import { StoreError, type Insert, type Row, type Store } from './store'

type Database = Record<string, Record<string, unknown>[]>

const DATA_DIR = process.env.CCX_DATA_DIR || path.join(process.cwd(), '.data')
const DB_FILE = path.join(DATA_DIR, 'store.json')

function emptyDatabase(): Database {
  return Object.fromEntries(TABLE_NAMES.map((name) => [name, []])) as Database
}

/**
 * File-backed store used for local development, demo mode and tests.
 *
 * Writes are serialised through a promise chain and flushed atomically
 * (write-temp + rename) so a crash mid-write cannot corrupt the database.
 */
export class LocalStore implements Store {
  readonly driver = 'local' as const
  private db: Database = emptyDatabase()
  private loaded = false
  private tail: Promise<unknown> = Promise.resolve()
  private dirty = false
  private flushTimer: NodeJS.Timeout | null = null
  /** Serialises flushes so two writers cannot race on the same temp file. */
  private flushChain: Promise<void> = Promise.resolve()
  private readonly persist: boolean

  constructor(options: { persist?: boolean } = {}) {
    this.persist = options.persist ?? process.env.NODE_ENV !== 'test'
  }

  /** Serialises all mutations so concurrent requests cannot interleave writes. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn)
    this.tail = run.catch(() => undefined)
    return run
  }

  private async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    if (!this.persist) return
    try {
      const raw = await readFile(DB_FILE, 'utf8')
      const parsed = JSON.parse(raw) as Database
      const next = emptyDatabase()
      for (const table of TABLE_NAMES) next[table] = parsed[table] ?? []
      this.db = next
    } catch {
      // No database on disk yet — start from an empty one.
    }
  }

  private scheduleFlush(): void {
    if (!this.persist) return
    this.dirty = true
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, 25)
    this.flushTimer.unref?.()
  }

  async flush(): Promise<void> {
    if (!this.persist) return
    const run = this.flushChain.then(async () => {
      if (!this.dirty) return
      this.dirty = false
      const snapshot = JSON.stringify(this.db)
      await mkdir(DATA_DIR, { recursive: true })
      // A unique temp name per write, renamed into place, so a crash mid-write
      // cannot leave a truncated database and two writers cannot collide.
      const tmp = `${DB_FILE}.${process.pid}.${randomUUID()}.tmp`
      await writeFile(tmp, snapshot, 'utf8')
      await rename(tmp, DB_FILE)
    })
    this.flushChain = run.catch((error) => {
      console.error('[store] flush failed', error)
    })
    return run
  }

  private table(name: TableName): Record<string, unknown>[] {
    return (this.db[name] ??= [])
  }

  async select<T extends TableName>(table: T, query?: Query): Promise<Row<T>[]> {
    return this.enqueue(async () => {
      await this.load()
      return applyQuery(this.table(table), query).map((r) => structuredClone(r)) as unknown as Row<T>[]
    })
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
    return this.enqueue(async () => {
      await this.load()
      const now = new Date().toISOString()
      const target = this.table(table)
      const created = rows.map((row) => {
        const record = structuredClone(row) as Record<string, unknown>
        record.id ??= randomUUID()
        record.created_at ??= now
        if ('updated_at' in record || !APPEND_ONLY_TABLES.includes(table)) record.updated_at ??= now
        return record
      })
      const seen = new Set(target.map((r) => r.id as string))
      for (const record of created) {
        if (seen.has(record.id as string)) {
          throw new StoreError(`Duplicate id in ${table}: ${record.id}`, 'conflict')
        }
        seen.add(record.id as string)
      }
      target.push(...created)
      this.scheduleFlush()
      return created.map((r) => structuredClone(r)) as unknown as Row<T>[]
    })
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<Row<T>>): Promise<Row<T>> {
    return this.enqueue(async () => {
      await this.load()
      if (APPEND_ONLY_TABLES.includes(table)) {
        throw new StoreError(`${table} is append-only`, 'driver')
      }
      const target = this.table(table)
      const index = target.findIndex((r) => r.id === id)
      if (index === -1) throw new StoreError(`${table} row ${id} not found`, 'not_found')
      const next: Record<string, unknown> = { ...target[index], ...structuredClone(patch as object), id }
      if ('updated_at' in target[index]) next.updated_at = new Date().toISOString()
      target[index] = next
      this.scheduleFlush()
      return structuredClone(next) as unknown as Row<T>
    })
  }

  async updateWhere<T extends TableName>(table: T, where: Where, patch: Partial<Row<T>>): Promise<number> {
    return this.enqueue(async () => {
      await this.load()
      if (APPEND_ONLY_TABLES.includes(table)) {
        throw new StoreError(`${table} is append-only`, 'driver')
      }
      const target = this.table(table)
      const now = new Date().toISOString()
      let updated = 0
      for (let i = 0; i < target.length; i++) {
        if (!matchesWhere(target[i], where)) continue
        const next: Record<string, unknown> = { ...target[i], ...structuredClone(patch as object), id: target[i].id }
        if ('updated_at' in target[i]) next.updated_at = now
        target[i] = next
        updated++
      }
      if (updated) this.scheduleFlush()
      return updated
    })
  }

  async remove<T extends TableName>(table: T, id: string): Promise<void> {
    await this.enqueue(async () => {
      await this.load()
      if (APPEND_ONLY_TABLES.includes(table)) {
        throw new StoreError(`${table} is append-only`, 'driver')
      }
      const target = this.table(table)
      const index = target.findIndex((r) => r.id === id)
      if (index !== -1) {
        target.splice(index, 1)
        this.scheduleFlush()
      }
    })
  }

  async count<T extends TableName>(table: T, query?: Query): Promise<number> {
    const rows = await this.select(table, { ...query, limit: undefined, offset: undefined })
    return rows.length
  }

  async reset(): Promise<void> {
    await this.enqueue(async () => {
      this.loaded = true
      this.db = emptyDatabase()
      this.scheduleFlush()
    })
    await this.flush()
  }

  /** True when the database has never been seeded. */
  async isEmpty(): Promise<boolean> {
    return (await this.count('companies')) === 0
  }
}
