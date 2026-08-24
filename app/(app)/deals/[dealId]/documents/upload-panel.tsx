'use client'

import { useActionState, useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Field, Select } from '@/components/ui/primitives'
import { uploadDocumentAction, type ActionState } from '../../actions'
import { cn } from '@/lib/utils/cn'
import { formatBytes, titleize } from '@/lib/utils/format'
import { DOCUMENT_TYPES } from '@/types'

/**
 * Upload panel with drag-and-drop and multi-file support.
 *
 * The document type applies to the whole batch, which is how documents actually
 * arrive — a folder of statements, then a folder of census reports.
 */
export function UploadPanel({ dealId }: { dealId: string }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(uploadDocumentAction, {})
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(list: FileList | null) {
    if (!list) return
    setFiles((current) => [...current, ...Array.from(list)])
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Upload documents</CardTitle>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            PDF, Excel, CSV, Word and images. Files are scanned, parsed and extracted automatically.
          </p>
        </div>
      </CardHeader>
      <CardBody>
        <form
          action={(formData) => {
            // The visible file input is not the source of truth once files have
            // been dropped, so the batch is attached explicitly.
            formData.delete('files')
            for (const file of files) formData.append('files', file)
            submit(formData)
            setFiles([])
            if (inputRef.current) inputRef.current.value = ''
          }}
        >
          <input type="hidden" name="dealId" value={dealId} />

          <div
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              addFiles(event.dataTransfer.files)
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center border border-dashed px-6 py-8 text-center transition-colors',
              dragging ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-accent-line hover:bg-surface-sunken/60',
            )}
          >
            <UploadCloud className="size-6 text-ink-muted" />
            <p className="mt-2 text-[13px] font-medium text-ink">Drop files here, or click to browse</p>
            <p className="mt-0.5 text-[11px] text-ink-muted">Up to 25MB per file. Multiple files and folders are supported.</p>
            <input
              ref={inputRef}
              type="file"
              name="files"
              multiple
              className="hidden"
              onChange={(event) => addFiles(event.target.files)}
            />
          </div>

          {files.length > 0 ? (
            <ul className="mt-3 divide-y divide-line border border-line">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span className="min-w-0 truncate text-[12px] text-ink">{file.name}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tnum text-[11px] text-ink-muted">{formatBytes(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                      className="text-[11px] text-ink-muted hover:text-critical"
                    >
                      Remove
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Document type" htmlFor="docType" hint="Determines what the pipeline expects to find inside.">
              <Select id="docType" name="docType" defaultValue="profit_and_loss">
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>{titleize(type)}</option>
                ))}
              </Select>
            </Field>
            <Field
              label="Lender visibility"
              htmlFor="visibility"
              hint="Restricted documents are never released to a lender, whatever the distribution."
            >
              <Select id="visibility" name="visibility" defaultValue="distributed_lenders">
                <option value="distributed_lenders">Visible to lenders you distribute to</option>
                <option value="deal_team">Deal team only</option>
                <option value="restricted">Restricted — never shared</option>
              </Select>
            </Field>
          </div>

          {state.error ? <Alert tone="critical" className="mt-3">{state.error}</Alert> : null}
          {state.success ? <Alert tone="positive" className="mt-3">{state.success}</Alert> : null}

          <div className="mt-4">
            <Button type="submit" variant="primary" disabled={pending || files.length === 0}>
              {pending ? 'Uploading…' : `Upload ${files.length || ''} ${files.length === 1 ? 'file' : 'files'}`.trim()}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
