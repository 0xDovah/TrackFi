-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.invites enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

-------------------------------------------------------------
-- Helper function: get the household_id for the current user
-------------------------------------------------------------
create or replace function public.get_user_household_id()
returns uuid as $$
  select household_id from public.household_members
  where user_id = auth.uid()
  limit 1;
$$ language sql security definer stable;

-------------------------------------------------------------
-- PROFILES policies
-------------------------------------------------------------
create policy "Users can view own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "Users can update own profile"
  on public.profiles for update
  using (id = auth.uid());

-------------------------------------------------------------
-- HOUSEHOLDS policies
-------------------------------------------------------------
-- Members can view their own household
create policy "Members can view household"
  on public.households for select
  using (id = public.get_user_household_id());

-- FIX #5: Only users WITHOUT an existing household can create one (prevents spam)
create policy "Users without household can create one"
  on public.households for insert
  with check (
    auth.uid() is not null
    and public.get_user_household_id() is null
  );

-- Owner can update household
create policy "Owner can update household"
  on public.households for update
  using (
    id in (
      select household_id from public.household_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-------------------------------------------------------------
-- HOUSEHOLD_MEMBERS policies
-------------------------------------------------------------
-- Members can view co-members of their household
create policy "Members can view household members"
  on public.household_members for select
  using (household_id = public.get_user_household_id());

-- FIX #1: Tighten INSERT to only allow inserting yourself as OWNER
-- of a household you just created (no existing membership).
-- Joining via invite code goes through the secure RPC function instead.
create policy "Users can create initial membership as owner"
  on public.household_members for insert
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and public.get_user_household_id() is null
  );

-- FIX #2: Only allow updating display_name (not role or household_id)
-- Uses WITH CHECK to ensure role and household_id remain unchanged
create policy "Members can update own display name"
  on public.household_members for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and role = (select hm.role from public.household_members hm where hm.id = id)
    and household_id = (select hm.household_id from public.household_members hm where hm.id = id)
  );

-------------------------------------------------------------
-- INVITES policies
-------------------------------------------------------------
-- Household members can view their household's invites
create policy "Members can view invites"
  on public.invites for select
  using (household_id = public.get_user_household_id());

-- Only owner can manage invites (belt-and-suspenders; main ops via RPC)
create policy "Owner can manage invites"
  on public.invites for all
  using (
    household_id in (
      select household_id from public.household_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-------------------------------------------------------------
-- RPC: Create household with seats (replaces direct INSERT)
-------------------------------------------------------------
create or replace function public.create_household_with_seats(
  household_name text,
  owner_display_name text,
  seat_count int
) returns json as $$
declare
  new_household_id uuid;
  i int;
begin
  -- Validate
  if seat_count < 1 or seat_count > 10 then
    raise exception 'Seat count must be between 1 and 10';
  end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'You already belong to a household';
  end if;

  -- Create household
  insert into public.households (name, max_members)
  values (coalesce(nullif(trim(household_name), ''), 'Our Household'), seat_count)
  returning id into new_household_id;

  -- Add owner as seat 1
  insert into public.household_members (household_id, user_id, display_name, role)
  values (new_household_id, auth.uid(), trim(owner_display_name), 'owner');

  -- Create invite rows for seats 2..N
  for i in 2..seat_count loop
    insert into public.invites (household_id, seat_number)
    values (new_household_id, i);
  end loop;

  return json_build_object('household_id', new_household_id);
end;
$$ language plpgsql security definer;

-------------------------------------------------------------
-- RPC: Join household by consuming a one-time invite code
-------------------------------------------------------------
create or replace function public.join_household_by_invite(
  invite_code_input text,
  display_name_input text
) returns uuid as $$
declare
  target_invite public.invites%rowtype;
begin
  if trim(display_name_input) = '' then
    raise exception 'Display name is required';
  end if;
  if trim(invite_code_input) = '' then
    raise exception 'Invite code is required';
  end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'You already belong to a household';
  end if;

  -- Lock the invite row to prevent race conditions
  select * into target_invite
  from public.invites
  where invite_code = lower(trim(invite_code_input)) and status = 'pending'
  for update;

  if target_invite is null then
    raise exception 'Invalid or expired invite code';
  end if;

  -- If invite has an email restriction, validate it
  if target_invite.invited_email is not null then
    if (select email from auth.users where id = auth.uid()) != lower(trim(target_invite.invited_email)) then
      raise exception 'This invite is reserved for a different email address';
    end if;
  end if;

  -- Mark invite as used
  update public.invites
  set status = 'used', used_by = auth.uid(), used_at = now()
  where id = target_invite.id;

  -- Insert membership
  insert into public.household_members (household_id, user_id, display_name, role)
  values (target_invite.household_id, auth.uid(), trim(display_name_input), 'member');

  return target_invite.household_id;
end;
$$ language plpgsql security definer;

-------------------------------------------------------------
-- RPC: Regenerate invite code (owner only, pending/revoked)
-------------------------------------------------------------
create or replace function public.regenerate_invite(invite_id uuid)
returns text as $$
declare
  new_code text;
  target_invite public.invites%rowtype;
begin
  select * into target_invite from public.invites where id = invite_id for update;

  if target_invite is null then
    raise exception 'Invite not found';
  end if;

  -- Verify caller is owner of this household
  if not exists (
    select 1 from public.household_members
    where household_id = target_invite.household_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the household owner can regenerate invites';
  end if;

  if target_invite.status = 'used' then
    raise exception 'Cannot regenerate a used invite';
  end if;

  new_code := encode(gen_random_bytes(6), 'hex');
  update public.invites set invite_code = new_code, status = 'pending' where id = invite_id;
  return new_code;
end;
$$ language plpgsql security definer;

-------------------------------------------------------------
-- RPC: Update invite email (owner only, pending invites)
-------------------------------------------------------------
create or replace function public.update_invite_email(invite_id uuid, email_input text)
returns void as $$
declare
  target_invite public.invites%rowtype;
begin
  select * into target_invite from public.invites where id = invite_id;

  if target_invite is null then raise exception 'Invite not found'; end if;
  if target_invite.status != 'pending' then raise exception 'Can only update pending invites'; end if;

  if not exists (
    select 1 from public.household_members
    where household_id = target_invite.household_id and user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'Only the household owner can update invites';
  end if;

  update public.invites
  set invited_email = nullif(lower(trim(email_input)), '')
  where id = invite_id;
end;
$$ language plpgsql security definer;

-------------------------------------------------------------
-- Trigger to prevent role escalation
-- Belt-and-suspenders: even if someone bypasses the RLS WITH CHECK,
-- this trigger prevents changing role after initial insert.
-------------------------------------------------------------
create or replace function public.prevent_role_change()
returns trigger as $$
begin
  if new.role <> old.role then
    raise exception 'Role cannot be changed';
  end if;
  if new.household_id <> old.household_id then
    raise exception 'Household cannot be changed';
  end if;
  if new.user_id <> old.user_id then
    raise exception 'User ID cannot be changed';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger enforce_membership_immutable_fields
  before update on public.household_members
  for each row execute function public.prevent_role_change();

-------------------------------------------------------------
-- BUDGETS policies
-------------------------------------------------------------
alter table public.budgets enable row level security;

create policy "Members can view budgets"
  on public.budgets for select
  using (household_id = public.get_user_household_id());

create policy "Members can insert budgets"
  on public.budgets for insert
  with check (household_id = public.get_user_household_id());

create policy "Members can update budgets"
  on public.budgets for update
  using (household_id = public.get_user_household_id());

create policy "Members can delete budgets"
  on public.budgets for delete
  using (household_id = public.get_user_household_id());

-------------------------------------------------------------
-- CATEGORIES policies
-------------------------------------------------------------
create policy "Members can view categories"
  on public.categories for select
  using (household_id = public.get_user_household_id());

create policy "Members can insert categories"
  on public.categories for insert
  with check (household_id = public.get_user_household_id());

create policy "Members can update categories"
  on public.categories for update
  using (household_id = public.get_user_household_id());

create policy "Members can delete categories"
  on public.categories for delete
  using (household_id = public.get_user_household_id());

-------------------------------------------------------------
-- TRANSACTIONS policies
-------------------------------------------------------------
create policy "Members can view transactions"
  on public.transactions for select
  using (household_id = public.get_user_household_id());

create policy "Members can insert transactions"
  on public.transactions for insert
  with check (household_id = public.get_user_household_id());

create policy "Members can update transactions"
  on public.transactions for update
  using (household_id = public.get_user_household_id());

create policy "Members can delete transactions"
  on public.transactions for delete
  using (household_id = public.get_user_household_id());
