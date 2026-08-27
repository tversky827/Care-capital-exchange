-- ---------------------------------------------------------------------------
-- Confidentiality agreements
--
-- An offering's detail is not shown to an outside viewer until their
-- organisation has signed the agreement for that specific offering. The row
-- below is the evidence that they did.
--
-- Per offering rather than per account on purpose: consent to disclose is
-- given by the operator about their own raise, and a person who agreed to keep
-- one facility's figures confidential has agreed nothing about another's.
-- ---------------------------------------------------------------------------

create table nda_acceptances (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references users(id),
  -- Null where the signing organisation has no investor profile, which is the
  -- case for anyone reading before they have completed onboarding.
  investor_id uuid references investor_profiles(id) on delete set null,
  -- The identifier of the exact text signed. Stored rather than referenced so
  -- the record still answers "what did they agree to" after the text changes.
  nda_version text not null,
  signed_name text not null,
  accepted_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- One acceptance per organisation per version of the text. A second signature
-- of the same words adds nothing; a new version is a new row.
create unique index nda_acceptances_unique
  on nda_acceptances(offering_id, company_id, nda_version);
create index nda_acceptances_company_idx on nda_acceptances(company_id);

alter table nda_acceptances enable row level security;

-- A signatory sees their own organisation's signatures. The operator raising
-- the offering sees who has signed for theirs, because knowing who is looking
-- is the other half of what the agreement is for.
create policy nda_acceptances_read on nda_acceptances
  for select using (
    company_id = any (ccx_company_ids())
    or ccx_owns_offering(offering_id)
    or ccx_is_admin()
  );

-- Signing is done for your own organisation and nobody else's.
create policy nda_acceptances_insert on nda_acceptances
  for insert with check (
    company_id = any (ccx_company_ids())
    and user_id = ccx_user_id()
  );

-- Evidence is append-only. There is no update or delete policy, so with row
-- level security on, neither is possible for any non-service role.
