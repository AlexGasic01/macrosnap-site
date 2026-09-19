-- ═══════════════════════════════════════════════════════════
-- creator_tokens — one secret link per influencer
--
-- Full context: CREATOR-DASHBOARD.md at the repo root.
--
-- This file belongs in the MacroSnap repo's supabase/migrations/, not here;
-- it lives in the site repo only because that is where the dashboard that
-- consumes it is. Copy it across as a migration rather than running it ad hoc.
--
-- Same access model as public.referral: RLS on, no policies, so only the
-- service role can read it. The dashboard's Vercel function is the only
-- thing that ever queries it.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.creator_tokens (
  token       text primary key,
  code        text not null references public.referral(code) on delete cascade,
  label       text,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

create index if not exists creator_tokens_code_idx
  on public.creator_tokens (code);

alter table public.creator_tokens enable row level security;

-- No policies, and no grants: service role only.
revoke all on public.creator_tokens from anon, authenticated;


-- ── Issuing links ──────────────────────────────────────────
-- Run these as queries, NOT as part of the migration: a real token committed
-- to git is in the history permanently, and it is the credential for that
-- creator's dashboard.
--
-- Gives every code that hasn't got a live link one. 64 hex characters, 256
-- bits. gen_random_uuid() is built into Postgres 13+, so no extension needed.
-- Safe to re-run: codes that already have a live link are skipped, so it
-- issues links for new creators without disturbing anyone's existing one.

-- insert into public.creator_tokens (token, code, label)
-- select replace(gen_random_uuid()::text, '-', '') ||
--        replace(gen_random_uuid()::text, '-', ''),
--        r.code,
--        r.name || ' — dashboard link'
--   from public.referral r
--  where not exists (
--        select 1 from public.creator_tokens t
--         where t.code = r.code and t.revoked_at is null
--      );

-- Then read the finished links back out, ready to send:

-- select r.name,
--        r.code,
--        'https://macrosnap.shop/creator/#t=' || t.token as link
--   from public.creator_tokens t
--   join public.referral r on r.code = t.code
--  where t.revoked_at is null
--  order by r.name;


-- ── Revoking a link ────────────────────────────────────────
-- Revoke rather than delete, so the row remains as a record of what was
-- issued. The dashboard treats a revoked token exactly like an unknown one.

-- update public.creator_tokens
--    set revoked_at = now()
--  where token = '<token>';
