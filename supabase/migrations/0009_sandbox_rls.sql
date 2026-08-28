-- ---------------------------------------------------------------------------
-- 0009 — row level security for the sandbox
--
-- A sandbox account belongs to one person. Nobody else reads it — not another
-- investor, not the sponsor of an offering it holds a hypothetical stake in,
-- and not an administrator through PostgREST. A practice portfolio is a record
-- of what somebody was considering, which is at least as private as what they
-- actually did.
--
-- The sponsor exclusion is the one worth stating plainly: if a sponsor could
-- see practice positions in their own offering, the practice environment would
-- become a channel for signalling interest, and the whole guarantee that
-- nothing here creates an obligation would start to erode in practice even
-- while remaining true in the database.
-- ---------------------------------------------------------------------------

alter table practice_accounts enable row level security;
alter table practice_ledger_entries enable row level security;
alter table practice_positions enable row level security;
alter table practice_activity enable row level security;
alter table practice_watchlist enable row level security;
alter table practice_scenarios enable row level security;
alter table practice_resets enable row level security;

-- The accounts this session holds. A set-returning function, so every use is
-- `in (select ...)` — `= any(...)` does not accept one.
create or replace function ccx_practice_account_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from practice_accounts where user_id = auth.uid();
$$;

-- --- accounts ---------------------------------------------------------------

create policy practice_accounts_own_read on practice_accounts
  for select using (user_id = auth.uid());

-- A holder may open their own account and close it. They may not set its
-- reference or its reset count to anything they like after the fact, but those
-- are cosmetic; what matters is that no policy lets them reach another
-- person's row.
create policy practice_accounts_own_insert on practice_accounts
  for insert with check (user_id = auth.uid());

create policy practice_accounts_own_update on practice_accounts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- --- the ledger -------------------------------------------------------------
--
-- Read only, for the holder. There is deliberately no insert policy: a balance
-- is the sum of these entries, so a client that could write one could write
-- itself any balance it liked. Entries are written by the service layer with
-- the service role, after it has checked the account and the amount — the same
-- rule the production ledger follows, for the same reason.

create policy practice_ledger_own_read on practice_ledger_entries
  for select using (account_id in (select ccx_practice_account_ids()));

-- --- positions --------------------------------------------------------------
--
-- Also read-only to the holder. A position is created by settling an
-- investment, and that is arithmetic against a balance rather than a fact the
-- client gets to assert.

create policy practice_positions_own_read on practice_positions
  for select using (account_id in (select ccx_practice_account_ids()));

-- --- history ----------------------------------------------------------------

create policy practice_activity_own_read on practice_activity
  for select using (account_id in (select ccx_practice_account_ids()));

create policy practice_resets_own_read on practice_resets
  for select using (account_id in (select ccx_practice_account_ids()));

create policy practice_scenarios_own_read on practice_scenarios
  for select using (account_id in (select ccx_practice_account_ids()));

-- A scenario is the holder's own working. Nothing is derived from it, so they
-- may write and delete their own.
create policy practice_scenarios_own_write on practice_scenarios
  for insert with check (account_id in (select ccx_practice_account_ids()));

create policy practice_scenarios_own_delete on practice_scenarios
  for delete using (account_id in (select ccx_practice_account_ids()));

-- --- watchlist --------------------------------------------------------------
--
-- The one thing a holder may freely write: it holds no money and derives
-- nothing. It is still theirs alone to read.

create policy practice_watchlist_own_read on practice_watchlist
  for select using (account_id in (select ccx_practice_account_ids()));

create policy practice_watchlist_own_insert on practice_watchlist
  for insert with check (account_id in (select ccx_practice_account_ids()));

create policy practice_watchlist_own_delete on practice_watchlist
  for delete using (account_id in (select ccx_practice_account_ids()));
