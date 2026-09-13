-- Job creation and its transactional coupling to credit spending.
begin;
select plan(9);

insert into auth.users (id, email, instance_id, aud, role)
values (
  '44444444-4444-4444-8444-444444444444',
  'chopper@example.com',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated'
);

-- A new user has exactly one chop of credits.
select is(
  (select balance from credit_balances
   where user_id = '44444444-4444-4444-8444-444444444444'),
  8,
  'the signup grant covers exactly one chop'
);

select is(
  (select balance from create_job(
    '44444444-4444-4444-8444-444444444444', 'upload', null,
    'uploads/a.wav', 'dusty, melancholy, chop the horns')),
  0,
  'creating a job spends the chop cost'
);

select is(
  (select count(*)::integer from jobs
   where user_id = '44444444-4444-4444-8444-444444444444'),
  1,
  'the job row exists'
);

select is(
  (select reason from credit_ledger
   where user_id = '44444444-4444-4444-8444-444444444444'
     and reason in ('chop', 'retry')),
  'chop',
  'a first chop is recorded as a chop'
);

-- The balance is now zero, so a second job must fail and must not leave a
-- row behind. This is the property the single transaction exists for.
select throws_ok(
  $$select create_job(
      '44444444-4444-4444-8444-444444444444', 'upload', null,
      'uploads/b.wav', 'again')$$,
  null,
  null,
  'a job cannot be created without credits'
);

select is(
  (select count(*)::integer from jobs
   where user_id = '44444444-4444-4444-8444-444444444444'),
  1,
  'the failed attempt rolled back its job row rather than orphaning it'
);

select throws_ok(
  $$select create_job(
      '44444444-4444-4444-8444-444444444444', 'youtube', null, null, 'no url')$$,
  null,
  null,
  'a youtube job without a url is rejected'
);

select throws_ok(
  $$select create_job(
      '44444444-4444-4444-8444-444444444444', 'upload', null,
      'uploads/c.wav', '   ')$$,
  null,
  null,
  'a blank prompt is rejected'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.create_job(uuid,text,text,text,text,uuid)',
    'execute'),
  false,
  'a signed-in user cannot create jobs directly and skip the API'
);

select finish();
rollback;
