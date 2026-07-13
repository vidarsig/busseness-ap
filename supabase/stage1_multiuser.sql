-- ============================================================
-- Jobboks — Stage 1 multi-user security (run in Supabase SQL Editor)
-- Do the PARTS IN ORDER. Do NOT run Part C until the app update is
-- deployed and verified (see the chat plan), or you can lock yourself out.
-- ============================================================

-- ── PART A — membership table (SAFE: only adds a table) ──────
create table if not exists company_members (
  user_id     uuid not null references auth.users(id) on delete cascade,
  company_key text not null,
  role        text not null default 'staff',
  created_at  timestamptz default now(),
  primary key (user_id, company_key)
);

alter table company_members enable row level security;

-- A logged-in user can read their own memberships.
drop policy if exists "own_memberships_select" on company_members;
create policy "own_memberships_select" on company_members
  for select using (user_id = auth.uid());


-- ── PART B — claim ownership (run AFTER Part A) ──────────────
-- Links YOUR login to YOUR existing data. Replace the two values:
--   <YOUR_LOGIN_EMAIL>   = the email you log into the Jobboks app with
--   <YOUR_USER_KEY>      = Jobboks → Stillingar → Supabase → "User key" field
-- No data is moved; this just records that you own that data key.
--
-- insert into company_members (user_id, company_key, role)
-- select id, '<YOUR_USER_KEY>', 'owner'
-- from auth.users where email = '<YOUR_LOGIN_EMAIL>'
-- on conflict (user_id, company_key) do update set role = 'owner';


-- ── PART C — turn on security (run LAST, after app verified) ─
-- Replaces the "allow anyone" rule on app_data with membership-based access.
-- ONLY run this once the deployed app loads your data via your membership.
--
-- drop policy if exists "allow_all" on app_data;
-- create policy "members_only" on app_data
--   for all
--   using  (user_key in (select company_key from company_members where user_id = auth.uid()))
--   with check (user_key in (select company_key from company_members where user_id = auth.uid()));
