'use client'

import { useEffect } from 'react'

/** Opens the browser print dialog once the memo has rendered. */
export function PrintTrigger() {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 400)
    return () => clearTimeout(timer)
  }, [])
  return null
}
