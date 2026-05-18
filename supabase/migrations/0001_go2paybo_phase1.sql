create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text,
  role text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_no text,
  account_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crypto_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  network text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time,
  source_account text,
  status text not null,
  target_account text,
  amount numeric(18,2) not null default 0,
  fee numeric(18,2) not null default 0,
  user_name text,
  note text,
  slip_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crypto_transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time,
  source_account text,
  status text not null,
  target_account text,
  amount_thb numeric(18,2) not null default 0,
  exchange_rate numeric(18,6) not null default 0,
  usdt numeric(18,6) not null default 0,
  note text,
  user_name text,
  slip_url text,
  source_ref text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.balances (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time,
  account_name text not null,
  balance_type text not null,
  amount numeric(18,2) not null default 0,
  user_name text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, account_name, balance_type)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time,
  item text not null,
  amount numeric(18,2) not null default 0,
  note text,
  user_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bogo2pay_transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time,
  item text,
  type text not null,
  actual_amount numeric(18,2) not null default 0,
  fee numeric(18,2) not null default 0,
  net_amount numeric(18,2) not null default 0,
  note text,
  user_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bank_statement_daily (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  bank text,
  account_no text not null,
  deposit_total numeric(18,2) not null default 0,
  withdraw_total numeric(18,2) not null default 0,
  fee_total numeric(18,2) not null default 0,
  ending_balance numeric(18,2) not null default 0,
  failed_amount numeric(18,2) not null default 0,
  failed_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (date, account_no)
);

create table if not exists public.payout_followups (
  id uuid primary key default gen_random_uuid(),
  payout_item_id text not null unique,
  followup_status text not null default 'pending' check (followup_status in ('paid', 'pending')),
  followup_paid_at timestamptz,
  followup_paid_by text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bot_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null unique,
  ticket_number text,
  merchant text,
  merchant_email text,
  subject text,
  category text,
  priority text,
  status text,
  created_at_source timestamptz,
  last_reply_at timestamptz,
  last_reply_by text,
  link text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bot_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  time time,
  job text not null,
  status text not null,
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists public.safewallet_transactions (
  id uuid primary key default gen_random_uuid(),
  source_ref text not null unique,
  date date not null,
  time time,
  merchant text,
  amount numeric(18,6) not null default 0,
  status text,
  note text,
  created_at_source timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transfers_date_idx on public.transfers (date);
create index if not exists crypto_transactions_date_idx on public.crypto_transactions (date);
create index if not exists balances_date_idx on public.balances (date);
create index if not exists expenses_date_idx on public.expenses (date);
create index if not exists bogo2pay_transactions_date_idx on public.bogo2pay_transactions (date);
create index if not exists bank_statement_daily_date_idx on public.bank_statement_daily (date);
create index if not exists payout_followups_item_idx on public.payout_followups (payout_item_id);
create index if not exists bot_logs_date_idx on public.bot_logs (date);

alter table public.app_users enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.crypto_accounts enable row level security;
alter table public.transfers enable row level security;
alter table public.crypto_transactions enable row level security;
alter table public.balances enable row level security;
alter table public.expenses enable row level security;
alter table public.bogo2pay_transactions enable row level security;
alter table public.bank_statement_daily enable row level security;
alter table public.payout_followups enable row level security;
alter table public.bot_tickets enable row level security;
alter table public.bot_logs enable row level security;
alter table public.safewallet_transactions enable row level security;

-- Phase 1 access model: all reads/writes go through Vercel server routes using
-- SUPABASE_SERVICE_ROLE_KEY. Do not add anon/authenticated policies until the
-- browser auth model is finalized.
