-- LOCAL-ONLY Supabase Auth fixture for the signed-in Playwright e2e specs
-- (tests/e2e/auth.setup.ts, tests/e2e/README.md). Loaded automatically by
-- `supabase start` / `supabase db reset` (the CLI's default
-- `[db.seed].sql_paths = ["./seed.sql"]`), never against a linked/remote
-- project.
--
-- NEVER run this against a non-local Supabase project: these are fixed,
-- low-entropy, publicly-known passwords for throwaway local test accounts.
--
-- Inserts two confirmed users directly into auth.users (GoTrue's own test
-- suite does the same thing for the same reason — see
-- github.com/supabase/auth internal/api/token_test.go — bypassing /signup
-- and its email/webhook side effects entirely) plus a matching
-- auth.identities row, which GoTrue's password sign-in path requires for
-- any account created some way other than the real /signup endpoint.
--
-- `extensions.crypt(password, extensions.gen_salt('bf'))` (pgcrypto, the
-- `extensions` schema the Supabase Postgres image installs it into)
-- produces the same bcrypt hash format GoTrue's own Go bcrypt verifier
-- reads from `encrypted_password` — so these accounts sign in through the
-- real `/api/auth/password` `signin` action exactly like any other.
--
-- Also pre-records age/legal consent (Ley N° 29733, src/lib/ageConsent.ts)
-- in `raw_app_meta_data.ageConsent` — that gate (src/middleware.ts) redirects
-- ANY signed-in, non-consented visitor to /auth/consentimiento before they
-- ever reach a gated section, which would otherwise swallow every signed-in
-- e2e spec regardless of its own assertions.
--
-- regular:   e2e-regular@chuyocode.test   / ChuyoE2E!2026
-- moderator: e2e-moderator@chuyocode.test / ChuyoE2E!2026 (+ user_roles row,
--            see 0008_user_roles.sql)

do $$
declare
  regular_id   uuid := '11111111-1111-1111-1111-111111111111';
  moderator_id uuid := '22222222-2222-2222-2222-222222222222';
  test_password text := 'ChuyoE2E!2026';
  consent jsonb := jsonb_build_object(
    'ageConsent', jsonb_build_object('acceptedAt', now(), 'version', 'v1')
  );
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values
    ('00000000-0000-0000-0000-000000000000', regular_id, 'authenticated', 'authenticated',
     'e2e-regular@chuyocode.test',
     extensions.crypt(test_password, extensions.gen_salt('bf')),
     now(),
     '{"provider":"email","providers":["email"]}'::jsonb || consent,
     '{}'::jsonb,
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', moderator_id, 'authenticated', 'authenticated',
     'e2e-moderator@chuyocode.test',
     extensions.crypt(test_password, extensions.gen_salt('bf')),
     now(),
     '{"provider":"email","providers":["email"]}'::jsonb || consent,
     '{}'::jsonb,
     now(), now(), '', '', '', '')
  on conflict (id) do nothing;

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values
    (gen_random_uuid(), regular_id::text, regular_id,
     jsonb_build_object('sub', regular_id::text, 'email', 'e2e-regular@chuyocode.test'),
     'email', now(), now(), now()),
    (gen_random_uuid(), moderator_id::text, moderator_id,
     jsonb_build_object('sub', moderator_id::text, 'email', 'e2e-moderator@chuyocode.test'),
     'email', now(), now(), now())
  on conflict (provider_id, provider) do nothing;

  insert into public.user_roles (user_id, role)
  values (moderator_id, 'moderator')
  on conflict (user_id, role) do nothing;
end $$;
