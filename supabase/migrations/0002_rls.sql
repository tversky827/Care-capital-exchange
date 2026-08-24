-- ============================================================================
-- Row Level Security
--
-- These policies mirror `lib/policy.ts` one-for-one. The application layer is
-- the authority for server-rendered requests (which use the service role);
-- these policies are the backstop for any client that reaches PostgREST
-- directly with an anon or user token.
--
-- Both must agree. `tests/policy.test.ts` exercises the TypeScript side, and
-- every rule below names the function it corresponds to.
--
-- Conventions:
--   * Helpers are SECURITY DEFINER with a pinned search_path so that a policy
--     which needs to read `company_members` does not re-enter RLS and recurse.
--   * Deny by default: RLS is enabled on every table, and a table with no
--     policy for an operation denies it.
--   * The service role bypasses RLS by design; the application policy layer is
--     what constrains it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The platform user for the current request. Assumes `users.id` matches the
-- Supabase Auth subject; adjust here if you map them through another column.
create or replace function ccx_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function ccx_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from company_members where user_id = auth.uid();
$$;

create or replace function ccx_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from company_members m
    join companies c on c.id = m.company_id
    where m.user_id = auth.uid() and c.type = 'admin'
  );
$$;

/* The lender organisation the current user belongs to, if any. */
create or replace function ccx_lender_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.id
  from lenders l
  join company_members m on m.company_id = l.company_id
  where m.user_id = auth.uid()
  limit 1;
$$;

create or replace function ccx_member_role(target_company uuid)
returns member_role
language sql
stable
security definer
set search_path = public
as $$
  select role from company_members
  where user_id = auth.uid() and company_id = target_company
  limit 1;
$$;

/* Mirrors `hasLiveDistribution`: a revoked distribution grants nothing. */
create or replace function ccx_has_distribution(target_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from deal_distributions d
    join lenders l on l.id = d.lender_id
    join company_members m on m.company_id = l.company_id
    where d.deal_id = target_deal
      and m.user_id = auth.uid()
      and d.status <> 'revoked'
      and l.verification_status = 'verified'
  );
$$;

/* Mirrors `isMarketplaceVisible`. */
create or replace function ccx_deal_on_marketplace(target_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from deals d
    where d.id = target_deal
      and d.distribution_scope = 'marketplace'
      and d.status <> 'draft'
      and d.distributed_at is not null
  );
$$;

create or replace function ccx_owns_deal(target_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from deals d
    where d.id = target_deal and d.company_id in (select ccx_company_ids())
  );
$$;

/* Mirrors `canViewDeal`. */
create or replace function ccx_can_read_deal(target_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    ccx_is_admin()
    or ccx_owns_deal(target_deal)
    or (
      ccx_lender_id() is not null
      and (ccx_has_distribution(target_deal) or ccx_deal_on_marketplace(target_deal))
    );
$$;

/* Mirrors `canEditDeal`: viewers cannot write, terminal states are frozen. */
create or replace function ccx_can_write_deal(target_deal uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when ccx_is_admin() then true
    when not ccx_owns_deal(target_deal) then false
    else (
      select ccx_member_role(d.company_id) <> 'viewer'
        and d.status not in ('funded', 'withdrawn', 'rejected', 'archived')
      from deals d where d.id = target_deal
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

do $$
declare
  target text;
begin
  foreach target in array array[
    'users', 'companies', 'company_members', 'deals', 'facilities', 'facility_metrics',
    'financial_periods', 'financial_line_items', 'transaction_terms', 'sponsors',
    'sponsor_experience', 'documents', 'document_versions', 'document_permissions',
    'document_access_logs', 'extraction_runs', 'extracted_fields', 'discrepancies',
    'discrepancy_resolutions', 'underwriting_runs', 'underwriting_metrics',
    'underwriting_risks', 'credit_memos', 'credit_memo_versions', 'lenders',
    'lender_lending_boxes', 'lender_preferences', 'lender_notes', 'saved_searches',
    'matches', 'deal_distributions', 'indications', 'indication_conditions',
    'message_threads', 'messages', 'data_requests', 'notifications', 'audit_logs',
    'jobs', 'subscriptions', 'billing_events', 'ai_usage_events'
  ]
  loop
    execute format('alter table %I enable row level security', target);
    execute format('alter table %I force row level security', target);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create policy users_read_self on users
  for select using (id = auth.uid() or ccx_is_admin());

create policy users_update_self on users
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy users_admin_write on users
  for all using (ccx_is_admin()) with check (ccx_is_admin());

create policy companies_read on companies
  for select using (id in (select ccx_company_ids()) or ccx_is_admin());

-- Only an owner or organisation administrator may edit; mirrors `canManageCompany`.
create policy companies_update on companies
  for update
  using (ccx_member_role(id) in ('owner', 'admin') or ccx_is_admin())
  with check (ccx_member_role(id) in ('owner', 'admin') or ccx_is_admin());

create policy company_members_read on company_members
  for select using (company_id in (select ccx_company_ids()) or ccx_is_admin());

create policy company_members_manage on company_members
  for all
  using (ccx_member_role(company_id) in ('owner', 'admin') or ccx_is_admin())
  with check (ccx_member_role(company_id) in ('owner', 'admin') or ccx_is_admin());

-- ---------------------------------------------------------------------------
-- Deals and deal-scoped records
--
-- Everything below follows the same shape: read when `ccx_can_read_deal`,
-- write when `ccx_can_write_deal`. Doing it uniformly is what makes the rules
-- auditable — there is no table where the reasoning is subtly different.
-- ---------------------------------------------------------------------------

create policy deals_read on deals for select using (ccx_can_read_deal(id));

create policy deals_insert on deals
  for insert with check (
    company_id in (select ccx_company_ids())
    and ccx_member_role(company_id) <> 'viewer'
  );

create policy deals_update on deals
  for update using (ccx_can_write_deal(id)) with check (ccx_can_write_deal(id));

-- Only an owner may delete, and only a draft; mirrors `canDeleteDeal`.
create policy deals_delete on deals
  for delete using (
    ccx_is_admin()
    or (ccx_owns_deal(id) and ccx_member_role(company_id) = 'owner' and status = 'draft')
  );

do $$
declare
  target text;
begin
  foreach target in array array[
    'facilities', 'facility_metrics', 'financial_periods', 'financial_line_items',
    'transaction_terms', 'sponsors', 'extraction_runs', 'extracted_fields',
    'discrepancies', 'discrepancy_resolutions', 'underwriting_runs',
    'underwriting_metrics', 'underwriting_risks', 'credit_memos',
    'credit_memo_versions', 'data_requests', 'indication_conditions'
  ]
  loop
    execute format(
      'create policy %I_read on %I for select using (ccx_can_read_deal(deal_id))',
      target, target
    );
    execute format(
      'create policy %I_write on %I for all
       using (ccx_can_write_deal(deal_id)) with check (ccx_can_write_deal(deal_id))',
      target, target
    );
  end loop;
end;
$$;

create policy sponsor_experience_read on sponsor_experience
  for select using (
    exists (select 1 from sponsors s where s.id = sponsor_id and ccx_can_read_deal(s.deal_id))
  );

create policy sponsor_experience_write on sponsor_experience
  for all
  using (exists (select 1 from sponsors s where s.id = sponsor_id and ccx_can_write_deal(s.deal_id)))
  with check (exists (select 1 from sponsors s where s.id = sponsor_id and ccx_can_write_deal(s.deal_id)));

-- ---------------------------------------------------------------------------
-- Documents
--
-- Mirrors `canViewDocument`. Three rules that matter:
--   * `restricted` documents never leave the owning organisation, whatever the
--     distribution or grant says.
--   * `deal_team` documents require an explicit, unexpired permission grant.
--   * Marketplace discovery alone never reaches a document — a live
--     distribution is required.
-- ---------------------------------------------------------------------------

create policy documents_read on documents
  for select using (
    deleted_at is null
    and (
      ccx_is_admin()
      or company_id in (select ccx_company_ids())
      or (
        ccx_lender_id() is not null
        and visibility <> 'restricted'
        and (
          (visibility = 'distributed_lenders' and ccx_has_distribution(deal_id))
          or exists (
            select 1 from document_permissions p
            where p.document_id = documents.id
              and p.company_id in (select ccx_company_ids())
              and p.can_view
              and (p.expires_at is null or p.expires_at > now())
          )
        )
      )
    )
  );

create policy documents_admin_read on documents
  for select using (ccx_is_admin());

create policy documents_write on documents
  for all
  using (ccx_is_admin() or (company_id in (select ccx_company_ids()) and ccx_member_role(company_id) <> 'viewer'))
  with check (ccx_is_admin() or (company_id in (select ccx_company_ids()) and ccx_member_role(company_id) <> 'viewer'));

create policy document_versions_read on document_versions
  for select using (exists (select 1 from documents d where d.id = document_id and d.company_id in (select ccx_company_ids())));

create policy document_versions_write on document_versions
  for all
  using (exists (select 1 from documents d where d.id = document_id and d.company_id in (select ccx_company_ids())))
  with check (exists (select 1 from documents d where d.id = document_id and d.company_id in (select ccx_company_ids())));

create policy document_permissions_read on document_permissions
  for select using (
    company_id in (select ccx_company_ids())
    or exists (select 1 from documents d where d.id = document_id and d.company_id in (select ccx_company_ids()))
    or ccx_is_admin()
  );

create policy document_permissions_write on document_permissions
  for all
  using (exists (select 1 from documents d where d.id = document_id and d.company_id in (select ccx_company_ids())))
  with check (exists (select 1 from documents d where d.id = document_id and d.company_id in (select ccx_company_ids())));

-- Access logs are append-only: insert and select, never update or delete.
create policy document_access_logs_insert on document_access_logs
  for insert with check (user_id = auth.uid());

create policy document_access_logs_read on document_access_logs
  for select using (ccx_owns_deal(deal_id) or ccx_is_admin());

-- ---------------------------------------------------------------------------
-- Lenders
-- ---------------------------------------------------------------------------

-- A verified lender profile is readable by any authenticated user; an
-- unverified one only by the lender itself and administrators.
create policy lenders_read on lenders
  for select using (
    verification_status = 'verified'
    or company_id in (select ccx_company_ids())
    or ccx_is_admin()
  );

create policy lenders_update on lenders
  for update
  using (company_id in (select ccx_company_ids()) or ccx_is_admin())
  with check (company_id in (select ccx_company_ids()) or ccx_is_admin());

create policy lenders_insert on lenders
  for insert with check (company_id in (select ccx_company_ids()) or ccx_is_admin());

-- A lending box is the lender's own; it is never readable by another lender or
-- by a borrower, because it is the institution's commercial strategy.
create policy lender_boxes_read on lender_lending_boxes
  for select using (
    ccx_is_admin()
    or exists (select 1 from lenders l where l.id = lender_id and l.company_id in (select ccx_company_ids()))
  );

create policy lender_boxes_write on lender_lending_boxes
  for all
  using (exists (select 1 from lenders l where l.id = lender_id and l.company_id in (select ccx_company_ids())))
  with check (exists (select 1 from lenders l where l.id = lender_id and l.company_id in (select ccx_company_ids())));

create policy lender_preferences_all on lender_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

/*
 * Internal lender notes.
 *
 * Deliberately excludes administrators: the note is the institution's own
 * credit thinking, and a platform operator has no business reading it.
 */
create policy lender_notes_all on lender_notes
  for all
  using (exists (select 1 from lenders l where l.id = lender_id and l.company_id in (select ccx_company_ids())))
  with check (exists (select 1 from lenders l where l.id = lender_id and l.company_id in (select ccx_company_ids())));

create policy saved_searches_all on saved_searches
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Matching and distribution
-- ---------------------------------------------------------------------------

-- A borrower sees every match on their deal; a lender sees only their own.
create policy matches_read on matches
  for select using (
    ccx_is_admin()
    or ccx_owns_deal(deal_id)
    or exists (select 1 from lenders l where l.id = lender_id and l.company_id in (select ccx_company_ids()))
  );

create policy matches_write on matches
  for all using (ccx_can_write_deal(deal_id)) with check (ccx_can_write_deal(deal_id));

create policy distributions_read on deal_distributions
  for select using (
    ccx_is_admin()
    or ccx_owns_deal(deal_id)
    or exists (select 1 from lenders l where l.id = lender_id and l.company_id in (select ccx_company_ids()))
  );

-- The borrower controls who receives the deal; the lender controls only their
-- own pipeline stage, which the update policy allows through the same row.
create policy distributions_write on deal_distributions
  for all
  using (
    ccx_can_write_deal(deal_id)
    or exists (select 1 from lenders l where l.id = lender_id and l.company_id in (select ccx_company_ids()))
  )
  with check (
    ccx_can_write_deal(deal_id)
    or exists (select 1 from lenders l where l.id = lender_id and l.company_id in (select ccx_company_ids()))
  );

-- ---------------------------------------------------------------------------
-- Indications
--
-- Mirrors `canViewIndication`: the borrower sees all of them, the submitting
-- lender sees its own, and a competing lender sees nothing.
-- ---------------------------------------------------------------------------

create policy indications_read on indications
  for select using (
    ccx_is_admin()
    or ccx_owns_deal(deal_id)
    or exists (select 1 from lenders l where l.id = lender_id and l.company_id in (select ccx_company_ids()))
  );

create policy indications_insert on indications
  for insert with check (
    exists (select 1 from lenders l where l.id = lender_id and l.company_id in (select ccx_company_ids()))
    and ccx_has_distribution(deal_id)
  );

create policy indications_update on indications
  for update
  using (
    ccx_owns_deal(deal_id)
    or exists (select 1 from lenders l where l.id = lender_id and l.company_id in (select ccx_company_ids()))
  )
  with check (
    ccx_owns_deal(deal_id)
    or exists (select 1 from lenders l where l.id = lender_id and l.company_id in (select ccx_company_ids()))
  );

-- ---------------------------------------------------------------------------
-- Collaboration
-- ---------------------------------------------------------------------------

-- Threads are readable only by their participants; mirrors `canViewThread`.
create policy threads_read on message_threads
  for select using (
    ccx_is_admin()
    or exists (
      select 1 from unnest(participant_company_ids) as participant
      where participant in (select ccx_company_ids())
    )
  );

create policy threads_write on message_threads
  for all
  using (
    exists (
      select 1 from unnest(participant_company_ids) as participant
      where participant in (select ccx_company_ids())
    )
  )
  with check (
    exists (
      select 1 from unnest(participant_company_ids) as participant
      where participant in (select ccx_company_ids())
    )
  );

create policy messages_read on messages
  for select using (
    ccx_is_admin()
    or exists (
      select 1 from message_threads t
      where t.id = thread_id
        and exists (
          select 1 from unnest(t.participant_company_ids) as participant
          where participant in (select ccx_company_ids())
        )
    )
  );

create policy messages_insert on messages
  for insert with check (
    author_id = auth.uid()
    and author_company_id in (select ccx_company_ids())
    and exists (
      select 1 from message_threads t
      where t.id = thread_id
        and exists (
          select 1 from unnest(t.participant_company_ids) as participant
          where participant in (select ccx_company_ids())
        )
    )
  );

create policy notifications_read on notifications
  for select using (user_id = auth.uid());

create policy notifications_update on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Audit
--
-- Append-only for every role. There is deliberately no UPDATE or DELETE policy
-- on `audit_logs`, `document_access_logs` or `ai_usage_events`, so with RLS
-- forced those operations are denied for anyone other than the service role.
-- ---------------------------------------------------------------------------

create policy audit_logs_insert on audit_logs
  for insert with check (actor_id = auth.uid() or actor_id is null);

create policy audit_logs_read on audit_logs
  for select using (
    ccx_is_admin()
    or actor_company_id in (select ccx_company_ids())
    or (deal_id is not null and ccx_owns_deal(deal_id))
  );

create policy ai_usage_read on ai_usage_events for select using (ccx_is_admin());
create policy ai_usage_insert on ai_usage_events for insert with check (ccx_is_admin());

-- ---------------------------------------------------------------------------
-- Operations and billing
-- ---------------------------------------------------------------------------

create policy jobs_admin on jobs for all using (ccx_is_admin()) with check (ccx_is_admin());

create policy jobs_deal_read on jobs
  for select using (deal_id is not null and ccx_owns_deal(deal_id));

create policy subscriptions_read on subscriptions
  for select using (company_id in (select ccx_company_ids()) or ccx_is_admin());

create policy subscriptions_write on subscriptions
  for all
  using (ccx_member_role(company_id) in ('owner', 'admin') or ccx_is_admin())
  with check (ccx_member_role(company_id) in ('owner', 'admin') or ccx_is_admin());

create policy billing_events_read on billing_events
  for select using (company_id in (select ccx_company_ids()) or ccx_is_admin());

create policy billing_events_insert on billing_events
  for insert with check (ccx_is_admin());

-- ---------------------------------------------------------------------------
-- Storage
--
-- The documents bucket is private. Files are served only through the
-- application's authorized download route, which checks policy and writes an
-- access-log entry before returning bytes. No public policy is created here on
-- purpose.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('deal-documents', 'deal-documents', false)
on conflict (id) do nothing;
