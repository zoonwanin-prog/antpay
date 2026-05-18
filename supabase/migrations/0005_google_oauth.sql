-- Google OAuth tokens + Drive upload metadata
create extension if not exists pgcrypto;

create table if not exists public.google_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'google',
  google_email text,
  access_token text not null,
  refresh_token text,
  expiry_date timestamptz,
  scope text,
  token_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists google_oauth_tokens_provider_idx
  on public.google_oauth_tokens (provider, updated_at desc);

alter table public.google_oauth_tokens enable row level security;
-- Access is restricted to server routes that use the service-role key.
-- No anon policies on purpose.

create table if not exists public.google_drive_uploads (
  id uuid primary key default gen_random_uuid(),
  folder_type text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  drive_file_id text not null,
  drive_url text,
  uploaded_by text,
  related_table text,
  related_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists google_drive_uploads_folder_idx
  on public.google_drive_uploads (folder_type, created_at desc);
create index if not exists google_drive_uploads_related_idx
  on public.google_drive_uploads (related_table, related_id);

alter table public.google_drive_uploads enable row level security;
-- Server routes use SUPABASE_SERVICE_ROLE_KEY. Do not expose this table to anon
-- until browser auth and RLS policies are finalized.
