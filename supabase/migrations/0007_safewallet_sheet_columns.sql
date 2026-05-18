alter table public.safewallet_transactions add column if not exists account_name text;
alter table public.safewallet_transactions add column if not exists amount_thb numeric(18,2) not null default 0;
alter table public.safewallet_transactions add column if not exists fee_percent numeric(9,4) not null default 0;
alter table public.safewallet_transactions add column if not exists fee_amount numeric(18,2) not null default 0;
alter table public.safewallet_transactions add column if not exists net_thb numeric(18,2) not null default 0;
alter table public.safewallet_transactions add column if not exists user_name text;

update public.safewallet_transactions
set
  account_name = coalesce(account_name, merchant),
  amount_thb = case when amount_thb = 0 then round(amount::numeric, 2) else amount_thb end,
  net_thb = case when net_thb = 0 then round((amount - fee_amount)::numeric, 2) else net_thb end
where account_name is null or amount_thb = 0 or net_thb = 0;

create index if not exists safewallet_transactions_account_idx
  on public.safewallet_transactions (account_name);
