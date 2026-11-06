-- ═══════════════════════════════════════════════════════════
-- creator_agreements — the signed e-signature records
--
-- Full context: CREATOR-AGREEMENT.md at the repo root.
--
-- Copy this into the MacroSnap repo's supabase/migrations/ and apply it
-- there; this repo has no Supabase link.
--
-- Same access model as public.referral: RLS on, no policies, no grants, so
-- only the service role can read or write it. The signing endpoint on Vercel
-- is the only thing that touches it.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.creator_agreements (
  access_code          text primary key,
  first_name           text not null,
  last_name            text not null,
  creator_name         text not null,
  signed_at            timestamptz not null,
  signed_date_text     text,
  agreement_sha256     text not null,
  terms                jsonb not null,
  signature_png_base64 text not null,
  pdf_base64           text not null,
  ip_address           text,
  user_agent           text,
  created_at           timestamptz not null default now()
);

-- access_code is the primary key, so a second signing attempt for the same
-- creator fails at the database rather than overwriting the first signature.
-- The endpoint turns that conflict into a 409.

alter table public.creator_agreements enable row level security;

revoke all on public.creator_agreements from anon, authenticated;


-- ── Looking at what has been signed ────────────────────────
-- Deliberately excludes pdf_base64, which is large.

-- select creator_name, access_code, signed_at, signed_date_text,
--        agreement_sha256, ip_address
--   from public.creator_agreements
--  order by signed_at desc;


-- ── Getting a signed PDF back out ──────────────────────────
-- Run in psql, or copy the base64 out of the SQL editor and decode it:
--   select pdf_base64 from public.creator_agreements where access_code = '...';
--   -- then locally:  base64 -d < copied.txt > agreement.pdf


-- ── Letting a creator re-sign ──────────────────────────────
-- Only after deciding the first signature should not stand; it destroys the
-- evidence of that signing.
-- delete from public.creator_agreements where access_code = '<code>';
