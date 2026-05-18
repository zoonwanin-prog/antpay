update public.safewallet_transactions
set
  fee_percent = fee_percent * 100,
  fee_amount = round((amount_thb * (fee_percent * 100) / 100)::numeric, 2),
  net_thb = round((amount_thb - (amount_thb * (fee_percent * 100) / 100))::numeric, 2)
where fee_percent > 0 and fee_percent <= 1;
