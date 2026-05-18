create table if not exists public.app_system_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_system_settings enable row level security;

-- Server routes use SUPABASE_SERVICE_ROLE_KEY. Do not expose token settings to
-- anon/authenticated clients until browser auth and RLS policies are finalized.
