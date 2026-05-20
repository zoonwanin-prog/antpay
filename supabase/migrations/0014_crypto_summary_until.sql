create or replace function public.crypto_summary_until(target_date date)
returns table (
  buy_usdt numeric,
  buy_thb numeric,
  withdraw_usdt numeric,
  withdraw_thb numeric,
  transfer_usdt numeric,
  transfer_thb numeric,
  sell_usdt numeric,
  sell_thb numeric,
  cumulative_usdt numeric,
  cumulative_thb numeric,
  day_count bigint
)
language sql
stable
set search_path = public
as $$
  with filtered as (
    select
      date,
      status,
      coalesce(usdt, 0) as usdt,
      coalesce(amount_thb, 0) as amount_thb
    from public.crypto_transactions
    where date <= target_date
  )
  select
    coalesce(sum(usdt) filter (where date = target_date and status = 'ซื้อ USDT'), 0) as buy_usdt,
    coalesce(sum(amount_thb) filter (where date = target_date and status = 'ซื้อ USDT'), 0) as buy_thb,
    coalesce(sum(usdt) filter (where date = target_date and status = 'ถอน USDT'), 0) as withdraw_usdt,
    coalesce(sum(amount_thb) filter (where date = target_date and status = 'ถอน USDT'), 0) as withdraw_thb,
    coalesce(sum(usdt) filter (where date = target_date and status = 'โอน USDT'), 0) as transfer_usdt,
    coalesce(sum(amount_thb) filter (where date = target_date and status = 'โอน USDT'), 0) as transfer_thb,
    coalesce(sum(usdt) filter (where date = target_date and status = 'ขาย USDT'), 0) as sell_usdt,
    coalesce(sum(amount_thb) filter (where date = target_date and status = 'ขาย USDT'), 0) as sell_thb,
    coalesce(sum(
      case
        when status = 'ซื้อ USDT' then usdt
        when status in ('ขาย USDT', 'ถอน USDT', 'โอน USDT') then -usdt
        else 0
      end
    ), 0) as cumulative_usdt,
    coalesce(sum(
      case
        when status = 'ซื้อ USDT' then amount_thb
        when status in ('ขาย USDT', 'ถอน USDT', 'โอน USDT') then -amount_thb
        else 0
      end
    ), 0) as cumulative_thb,
    count(*) filter (where date = target_date) as day_count
  from filtered;
$$;

revoke all on function public.crypto_summary_until(date) from public;
grant execute on function public.crypto_summary_until(date) to service_role;
