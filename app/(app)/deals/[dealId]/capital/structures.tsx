import { Alert, Badge, CardBody, Section, Table, Td, Th, Tr } from '@/components/ui/primitives'
import { formatPercent } from '@/lib/utils/format'
import type { ComparisonRow, StructureOption } from '@/lib/equity/structures'

/**
 * Capital structure analysis and comparison.
 *
 * Four structures the deal's own figures support, priced side by side. No
 * option is marked best and no column is sorted to imply one: a structure that
 * lowers the cost of capital raises the leverage, and which of those a sponsor
 * wants is a judgement about risk that the platform has no basis to make.
 */
export function StructureAnalysis({
  options, comparison, ratePctUsed, rateSource,
}: {
  options: StructureOption[]
  comparison: ComparisonRow[]
  ratePctUsed: number | null
  rateSource: string
}) {
  if (options.length === 0) {
    return (
      <Section title="Capital structure options">
        <CardBody>
          <p className="text-[13px] text-ink-muted">
            This deal has not been underwritten far enough to price a capital structure. A total
            capitalisation and an underwritten net operating income are both required.
          </p>
        </CardBody>
      </Section>
    )
  }

  return (
    <Section
      title="Capital structure options"
      description={`Priced at ${ratePctUsed !== null ? formatPercent(ratePctUsed) : 'an unknown rate'}, taken from ${rateSource}.`}
    >
      <CardBody className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          {options.map((option) => (
            <div key={option.key} className="rounded border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-[13px] font-semibold text-ink">{option.label}</h4>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">{option.description}</p>
                </div>
                {option.dscr !== null ? (
                  <Badge tone={option.dscr >= 1.25 ? 'positive' : 'critical'}>
                    {option.dscr.toFixed(2)}x
                  </Badge>
                ) : null}
              </div>

              <div className="mt-2.5 flex h-2 overflow-hidden rounded-full">
                {option.layers.map((layer) => (
                  <div
                    key={layer.position}
                    className={
                      layer.position === 'senior_debt' ? 'bg-[#1f4e79]'
                        : layer.position === 'preferred_equity' ? 'bg-[#6b9ac4]' : 'bg-[#a8c5dd]'
                    }
                    style={{ width: `${layer.sharePct * 100}%` }}
                    title={`${layer.label}: ${formatPercent(layer.sharePct * 100)}`}
                  />
                ))}
              </div>

              <ul className="mt-2.5 space-y-1 text-[11px] leading-relaxed">
                {option.pros.map((pro) => (
                  <li key={pro} className="text-ink-secondary">✓ {pro}</li>
                ))}
                {option.cons.map((con) => (
                  <li key={con} className="text-amber-700">− {con}</li>
                ))}
                {option.risks.map((risk) => (
                  <li key={risk} className="text-red-700">⚠ {risk}</li>
                ))}
              </ul>

              {option.insufficientData ? (
                <p className="mt-2 text-[11px] text-ink-muted">{option.insufficientData}</p>
              ) : null}
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <thead>
              <Tr>
                <Th>Comparison</Th>
                {options.map((option) => <Th key={option.key} numeric>{option.label}</Th>)}
              </Tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <Tr key={row.label}>
                  <Td>
                    <span className="text-ink">{row.label}</span>
                    {row.hint ? <span className="block text-[11px] text-ink-muted">{row.hint}</span> : null}
                  </Td>
                  {row.values.map((value, index) => (
                    <Td key={`${row.label}-${index}`} numeric>{value ?? '—'}</Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>

        <Alert tone="neutral">
          These are the structures this deal&rsquo;s figures will support, not a recommendation
          among them. Lower leverage costs more equity and gives more cushion; higher leverage does
          the reverse. Projected returns are derived from the assumptions on this deal&rsquo;s
          offering and are not forecasts.
        </Alert>
      </CardBody>
    </Section>
  )
}
