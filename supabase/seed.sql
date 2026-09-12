-- Local development seed. Runs on every `supabase db reset`.
--
-- Exists so the credit path is exercisable without completing a Google
-- OAuth round trip, and so a reset does not mean re-signing-in by hand.
-- Inserting into auth.users fires handle_new_user, which seeds the
-- profile, the balance, and the opening daily grant, so this one insert
-- gives a user with exactly one chop of credits.
--
-- Never applied to a hosted project: `supabase db push` only runs
-- migrations, not this file.

insert into auth.users (id, email, instance_id, aud, role)
values (
  '00000000-0000-4000-8000-000000000001',
  'dev@chop.local',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated'
);
