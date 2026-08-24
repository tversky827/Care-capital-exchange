import { inflateRawSync, inflateSync } from 'node:zlib'

/**
 * Minimal ZIP reader.
 *
 * XLSX and DOCX are ZIP containers of XML. Rather than pull in a spreadsheet
 * library (and its parsing CVE surface) to read a handful of entries, this
 * walks the central directory directly. It supports the two compression
 * methods the Office formats actually emit: stored (0) and deflate (8).
 */

interface ZipEntry {
  name: string
  offset: number
  compressedSize: number
  uncompressedSize: number
  method: number
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50

function findEndOfCentralDirectory(buffer: Buffer): number {
  // The EOCD record is at the end, after a comment of up to 64 KiB.
  const start = Math.max(0, buffer.length - 65_557)
  for (let i = buffer.length - 22; i >= start; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i
  }
  return -1
}

export function readZipEntries(buffer: Buffer): Map<string, ZipEntry> {
  const entries = new Map<string, ZipEntry>()
  const eocd = findEndOfCentralDirectory(buffer)
  if (eocd === -1) return entries

  const count = buffer.readUInt16LE(eocd + 10)
  let pointer = buffer.readUInt32LE(eocd + 16)

  for (let i = 0; i < count; i++) {
    if (pointer + 46 > buffer.length) break
    if (buffer.readUInt32LE(pointer) !== CENTRAL_SIGNATURE) break
    const method = buffer.readUInt16LE(pointer + 10)
    const compressedSize = buffer.readUInt32LE(pointer + 20)
    const uncompressedSize = buffer.readUInt32LE(pointer + 24)
    const nameLength = buffer.readUInt16LE(pointer + 28)
    const extraLength = buffer.readUInt16LE(pointer + 30)
    const commentLength = buffer.readUInt16LE(pointer + 32)
    const localOffset = buffer.readUInt32LE(pointer + 42)
    const name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength)
    entries.set(name, { name, offset: localOffset, compressedSize, uncompressedSize, method })
    pointer += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

export function readZipFile(buffer: Buffer, entry: ZipEntry): Buffer | null {
  if (entry.offset + 30 > buffer.length) return null
  if (buffer.readUInt32LE(entry.offset) !== LOCAL_SIGNATURE) return null
  const nameLength = buffer.readUInt16LE(entry.offset + 26)
  const extraLength = buffer.readUInt16LE(entry.offset + 28)
  const start = entry.offset + 30 + nameLength + extraLength
  const data = buffer.subarray(start, start + entry.compressedSize)
  try {
    if (entry.method === 0) return Buffer.from(data)
    if (entry.method === 8) return inflateRawSync(data)
    return null
  } catch {
    try {
      return inflateSync(data)
    } catch {
      return null
    }
  }
}

export function extractZipEntry(buffer: Buffer, name: string): Buffer | null {
  const entries = readZipEntries(buffer)
  const entry = entries.get(name)
  return entry ? readZipFile(buffer, entry) : null
}

export function isZipContainer(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer.readUInt32LE(0) === LOCAL_SIGNATURE
}
