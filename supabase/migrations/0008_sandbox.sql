-- ---------------------------------------------------------------------------
-- 0008 — the sandbox
--
-- Virtual money, in its own tables.
--
-- The isolation this file is for is a WRITE isolation, and it is structural
-- rather than conditional. There is no `environment` column on the production
-- ledger that a forgotten `where` clause could bypass, because the sandbox has
-- no row in the production ledger at all. A sandbox write lands here or it
-- fails; there is nowhere else for it to go.
--
-- What the sandbox may reference is an offering, and only to read it. There is
-- deliberately no foreign key from any table here to `investment_orders`,
-- `cash_ledger_entries`, `investor_accounts` or `investment_positions`: a
-- practice position is not a smaller version of a real one and must never be
-- mistakable for one, in a query or in a migration written later.
-- ---------------------------------------------------------------------------

create type practice_environment as enum ('practice', 'demo');
create type practice_account_status as enum ('active', 'closed');
create type practice_entry_type as enum (
  'opening_balance', 'deposit', 'withdrawal', 'investment_debit',
  'investment_refund', 'distribution_credit', 'exit_proceeds', 'adjustment'
);
create type practice_position_status as enum ('active', 'exited');
create type practice_activity_kind as enum (
  'account_opened', 'cash_added', 'cash_withdrawn', 'invested', 'distribution',
  'exited', 'watchlist_added', 'watchlist_removed', 'scenario_run', 'reset'
);

-- --- accounts --------------------------------------------------------------

create table practice_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  environment practice_environment not null,
  reference text not null unique,
  status practice_account_status not null default 'active',
  opened_at timestamptz not null default now(),
  reset_count integer not null default 0 check (reset_count >= 0),
  last_reset_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open account per person per sandbox. Two would each show a balance and
-- neither would be wrong, which is the worst kind of wrong.
create unique index practice_accounts_one_active
  on practice_accounts (user_id, environment)
  where status = 'active';

create index practice_accounts_company on practice_accounts (company_id);

-- --- the ledger ------------------------------------------------------------

create table practice_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references practice_accounts(id) on delete cascade,
  environment practice_environment not null,
  type practice_entry_type not null,
  -- Signed, and never zero: an entry that moves nothing is a bug that would
  -- otherwise sit in the history looking like a decision.
  amount_cents bigint not null check (amount_cents <> 0),
  description text not null,
  idempotency_key text not null,
  reference_type text check (reference_type in ('offering', 'position', 'reset')),
  reference_id uuid,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- The same key twice is the same entry. This is what makes a double-clicked
-- button place one investment rather than two.
create unique index practice_ledger_idempotency
  on practice_ledger_entries (account_id, idempotency_key);

create index practice_ledger_account on practice_ledger_entries (account_id, effective_at desc);

-- --- positions -------------------------------------------------------------

create table practice_positions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references practice_accounts(id) on delete cascade,
  environment practice_environment not null,
  -- References an offering to read it. Nothing here ever writes one.
  offering_id uuid not null references offerings(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  invested_cents bigint not null check (invested_cents > 0),
  distributions_cents bigint not null default 0 check (distributions_cents >= 0),
  exit_proceeds_cents bigint not null default 0 check (exit_proceeds_cents >= 0),
  status practice_position_status not null default 'active',
  acquired_at timestamptz not null default now(),
  exited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index practice_positions_account on practice_positions (account_id, status);
create index practice_positions_offering on practice_positions (offering_id);

-- --- history ---------------------------------------------------------------

create table practice_activity (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references practice_accounts(id) on delete cascade,
  environment practice_environment not null,
  kind practice_activity_kind not null,
  summary text not null,
  offering_id uuid references offerings(id) on delete set null,
  amount_cents bigint,
  created_at timestamptz not null default now()
);

create index practice_activity_account on practice_activity (account_id, created_at desc);

create table practice_watchlist (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references practice_accounts(id) on delete cascade,
  offering_id uuid not null references offerings(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  unique (account_id, offering_id)
);

create table practice_scenarios (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references practice_accounts(id) on delete cascade,
  offering_id uuid not null references offerings(id) on delete cascade,
  label text not null,
  inputs jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index practice_scenarios_account on practice_scenarios (account_id, created_at desc);

create table practice_resets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references practice_accounts(id) on delete cascade,
  cash_before_cents bigint not null,
  invested_before_cents bigint not null,
  positions_cleared integer not null,
  created_at timestamptz not null default now()
);

-- --- the ledger is append-only ---------------------------------------------
--
-- Stronger than the production ledger's rule, which permits a status to
-- advance. A sandbox entry has no status: it is posted when it is written, so
-- there is nothing legitimate to update and the trigger refuses everything.

create or replace function ccx_practice_entry_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'practice ledger entries are immutable; post a reversing entry instead';
end;
$$;

create trigger practice_ledger_entries_immutable
  before update or delete on practice_ledger_entries
  for each row execute function ccx_practice_entry_immutable();

create or replace function ccx_practice_activity_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'practice activity is a record of what happened and cannot be changed';
end;
$$;

create trigger practice_activity_immutable
  before update or delete on practice_activity
  for each row execute function ccx_practice_activity_immutable();

-- --- an entry may not disagree with its account -----------------------------
--
-- The environment is denormalised onto every child row so a query never has to
-- join to know which sandbox it is reading. Denormalised and unchecked, it
-- would be a lie waiting to happen.

create or replace function ccx_practice_environment_matches()
returns trigger language plpgsql as $$
declare
  account_environment practice_environment;
begin
  select environment into account_environment
    from practice_accounts where id = new.account_id;
  if account_environment is null then
    raise exception 'practice row references an account that does not exist';
  end if;
  if new.environment <> account_environment then
    raise exception 'a % row cannot belong to a % account', new.environment, account_environment;
  end if;
  return new;
end;
$$;

create trigger practice_ledger_environment
  before insert on practice_ledger_entries
  for each row execute function ccx_practice_environment_matches();

create trigger practice_positions_environment
  before insert or update on practice_positions
  for each row execute function ccx_practice_environment_matches();

create trigger practice_activity_environment
  before insert on practice_activity
  for each row execute function ccx_practice_environment_matches();

-- --- balances ---------------------------------------------------------------
--
-- Derived, never stored. The same rule as the production ledger and for the
-- same reason: a stored balance is a second source of truth that will one day
-- disagree with the entries and there is no way to tell which is right.

create or replace function ccx_practice_balance_cents(target_account uuid)
returns bigint language sql stable as $$
  select coalesce(sum(amount_cents), 0)::bigint
    from practice_ledger_entries
   where account_id = target_account;
$$;

create trigger practice_accounts_updated_at
  before update on practice_accounts
  for each row execute function set_updated_at();

create trigger practice_positions_updated_at
  before update on practice_positions
  for each row execute function set_updated_at();
