update public.crypto_transactions
set time = (time + interval '7 hours')::time,
    updated_at = now()
where source_ref like 'settlement:%'
  and user_name = 'cron'
  and time is not null;
