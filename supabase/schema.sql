-------------------------------------------------------------
-- PROFILES (mirrors auth.users, auto-created on signup)
-------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text check (char_length(full_name) <= 100),
  created_at  timestamptz not null default now()
);

-- Auto-create profile on signup via trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, left(coalesce(new.raw_user_meta_data->>'full_name', ''), 100));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-------------------------------------------------------------
-- HOUSEHOLDS (the "couple" / tenant)
-------------------------------------------------------------
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Our Household'
              check (char_length(name) between 1 and 100),
  max_members int not null default 2
              check (max_members between 1 and 10),
  created_at  timestamptz not null default now()
);

-------------------------------------------------------------
-- HOUSEHOLD_MEMBERS (join table: user <-> household)
-------------------------------------------------------------
create table public.household_members (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  display_name    text not null
                  check (char_length(display_name) between 1 and 50),
  role            text not null default 'member' check (role in ('owner', 'member')),
  created_at      timestamptz not null default now(),
  unique (household_id, user_id)
);

create index idx_household_members_user on public.household_members(user_id);
create index idx_household_members_household on public.household_members(household_id);

-------------------------------------------------------------
-- INVITES (one-time-use seat invitations)
-------------------------------------------------------------
create table public.invites (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  seat_number   int not null check (seat_number between 2 and 10),
  invite_code   text not null default encode(gen_random_bytes(6), 'hex'),
  invited_email text default null
                check (invited_email is null or char_length(invited_email) <= 255),
  status        text not null default 'pending'
                check (status in ('pending', 'used', 'revoked')),
  used_by       uuid references public.profiles(id),
  used_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (household_id, seat_number)
);

-- Only one active (pending) invite code can exist per code value
create unique index idx_invites_active_code on public.invites(invite_code) where status = 'pending';

-- Fast lookups
create index idx_invites_household on public.invites(household_id);

-------------------------------------------------------------
-- CATEGORIES (per-household)
-------------------------------------------------------------
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  name          text not null
                check (char_length(name) between 1 and 50),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  unique (household_id, name)
);

create index idx_categories_household on public.categories(household_id);

-------------------------------------------------------------
-- TRANSACTIONS
-------------------------------------------------------------
create table public.transactions (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  date            date not null,
  description     text not null
                  check (char_length(description) between 1 and 500),
  amount          numeric(12,2) not null
                  check (amount >= 0 and amount < 100000000),
  paid_by         uuid not null references public.household_members(id),
  category        text not null default 'other'
                  check (char_length(category) between 1 and 50),
  expense_type    text not null default 'shared' check (expense_type in ('shared', 'personal')),
  payment_method  text not null default 'debit_card'
                  check (payment_method in ('cash','debit_card','credit_card','bizum','bank_transfer','revolut','other')),
  is_income       boolean not null default false,
  notes           text not null default ''
                  check (char_length(notes) <= 1000),
  source          text not null default 'manual'
                  check (char_length(source) <= 50),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_transactions_household on public.transactions(household_id);
create index idx_transactions_date on public.transactions(household_id, date desc);

-- Auto-update updated_at
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
  before update on public.transactions
  for each row execute function public.update_updated_at();

-------------------------------------------------------------
-- BUDGETS (monthly spending limits per category)
-------------------------------------------------------------
create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  category      text not null
                check (char_length(category) between 1 and 50),
  amount_limit  numeric(12,2) not null
                check (amount_limit > 0 and amount_limit < 100000000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, category)
);

create index idx_budgets_household on public.budgets(household_id);

create trigger set_budgets_updated_at
  before update on public.budgets
  for each row execute function public.update_updated_at();
