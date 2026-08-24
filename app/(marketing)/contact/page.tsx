import type { Metadata } from 'next'
import { Card } from '@/components/ui/primitives'
import { ContactForm } from './contact-form'

export const metadata: Metadata = { title: 'Contact' }

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="grid gap-10 md:grid-cols-[1fr_1fr]">
        <div>
          <p className="eyebrow">Contact</p>
          <h1 className="mt-2 text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            Tell us about the transaction.
          </h1>
          <p className="mt-4 text-[14px] leading-relaxed text-ink-secondary">
            If you have a financing opportunity in progress, the fastest route is to create an
            account and start the deal — you will get matched lenders and a readiness checklist
            immediately. Use this form for anything else.
          </p>

          <div className="mt-8 space-y-4">
            {[
              { label: 'Borrowers and operators', value: 'deals@carecapital.exchange' },
              { label: 'Lending institutions', value: 'lenders@carecapital.exchange' },
              { label: 'Everything else', value: 'hello@carecapital.exchange' },
            ].map((item) => (
              <div key={item.label} className="border-b border-line pb-3">
                <p className="text-[11px] uppercase tracking-[0.05em] text-ink-muted">{item.label}</p>
                <p className="mt-0.5 text-[13px] font-medium text-ink">{item.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-[11px] leading-relaxed text-ink-muted">
            Addresses shown are placeholders for this demonstration environment.
          </p>
        </div>

        <Card className="p-6">
          <ContactForm />
        </Card>
      </div>
    </div>
  )
}
