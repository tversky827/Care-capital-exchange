import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

/**
 * Document storage.
 *
 * Two drivers behind one interface. Neither ever produces a publicly readable
 * URL: the local driver keeps bytes outside the served directory tree and the
 * Supabase driver uses time-limited signed URLs. In both cases every read goes
 * through `/api/documents/[id]/download`, which authorizes and logs first.
 */

export interface StoredObject {
  key: string
  size: number
  checksum: string
}

export interface StorageDriver {
  readonly name: string
  put(key: string, data: Buffer, contentType: string): Promise<StoredObject>
  get(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  /** A time-limited URL, when the driver supports one. Null means stream it. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string | null>
}

const UPLOAD_DIR = process.env.CCX_UPLOAD_DIR || path.join(process.cwd(), '.data', 'uploads')

class LocalStorageDriver implements StorageDriver {
  readonly name = 'local'

  private resolve(key: string): string {
    // Defence against a key like `../../etc/passwd` reaching the filesystem.
    const safe = key.replace(/[^a-zA-Z0-9._/-]/g, '_')
    const full = path.resolve(UPLOAD_DIR, safe)
    if (!full.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
      throw new Error('Invalid storage key.')
    }
    return full
  }

  async put(key: string, data: Buffer): Promise<StoredObject> {
    const target = this.resolve(key)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, data)
    return { key, size: data.length, checksum: checksumOf(data) }
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key))
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true })
  }

  async signedUrl(): Promise<string | null> {
    // The local driver streams through the authorized route instead.
    return null
  }
}

class SupabaseStorageDriver implements StorageDriver {
  readonly name = 'supabase'
  private client
  private bucket: string

  constructor(url: string, key: string, bucket: string) {
    this.client = createClient(url, key, { auth: { persistSession: false } })
    this.bucket = bucket
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(key, data, { contentType, upsert: true })
    if (error) throw new Error(this.describe('upload', error))
    return { key, size: data.length, checksum: checksumOf(data) }
  }

  /**
   * A storage failure that says what to do about it.
   *
   * Supabase's storage errors frequently serialise to an empty object, so the
   * message has to be assembled from whatever fields did arrive. The bucket is
   * named because a missing bucket is much the commonest cause, and it is
   * created by `0002_rls.sql` — a deployment that skipped that migration fails
   * here first, with nothing else to point at.
   */
  private describe(operation: string, error: unknown): string {
    const detail = error as { message?: unknown; error?: unknown; statusCode?: unknown } | null
    // Only text that is actually informative. Supabase sometimes sets `message`
    // to a stringified empty body, and "{}" in an error message is worse than
    // saying nothing at all.
    const EMPTY = new Set(['{}', '[]', 'null', 'undefined', '[object Object]'])
    const text = (value: unknown): string | null => {
      if (typeof value !== 'string') return null
      const trimmed = value.trim()
      return trimmed.length > 0 && !EMPTY.has(trimmed) ? trimmed : null
    }
    const parts = [
      text(detail?.message),
      text(detail?.error),
      detail?.statusCode !== undefined && detail.statusCode !== null
        ? `status ${String(detail.statusCode)}`
        : null,
    ].filter((part): part is string => part !== null)

    const reason = parts.length > 0 ? parts.join(' — ') : 'the storage service returned no detail'
    return [
      `Storage ${operation} failed for bucket "${this.bucket}": ${reason}.`,
      `Check that the bucket exists and is private. It is created by supabase/migrations/0002_rls.sql;`,
      `if that migration has not been applied, apply it or create the bucket by hand.`,
    ].join(' ')
  }

  async get(key: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key)
    if (error || !data) throw new Error(this.describe('download', error))
    return Buffer.from(await data.arrayBuffer())
  }

  async delete(key: string): Promise<void> {
    await this.client.storage.from(this.bucket).remove([key])
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string | null> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(key, expiresInSeconds)
    if (error) return null
    return data?.signedUrl ?? null
  }
}

export function checksumOf(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

let driver: StorageDriver | null = null

export function getStorage(): StorageDriver {
  if (driver) return driver
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'deal-documents'
  // Where documents live is a separate decision from where rows live. It
  // defaults to following the data driver, which is what a normal Supabase
  // deployment wants, but STORAGE_DRIVER can pin it either way — useful for
  // keeping bytes on disk while the database is remote, and for exercising the
  // Supabase data path against a stack that has no object storage.
  const configured = process.env.STORAGE_DRIVER
  const useSupabase =
    configured === 'supabase' ||
    (configured !== 'local' && process.env.DATA_DRIVER === 'supabase')
  driver = useSupabase && url && key
    ? new SupabaseStorageDriver(url, key, bucket)
    : new LocalStorageDriver()
  return driver
}

/** Namespaced, unguessable object key for a deal document. */
export function storageKeyFor(dealId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  return `deals/${dealId}/${randomUUID()}-${safeName}`
}
