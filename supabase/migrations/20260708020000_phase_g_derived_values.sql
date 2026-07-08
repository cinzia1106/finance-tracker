create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  emergency_fund_months integer not null default 3 check (emergency_fund_months between 1 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own"
on public.user_settings for select
using (user_id = auth.uid());

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own"
on public.user_settings for insert
with check (user_id = auth.uid());

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own"
on public.user_settings for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into public.user_settings (user_id)
select id
from public.profiles
on conflict (user_id) do nothing;
