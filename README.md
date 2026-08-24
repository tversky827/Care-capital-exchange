# CareCapital Exchange

**Healthcare capital, intelligently matched.**

An institutional healthcare financing platform that turns a messy financing
opportunity into a standardised, lender-ready package and matches it with
lenders whose published criteria actually fit the deal. The first vertical is
skilled nursing.

The application runs end to end with **no configuration and no external
credentials**. `npm install && npm run dev` gives you a seeded marketplace with
ten deals, five lending institutions, real documents that the real extraction
pipeline has processed, and a complete borrower-to-lender workflow.

---

## Contents

- [Quick start](#quick-start)
- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Environment variables](#environment-variables)
- [Supabase setup](#supabase-setup)
- [Database migrations](#database-migrations)
- [Seed data](#seed-data)
- [AI provider setup](#ai-provider-setup)
- [Local development](#local-development)
- [Testing](#testing)
- [Production deployment](#production-deployment)
- [Security](#security)
- [Known limitations](#known-limitations)
- [Future integrations](#future-integrations)

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The database seeds itself on first request.

Sign in at `/login` — the page lists the seeded accounts and signs you in with
one click. Or use the password directly:

| Account | Role | Password |
| --- | --- | --- |
| `dana@meridiansenior.demo` | Borrower — Meridian Senior Operations | `DemoPass123!` |
| `healthcare@midwesthealthcarebank.demo` | Lender — Midwest Healthcare Bank | `DemoPass123!` |
| `admin@carecapital.demo` | Platform administrator | `DemoPass123!` |

> All demonstration data is fictional. Company names, facilities, financial
> figures and lending institutions were invented for this environment and do not
> refer to any real business, property or lender.

### A five-minute tour

1. Sign in as the **borrower**. The dashboard names the single most useful next
   action across the portfolio.
2. Open **CCX-1001 Lakeview Skilled Nursing**. The header carries the metrics a
   lender screens on; the tabs carry the whole package.
3. **Issues** shows the conflicts reconciliation found between documents, with
   both values, their sources, and the question a lender would ask.
4. **Credit Memo** is generated from the deal record, with citations that open
   the underlying document.
5. **Lender Matches** shows each institution's fit with per-criterion reasoning.
6. **Distribute** names every recipient before anything is sent.
7. Sign in as the **lender** to see the same deal from the other side, then
   submit an indication and watch it appear in the borrower's comparison.

---

## What it does

The workflow it automates is the one a healthcare financing broker performs
manually:

```
INTAKE → DOCUMENTS → EXTRACTION → RECONCILIATION → UNDERWRITING
      → CREDIT MEMO → MATCHING → DISTRIBUTION → INDICATIONS
      → COMPARISON → DILIGENCE
```

**Document pipeline.** Upload PDF, Excel, CSV, Word or images. Files are scanned
for malware, parsed (with OCR routing for documents that have no text layer),
and figures are extracted with a confidence score, a page reference and the
source text they came from.

**Reconciliation.** Every source is compared against every other — operating
statements against tax returns, census against stated occupancy, the debt
schedule against the balance sheet, the appraisal against the contract price.
Conflicts become work items with both values, their provenance, why it matters,
and the question to ask.

**Underwriting.** LTV, loan-to-cost, underwritten NOI, annual debt service,
DSCR, debt yield, margins, growth, sources and uses, equity requirement and
balloon balance — all computed in tested application code, with the formula and
inputs recorded against every published figure.

**Matching.** Each verified lender publishes a lending box. Deals are scored
against it deterministically, factor by factor, with hard boundaries separated
from soft preferences.

**Offer comparison.** Indications arrive in one format and are compared on
fee-loaded effective cost, solved from the actual cash flows, ranked against the
priority the borrower selected.

### Three rules the product is built around

1. **Never invent a financial number.** If a figure is not in the documents, the
   platform reports nothing. Every calculation returns `null` rather than a
   guess when an input is missing.
2. **Never resolve a conflict silently.** Where two sources disagree, both are
   shown with their provenance and the conflict is raised. Extraction proposes;
   a person approves; an approved figure is never overwritten automatically.
3. **Never make a credit decision.** The platform produces analysis, a
   transparent score, and a match against published criteria. It never states or
   implies that any lender will approve any loan.

---

## Architecture

```
app/          Next.js App Router — marketing, auth, borrower, lender, admin
components/   UI primitives, charts (hand-drawn SVG), application shell
lib/          Pure domain logic — finance, matching, underwriting, AI, policy
services/     Orchestration — the only layer that reads and writes the database
db/           Data-access abstraction with local and Supabase drivers
jobs/         Background job handlers
types/        Domain model, mirroring the SQL schema
supabase/     PostgreSQL schema and row level security policies
tests/        Unit, policy and end-to-end acceptance tests
scripts/      Seeding and smoke checks
```

Business logic does not live in React components. A page loads data through a
service, and services call pure functions in `lib/`.

### The layers that matter

**`lib/finance/calculations.ts`** — every ratio in the product. Pure, total,
tested. Nothing here calls a model; language models never do arithmetic.

**`lib/policy.ts`** — the single authority on who may see and do what. Pure over
its inputs, so it is directly testable, and mirrored one-for-one by the SQL
policies in `supabase/migrations/0002_rls.sql`.

**`db/`** — one query language with two drivers. The default writes to a
JSON-backed local store; the Supabase driver maps the same operations onto
PostgREST. Every operator in the query language has a direct PostgREST
equivalent, which is what keeps the two honest.

**`lib/ai/`** — every AI-assisted operation supplies both a model prompt *and* a
deterministic local implementation. With no provider configured the local one
runs and the product is fully functional; with a provider configured the model
output is validated against the same schema, and a validation failure falls back
to the local result rather than writing unvalidated output onto a deal.

### Service interfaces you can swap

Each has a working development implementation and a clean seam for a real
provider:

| Interface | Location | Development implementation |
| --- | --- | --- |
| `AiProvider` | `lib/ai/provider.ts` | Deterministic local analyst |
| `StorageDriver` | `services/storage.ts` | Local filesystem, outside the served tree |
| `MalwareScanner` | `services/malware.ts` | Signature and magic-byte heuristics |
| `OcrService` | `services/ocr.ts` | Unavailable — reports `needs_ocr` honestly |
| `EmailTransport` | `services/notifications.ts` | Logs to the server console |
| `BillingProvider` | `services/billing.ts` | Records locally, charges nothing |
| `Store` | `db/store.ts` | File-backed local store |

---

## Environment variables

Every variable is optional. Copy `.env.example` to `.env.local` and set only
what you need.

| Variable | Purpose |
| --- | --- |
| `DATA_DRIVER` | `local` (default) or `supabase` |
| `AUTH_SECRET` | Signs session cookies and document tokens. **Required in production.** Generate with `openssl rand -hex 32` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |
| `SUPABASE_STORAGE_BUCKET` | Defaults to `deal-documents` |
| `AI_PROVIDER` | `mock` (default) or `openai` |
| `OPENAI_API_KEY` | Required when `AI_PROVIDER=openai` |
| `OPENAI_BASE_URL` | For an OpenAI-compatible endpoint |
| `AI_MODEL_EXTRACTION` etc. | Per-task model overrides — see `lib/ai/routing.ts` |
| `AI_MONTHLY_BUDGET_USD` | Spend ceiling shown in the admin console |
| `BILLING_PROVIDER`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Billing |
| `EMAIL_PROVIDER`, `EMAIL_FROM` | Notification email |
| `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY` | Observability |
| `SEED_DEMO_DATA` | `false` disables demo seeding and the demo sign-in |

Never commit secrets. `.env.local` is gitignored.

---

## Supabase setup

Only needed when you want real PostgreSQL, Supabase Auth and Supabase Storage.
See [`supabase/README.md`](supabase/README.md) for the full walkthrough.

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Then in `.env.local`:

```
DATA_DRIVER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
AUTH_SECRET=<openssl rand -hex 32>
```

---

## Database migrations

| File | Contents |
| --- | --- |
| `supabase/migrations/0001_init.sql` | Schema: 42 tables, enumerated types, constraints, indexes, `updated_at` triggers |
| `supabase/migrations/0002_rls.sql` | Row level security on every table, plus the private storage bucket |

Apply in order:

```bash
npx supabase db push          # against a linked project
npx supabase db reset         # against a local stack
```

Financial data is normalised — `financial_line_items` is one row per period and
line item, so a figure can be indexed, approved individually and traced to its
source document. JSONB is used only where the shape is genuinely open: AI
output, match factor explanations and audit metadata. Money is `numeric(16,2)`
throughout; there is no floating point anywhere a dollar is stored.

---

## Seed data

Seeding runs automatically on first boot with the local driver. To reset:

```bash
npm run seed
```

It creates one platform administrator, three borrower organisations with ten
skilled nursing deals, five lending institutions with lending boxes, and the
matches, distributions, indications and Q&A threads between them.

**The seed runs the real product code.** Documents are generated as genuine
CSV and text files, written through the storage driver, and processed by the
same extraction pipeline that handles a real upload. Discrepancies come from the
real reconciliation detectors, scores from the real underwriting engine, and
matches from the real matching engine. If a figure looks wrong in the demo, the
engine that produced it is wrong.

The deals deliberately span every state worth demonstrating: one draft, two
needing attention (a document conflict and an appraisal below contract), three
ready to distribute, and four with live indications.

> After running `npm run seed` while `npm run dev` is running, restart the dev
> server. The local driver caches the database in memory, so a running server
> will not see a database rewritten underneath it.

---

## AI provider setup

The product is fully functional with no AI provider. To connect one:

```
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

Models are routed per task in `lib/ai/routing.ts` — extraction, classification
and chat on a cheap model; reconciliation, reasoning and memo generation on a
stronger one. Override any of them with `AI_MODEL_*`.

Three properties hold whichever provider is configured:

- **Output is schema-validated.** Every response is parsed against a Zod schema
  before it reaches the database. A response that fails validation falls back to
  the deterministic implementation and the run records why.
- **Documents are untrusted data.** Uploaded content is fenced inside a
  unique per-call delimiter that the document cannot predict, the system prompt
  states that instructions found inside the fence must be reported rather than
  followed, and instruction-like content is detected and surfaced to
  administrators. No schema contains a field that could carry an action.
- **Models never do arithmetic.** Computed metrics are supplied as authoritative
  context; the model reads, compares, classifies and questions.

Cost control: analysis runs are fingerprinted on their material inputs, so
re-analysing an unchanged deal reuses the previous run. Usage and spend are
tracked per task and per provider in the admin console.

---

## Local development

```bash
npm run dev        # development server
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run test       # vitest
npm run verify     # typecheck + lint + test
npm run seed       # reset and reseed the local store
```

The local store lives in `.data/` (gitignored): `store.json` for records and
`uploads/` for document bytes. Delete the directory to start clean.

---

## Testing

```bash
npm run test
```

| Suite | Covers |
| --- | --- |
| `tests/finance.test.ts` | Every ratio and cash-flow calculation, including the IRR solver and null handling |
| `tests/policy.test.ts` | Authorization: deal visibility, anonymisation, document access, lender privacy, indication confidentiality |
| `tests/matching.test.ts` | Match scoring, hard fails, unknown-metric handling, marketplace relevance ranking |
| `tests/documents.test.ts` | CSV/XLSX/DOCX/PDF parsing, number and period recognition, extraction, unit normalisation |
| `tests/underwriting.test.ts` | Deal scoring, readiness gating, reconciliation detectors, credit analysis |
| `tests/acceptance.test.ts` | The complete borrower-to-lender workflow, end to end, unmocked |

The acceptance test is the important one. It walks the full lifecycle — signup,
deal creation, document upload, extraction, reconciliation, discrepancy
resolution, approval, underwriting, memo generation, readiness, distribution,
lender review, document download, indication submission, comparison, selection
and the audit trail — against a real store with real files on disk. It also
asserts the confidentiality properties: one lender never sees another's
indication, internal lender notes stay inside the institution, an unrelated
borrower is denied, and revoking a distribution immediately closes document
access and logs the denial.

There is also a route-level smoke check that walks every page as each role:

```bash
npm run dev
npx tsx scripts/smoke.mts
```

---

## Production deployment

Designed for Vercel plus Supabase.

1. Apply both migrations to your Supabase project.
2. Set `DATA_DRIVER=supabase`, the three Supabase keys, and `AUTH_SECRET`.
3. Set `SEED_DEMO_DATA=false`.
4. Configure `AI_PROVIDER` and `OPENAI_API_KEY` if you want model-backed analysis.
5. Deploy.

```bash
npm run verify && npm run build
```

**Do not run the local driver in production.** It stores everything in a file on
the instance's disk, which is neither durable nor shared across instances. The
driver refuses to start without `AUTH_SECRET` when `NODE_ENV=production`.

---

## Security

**Authentication.** Sessions are HMAC-signed, expiring cookies —
`httpOnly`, `sameSite=lax`, `secure` in production. Passwords are hashed with
scrypt and a per-password salt, and verified in constant time. Sign-in reports
the same message whether or not the account exists.

**Authorization.** `lib/policy.ts` denies by default and is the single authority
for server-rendered requests. `supabase/migrations/0002_rls.sql` mirrors it for
any client that reaches PostgREST directly. Every deal-scoped page passes
through `lib/deal-access.ts`, so the check cannot be forgotten in a new route.

**Documents.** No document is ever served from a public URL. Every read goes
through `/api/documents/[documentId]/download`, which authorizes, writes an
access-log entry (including denials, with user, organisation, time and address)
and only then returns bytes. Responses are `no-store`. The Supabase bucket is
private and no public policy is created. Documents marked *deal team* never
leave the borrower's organisation; documents marked *restricted* are never
released to a lender under any circumstance.

**Confidentiality.** Deals are private until distributed. On the marketplace an
anonymised deal appears as, for example, "120-bed Skilled Nursing Facility —
Illinois"; identity and the data room are released only to lenders the borrower
distributes to. A lender never sees a competitor's indication or identity.
Internal lender notes are visible only inside the authoring institution —
explicitly including exclusion of platform administrators. Borrower and lender
contact details are not exchanged; the platform carries the conversation.

**Prompt injection.** Uploaded documents are treated as adversarial input. See
[AI provider setup](#ai-provider-setup) for the three defences.

**Uploads.** Scanned before processing; executables, macro-enabled Office
documents and the EICAR signature are quarantined rather than parsed. Storage
keys are sanitised and path-traversal is rejected. Uploads are capped at 25MB.

**Audit.** `audit_logs`, `document_access_logs` and `ai_usage_events` are
append-only — the store layer refuses updates and deletes, and the SQL policies
create no UPDATE or DELETE policy for any role.

**Headers.** `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy` and a restrictive `Permissions-Policy` are set globally.

---

## Known limitations

Stated plainly, because a platform that overstates what it does is worse than
one that does less.

- **OCR is not implemented.** A scanned document with no text layer is reported
  as `needs_ocr` rather than being silently treated as empty. `services/ocr.ts`
  is the seam for a real engine.
- **Multi-factor authentication is modelled, not enforced.** Users carry
  `mfa_enabled` and `mfa_required`, lenders and administrators are marked as
  requiring it, and the settings page says plainly that no authenticator is
  wired up.
- **PDF export is the browser's.** The credit memo has a dedicated print view
  and `Print / PDF` opens the browser's own dialog. This produces a correct,
  selectable, accessible PDF without shipping a headless browser.
- **PDF text extraction handles machine-generated PDFs.** It walks content
  streams for text operators; complex layouts and scans route to OCR.
- **The malware scanner is heuristic.** It catches the EICAR signature,
  executable magic bytes, macro-enabled Office documents and dangerous
  extensions. It is not a substitute for a real scanner in production.
- **Background jobs run in-process.** Fine for a single instance; a multi-region
  deployment wants a real queue. The `jobs` table already records status,
  attempts, last error and duration, and is retryable from the admin console.
- **The local driver is single-instance and non-durable.** It exists so the
  product runs with no configuration. Use Supabase for anything real.
- **In-app "not found" pages return HTTP 200.** Next.js reports a `notFound()`
  raised inside a matched route as a successful response. The content and the
  access control are correct — nothing about an inaccessible deal is disclosed —
  but the status code is 200 rather than 404 on those routes.
- **Email is logged, not sent.** `EmailTransport` is the seam.
- **Billing records, it does not charge.** Plans and fee rules are configuration;
  connecting Stripe does not change any other part of the product.
- **Benchmarks need volume.** A cohort is suppressed below three transactions so
  no individual deal can be inferred, which means most cohorts are empty in the
  demonstration environment.
- **No PHI.** The product deliberately handles no protected health information.
  Census and payer mix are aggregate figures only.

---

## Future integrations

The architecture anticipates these; none of them are built.

**Market intelligence** — CMS quality and inspection data, Medicare and Medicaid
rate data, property records, market demographics and benchmark financing rates,
as external data connectors that enrich a deal rather than block it.

**CRM** — Salesforce, HubSpot and Dynamics, plus email and calendar, so a
lender's pipeline can live where their team already works.

**Lender API** — `POST /deals`, `GET /matches`, `GET /deals`, `POST /indications`,
`PATCH /indications`, `GET /documents`, `POST /questions`, so a bank can wire the
marketplace into its own loan origination system.

**Borrower API** — ERP and accounting connections so trailing financials update
themselves, and property management systems for census.

**Benchmarking at scale** — the schema already supports anonymous benchmarks by
state, facility size, transaction type, loan size, payer mix and operator size.
This is the asset that compounds: more transactions produce better matching and
better underwriting, which attracts more lenders, which produces better outcomes
for borrowers, which brings more transactions.

---

## Legal

CareCapital Exchange facilitates connections between healthcare operators
seeking financing and lenders. It does not originate, approve, underwrite for
its own account, guarantee or commit to any loan, and nothing in the product is
an offer of credit. Financing indications submitted through the platform are
indications of interest, not commitments to lend. Nothing here is legal, tax,
accounting or investment advice. All figures, companies, facilities and
institutions in the demonstration environment are fictional.
