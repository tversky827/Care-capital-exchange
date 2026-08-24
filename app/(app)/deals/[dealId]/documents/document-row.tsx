'use client'

import { useActionState, useState } from 'react'
import { Button, Input, Select } from '@/components/ui/primitives'
import { deleteDocumentAction, updateDocumentAction, type ActionState } from '../../actions'
import { titleize } from '@/lib/utils/format'
import { DOCUMENT_TYPES } from '@/types'

export function DocumentRow({
  dealId, document,
}: {
  dealId: string
  document: { id: string; display_name: string; doc_type: string; visibility: string }
}) {
  const [editing, setEditing] = useState(false)
  const [updateState, updateSubmit, updatePending] = useActionState<ActionState, FormData>(updateDocumentAction, {})
  const [deleteState, deleteSubmit] = useActionState<ActionState, FormData>(deleteDocumentAction, {})

  if (!editing) {
    return (
      <div className="mt-1 flex items-center gap-2">
        <button type="button" onClick={() => setEditing(true)} className="text-[11px] text-ink-muted hover:text-ink">
          Edit
        </button>
        <form
          action={deleteSubmit}
          onSubmit={(event) => {
            if (!window.confirm(`Remove "${document.display_name}" from the data room? Lenders who have already downloaded it will still have their copy.`)) {
              event.preventDefault()
            }
          }}
        >
          <input type="hidden" name="dealId" value={dealId} />
          <input type="hidden" name="documentId" value={document.id} />
          <button type="submit" className="text-[11px] text-ink-muted hover:text-critical">Remove</button>
        </form>
        {deleteState.error ? <span className="text-[11px] text-critical">{deleteState.error}</span> : null}
      </div>
    )
  }

  return (
    <form action={updateSubmit} className="mt-2 space-y-1.5">
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="documentId" value={document.id} />
      <Input name="display_name" defaultValue={document.display_name} className="h-7 text-[12px]" aria-label="Display name" />
      <Select name="doc_type" defaultValue={document.doc_type} className="h-7 text-[12px]" aria-label="Document type">
        {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{titleize(type)}</option>)}
      </Select>
      <Select name="visibility" defaultValue={document.visibility} className="h-7 text-[12px]" aria-label="Visibility">
        <option value="distributed_lenders">Lenders</option>
        <option value="deal_team">Deal team only</option>
        <option value="restricted">Restricted</option>
      </Select>
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" variant="primary" disabled={updatePending}>Save</Button>
        <Button type="button" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
      {updateState.error ? <p className="text-[11px] text-critical">{updateState.error}</p> : null}
    </form>
  )
}
