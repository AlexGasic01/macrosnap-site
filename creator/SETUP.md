# Creator dashboard — setup

The dashboard reads `public.referral`, which has RLS on with no policies: the
anon key cannot read it at all. So the read happens **server-side** in
`/api/creator-stats.js` with the service role key, and the browser only ever
talks to that endpoint.

This is why the site has to be on Vercel rather than GitHub Pages — GitHub
Pages serves static files only, and there is nowhere in a static file to put a
service role key.

## 1. Migration: the tokens table

`supabase/creator_tokens.sql` in this repo is the DDL. **Copy it into the
MacroSnap repo's `supabase/migrations/`** and apply it there — this repo has no
Supabase link.

It creates `public.creator_tokens` (token → code), with the same access model
as `referral`: RLS on, no policies, service role only.

## 2. Issue a link per creator

```sql
insert into public.creator_tokens (token, code, label)
values (
  replace(gen_random_uuid()::text, '-', '') ||
  replace(gen_random_uuid()::text, '-', ''),
  'ALEX2509',
  'Alex — primary link'
)
returning token;
```

That returns a 64-character token. Their link is:

```
https://macrosnap.shop/creator/#t=<token>
```

The token sits in the URL **fragment**, which browsers never send in a
`Referer` header and which never reaches a server log — so it survives being
tapped through to the App Store. The page remembers it in `localStorage`
afterwards, so they can just open `/creator/`.

To take a link out of use:

```sql
update public.creator_tokens set revoked_at = now() where token = '<token>';
```

Revoked and unknown tokens are indistinguishable from the outside: both get a
plain 404.

## 3. Deploy on Vercel

Import the repo at vercel.com. No framework preset — the site is static files,
and Vercel runs anything in `/api` as a serverless function automatically.

Set two environment variables (Project → Settings → Environment Variables):

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://glugytojrxzrlvcaxsnb.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the service role key, from Supabase → Settings → API |

**The service role key bypasses every permission check in the database.** It
belongs only here, in Vercel's environment. Never in this repo, never in a
`NEXT_PUBLIC_`-style variable, never in anything the browser downloads.

Then point `macrosnap.shop` at Vercel (Project → Settings → Domains) and
update the DNS records where the domain is registered. Until the DNS moves,
the live site is still the GitHub Pages copy — where `/creator/` will 404,
because there is no `/api` there to answer it.

## 4. Check it

```bash
curl -s -X POST https://macrosnap.shop/api/creator-stats \
  -H 'Content-Type: application/json' \
  -d '{"token":"<token>"}'
```

- A JSON row → working.
- `{"error":"not_found"}` → the token isn't in `creator_tokens`, or is revoked.
- `{"error":"not_configured"}` → the environment variables aren't set.
- `{"error":"upstream"}` → Supabase rejected the query; the Vercel function log
  has the status code.

## What the influencer sees

Per your data notes, the endpoint selects only influencer-safe columns:
`code, name, active, commission_pct, code_inputs, purchases, conversion_pct,
net_revenue_usd, commission_usd, last_input_at, last_purchase_at, created_at`.

`note`, `sandbox_purchases` and the gross `revenue_usd` are never selected, so
they cannot reach the browser even through an error path. "Revenue" on the
dashboard is `net_revenue_usd` — the figure commission is actually paid on.

PostgREST returns numerics as strings (`"826.87"`); the endpoint converts them
so the page never has to. Nulls stay null rather than becoming `0`.

Rates come from `referral.commission_pct` — set them in the Supabase table
editor. `commission_usd` is a generated column, so the page displays it rather
than recomputing it.

A code with `active = false` still shows its history, with a notice saying new
signups can't use it.

## Not built

There's no chart. Per-day figures live only in `private.referral_signups`,
which isn't exposed through the API by design. Your notes sketch a
`referral_daily(code)` service-role function as the way to get one — if you add
that migration, the endpoint can call it and the page can plot it.
