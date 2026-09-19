-- ═══════════════════════════════════════════════════════════
-- creator_tokens — one secret link per influencer
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


-- ── Issuing a link ─────────────────────────────────────────
-- 64 hex characters, 256 bits of randomness. gen_random_uuid() is built into
-- Postgres 13+, so this needs no extension.

-- insert into public.creator_tokens (token, code, label)
-- values (
--   replace(gen_random_uuid()::text, '-', '') ||
--   replace(gen_random_uuid()::text, '-', ''),
--   'ALEX2509',
--   'Alex — primary link'
-- )
-- returning token;

-- The returned token goes in the link:
--   https://macrosnap.shop/creator/#t=<token>


-- ── Revoking a link ────────────────────────────────────────
-- Revoke rather than delete, so the row remains as a record of what was
-- issued. The dashboard treats a revoked token exactly like an unknown one.

-- update public.creator_tokens
--    set revoked_at = now()
--  where token = '<token>';
