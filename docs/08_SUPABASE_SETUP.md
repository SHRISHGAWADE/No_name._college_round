# Supabase setup for accounts, history, and PDFs

## What this enables

- Supabase Auth email/password accounts.
- Account-scoped audit history and source library.
- Audit results and extracted source pages in Postgres.
- Original PDFs in a private Storage bucket. The API issues a five-minute signed URL only after checking ownership.
- Reusable Gemini document embeddings in `source_chunks`; the backend reuses them on later audits of the same saved source.

The browser only receives the Supabase publishable/anon key. The service-role key stays in the backend and must never be prefixed with `NEXT_PUBLIC_`.

## Supabase dashboard steps

1. Create a Supabase project and save its **Project URL**, **publishable/anon key**, and **service_role secret key**.
2. In **SQL Editor**, run [`backend/supabase/migrations/001_history_and_sources.sql`](../backend/supabase/migrations/001_history_and_sources.sql). This creates the tables, indexes, vector extension, and private `source-pdfs` bucket.
3. In **Authentication → Providers → Email**, enable email/password. For a short-lived judging demo, either disable email confirmation or configure the confirmation redirect URL to your deployed frontend. Set the site URL and allowed redirect URLs to the Vercel domain and `http://localhost:3000` for local work.
4. Do not add public Storage policies. RLS is enabled and the browser roles have no table grants; the FastAPI backend accesses rows using its service-role key after validating the signed-in user's access token.

## Environment variables

Frontend local `frontend/.env.local` (copy the variable names from `frontend/.env.example`):

```dotenv
NEXT_PUBLIC_API_BASE=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Backend local `backend/.env` (copy from `backend/.env.example`):

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_SECRET
SUPABASE_STORAGE_BUCKET=source-pdfs
```

Set the same backend Supabase values in **Render → your backend service → Environment**. Set the three `NEXT_PUBLIC_` values in **Vercel → frontend project → Settings → Environment Variables**; use the deployed Render URL for `NEXT_PUBLIC_API_BASE`. Redeploy both services after changing variables. Never put `SUPABASE_SERVICE_ROLE_KEY` in Vercel or commit real keys.

## Current account behavior and limits

The frontend now gates the app behind email/password sign-in when Supabase variables are present. Local development without Supabase variables retains the in-memory local mode. Uploaded PDFs and audits persist per signed-in account once the backend has all Supabase variables.

There is no password-reset or account-deletion screen yet. Deleting an Auth user cascades the Postgres audit/source/chunk rows; use a Storage cleanup policy or delete that user's objects under `<user-id>/` as part of account deletion. The source viewer supports text-layer PDFs; scanned PDFs still need OCR and remain unsupported.
