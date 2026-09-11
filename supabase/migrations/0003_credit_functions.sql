create extension if not exists pgtap with schema extensions;

-- Cost constants. Mirrored in lib/credits/constants.ts, with both sides
-- asserted in their own test suites so a one-sided change fails twice.
create or replace function public.chop_cost() returns integer
  language sql immutable parallel safe as $$ select 8 $$;

create or replace function public.daily_grant() returns integer
  language sql immutable parallel safe as $$ select 8 $$;

-- Tops the balance up to the daily grant if today's grant has not been
-- applied. Tops up rather than adds, so a dormant account does not accrue
-- a week of credits, and a purchased balance above the grant is never
-- reduced. Takes the row lock, so concurrent callers serialize and a
-- double grant is impossible. Lazy rather than scheduled: there is no cron
-- to operate, and reading any page is what lands the grant.
create or replace function public.apply_daily_grant(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_last date;
  v_grant integer := daily_grant();
begin
  select balance, last_grant_date into v_balance, v_last
  from credit_balances
  where user_id = p_user
  for update;

  if not found then
    raise exception 'no credit balance for user %', p_user;
  end if;

  if v_last is null or v_last < current_date then
    if v_balance < v_grant then
      insert into credit_ledger (user_id, delta, reason)
      values (p_user, v_grant - v_balance, 'daily_grant');
      v_balance := v_grant;
    end if;

    update credit_balances
    set balance = v_balance,
        last_grant_date = current_date,
        updated_at = now()
    where user_id = p_user;
  end if;

  return v_balance;
end;
$$;

-- Debits the cost and writes the ledger row. Intended to be called in the
-- same transaction that inserts the job, so a job cannot exist unpaid and
-- credits cannot be taken without a job.
create or replace function public.spend_credits(
  p_user uuid,
  p_cost integer,
  p_reason text,
  p_job uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_reason not in ('chop', 'retry') then
    raise exception 'spend_credits reason must be chop or retry, got %', p_reason;
  end if;

  if p_cost <> chop_cost() then
    raise exception 'cost % does not match chop_cost() %', p_cost, chop_cost();
  end if;

  v_balance := apply_daily_grant(p_user);

  if v_balance < p_cost then
    raise exception 'insufficient credits: have %, need %', v_balance, p_cost;
  end if;

  update credit_balances
  set balance = balance - p_cost,
      updated_at = now()
  where user_id = p_user
  returning balance into v_balance;

  insert into credit_ledger (user_id, delta, reason, job_id)
  values (p_user, -p_cost, p_reason, p_job);

  return v_balance;
end;
$$;

-- Returns the credits spent on a failed job. Idempotent by way of the
-- unique partial index on credit_ledger (job_id) where reason = 'refund':
-- a second call raises unique_violation, which is caught and turned into a
-- no-op returning the current balance. A read-then-write guard would race.
create or replace function public.refund_credits(p_job uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_spent integer;
  v_balance integer;
begin
  select user_id, -delta into v_user, v_spent
  from credit_ledger
  where job_id = p_job and reason in ('chop', 'retry');

  if v_user is null then
    raise exception 'no spend ledger entry for job %', p_job;
  end if;

  begin
    insert into credit_ledger (user_id, delta, reason, job_id)
    values (v_user, v_spent, 'refund', p_job);
  exception
    when unique_violation then
      select balance into v_balance from credit_balances where user_id = v_user;
      return v_balance;
  end;

  update credit_balances
  set balance = balance + v_spent,
      updated_at = now()
  where user_id = v_user
  returning balance into v_balance;

  return v_balance;
end;
$$;

-- Seeds a profile, a balance, and the opening grant when a user signs up,
-- so a new account can chop immediately.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);

  insert into public.credit_balances (user_id, balance, last_grant_date)
  values (new.id, daily_grant(), current_date);

  insert into public.credit_ledger (user_id, delta, reason)
  values (new.id, daily_grant(), 'daily_grant');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- security definer functions run with the owner's privileges, so leaving
-- these callable by authenticated would let any signed-in user grant
-- themselves credits by passing someone else's uuid to the RPC.
revoke all on function public.spend_credits(uuid, integer, text, uuid)
  from public, anon, authenticated;
revoke all on function public.refund_credits(uuid)
  from public, anon, authenticated;
revoke all on function public.apply_daily_grant(uuid)
  from public, anon, authenticated;
