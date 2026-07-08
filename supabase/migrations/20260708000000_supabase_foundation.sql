create extension if not exists pgcrypto;

create type public.account_type as enum ('cash', 'bank', 'credit_card', 'virtual');
create type public.transaction_type as enum ('expense', 'income', 'transfer');
create type public.transaction_status as enum ('confirmed', 'needs_review');
create type public.transaction_source as enum ('manual', 'import');
create type public.recurring_cycle as enum ('monthly', 'semiannual', 'yearly', 'irregular');
create type public.snapshot_source as enum ('manual_check', 'statement', 'import_derived');
create type public.import_batch_status as enum ('uploaded', 'processing', 'completed', 'failed');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type public.account_type not null,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  status public.import_batch_status not null default 'uploaded',
  file_name text,
  row_count integer not null default 0 check (row_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  to_account_id uuid,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  date date not null,
  type public.transaction_type not null,
  amount numeric(14, 2) not null,
  category text not null default '',
  note text not null default '',
  tags text[] not null default '{}',
  status public.transaction_status not null default 'confirmed',
  source public.transaction_source not null default 'manual',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id) references public.accounts(id) on delete set null,
  foreign key (to_account_id) references public.accounts(id) on delete set null
);

create table public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  payment_account_id uuid,
  name text not null,
  amount numeric(14, 2),
  cycle public.recurring_cycle not null,
  monthly_equivalent numeric(14, 2),
  category text not null default '',
  billing_day integer check (billing_day between 1 and 31),
  active boolean not null default true,
  last_paid date,
  next_due date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id) references public.accounts(id) on delete set null,
  foreign key (payment_account_id) references public.accounts(id) on delete set null
);

create table public.asset_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  date date not null,
  balance numeric(14, 2) not null,
  cost_basis numeric(14, 2),
  market_value numeric(14, 2),
  dividend_total numeric(14, 2),
  source public.snapshot_source not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id) references public.accounts(id) on delete set null
);

create table public.debt_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  name text not null,
  date date not null,
  remaining_balance numeric(14, 2) not null,
  monthly_payment numeric(14, 2),
  next_due_date date,
  source public.snapshot_source not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id) references public.accounts(id) on delete set null
);

create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_text text not null,
  category text not null,
  transaction_type public.transaction_type,
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sync_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  entity_table text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index accounts_user_id_idx on public.accounts(user_id);
create index transactions_user_date_idx on public.transactions(user_id, date desc);
create index transactions_user_status_idx on public.transactions(user_id, status);
create index recurring_items_user_next_due_idx on public.recurring_items(user_id, next_due);
create index asset_snapshots_user_date_idx on public.asset_snapshots(user_id, date desc);
create index debt_snapshots_user_date_idx on public.debt_snapshots(user_id, date desc);
create index import_batches_user_created_idx on public.import_batches(user_id, created_at desc);
create index category_rules_user_priority_idx on public.category_rules(user_id, priority);
create index sync_events_user_created_idx on public.sync_events(user_id, created_at desc);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger accounts_set_updated_at
before update on public.accounts
for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create trigger recurring_items_set_updated_at
before update on public.recurring_items
for each row execute function public.set_updated_at();

create trigger asset_snapshots_set_updated_at
before update on public.asset_snapshots
for each row execute function public.set_updated_at();

create trigger debt_snapshots_set_updated_at
before update on public.debt_snapshots
for each row execute function public.set_updated_at();

create trigger import_batches_set_updated_at
before update on public.import_batches
for each row execute function public.set_updated_at();

create trigger category_rules_set_updated_at
before update on public.category_rules
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring_items enable row level security;
alter table public.asset_snapshots enable row level security;
alter table public.debt_snapshots enable row level security;
alter table public.import_batches enable row level security;
alter table public.category_rules enable row level security;
alter table public.sync_events enable row level security;

create policy "profiles_select_own"
on public.profiles for select
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles for insert
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "accounts_select_own"
on public.accounts for select
using (user_id = auth.uid());

create policy "accounts_insert_own"
on public.accounts for insert
with check (user_id = auth.uid());

create policy "accounts_update_own"
on public.accounts for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "accounts_delete_own"
on public.accounts for delete
using (user_id = auth.uid());

create policy "transactions_select_own"
on public.transactions for select
using (user_id = auth.uid());

create policy "transactions_insert_own"
on public.transactions for insert
with check (user_id = auth.uid());

create policy "transactions_update_own"
on public.transactions for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "transactions_delete_own"
on public.transactions for delete
using (user_id = auth.uid());

create policy "recurring_items_select_own"
on public.recurring_items for select
using (user_id = auth.uid());

create policy "recurring_items_insert_own"
on public.recurring_items for insert
with check (user_id = auth.uid());

create policy "recurring_items_update_own"
on public.recurring_items for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "recurring_items_delete_own"
on public.recurring_items for delete
using (user_id = auth.uid());

create policy "asset_snapshots_select_own"
on public.asset_snapshots for select
using (user_id = auth.uid());

create policy "asset_snapshots_insert_own"
on public.asset_snapshots for insert
with check (user_id = auth.uid());

create policy "asset_snapshots_update_own"
on public.asset_snapshots for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "asset_snapshots_delete_own"
on public.asset_snapshots for delete
using (user_id = auth.uid());

create policy "debt_snapshots_select_own"
on public.debt_snapshots for select
using (user_id = auth.uid());

create policy "debt_snapshots_insert_own"
on public.debt_snapshots for insert
with check (user_id = auth.uid());

create policy "debt_snapshots_update_own"
on public.debt_snapshots for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "debt_snapshots_delete_own"
on public.debt_snapshots for delete
using (user_id = auth.uid());

create policy "import_batches_select_own"
on public.import_batches for select
using (user_id = auth.uid());

create policy "import_batches_insert_own"
on public.import_batches for insert
with check (user_id = auth.uid());

create policy "import_batches_update_own"
on public.import_batches for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "import_batches_delete_own"
on public.import_batches for delete
using (user_id = auth.uid());

create policy "category_rules_select_own"
on public.category_rules for select
using (user_id = auth.uid());

create policy "category_rules_insert_own"
on public.category_rules for insert
with check (user_id = auth.uid());

create policy "category_rules_update_own"
on public.category_rules for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "category_rules_delete_own"
on public.category_rules for delete
using (user_id = auth.uid());

create policy "sync_events_select_own"
on public.sync_events for select
using (user_id = auth.uid());

create policy "sync_events_insert_own"
on public.sync_events for insert
with check (user_id = auth.uid());

create policy "sync_events_update_own"
on public.sync_events for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "sync_events_delete_own"
on public.sync_events for delete
using (user_id = auth.uid());

create or replace function public.bootstrap_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_bootstrap_profile
after insert on auth.users
for each row execute function public.bootstrap_profile();
