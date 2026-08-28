-- ---------------------------------------------------------------------------
-- Investor accounts, cash and orders
--
-- The investor holds an account with a balance and deploys it into offerings,
-- rather than arranging a separate transfer for every one. That difference is
-- the product, and these tables are what make it true.
--
-- Money is stored as `bigint` cents, never `float`. A float cannot represent
-- $0.10 exactly, and a ledger that adds a thousand of them does not reconcile.
-- `numeric` would also be exact; integer cents are chosen because they cannot
-- be accidentally divided into a fraction of a cent by any client.
-- ---------------------------------------------------------------------------

create type account_type as enum (
  'individual', 'llc', 'trust', 'family_office', 'institution', 'other'
);
-- Named `investor_account_status` rather than `account_status`, which migration
-- 0001 already uses for a user's account being active or suspended. Two enums
-- with one name is a collision; two enums with similar names that mean
-- different things is a trap, so this one says whose status it is.
create type investor_account_status as enum (
  'pending', 'active', 'action_required', 'suspended', 'closed'
);
create type check_status as enum ('not_started', 'pending', 'passed', 'failed', 'expired');
create type ledger_entry_type as enum (
  'deposit', 'withdrawal', 'investment_debit', 'investment_refund',
  'distribution_credit', 'fee', 'adjustment', 'transfer_in', 'transfer_out'
);
create type ledger_entry_status as enum ('pending', 'posted', 'failed', 'cancelled', 'reversed');
create type transfer_status as enum (
  'requested', 'pending', 'approved', 'processing', 'completed', 'failed', 'cancelled'
);
create type funding_method as enum ('ach', 'wire', 'check', 'demo');
create type order_status as enum (
  'draft', 'eligibility_check', 'pending_confirmation', 'submitted', 'accepted',
  'rejected', 'settling', 'settled', 'cancelled', 'failed'
);

-- --- the account -----------------------------------------------------------

create table investor_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  investor_id uuid references investor_profiles(id) on delete set null,
  account_type account_type not null,
  legal_name text not null,
  reference text not null unique,
  status investor_account_status not null default 'pending',
  -- Held separately rather than as one "verified" flag. An investor blocked at
  -- accreditation and one blocked at identity need different answers, and a
  -- boolean cannot say which they are.
  identity_status check_status not null default 'not_started',
  kyc_status check_status not null default 'not_started',
  aml_status check_status not null default 'not_started',
  accreditation_status check_status not null default 'not_started',
  tax_status check_status not null default 'not_started',
  activated_at timestamptz,
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One account per organisation. Two would mean two balances and no answer to
-- which one an order should spend.
create unique index investor_accounts_company_idx on investor_accounts(company_id);

create table cash_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references investor_accounts(id) on delete cascade,
  currency text not null default 'USD',
  provider text,
  provider_account_ref text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index cash_accounts_account_idx on cash_accounts(account_id);

-- --- the ledger ------------------------------------------------------------

create table cash_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  cash_account_id uuid not null references cash_accounts(id) on delete restrict,
  account_id uuid not null references investor_accounts(id) on delete restrict,
  type ledger_entry_type not null,
  -- Signed: positive credits the investor, negative debits them. The sign lives
  -- on the amount rather than being implied by the type, so summing the column
  -- gives the right answer without knowing a per-type rule.
  amount_cents bigint not null,
  currency text not null default 'USD',
  status ledger_entry_status not null default 'posted',
  description text not null,
  reference_type text,
  reference_id uuid,
  idempotency_key text not null,
  reverses_entry_id uuid references cash_ledger_entries(id),
  provider_transaction_id uuid,
  effective_at timestamptz not null default now(),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  -- An entry that moves nothing is not an event.
  constraint cash_ledger_entries_non_zero check (amount_cents <> 0)
);

-- The durable guarantee against double-spending. Two concurrent requests to
-- spend the same money either carry the same key — in which case the second is
-- rejected here, whatever process it arrived on — or different keys, in which
-- case the balance check below refuses it.
create unique index cash_ledger_entries_idempotency
  on cash_ledger_entries(account_id, idempotency_key);
create index cash_ledger_entries_account_idx on cash_ledger_entries(account_id, effective_at desc);
create index cash_ledger_entries_reference_idx on cash_ledger_entries(reference_type, reference_id);

-- ---------------------------------------------------------------------------
-- Immutability
--
-- An entry's amount, type, account and key never change. A mistake is
-- corrected by posting a reversing entry, so the statement reads "this
-- happened and then it was undone" — which is the truth, where a silently
-- edited row is not.
--
-- `status` and `posted_at` are the exception: a deposit is recorded when it is
-- instructed and posts when it clears, which is one event arriving in two
-- parts rather than a rewrite. The trigger allows those two columns and
-- nothing else, so the rule holds even against something writing SQL directly.
-- ---------------------------------------------------------------------------
create or replace function ccx_ledger_entry_immutable()
returns trigger language plpgsql as $$
begin
  if new.id is distinct from old.id
     or new.cash_account_id is distinct from old.cash_account_id
     or new.account_id is distinct from old.account_id
     or new.type is distinct from old.type
     or new.amount_cents is distinct from old.amount_cents
     or new.currency is distinct from old.currency
     or new.description is distinct from old.description
     or new.reference_type is distinct from old.reference_type
     or new.reference_id is distinct from old.reference_id
     or new.idempotency_key is distinct from old.idempotency_key
     or new.reverses_entry_id is distinct from old.reverses_entry_id
     or new.effective_at is distinct from old.effective_at
     or new.created_at is distinct from old.created_at then
    raise exception 'A ledger entry is immutable. Post a reversing entry instead.';
  end if;
  return new;
end $$;

create trigger cash_ledger_entries_immutable
  before update on cash_ledger_entries
  for each row execute function ccx_ledger_entry_immutable();

-- Deleting an entry would make the balance unreconcilable and the history a
-- lie. There is no circumstance in which it is the right thing to do.
create or replace function ccx_ledger_entry_no_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'A ledger entry cannot be deleted. Post a reversing entry instead.';
end $$;

create trigger cash_ledger_entries_no_delete
  before delete on cash_ledger_entries
  for each row execute function ccx_ledger_entry_no_delete();

-- ---------------------------------------------------------------------------
-- The balance, and the lock that makes spending it safe
--
-- The application derives balances in TypeScript for display. This function is
-- the authority for anything that must not race: it takes a row lock on the
-- account first, so two concurrent orders serialise rather than both reading a
-- balance neither of them has yet spent.
--
-- The in-process lock in `services/accounts/ledger.ts` is not sufficient for a
-- deployment running more than one instance. This is.
-- ---------------------------------------------------------------------------
create or replace function ccx_spendable_cents(target_account uuid)
returns bigint language plpgsql as $$
declare
  settled bigint;
  reserved bigint;
begin
  -- Serialises every caller for this account until the transaction commits.
  perform 1 from investor_accounts where id = target_account for update;

  select coalesce(sum(amount_cents), 0) into settled
    from cash_ledger_entries
   where account_id = target_account and status in ('posted', 'reversed');

  select coalesce(sum(-amount_cents), 0) into reserved
    from cash_ledger_entries
   where account_id = target_account and status = 'pending' and amount_cents < 0;

  return settled - reserved;
end $$;

-- --- transfers and funding sources -----------------------------------------

create table funding_sources (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references investor_accounts(id) on delete cascade,
  method funding_method not null,
  display_name text not null,
  -- The last four digits and nothing more. A full account number stored here
  -- would be a liability with no corresponding use: the provider holds it.
  last4 text,
  provider text,
  provider_source_ref text,
  status text not null default 'pending',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index funding_sources_account_idx on funding_sources(account_id);

create table cash_transfers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references investor_accounts(id) on delete cascade,
  cash_account_id uuid not null references cash_accounts(id) on delete cascade,
  direction text not null check (direction in ('deposit', 'withdrawal')),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD',
  method funding_method not null,
  funding_source_id uuid references funding_sources(id) on delete set null,
  status transfer_status not null default 'requested',
  ledger_entry_id uuid references cash_ledger_entries(id),
  provider text,
  provider_transfer_ref text,
  failure_reason text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cash_transfers_account_idx on cash_transfers(account_id, requested_at desc);

-- --- orders ----------------------------------------------------------------

create table investment_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  account_id uuid not null references investor_accounts(id) on delete restrict,
  cash_account_id uuid not null references cash_accounts(id) on delete restrict,
  investor_id uuid not null references investor_profiles(id) on delete restrict,
  offering_id uuid not null references offerings(id) on delete restrict,
  deal_id uuid not null references deals(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD',
  status order_status not null default 'draft',
  eligibility_verdict text,
  eligibility_detail text,
  acknowledged_disclosures uuid[] not null default '{}',
  ledger_entry_id uuid references cash_ledger_entries(id),
  commitment_id uuid references investment_commitments(id),
  position_id uuid references investment_positions(id),
  idempotency_key text not null,
  provider text,
  provider_order_ref text,
  rejection_reason text,
  failure_reason text,
  submitted_at timestamptz,
  accepted_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- The same instruction never places two orders, whatever process it arrives on.
create unique index investment_orders_idempotency
  on investment_orders(account_id, idempotency_key);
create index investment_orders_account_idx on investment_orders(account_id, created_at desc);
create index investment_orders_offering_idx on investment_orders(offering_id);

-- --- providers -------------------------------------------------------------

create table provider_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references investor_accounts(id) on delete cascade,
  provider text not null,
  provider_kind text not null,
  provider_ref text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index provider_accounts_ref_idx on provider_accounts(provider, provider_ref);

-- Kept separately from the ledger so the platform's record and the provider's
-- can be reconciled against each other rather than assumed equal.
create table provider_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references investor_accounts(id) on delete cascade,
  provider text not null,
  provider_kind text not null,
  provider_ref text not null,
  kind text not null,
  amount_cents bigint,
  status text not null,
  reconciled boolean not null default false,
  reconciled_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index provider_transactions_account_idx on provider_transactions(account_id, created_at desc);
create index provider_transactions_unreconciled_idx
  on provider_transactions(reconciled) where reconciled = false;

create trigger investor_accounts_set_updated_at before update on investor_accounts
  for each row execute function set_updated_at();
create trigger cash_accounts_set_updated_at before update on cash_accounts
  for each row execute function set_updated_at();
create trigger cash_transfers_set_updated_at before update on cash_transfers
  for each row execute function set_updated_at();
create trigger funding_sources_set_updated_at before update on funding_sources
  for each row execute function set_updated_at();
create trigger investment_orders_set_updated_at before update on investment_orders
  for each row execute function set_updated_at();
create trigger provider_accounts_set_updated_at before update on provider_accounts
  for each row execute function set_updated_at();
create trigger provider_transactions_set_updated_at before update on provider_transactions
  for each row execute function set_updated_at();
