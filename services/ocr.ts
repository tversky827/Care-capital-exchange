import 'server-only'

/**
 * OCR.
 *
 * Scanned documents are routed here rather than being treated as empty. No OCR
 * engine ships with the application, so the development implementation is
 * honest about what it is: it returns no text and marks the document as
 * requiring OCR, which surfaces in the data room as "needs OCR" rather than as
 * a silently empty extraction.
 *
 * Wire a real engine by calling `setOcrService` at startup.
 */

export interface OcrPage {
  page: number
  text: string
  confidence: number
}

export interface OcrResult {
  pages: OcrPage[]
  provider: string
  available: boolean
}

export interface OcrService {
  readonly name: string
  readonly available: boolean
  recognize(filename: string, data: Buffer, mimeType: string): Promise<OcrResult>
}

class UnavailableOcrService implements OcrService {
  readonly name = 'none'
  readonly available = false
  async recognize(): Promise<OcrResult> {
    return { pages: [], provider: this.name, available: false }
  }
}

let service: OcrService = new UnavailableOcrService()

export function setOcrService(next: OcrService): void {
  service = next
}

export function getOcrService(): OcrService {
  return service
}
