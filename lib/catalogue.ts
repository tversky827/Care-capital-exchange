import type { Environment } from '@/lib/environment'

/**
 * Which catalogue of properties and raises an environment looks at.
 *
 * Practice deliberately reads the live one. That is the whole proposition:
 * the opportunities are real even though the money is not, so a person who
 * has practised has practised on something that exists. Only the
 * demonstration environment gets the fictional catalogue.
 */
export type Catalogue = 'live' | 'demo'

export function catalogueFor(environment: Environment): Catalogue {
  return environment === 'demo' ? 'demo' : 'live'
}

/**
 * Whether a record belongs in the catalogue this environment reads.
 *
 * Rows written before the catalogue existed carry no environment, and are
 * live catalogue: an absent value must never read as "fictional", because a
 * real raise mislabelled as a demonstration is a real raise nobody can see.
 */
export function inCatalogue(
  row: { environment?: Catalogue | null },
  catalogue: Catalogue,
): boolean {
  return (row.environment ?? 'live') === catalogue
}
