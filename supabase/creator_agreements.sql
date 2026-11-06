-- ═══════════════════════════════════════════════════════════
-- creator_agreements — one row per creator
--
-- Full context: CREATOR-AGREEMENT.md at the repo root.
--
-- The row is both halves of the job: the access record that says who may
-- open the agreement, and the signature once they sign it. The signature
-- columns are null until then.
--
-- Copy this into the MacroSnap repo's supabase/migrations/ and apply it
-- there; this repo has no Supabase link.
--
-- Same access model as public.referral: RLS on, no policies, no grants, so
-- only the service role can read or write it.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.creator_agreements (
  -- who may open it
  access_code          text primary key,
  first_name           text not null,
  last_name            text not null,
  terms                jsonb not null,
  created_at           timestamptz not null default now(),

  -- filled in when they sign
  signed_at            timestamptz,
  signed_date_text     text,
  agreement_sha256     text,
  signature_png_base64 text,
  pdf_base64           text,
  ip_address           text,
  user_agent           text
);

-- ── Already ran the first version of this file? ───────────
-- The first version only created a row once someone SIGNED, so creator_name,
-- signed_at, agreement_sha256, signature_png_base64 and pdf_base64 were all
-- NOT NULL. A row now exists from the moment the creator is added, with those
-- empty. `create table if not exists` will NOT alter an existing table, so
-- run this once to convert it — no data is lost:
--
--   alter table public.creator_agreements
--     drop column if exists creator_name,
--     alter column signed_at            drop not null,
--     alter column agreement_sha256     drop not null,
--     alter column signature_png_base64 drop not null,
--     alter column pdf_base64           drop not null;
--
-- Symptom if you skip it: inserting a creator fails with
-- 'null value in column "creator_name" ... violates not-null constraint'.


alter table public.creator_agreements enable row level security;

revoke all on public.creator_agreements from anon, authenticated;


-- ── Adding a creator ───────────────────────────────────────
-- Do this in the table editor, or here. Anything left out of `terms` falls
-- back to MS.DEFAULTS in lib/agreement-engine.js.
--
-- The access code is a password: make it unguessable, and send it to the
-- creator over something private.

-- insert into public.creator_agreements (access_code, first_name, last_name, terms)
-- values (
--   'MS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) ||
--   '-'   || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)),
--   'Jordan',
--   'Smith',
--   jsonb_build_object(
--     'creatorEmail',  'jordan@example.com',
--     'startDate',     '2026-11-10',
--     'currency',      'USD',
--     'payModel',      'view',
--     'ratePer1k',     '1.20',
--     'viewWindow',    7,
--     'reviewDays',    3,
--     'schedule',      'every2',
--     'videosPerDay',  2,
--     'minPayout',     50,
--     'weeklyCap',     500,
--     'processingDays', 3,
--     'payoutMethod',  'PayPal',
--     'minTerm',       30,
--     'timezone',      'UTC',
--     'law',           'England and Wales',
--     'companyEmail',  'creators@macrosnap.app',
--     'companyTitle',  'Founder',
--     'pageSize',      'A4',
--     'theme',         'dark'
--   )
-- )
-- returning access_code;


-- ── Who has signed ─────────────────────────────────────────
-- Excludes pdf_base64, which is large.

-- select first_name, last_name, access_code,
--        signed_at, signed_date_text, agreement_sha256, ip_address
--   from public.creator_agreements
--  order by signed_at desc nulls last;


-- ── Getting a signed PDF back out ──────────────────────────
--   select pdf_base64 from public.creator_agreements where access_code = '...';
--   -- then locally:  base64 -d < copied.txt > agreement.pdf


-- ── Letting a creator re-sign ──────────────────────────────
-- Only after deciding the first signature should not stand; this destroys
-- the evidence of that signing. The access record itself is kept.

-- update public.creator_agreements
--    set signed_at = null, signed_date_text = null, agreement_sha256 = null,
--        signature_png_base64 = null, pdf_base64 = null,
--        ip_address = null, user_agent = null
--  where access_code = '<code>';
