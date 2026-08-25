-- ---------------------------------------------------------------------------
-- CareCapital Exchange — row level security for the equity marketplace
--
-- Mirrors `lib/policy.ts` one-for-one, the same way 0002_rls.sql mirrors the
-- debt rules. The application's service-role client bypasses these policies
-- and is governed by the policy module; these exist so that any client talking
-- to PostgREST with a user token is held to the same rules by the database.
--
-- Two invariants shape everything here:
--   1. An offering is invisible to investors until it has been published.
--   2. An investor's dealings are private from every other investor. Amounts,
--      identities, questions, positions and distributions alike.
-- ---------------------------------------------------------------------------

/* The investing organisation the current user belongs to, if any. */
create or replace function ccx_investor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from investor_profiles p
  join company_members m on m.company_id = p.company_id
  where m.user_id = auth.uid()
  limit 1;
$$;

/* Mirrors `isOfferingPublished`. */
create or replace function ccx_offering_published(target_offering uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from offerings o
    where o.id = target_offering
      and o.status in ('live', 'paused', 'fully_subscribed', 'closed')
  );
$$;

/* Mirrors `ownsOffering`: the sponsor company that raised it. */
create or replace function ccx_owns_offering(target_offering uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from offerings o
    where o.id = target_offering
      and o.company_id in (select ccx_company_ids())
  );
$$;

/* Mirrors `canViewOffering`. */
create or replace function ccx_can_view_offering(target_offering uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when ccx_is_admin() then true
    when ccx_owns_offering(target_offering) then true
    when ccx_investor_id() is not null then ccx_offering_published(target_offering)
    else false
  end;
$$;

/* The stage this investor has reached on an offering, or null. */
create or replace function ccx_investor_stage(target_offering uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select i.stage
  from investment_interests i
  where i.offering_id = target_offering and i.investor_id = ccx_investor_id()
  limit 1;
$$;

/* Mirrors `investorAccessLevel`, as a rank so tiers can be compared. */
create or replace function ccx_access_rank(level text)
returns integer
language sql
immutable
as $$
  select case level
    when 'public_teaser' then 0
    when 'verified_investor' then 1
    when 'interested_investor' then 2
    when 'committed_investor' then 3
    when 'closing_investor' then 4
    when 'admin_only' then 5
    else 5
  end;
$$;

create or replace function ccx_investor_rank(target_offering uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case ccx_investor_stage(target_offering)
    when 'interested' then 1
    when 'eligibility_check' then 1
    when 'reviewing_documents' then 2
    when 'application' then 2
    when 'commitment_pending' then 3
    when 'commitment_submitted' then 3
    when 'investment_pending' then 4
    when 'invested' then 4
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------
-- Enable row level security on every equity table
-- ---------------------------------------------------------------------------

alter table investor_profiles enable row level security;
alter table investor_preferences enable row level security;
alter table investor_verifications enable row level security;
alter table offerings enable row level security;
alter table offering_terms enable row level security;
alter table offering_eligibility enable row level security;
alter table offering_disclosures enable row level security;
alter table offering_documents enable row level security;
alter table offering_versions enable row level security;
alter table disclosure_acknowledgements enable row level security;
alter table investment_interests enable row level security;
alter table investment_commitments enable row level security;
alter table investment_transactions enable row level security;
alter table investment_positions enable row level security;
alter table distribution_events enable row level security;
alter table investment_distributions enable row level security;
alter table waterfall_structures enable row level security;
alter table waterfall_tiers enable row level security;
alter table investor_updates enable row level security;
alter table tax_documents enable row level security;
alter table investor_questions enable row level security;
alter table investor_answers enable row level security;
alter table risk_assessments enable row level security;
alter table investment_scenarios enable row level security;
alter table capital_stacks enable row level security;
alter table capital_sources enable row level security;
alter table investor_matches enable row level security;
alter table saved_investments enable row level security;
alter table compliance_reviews enable row level security;

-- ---------------------------------------------------------------------------
-- Investor records: the investor's own, and the platform's. Never a peer's.
-- ---------------------------------------------------------------------------

create policy investor_profiles_self on investor_profiles
  for select using (id = ccx_investor_id() or ccx_is_admin());
create policy investor_profiles_write on investor_profiles
  for update using (id = ccx_investor_id() or ccx_is_admin())
  with check (id = ccx_investor_id() or ccx_is_admin());

create policy investor_preferences_self on investor_preferences
  for all using (investor_id = ccx_investor_id() or ccx_is_admin())
  with check (investor_id = ccx_investor_id() or ccx_is_admin());

-- A verification verdict is written by the provider adapter, never by the
-- investor: readable by its subject, writable only by an administrator.
create policy investor_verifications_read on investor_verifications
  for select using (investor_id = ccx_investor_id() or ccx_is_admin());
create policy investor_verifications_admin on investor_verifications
  for all using (ccx_is_admin()) with check (ccx_is_admin());

-- ---------------------------------------------------------------------------
-- Offerings and their material
-- ---------------------------------------------------------------------------

create policy offerings_read on offerings
  for select using (ccx_can_view_offering(id));
create policy offerings_sponsor_write on offerings
  for all using (ccx_owns_offering(id) or ccx_is_admin())
  with check (ccx_owns_offering(id) or ccx_is_admin());

create policy offering_terms_read on offering_terms
  for select using (ccx_can_view_offering(offering_id));
create policy offering_terms_write on offering_terms
  for all using (ccx_owns_offering(offering_id) or ccx_is_admin())
  with check (ccx_owns_offering(offering_id) or ccx_is_admin());

create policy offering_eligibility_read on offering_eligibility
  for select using (ccx_can_view_offering(offering_id));
create policy offering_eligibility_write on offering_eligibility
  for all using (ccx_owns_offering(offering_id) or ccx_is_admin())
  with check (ccx_owns_offering(offering_id) or ccx_is_admin());

create policy offering_disclosures_read on offering_disclosures
  for select using (ccx_can_view_offering(offering_id));
create policy offering_disclosures_write on offering_disclosures
  for all using (ccx_owns_offering(offering_id) or ccx_is_admin())
  with check (ccx_owns_offering(offering_id) or ccx_is_admin());

-- Documents are gated by the access tier the investor's engagement has earned.
create policy offering_documents_read on offering_documents
  for select using (
    ccx_is_admin()
    or ccx_owns_offering(offering_id)
    or (
      ccx_investor_id() is not null
      and ccx_offering_published(offering_id)
      and access_level <> 'admin_only'
      and ccx_access_rank(access_level) <= ccx_investor_rank(offering_id)
    )
  );
create policy offering_documents_write on offering_documents
  for all using (ccx_owns_offering(offering_id) or ccx_is_admin())
  with check (ccx_owns_offering(offering_id) or ccx_is_admin());

-- Append-only: readable by anyone who may see the offering, never updated or
-- deleted through the data API. No update or delete policy exists by design.
create policy offering_versions_read on offering_versions
  for select using (ccx_can_view_offering(offering_id));
create policy offering_versions_insert on offering_versions
  for insert with check (ccx_owns_offering(offering_id) or ccx_is_admin());

-- An acknowledgement is evidence. Its subject and administrators may read it;
-- only its subject may create it; nobody may change it.
create policy disclosure_ack_read on disclosure_acknowledgements
  for select using (investor_id = ccx_investor_id() or ccx_is_admin());
create policy disclosure_ack_insert on disclosure_acknowledgements
  for insert with check (investor_id = ccx_investor_id());

-- ---------------------------------------------------------------------------
-- Engagement: interest, commitment, transaction, position
--
-- The sponsor sees engagement with its own offering. An investor sees only
-- their own. There is deliberately no path from one investor to another.
-- ---------------------------------------------------------------------------

create policy investment_interests_read on investment_interests
  for select using (
    investor_id = ccx_investor_id() or ccx_owns_offering(offering_id) or ccx_is_admin()
  );
create policy investment_interests_write on investment_interests
  for all using (investor_id = ccx_investor_id() or ccx_is_admin())
  with check (investor_id = ccx_investor_id() or ccx_is_admin());

create policy investment_commitments_read on investment_commitments
  for select using (
    investor_id = ccx_investor_id() or ccx_owns_offering(offering_id) or ccx_is_admin()
  );
create policy investment_commitments_investor on investment_commitments
  for insert with check (investor_id = ccx_investor_id());
create policy investment_commitments_manage on investment_commitments
  for update using (ccx_owns_offering(offering_id) or ccx_is_admin())
  with check (ccx_owns_offering(offering_id) or ccx_is_admin());

-- A transaction is written only by the provider adapter, running as admin.
create policy investment_transactions_read on investment_transactions
  for select using (investor_id = ccx_investor_id() or ccx_is_admin());
create policy investment_transactions_admin on investment_transactions
  for all using (ccx_is_admin()) with check (ccx_is_admin());

create policy investment_positions_read on investment_positions
  for select using (
    investor_id = ccx_investor_id() or ccx_owns_offering(offering_id) or ccx_is_admin()
  );
create policy investment_positions_admin on investment_positions
  for all using (ccx_is_admin()) with check (ccx_is_admin());

-- ---------------------------------------------------------------------------
-- Waterfall and distributions
-- ---------------------------------------------------------------------------

create policy waterfall_structures_read on waterfall_structures
  for select using (ccx_can_view_offering(offering_id));
create policy waterfall_structures_write on waterfall_structures
  for all using (ccx_owns_offering(offering_id) or ccx_is_admin())
  with check (ccx_owns_offering(offering_id) or ccx_is_admin());

create policy waterfall_tiers_read on waterfall_tiers
  for select using (exists (
    select 1 from waterfall_structures w
    where w.id = waterfall_id and ccx_can_view_offering(w.offering_id)
  ));
create policy waterfall_tiers_write on waterfall_tiers
  for all using (exists (
    select 1 from waterfall_structures w
    where w.id = waterfall_id and (ccx_owns_offering(w.offering_id) or ccx_is_admin())
  ))
  with check (exists (
    select 1 from waterfall_structures w
    where w.id = waterfall_id and (ccx_owns_offering(w.offering_id) or ccx_is_admin())
  ));

create policy distribution_events_read on distribution_events
  for select using (
    ccx_owns_offering(offering_id)
    or ccx_is_admin()
    or exists (
      select 1 from investment_positions p
      where p.offering_id = distribution_events.offering_id
        and p.investor_id = ccx_investor_id()
    )
  );
create policy distribution_events_write on distribution_events
  for all using (ccx_owns_offering(offering_id) or ccx_is_admin())
  with check (ccx_owns_offering(offering_id) or ccx_is_admin());

-- An investor sees their own allocation and no one else's, not even the
-- sponsor's view of the whole event.
create policy investment_distributions_read on investment_distributions
  for select using (
    investor_id = ccx_investor_id() or ccx_owns_offering(offering_id) or ccx_is_admin()
  );
create policy investment_distributions_admin on investment_distributions
  for all using (ccx_is_admin()) with check (ccx_is_admin());

-- ---------------------------------------------------------------------------
-- Reporting, questions, risk, scenarios
-- ---------------------------------------------------------------------------

-- Published updates reach the offering's investors; drafts stay with the
-- sponsor until approved.
create policy investor_updates_read on investor_updates
  for select using (
    ccx_owns_offering(offering_id)
    or ccx_is_admin()
    or (
      status = 'published'
      and exists (
        select 1 from investment_positions p
        where p.offering_id = investor_updates.offering_id
          and p.investor_id = ccx_investor_id()
      )
    )
  );
create policy investor_updates_write on investor_updates
  for all using (ccx_owns_offering(offering_id) or ccx_is_admin())
  with check (ccx_owns_offering(offering_id) or ccx_is_admin());

create policy tax_documents_read on tax_documents
  for select using (investor_id = ccx_investor_id() or ccx_is_admin());
create policy tax_documents_admin on tax_documents
  for all using (ccx_is_admin()) with check (ccx_is_admin());

-- A question is its author's and the sponsor's; other investors see it only
-- when the author shared it and it has been answered.
create policy investor_questions_read on investor_questions
  for select using (
    investor_id = ccx_investor_id()
    or ccx_owns_offering(offering_id)
    or ccx_is_admin()
    or (visibility = 'shared' and status = 'answered' and ccx_investor_id() is not null)
  );
create policy investor_questions_insert on investor_questions
  for insert with check (investor_id = ccx_investor_id());
create policy investor_questions_moderate on investor_questions
  for update using (
    investor_id = ccx_investor_id() or ccx_owns_offering(offering_id) or ccx_is_admin()
  )
  with check (
    investor_id = ccx_investor_id() or ccx_owns_offering(offering_id) or ccx_is_admin()
  );

create policy investor_answers_read on investor_answers
  for select using (exists (
    select 1 from investor_questions q
    where q.id = question_id
      and (
        q.investor_id = ccx_investor_id()
        or ccx_owns_offering(q.offering_id)
        or ccx_is_admin()
        or (q.visibility = 'shared' and q.status = 'answered' and ccx_investor_id() is not null)
      )
  ));
create policy investor_answers_write on investor_answers
  for all using (ccx_owns_offering(offering_id) or ccx_is_admin())
  with check (ccx_owns_offering(offering_id) or ccx_is_admin());

create policy risk_assessments_read on risk_assessments
  for select using (ccx_can_view_offering(offering_id));
create policy risk_assessments_write on risk_assessments
  for all using (ccx_owns_offering(offering_id) or ccx_is_admin())
  with check (ccx_owns_offering(offering_id) or ccx_is_admin());

create policy investment_scenarios_read on investment_scenarios
  for select using (ccx_can_view_offering(offering_id));
create policy investment_scenarios_write on investment_scenarios
  for all using (
    ccx_owns_offering(offering_id) or ccx_is_admin() or ccx_investor_id() is not null
  )
  with check (
    ccx_owns_offering(offering_id) or ccx_is_admin() or ccx_investor_id() is not null
  );

-- ---------------------------------------------------------------------------
-- Capital stack: belongs to the deal and follows the deal's own rules
-- ---------------------------------------------------------------------------

create policy capital_stacks_read on capital_stacks
  for select using (ccx_owns_deal(deal_id) or ccx_is_admin());
create policy capital_stacks_write on capital_stacks
  for all using (ccx_owns_deal(deal_id) or ccx_is_admin())
  with check (ccx_owns_deal(deal_id) or ccx_is_admin());

create policy capital_sources_read on capital_sources
  for select using (ccx_owns_deal(deal_id) or ccx_is_admin());
create policy capital_sources_write on capital_sources
  for all using (ccx_owns_deal(deal_id) or ccx_is_admin())
  with check (ccx_owns_deal(deal_id) or ccx_is_admin());

-- ---------------------------------------------------------------------------
-- Matching, saved items, compliance
-- ---------------------------------------------------------------------------

-- A match is intelligence about one investor. The sponsor sees counts through
-- the application, never rows naming who was matched.
create policy investor_matches_read on investor_matches
  for select using (investor_id = ccx_investor_id() or ccx_is_admin());
create policy investor_matches_admin on investor_matches
  for all using (ccx_is_admin()) with check (ccx_is_admin());

create policy saved_investments_self on saved_investments
  for all using (investor_id = ccx_investor_id() or ccx_is_admin())
  with check (investor_id = ccx_investor_id() or ccx_is_admin());

-- Compliance review is between the sponsor and the reviewer. Investors never
-- see the deliberation behind a publication decision.
create policy compliance_reviews_read on compliance_reviews
  for select using (ccx_owns_offering(offering_id) or ccx_is_admin());
create policy compliance_reviews_admin on compliance_reviews
  for all using (ccx_is_admin()) with check (ccx_is_admin());
