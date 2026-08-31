'use server'

import { db } from '@/db'
import { requireActor } from '@/lib/auth/session'
import { currentEnvironment } from '@/lib/environment'
import { catalogueFor, inCatalogue } from '@/lib/catalogue'
import { runCustomScenario } from '@/services/equity/analysis'
import { accountFor, record, PracticeError } from '@/services/practice/accounts'
import type { ScenarioInputs, ScenarioResults } from '@/types/equity'

/**
 * The what-if.
 *
 * Runs the deterministic scenario engine — the same one the offering page's
 * downside case uses — against assumptions the person moved. Nothing here is
 * computed by a language model, and nothing here is advice: it answers "what
 * would this model say if that number were different", which is a question
 * about the model rather than about the future.
 */
export async function runScenarioAction(
  offeringId: string,
  inputs: Partial<ScenarioInputs>,
): Promise<{ results?: ScenarioResults; error?: string }> {
  try {
    const actor = await requireActor()
    const environment = await currentEnvironment(actor.user.id)
    if (environment === 'live') return { error: 'The scenario tool is part of the sandbox.' }

    const store = await db()
    const offering = await store.findById('offerings', offeringId)
    if (!offering || !inCatalogue(offering, catalogueFor(environment))) {
      return { error: 'That opportunity could not be found.' }
    }

    const results = await runCustomScenario(offeringId, inputs)
    if (!results) return { error: 'That opportunity could not be found.' }

    // Kept, so a person can see what they tried. Saved against the sandbox
    // account rather than the offering: it is the investor's own working, and
    // no sponsor should see what somebody was stress-testing.
    const account = await accountFor(actor, environment)
    if (account) {
      await store.insert('practice_scenarios', {
        account_id: account.id,
        offering_id: offeringId,
        label: describe(inputs),
        inputs: inputs as Record<string, number>,
        results: results as unknown as Record<string, number | null>,
      } as never)
      await record(account, 'scenario_run', `Scenario on ${offering.name}: ${describe(inputs)}.`, offeringId)
    }

    return { results }
  } catch (error) {
    if (error instanceof PracticeError) return { error: error.message }
    return { error: error instanceof Error ? error.message : 'Something went wrong.' }
  }
}

/** A short human label for what was changed, for the saved history. */
function describe(inputs: Partial<ScenarioInputs>): string {
  const parts: string[] = []
  const say = (value: number | undefined, unit: string, name: string) => {
    if (!value) return
    parts.push(`${name} ${value > 0 ? '+' : ''}${value}${unit}`)
  }
  say(inputs.occupancy_delta_pct, ' pts', 'occupancy')
  say(inputs.revenue_delta_pct, '%', 'revenue')
  say(inputs.labor_delta_pct, '%', 'labour')
  say(inputs.interest_rate_delta_pct, ' pts', 'rate')
  say(inputs.exit_multiple_delta, 'x', 'exit multiple')
  say(inputs.hold_years_delta, ' yrs', 'hold')
  if (inputs.capex_event) parts.push(`capital event $${inputs.capex_event.toLocaleString('en-US')}`)
  return parts.length > 0 ? parts.join(', ') : 'the stated assumptions, unchanged'
}
