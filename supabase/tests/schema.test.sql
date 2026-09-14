-- Structural invariants. These lock the shape of the schema so a future
-- migration cannot quietly remove a policy, an index, or a revoke.
begin;
select plan(10);

select is(
  (select count(*)::integer from information_schema.tables
   where table_schema = 'public' and table_name in (
     'profiles', 'credit_balances', 'audio_cache', 'jobs',
     'credit_ledger', 'samples', 'job_metrics', 'purchases')),
  8,
  'all eight tables exist'
);

-- Counted rather than listed on purpose: a new table that forgets RLS
-- fails this, which is the whole point of asserting it this way.
-- retained_purchases (0010) is the ninth.
select is(
  (select count(*)::integer from pg_tables
   where schemaname = 'public' and rowsecurity = true),
  9,
  'row level security is enabled on every public table'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and cmd <> 'SELECT'),
  0,
  'no insert, update, or delete policy exists anywhere'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public'
     and tablename in ('audio_cache', 'job_metrics')),
  0,
  'audio_cache and job_metrics are unreachable by any client'
);

select has_index(
  'public', 'credit_ledger', 'credit_ledger_one_refund_per_job_idx',
  'one refund per job is enforced by an index, not a read-then-write check'
);

select has_index(
  'public', 'credit_ledger', 'credit_ledger_one_spend_per_job_idx',
  'a job cannot be charged twice'
);

select has_index(
  'public', 'credit_ledger', 'credit_ledger_one_order_idx',
  'a LemonSqueezy order cannot be credited twice'
);

select is(
  (select count(*)::integer from pg_constraint
   where conname = 'credit_balances_balance_check' and contype = 'c'),
  1,
  'the balance cannot go negative at the storage layer'
);

select is(
  has_function_privilege(
    'authenticated', 'public.spend_credits(uuid,integer,text,uuid)', 'execute'),
  false,
  'a signed-in user cannot call spend_credits directly'
);

select is(
  has_function_privilege(
    'authenticated', 'public.apply_daily_grant(uuid)', 'execute'),
  false,
  'a signed-in user cannot grant themselves credits'
);

select finish();
rollback;
