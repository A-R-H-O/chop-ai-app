-- The stale job sweeper, the concurrency cap, and the retention policy.
begin;
select plan(16);

insert into auth.users (id, email, instance_id, aud, role)
values (
  '55555555-5555-4555-8555-555555555555',
  'stuck@example.com',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated'
);

-- Enough to run several chops without the balance being what stops us.
insert into credit_ledger (user_id, delta, reason)
values ('55555555-5555-4555-8555-555555555555', 100, 'purchase');
update credit_balances set balance = balance + 100
where user_id = '55555555-5555-4555-8555-555555555555';


-- ---------------------------------------------------------------------
-- The sweeper
-- ---------------------------------------------------------------------

select is(
  stale_job_after(),
  interval '16 minutes',
  'a job is stale once it outlives the modal timeout of 900 seconds'
);

select ok(
  stale_job_after() > interval '15 minutes',
  'the sweeper waits for modal to have given up before deciding it did'
);

-- A job that is genuinely still working.
select lives_ok(
  $$select create_job(
      '55555555-5555-4555-8555-555555555555', 'upload', null,
      'x/fresh.wav', 'still going')$$,
  'a fresh job is created normally'
);

select is(
  reconcile_stale_jobs(),
  0,
  'the sweeper leaves a job that is still inside its window alone'
);

-- Age that job past the window, as a container killed at its timeout
-- would leave it: still marked running, never updated again.
update jobs
set created_at = now() - interval '20 minutes', status = 'running'
where user_id = '55555555-5555-4555-8555-555555555555';

select is(
  (select balance from credit_balances
   where user_id = '55555555-5555-4555-8555-555555555555'),
  100,
  'the credits are gone while the job is stuck'
);

select is(
  reconcile_stale_jobs(),
  1,
  'the sweeper finds the job that died without saying so'
);

select is(
  (select status from jobs
   where user_id = '55555555-5555-4555-8555-555555555555'),
  'failed',
  'a swept job is marked failed rather than left running forever'
);

select is(
  (select balance from credit_balances
   where user_id = '55555555-5555-4555-8555-555555555555'),
  108,
  'the credits come back'
);

select alike(
  (select error from jobs
   where user_id = '55555555-5555-4555-8555-555555555555'),
  '%credits have been returned%',
  'and the message the producer reads is now true'
);

select is(
  reconcile_stale_jobs(),
  0,
  'a second sweep finds nothing, so credits cannot be refunded twice'
);

select is(
  (select balance from credit_balances
   where user_id = '55555555-5555-4555-8555-555555555555'),
  108,
  'and the balance is unchanged by the second sweep'
);


-- ---------------------------------------------------------------------
-- The concurrency cap
-- ---------------------------------------------------------------------

select is(max_concurrent_jobs(), 3, 'three chops at once');

-- Clear the swept row so the count starts from nothing.
delete from jobs where user_id = '55555555-5555-4555-8555-555555555555';

select lives_ok(
  $$select create_job('55555555-5555-4555-8555-555555555555', 'upload', null,
      'x/1.wav', 'one');
    select create_job('55555555-5555-4555-8555-555555555555', 'upload', null,
      'x/2.wav', 'two');
    select create_job('55555555-5555-4555-8555-555555555555', 'upload', null,
      'x/3.wav', 'three')$$,
  'three concurrent chops are allowed'
);

select throws_ok(
  $$select create_job('55555555-5555-4555-8555-555555555555', 'upload', null,
      'x/4.wav', 'four')$$,
  'too many chops running',
  'a fourth is refused rather than spawning a fourth gpu container'
);

-- A zombie row must not lock the account out. Age the three past the
-- staleness window and the producer can chop again immediately, whether
-- or not the sweeper has got to them yet.
update jobs
set created_at = now() - interval '20 minutes'
where user_id = '55555555-5555-4555-8555-555555555555';

select lives_ok(
  $$select create_job('55555555-5555-4555-8555-555555555555', 'upload', null,
      'x/5.wav', 'five')$$,
  'a stale in-flight row does not count against the cap'
);


-- ---------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------

select is(
  (select count(*)::integer from expired_objects),
  0,
  'nothing is expired in an empty bucket'
);

rollback;
