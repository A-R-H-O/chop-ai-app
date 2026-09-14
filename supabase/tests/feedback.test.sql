-- Getting credits back for a chop that worked but was not it.
begin;
select plan(14);

insert into auth.users (id, email, instance_id, aud, role)
values
  ('88888888-8888-4888-8888-888888888888', 'picky@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('99999999-9999-4999-8999-999999999999', 'other@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into credit_ledger (user_id, delta, reason)
values ('88888888-8888-4888-8888-888888888888', 200, 'purchase');
update credit_balances set balance = balance + 200
where user_id = '88888888-8888-4888-8888-888888888888';

select is(max_rejections_per_day(), 3, 'three rejections a day');

-- A chop that finished.
select create_job('88888888-8888-4888-8888-888888888888', 'upload', null,
  'x/a.wav', 'pgtap reject: horns');
update jobs set status = 'done'
where user_id = '88888888-8888-4888-8888-888888888888';

select is(
  (select balance from credit_balances
   where user_id = '88888888-8888-4888-8888-888888888888'),
  200,
  'the chop was paid for'
);

select lives_ok(
  $$select reject_chop(
      '88888888-8888-4888-8888-888888888888',
      (select id from jobs where user_id = '88888888-8888-4888-8888-888888888888'),
      'gave me the hi hats, i asked for the horns')$$,
  'a chop that came out wrong can be rejected'
);

select is(
  (select balance from credit_balances
   where user_id = '88888888-8888-4888-8888-888888888888'),
  208,
  'and the credits come back'
);

select is(
  (select rejected_reason from jobs
   where user_id = '88888888-8888-4888-8888-888888888888'),
  'gave me the hi hats, i asked for the horns',
  'the reason is kept, which is the part worth having'
);

select throws_ok(
  $$select reject_chop(
      '88888888-8888-4888-8888-888888888888',
      (select id from jobs where user_id = '88888888-8888-4888-8888-888888888888'),
      'again')$$,
  'you already got the credits back for that chop',
  'the same chop cannot be rejected twice'
);

select is(
  (select balance from credit_balances
   where user_id = '88888888-8888-4888-8888-888888888888'),
  208,
  'so the balance cannot be farmed by rejecting on a loop'
);

-- Somebody else's chop.
select create_job('99999999-9999-4999-8999-999999999999', 'upload', null,
  'y/b.wav', 'pgtap reject: other account');
update jobs set status = 'done'
where user_id = '99999999-9999-4999-8999-999999999999';

select throws_ok(
  $$select reject_chop(
      '88888888-8888-4888-8888-888888888888',
      (select id from jobs where user_id = '99999999-9999-4999-8999-999999999999'),
      'refunding someone else')$$,
  'no such chop',
  'one account cannot reject another account''s chop'
);

select is(
  (select balance from credit_balances
   where user_id = '99999999-9999-4999-8999-999999999999'),
  0,
  'and that account keeps its own balance untouched'
);

-- A chop still running has not produced anything to judge.
select create_job('88888888-8888-4888-8888-888888888888', 'upload', null,
  'x/c.wav', 'pgtap reject: unfinished');

select throws_ok(
  $$select reject_chop(
      '88888888-8888-4888-8888-888888888888',
      (select id from jobs where user_id = '88888888-8888-4888-8888-888888888888'
       and status = 'queued'),
      'too soon')$$,
  'that chop did not finish, so it was already refunded',
  'an unfinished chop is refused rather than double refunded'
);

-- The daily ceiling.
update jobs set status = 'done'
where user_id = '88888888-8888-4888-8888-888888888888' and status = 'queued';

select create_job('88888888-8888-4888-8888-888888888888', 'upload', null,
  'x/d.wav', 'pgtap reject: third');
select create_job('88888888-8888-4888-8888-888888888888', 'upload', null,
  'x/e.wav', 'pgtap reject: fourth');
update jobs set status = 'done'
where user_id = '88888888-8888-4888-8888-888888888888' and status = 'queued';

select lives_ok(
  $$select reject_chop('88888888-8888-4888-8888-888888888888',
      (select id from jobs where user_id = '88888888-8888-4888-8888-888888888888'
       and rejected_at is null and prompt = 'pgtap reject: unfinished'), null);
    select reject_chop('88888888-8888-4888-8888-888888888888',
      (select id from jobs where user_id = '88888888-8888-4888-8888-888888888888'
       and rejected_at is null and prompt = 'pgtap reject: third'), null)$$,
  'a second and third rejection are allowed'
);

select throws_ok(
  $$select reject_chop('88888888-8888-4888-8888-888888888888',
      (select id from jobs where user_id = '88888888-8888-4888-8888-888888888888'
       and rejected_at is null and prompt = 'pgtap reject: fourth'), null)$$,
  'too many rejections today',
  'the fourth is refused, so this is not a free chop machine'
);

-- Scoped to this test's prompts rather than counting the whole view:
-- the view is global by design and any other rejection in the database
-- would otherwise fail this.
select is(
  (select count(*)::integer from chop_rejections
   where prompt in ('pgtap reject: horns', 'pgtap reject: unfinished', 'pgtap reject: third')),
  3,
  'every rejection shows up where the model failures can be read'
);

select is(
  (select rejected_reason from chop_rejections
   where prompt = 'pgtap reject: horns'),
  'gave me the hi hats, i asked for the horns',
  'the view puts the reason next to the prompt that produced it'
);

rollback;
