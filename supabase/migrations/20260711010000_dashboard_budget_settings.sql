alter table public.user_settings
add column if not exists dashboard_budgets jsonb not null default '{
  "生活": 11500,
  "交通": 1500,
  "娛樂": 3000,
  "其他": 1000
}'::jsonb;

update public.user_settings
set dashboard_budgets = '{
  "生活": 11500,
  "交通": 1500,
  "娛樂": 3000,
  "其他": 1000
}'::jsonb
where dashboard_budgets is null;
