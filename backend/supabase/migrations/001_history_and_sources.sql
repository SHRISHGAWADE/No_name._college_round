-- Second Opinion: account-owned audit history and private source files.
-- Run once in Supabase SQL Editor. API access goes through the backend's
-- service role; browser roles receive no table/storage access.
create table if not exists public.sources (
  source_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  mime_type text not null,
  page_count integer not null default 0,
  pages jsonb not null default '[]'::jsonb,
  storage_path text,
  created_at timestamptz not null default now(),
  unique (source_id, owner_id)
);

create index if not exists sources_owner_created_idx
  on public.sources (owner_id, created_at desc);

create table if not exists public.audits (
  audit_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null check (status in ('running', 'done', 'error')),
  result jsonb not null
);

create index if not exists audits_owner_created_idx
  on public.audits (owner_id, created_at desc);

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create table if not exists public.source_chunks (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_id text not null,
  chunk_index integer not null,
  page_number integer not null,
  char_start integer not null,
  content text not null,
  embedding extensions.vector not null,
  embedding_model text not null,
  unique (source_id, embedding_model, chunk_index),
  foreign key (source_id, owner_id) references public.sources(source_id, owner_id) on delete cascade
);
create index if not exists source_chunks_owner_source_idx
  on public.source_chunks (owner_id, source_id, embedding_model);

alter table public.sources enable row level security;
alter table public.audits enable row level security;
alter table public.source_chunks enable row level security;
revoke all on public.sources, public.audits, public.source_chunks from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('source-pdfs', 'source-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf'];

-- No policies for anon/authenticated: only the backend service role accesses
-- this private bucket and returns short-lived signed URLs after ownership checks.
