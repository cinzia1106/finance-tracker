alter table public.transactions
add column if not exists account_name text not null default '',
add column if not exists to_account_name text,
add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null,
add column if not exists raw_payload jsonb not null default '{}'::jsonb;

create index if not exists transactions_user_import_batch_idx
on public.transactions(user_id, import_batch_id);
