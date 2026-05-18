alter table public.transfers add column if not exists import_key text unique;
alter table public.crypto_transactions add column if not exists import_key text unique;
alter table public.balances add column if not exists import_key text unique;
alter table public.expenses add column if not exists import_key text unique;
alter table public.bogo2pay_transactions add column if not exists import_key text unique;
alter table public.bank_statement_daily add column if not exists import_key text unique;
alter table public.safewallet_transactions add column if not exists import_key text unique;

create unique index if not exists transfers_import_key_idx on public.transfers (import_key) where import_key is not null;
create unique index if not exists crypto_transactions_import_key_idx on public.crypto_transactions (import_key) where import_key is not null;
create unique index if not exists balances_import_key_idx on public.balances (import_key) where import_key is not null;
create unique index if not exists expenses_import_key_idx on public.expenses (import_key) where import_key is not null;
create unique index if not exists bogo2pay_transactions_import_key_idx on public.bogo2pay_transactions (import_key) where import_key is not null;
create unique index if not exists bank_statement_daily_import_key_idx on public.bank_statement_daily (import_key) where import_key is not null;
create unique index if not exists safewallet_transactions_import_key_idx on public.safewallet_transactions (import_key) where import_key is not null;
