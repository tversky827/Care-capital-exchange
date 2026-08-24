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
    if (error) throw new Error(`Storage upload failed: ${error.message}`)
    return { key, size: data.length, checksum: checksumOf(data) }
  }

  async get(key: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key)
    if (error || !data) throw new Error(`Storage download failed: ${error?.message ?? 'not found'}`)
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
  driver =
    process.env.DATA_DRIVER === 'supabase' && url && key
      ? new SupabaseStorageDriver(url, key, bucket)
      : new LocalStorageDriver()
  return driver
}

/** Namespaced, unguessable object key for a deal document. */
export function storageKeyFor(dealId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  return `deals/${dealId}/${randomUUID()}-${safeName}`
}
