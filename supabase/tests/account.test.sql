-- Taking your data out, and leaving.
begin;
select plan(14);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('66666666-6666-4666-8666-666666666666', 'leaving@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('77777777-7777-4777-8777-777777777777', 'staying@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- A bought pack, a chop, and a sample for the account that leaves.
select credit_purchase(
  '66666666-6666-4666-8666-666666666666', 'ls-order-1', '300', 300, 900);

select job_id from create_job(
  '66666666-6666-4666-8666-666666666666', 'upload', null,
  '66666666-6666-4666-8666-666666666666/track.wav', 'chop the horns');

insert into samples
  (job_id, name, stem, start_ms, end_ms, reason, storage_path, peaks, rank)
select id, 'chop 1', 'drums', 0, 2000, 'the horn stab', 'x/chop-1.wav',
       '[0.4,0.9,0.2]'::jsonb, 1
from jobs where user_id = '66666666-6666-4666-8666-666666666666';

-- And one for the account that stays, which nothing below may touch.
select credit_purchase(
  '77777777-7777-4777-8777-777777777777', 'ls-order-2', '100', 100, 400);
select job_id from create_job(
  '77777777-7777-4777-8777-777777777777', 'upload', null,
  '77777777-7777-4777-8777-777777777777/other.wav', 'not yours');


-- ---------------------------------------------------------------------
-- Export
-- ---------------------------------------------------------------------

select is(
  (export_account('66666666-6666-4666-8666-666666666666')
    -> 'credits' ->> 'balance')::integer,
  300,
  'the export states the balance'
);

select is(
  jsonb_array_length(
    export_account('66666666-6666-4666-8666-666666666666') -> 'chops'),
  1,
  'the export includes the chops'
);

select is(
  export_account('66666666-6666-4666-8666-666666666666')
    -> 'chops' -> 0 ->> 'prompt',
  'chop the horns',
  'including what was asked for, which is the part only they wrote'
);

select is(
  jsonb_array_length(
    export_account('66666666-6666-4666-8666-666666666666')
      -> 'chops' -> 0 -> 'samples'),
  1,
  'and the samples that came out'
);

select ok(
  jsonb_array_length(
    export_account('66666666-6666-4666-8666-666666666666')
      -> 'credits' -> 'ledger') >= 2,
  'the ledger covers the signup grant and the purchase'
);

-- The whole point of an export is that it is yours and only yours.
select is(
  export_account('66666666-6666-4666-8666-666666666666')
    -> 'chops' -> 0 ->> 'prompt',
  'chop the horns',
  'one account export never contains another account''s chop'
);

select is(
  jsonb_array_length(
    export_account('77777777-7777-4777-8777-777777777777') -> 'chops'),
  1,
  'and the other account exports only its own'
);


-- ---------------------------------------------------------------------
-- Deletion
-- ---------------------------------------------------------------------

select is(
  (delete_account('66666666-6666-4666-8666-666666666666')
    ->> 'jobs_deleted')::integer,
  1,
  'deletion reports what it removed'
);

select is(
  (select count(*)::integer from jobs
   where user_id = '66666666-6666-4666-8666-666666666666'),
  0,
  'the chops are gone'
);

select is(
  (select count(*)::integer from samples s
   where not exists (select 1 from jobs j where j.id = s.job_id)),
  0,
  'and the samples cascade with them'
);

select is(
  (select count(*)::integer from credit_balances
   where user_id = '66666666-6666-4666-8666-666666666666'),
  0,
  'the balance is gone'
);

select is(
  (select count(*)::integer from profiles
   where id = '66666666-6666-4666-8666-666666666666'),
  0,
  'and the profile'
);

-- The financial record outlives the account, without naming anybody.
select is(
  (select amount_cents from retained_purchases where order_id = 'ls-order-1'),
  900,
  'what they paid survives, so a chargeback has an answer'
);

-- Nothing here may reach across accounts.
select is(
  (select count(*)::integer from jobs
   where user_id = '77777777-7777-4777-8777-777777777777'),
  1,
  'the other account is untouched'
);

rollback;
