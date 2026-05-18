drop index if exists public.payout_items_unique_key_idx;

create unique index if not exists payout_items_unique_key_idx
  on public.payout_items (unique_key);
