alter table public.bot_logs add column if not exists inserted integer not null default 0;
alter table public.bot_logs add column if not exists updated integer not null default 0;
alter table public.bot_logs add column if not exists scanned integer not null default 0;
alter table public.bot_logs add column if not exists skipped integer not null default 0;
alter table public.bot_logs add column if not exists error text;
alter table public.bot_logs add column if not exists duration_ms integer;
alter table public.bot_logs add column if not exists started_at timestamptz;
alter table public.bot_logs add column if not exists finished_at timestamptz;

create index if not exists bot_logs_job_created_idx on public.bot_logs (job, created_at desc);
create index if not exists bot_logs_status_created_idx on public.bot_logs (status, created_at desc);
