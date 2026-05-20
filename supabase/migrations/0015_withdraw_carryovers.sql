create table if not exists public.withdraw_carryovers (
  id uuid primary key default gen_random_uuid(),
  bo_date date not null,
  paid_date date not null,
  amount numeric(18,2) not null default 0,
  reason text not null default 'ธนาคารปิด',
  status text not null default 'paid' check (status in ('paid', 'pending', 'cancelled')),
  note text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists withdraw_carryovers_bo_date_idx on public.withdraw_carryovers (bo_date);
create index if not exists withdraw_carryovers_paid_date_idx on public.withdraw_carryovers (paid_date);

alter table public.withdraw_carryovers enable row level security;
