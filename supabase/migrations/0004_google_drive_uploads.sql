create table if not exists public.drive_uploads (
  id uuid primary key default gen_random_uuid(),
  upload_type text not null check (upload_type in ('statement', 'payout_time', 'bulk_payout')),
  file_name text not null,
  mime_type text,
  file_size bigint not null default 0,
  drive_file_id text,
  web_view_link text,
  web_content_link text,
  uploaded_by text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists drive_uploads_type_created_idx on public.drive_uploads (upload_type, created_at desc);
create index if not exists drive_uploads_file_name_idx on public.drive_uploads (file_name);

alter table public.drive_uploads enable row level security;

-- Server routes use SUPABASE_SERVICE_ROLE_KEY. Do not expose this table to anon
-- until browser auth and RLS policies are finalized.
