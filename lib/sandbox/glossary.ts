/**
 * The terms an investor new to this asset class trips over.
 *
 * Written to be read once and understood, not to be complete. Each one says
 * what the number is, and then the thing an experienced investor actually
 * knows about it, which is usually the more useful half.
 */
export interface Term {
  key: string
  label: string
  short: string
  detail: string
}

export const GLOSSARY: Term[] = [
  {
    key: 'irr',
    label: 'IRR',
    short: 'The annual rate that makes the money going out and coming back balance.',
    detail: 'It accounts for when cash arrives, so an early distribution is worth more than a late one of the same size. It is very sensitive to the exit assumption and to the length of the hold — a deal that sells a year later at the same price shows a materially lower IRR without anything having gone wrong.',
  },
  {
    key: 'moic',
    label: 'Equity multiple (MOIC)',
    short: 'Total dollars back for every dollar in, ignoring time.',
    detail: 'A 2.0x means you got twice what you put in over the whole hold. It answers a different question from IRR and the two can disagree: a quick 1.4x can beat a slow 2.2x on IRR while leaving you with less money.',
  },
  {
    key: 'dscr',
    label: 'DSCR',
    short: 'Operating income divided by the debt payment.',
    detail: 'Below 1.0 the property is not earning its mortgage. Lenders typically want 1.3x or better on skilled nursing, and a covenant breach is a conversation with the lender long before it is a loss to the equity.',
  },
  {
    key: 'ltv',
    label: 'LTV',
    short: 'Debt as a share of what the property is worth.',
    detail: 'Higher leverage raises the return when things go well and destroys the equity first when they do not. The equity in a 75% LTV deal is wiped out by a 25% fall in value; at 60% it takes a 40% fall.',
  },
  {
    key: 'occupancy',
    label: 'Occupancy',
    short: 'Beds filled as a share of beds operated.',
    detail: 'The single most powerful number in a nursing home, because most of the cost base does not fall when a bed empties. A five-point occupancy swing can move EBITDA by a third.',
  },
  {
    key: 'medicaid',
    label: 'Medicaid exposure',
    short: 'The share of revenue paid by a state Medicaid programme.',
    detail: 'Medicaid pays least and is set politically, so a high share means the revenue line can be changed by a legislature rather than by the market. It is not automatically bad — Medicaid census is stable — but it caps the upside.',
  },
  {
    key: 'preferred',
    label: 'Preferred return',
    short: 'A rate the investors are paid before the sponsor shares in anything.',
    detail: 'Usually 6–9% a year on capital still outstanding. "Preferred" means first in line, not guaranteed: if the property does not produce the cash, it accrues rather than being paid, and in a bad deal it is never paid at all.',
  },
  {
    key: 'waterfall',
    label: 'Waterfall',
    short: 'The order cash is paid out in.',
    detail: 'Typically the preferred return, then return of capital, then a split of what is left. The order matters more than the percentages: everything ahead of you gets paid in full before you see anything.',
  },
  {
    key: 'promote',
    label: 'Sponsor promote',
    short: 'The sponsor’s share of profit above the preferred return.',
    detail: 'Commonly 20%. It is how the operator is paid for performance rather than for showing up, and it only pays after the investors have their preferred return and their capital back.',
  },
  {
    key: 'cap-rate',
    label: 'Capitalisation rate',
    short: 'Operating income divided by value.',
    detail: 'A pricing convention: a higher cap rate is a lower price for the same income. The exit cap rate assumption is usually the single largest driver of a projected return, and it is the one nobody can know.',
  },
  {
    key: 'agency',
    label: 'Agency labour',
    short: 'Temporary staff hired through an agency, at a premium.',
    detail: 'Often 1.5–2x the cost of a permanent employee. A building running heavy agency has a staffing problem, and every turnaround thesis in this sector is really a thesis about converting agency hours to permanent ones.',
  },
  {
    key: 'illiquid',
    label: 'Illiquid',
    short: 'There is no market to sell your stake in.',
    detail: 'Unlike a listed share, there is no buyer on demand and no daily price. Your money is committed until the property is sold or refinanced, which is targeted rather than promised and can take longer than the target.',
  },
]

export const GLOSSARY_BY_KEY = new Map(GLOSSARY.map((term) => [term.key, term]))
