create extension if not exists pgcrypto;

alter table public.bank_accounts add column if not exists bank text;
alter table public.bank_accounts add column if not exists account_name text;
alter table public.bank_accounts add column if not exists display_name text;
alter table public.bank_accounts add column if not exists is_active boolean not null default true;

update public.bank_accounts
set
  account_name = coalesce(account_name, name),
  display_name = coalesce(display_name, name)
where account_name is null or display_name is null;

create table if not exists public.statements (
  statement_id text primary key,
  bank text not null,
  account_id text,
  account_no text not null,
  transaction_date date,
  transaction_time time,
  transaction_type text not null default 'unknown',
  withdrawal numeric(18,2) not null default 0,
  deposit numeric(18,2) not null default 0,
  fee numeric(18,2) not null default 0,
  amount numeric(18,2) not null default 0,
  balance numeric(18,2),
  description text,
  reference_no text,
  source_file_id text,
  source_file_name text,
  source_file_url text,
  source_row_no integer,
  unique_key text not null unique,
  uploaded_by text,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists statements_transaction_date_idx
  on public.statements (transaction_date);
create index if not exists statements_account_date_idx
  on public.statements (account_no, transaction_date);
create index if not exists statements_unique_key_idx
  on public.statements (unique_key);
create index if not exists statements_source_file_idx
  on public.statements (source_file_name);

alter table public.statements enable row level security;

alter table public.payout_items add column if not exists payout_item_id text;
alter table public.payout_items add column if not exists source_bank text;
alter table public.payout_items add column if not exists source_account_id text;
alter table public.payout_items add column if not exists source_account_no text;
alter table public.payout_items add column if not exists source_account_name text;
alter table public.payout_items add column if not exists batch_reference text;
alter table public.payout_items add column if not exists bank_reference_no text;
alter table public.payout_items add column if not exists payment_name text;
alter table public.payout_items add column if not exists transaction_date date;
alter table public.payout_items add column if not exists row_no text;
alter table public.payout_items add column if not exists recipient_bank_code text;
alter table public.payout_items add column if not exists recipient_bank_name text;
alter table public.payout_items add column if not exists paid_amount numeric(18,2) not null default 0;
alter table public.payout_items add column if not exists fee numeric(18,2) not null default 0;
alter table public.payout_items add column if not exists rejection_reason text;
alter table public.payout_items add column if not exists source_file_id text;
alter table public.payout_items add column if not exists source_file_name text;
alter table public.payout_items add column if not exists source_file_url text;
alter table public.payout_items add column if not exists unique_key text;
alter table public.payout_items add column if not exists import_id text;
alter table public.payout_items add column if not exists uploaded_by text;
alter table public.payout_items add column if not exists uploaded_at timestamptz;
alter table public.payout_items add column if not exists assigned_username text;
alter table public.payout_items add column if not exists assigned_display_name text;
alter table public.payout_items add column if not exists updated_by text;

update public.payout_items
set
  payout_item_id = coalesce(payout_item_id, id),
  paid_amount = case when paid_amount = 0 then amount else paid_amount end,
  uploaded_at = coalesce(uploaded_at, created_at)
where payout_item_id is null or uploaded_at is null or paid_amount = 0;

create unique index if not exists payout_items_unique_key_idx
  on public.payout_items (unique_key)
  where unique_key is not null;
create index if not exists payout_items_import_id_idx
  on public.payout_items (import_id)
  where import_id is not null;
create index if not exists payout_items_source_account_idx
  on public.payout_items (source_account_no);
create index if not exists payout_items_recipient_account_idx
  on public.payout_items (recipient_account_no);

create table if not exists public.import_history (
  import_id text primary key default ('IMP-' || replace(gen_random_uuid()::text, '-', '')),
  import_type text not null check (import_type in ('statement', 'payout')),
  source_file_name text,
  source_file_id text,
  source_file_url text,
  uploaded_by text,
  uploaded_at timestamptz not null default now(),
  record_count integer not null default 0,
  processed_count integer not null default 0,
  inserted_count integer not null default 0,
  skipped_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists import_history_type_uploaded_idx
  on public.import_history (import_type, uploaded_at desc);
create index if not exists import_history_source_file_idx
  on public.import_history (source_file_name);

alter table public.import_history enable row level security;

create table if not exists public.audit_logs (
  log_id text primary key default ('LOG-' || replace(gen_random_uuid()::text, '-', '')),
  timestamp timestamptz not null default now(),
  actor_username text,
  actor_role text,
  action text not null,
  target_type text,
  target_id text,
  old_value text,
  new_value text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_action_timestamp_idx
  on public.audit_logs (action, timestamp desc);
create index if not exists audit_logs_target_idx
  on public.audit_logs (target_type, target_id);

alter table public.audit_logs enable row level security;

-- Server routes use SUPABASE_SERVICE_ROLE_KEY. Do not expose these tables to
-- anon/authenticated until the browser auth model and RLS policies are finalized.
