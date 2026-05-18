create table if not exists public.payout_items (
  id text primary key,
  value_date date not null,
  amount numeric(18,2) not null default 0,
  status text not null,
  recipient_name text,
  recipient_account_no text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payout_items_value_date_idx on public.payout_items (value_date);
create index if not exists payout_items_status_idx on public.payout_items (status);

alter table public.payout_items enable row level security;

-- Phase 1 reads happen from Vercel server routes through the service role key.
-- Add anon/authenticated policies later only after the browser auth model is finalized.
