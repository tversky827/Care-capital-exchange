import Link from 'next/link'
import { FlaskConical, Presentation } from 'lucide-react'
import { ENVIRONMENT_LABELS, type Environment } from '@/lib/environment'
import { exitSandboxAction } from '@/app/(app)/sandbox/actions'

/**
 * Which environment this is.
 *
 * Present on every page of the sandbox and absent from the live product, so
 * its presence is the signal rather than its wording. The two sandboxes are
 * coloured differently from each other on purpose: a person who has been in
 * both should be able to tell which one they are in without reading.
 *
 * Not alarming, and deliberately. The guarantee that nothing here is real is
 * held by the database, not by a red bar — and a warning shown on every screen
 * is a warning nobody sees by the third one.
 */
export function EnvironmentBanner({ environment }: { environment: Environment }) {
  if (environment === 'live') return null
  const { label, detail } = ENVIRONMENT_LABELS[environment]
  const demo = environment === 'demo'

  return (
    <div
      className={`no-print flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-1.5 text-[11px] ${
        demo
          ? 'border-warning/25 bg-warning-soft text-warning'
          : 'border-accent-line bg-accent-soft text-accent'
      }`}
    >
      <span className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.08em]">
        {demo ? <Presentation className="size-3.5" /> : <FlaskConical className="size-3.5" />}
        {label} mode
      </span>
      <span className="font-medium">{detail}</span>
      <span className="flex items-center gap-3">
        <Link href="/sandbox/home" className="underline underline-offset-2">
          Sandbox home
        </Link>
        <form action={exitSandboxAction}>
          <button type="submit" className="underline underline-offset-2">
            Leave {demo ? 'demo' : 'practice'}
          </button>
        </form>
      </span>
    </div>
  )
}
