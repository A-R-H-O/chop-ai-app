-- Purchase crediting and webhook replay.
begin;
select plan(6);

insert into auth.users (id, email, instance_id, aud, role)
values (
  '33333333-3333-4333-8333-333333333333',
  'buyer@example.com',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated'
);

select is(
  credit_purchase(
    '33333333-3333-4333-8333-333333333333', 'ord_1', '300', 300, 900),
  308,
  'a 300 pack adds to the signup grant rather than replacing it'
);

select is(
  credit_purchase(
    '33333333-3333-4333-8333-333333333333', 'ord_1', '300', 300, 900),
  308,
  'a replayed webhook for the same order is a no-op'
);

select is(
  (select count(*)::integer from purchases where ls_order_id = 'ord_1'),
  1,
  'the replay did not write a second purchase row'
);

select is(
  (select count(*)::integer from credit_ledger where order_id = 'ord_1'),
  1,
  'the replay did not write a second ledger row'
);

select is(
  credit_purchase(
    '33333333-3333-4333-8333-333333333333', 'ord_2', '100', 100, 400),
  408,
  'a different order credits normally'
);

select throws_ok(
  $$select credit_purchase(
      '33333333-3333-4333-8333-333333333333', 'ord_3', '100', 0, 400)$$,
  null,
  null,
  'a zero-credit purchase is rejected rather than silently recorded'
);

select finish();
rollback;
