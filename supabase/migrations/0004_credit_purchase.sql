-- Credits a completed LemonSqueezy purchase.
--
-- Idempotent by way of the unique partial index on credit_ledger
-- (order_id) where order_id is not null, shipped in 0001_schema.sql. A
-- replayed webhook raises unique_violation, which is caught and turned
-- into a no-op returning the current balance. A read-then-write check
-- would race against LemonSqueezy's concurrent retries.
--
-- The ledger insert comes first on purpose: it carries the unique index,
-- so it is what detects a replay. Updating the balance first would double
-- credit before the conflict surfaced.
create or replace function public.credit_purchase(
  p_user uuid,
  p_order_id text,
  p_pack text,
  p_credits integer,
  p_amount_cents integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_credits <= 0 then
    raise exception 'credits must be positive, got %', p_credits;
  end if;

  begin
    insert into credit_ledger (user_id, delta, reason, order_id)
    values (p_user, p_credits, 'purchase', p_order_id);
  exception
    when unique_violation then
      select balance into v_balance from credit_balances where user_id = p_user;
      return v_balance;
  end;

  insert into purchases (user_id, ls_order_id, pack, credits, amount_cents)
  values (p_user, p_order_id, p_pack, p_credits, p_amount_cents);

  update credit_balances
  set balance = balance + p_credits,
      updated_at = now()
  where user_id = p_user
  returning balance into v_balance;

  return v_balance;
end;
$$;

revoke all on function
  public.credit_purchase(uuid, text, text, integer, integer)
  from public, anon, authenticated;
