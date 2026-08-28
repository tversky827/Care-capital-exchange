-- ---------------------------------------------------------------------------
-- Row level security for accounts, cash and orders
--
-- The rule for every table here is the same and is worth stating once: an
-- investor sees their own organisation's rows and nothing else. Not a
-- sponsor's, not another investor's, and not an aggregate that could be
-- differenced to reveal one.
--
-- Cash is the most sensitive data on the platform. A sponsor learning what an
-- investor holds in cash would know exactly how hard to push them, which is
-- why a sponsor has no read policy on any of these tables at all — not even
-- for the accounts that have invested in their own raise.
-- ---------------------------------------------------------------------------

alter table investor_accounts enable row level security;
alter table cash_accounts enable row level security;
alter table cash_ledger_entries enable row level security;
alter table cash_transfers enable row level security;
alter table funding_sources enable row level security;
alter table investment_orders enable row level security;
alter table provider_accounts enable row level security;
alter table provider_transactions enable row level security;

-- Every account this session's user belongs to. One statement, so the policies
-- below cannot drift from each other.
--
-- Returns `setof uuid` and is used as `in (select ...)`, matching
-- `ccx_company_ids` in migration 0002. Postgres refuses a set-returning
-- function inside `any()`, so the two shapes are not interchangeable — a
-- policy written the other way does not fail at review, it fails at deploy.
create or replace function ccx_account_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from investor_accounts where company_id in (select ccx_company_ids());
$$;

-- --- the account -----------------------------------------------------------

create policy investor_accounts_read on investor_accounts
  for select using (company_id in (select ccx_company_ids()) or ccx_is_admin());

-- An investor may open their own account and edit its descriptive fields. The
-- check statuses and the account status are decided by providers and
-- administrators, never by the account holder — enforced by the trigger below
-- rather than by the policy, because a policy cannot see which column changed.
create policy investor_accounts_write on investor_accounts
  for insert with check (company_id in (select ccx_company_ids()));
create policy investor_accounts_update on investor_accounts
  for update using (company_id in (select ccx_company_ids()) or ccx_is_admin())
  with check (company_id in (select ccx_company_ids()) or ccx_is_admin());
create policy investor_accounts_admin on investor_accounts
  for all using (ccx_is_admin()) with check (ccx_is_admin());

-- The account holder cannot mark their own checks passed or their own account
-- active. That decision belongs to a provider's answer, recorded by the
-- service; letting the holder write it would make the whole eligibility gate
-- decorative.
create or replace function ccx_account_status_is_privileged()
returns trigger language plpgsql as $$
begin
  if ccx_is_admin() then return new; end if;
  if new.status is distinct from old.status
     or new.identity_status is distinct from old.identity_status
     or new.kyc_status is distinct from old.kyc_status
     or new.aml_status is distinct from old.aml_status
     or new.accreditation_status is distinct from old.accreditation_status
     or new.activated_at is distinct from old.activated_at then
    raise exception 'Account status and verification checks cannot be set by the account holder.';
  end if;
  return new;
end $$;

create trigger investor_accounts_status_privileged
  before update on investor_accounts
  for each row execute function ccx_account_status_is_privileged();

create policy cash_accounts_read on cash_accounts
  for select using (account_id in (select ccx_account_ids()) or ccx_is_admin());
create policy cash_accounts_admin on cash_accounts
  for all using (ccx_is_admin()) with check (ccx_is_admin());

-- --- the ledger ------------------------------------------------------------

-- Read your own history. There is no policy that lets anyone else read it,
-- including the sponsors an investor has put money into.
create policy cash_ledger_entries_read on cash_ledger_entries
  for select using (account_id in (select ccx_account_ids()) or ccx_is_admin());

-- Deliberately no insert or update policy for an account holder.
--
-- Every entry is written by the service through the privileged role, after the
-- balance check and inside the account lock. An investor able to insert here
-- could credit themselves a million dollars, and no amount of care in the
-- application would matter.
create policy cash_ledger_entries_admin on cash_ledger_entries
  for all using (ccx_is_admin()) with check (ccx_is_admin());

-- --- transfers and sources -------------------------------------------------

create policy cash_transfers_read on cash_transfers
  for select using (account_id in (select ccx_account_ids()) or ccx_is_admin());
create policy cash_transfers_admin on cash_transfers
  for all using (ccx_is_admin()) with check (ccx_is_admin());

create policy funding_sources_own on funding_sources
  for all using (account_id in (select ccx_account_ids()) or ccx_is_admin())
  with check (account_id in (select ccx_account_ids()) or ccx_is_admin());

-- --- orders ----------------------------------------------------------------

-- An investor sees their own orders. A sponsor does not: what an investor
-- tried to do, at what size, and whether it was rejected is information about
-- the investor, not about the raise. The sponsor sees settled commitments,
-- which is what the existing `investment_commitments` policies already give
-- them.
create policy investment_orders_read on investment_orders
  for select using (account_id in (select ccx_account_ids()) or ccx_is_admin());

-- Orders are written by the service. An investor who could insert one directly
-- would be able to set its status to settled and skip the cash entirely.
create policy investment_orders_admin on investment_orders
  for all using (ccx_is_admin()) with check (ccx_is_admin());

-- --- providers -------------------------------------------------------------

-- Provider records are operational plumbing. An investor can see that a
-- movement of their own money exists; nobody else can see anything.
create policy provider_accounts_read on provider_accounts
  for select using (account_id in (select ccx_account_ids()) or ccx_is_admin());
create policy provider_accounts_admin on provider_accounts
  for all using (ccx_is_admin()) with check (ccx_is_admin());

create policy provider_transactions_read on provider_transactions
  for select using (account_id in (select ccx_account_ids()) or ccx_is_admin());
create policy provider_transactions_admin on provider_transactions
  for all using (ccx_is_admin()) with check (ccx_is_admin());
