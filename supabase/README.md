# Supabase setup

The application runs with no Supabase project at all — the default `local`
driver keeps everything in a file-backed store. Follow this only when you want a
real PostgreSQL database, Supabase Auth and Supabase Storage.

## 1. Create the project

```bash
npx supabase init          # if you have not already
npx supabase link --project-ref <your-project-ref>
```

## 2. Apply the migrations

```bash
npx supabase db push
```

Or, against a local stack:

```bash
npx supabase start
npx supabase db reset      # runs 0001_init.sql then 0002_rls.sql
```

`0001_init.sql` creates the schema. `0002_rls.sql` enables row level security on
every table and installs the policies. Apply them in that order.

## 3. Storage

`0002_rls.sql` creates the private `deal-documents` bucket. Do not add a public
policy to it: documents are served only through
`/api/documents/[documentId]/download`, which authorizes the request and writes
an access-log entry before returning a byte.

## 4. Point the application at it

In `.env.local`:

```
DATA_DRIVER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
SUPABASE_STORAGE_BUCKET=deal-documents
AUTH_SECRET=<openssl rand -hex 32>
```

## How the two authorization layers relate

`lib/policy.ts` and `0002_rls.sql` express the same rules twice, deliberately.

- Server-rendered requests go through the service role, which bypasses RLS. For
  those, `lib/policy.ts` is the authority, and `lib/access.ts` is the single
  place a deal is loaded so the check cannot be skipped.
- Any client that talks to PostgREST directly with an anon or user token is
  constrained by RLS.

Every policy in `0002_rls.sql` names the `lib/policy.ts` function it mirrors. If
you change one, change the other, and extend `tests/policy.test.ts`.

## Auth

The schema assumes `users.id` matches the Supabase Auth subject (`auth.uid()`).
If you map them through a separate column, change `ccx_user_id()` and the
policies that compare against `auth.uid()` directly.
