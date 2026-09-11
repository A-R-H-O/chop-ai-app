-- Behaviour of the credit functions.
begin;
select plan(10);

-- A user row in auth.users fires handle_new_user, which seeds the profile,
-- the balance, and the opening grant.
insert into auth.users (id, email, instance_id, aud, role)
values (
  '11111111-1111-1111-1111-111111111111',
  'producer@example.com',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated'
);

select is(chop_cost(), 8, 'a chop costs 8 credits');
select is(daily_grant(), 8, 'the daily grant is 8 credits');
select is(
  chop_cost(), daily_grant(),
  'the grant equals the chop cost, so the free tier buys exactly one chop'
);

select is(
  (select balance from credit_balances
   where user_id = '11111111-1111-1111-1111-111111111111'),
  8,
  'a new user starts with one chop of credits'
);

select is(
  (select count(*)::integer from credit_ledger
   where user_id = '11111111-1111-1111-1111-111111111111'
     and reason = 'daily_grant'),
  1,
  'signup writes exactly one grant ledger row'
);

insert into jobs (id, user_id, source_type, prompt)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'upload',
  'dusty, melancholy, chop the horns'
);

select is(
  spend_credits(
    '11111111-1111-1111-1111-111111111111', 8, 'chop',
    '22222222-2222-2222-2222-222222222222'
  ),
  0,
  'spending a chop leaves a zero balance'
);

select throws_ok(
  $$select spend_credits(
      '11111111-1111-1111-1111-111111111111', 8, 'chop', null)$$,
  null,
  null,
  'spending past the balance raises instead of going negative'
);

select is(
  refund_credits('22222222-2222-2222-2222-222222222222'),
  8,
  'refunding a failed job returns the credits'
);

select is(
  refund_credits('22222222-2222-2222-2222-222222222222'),
  8,
  'a second refund for the same job is a no-op'
);

-- Backdate the grant so the next read is eligible, and put the balance
-- above the grant to prove the top-up never reduces a purchased balance.
update credit_balances
set last_grant_date = current_date - 1, balance = 300
where user_id = '11111111-1111-1111-1111-111111111111';

select is(
  apply_daily_grant('11111111-1111-1111-1111-111111111111'),
  300,
  'the grant tops up to 8 and never reduces a larger purchased balance'
);

select finish();
rollback;
