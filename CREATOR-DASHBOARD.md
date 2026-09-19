# MacroSnap creator dashboard — handover

Context for a fresh session. This describes a **working, deployed** influencer
dashboard: what it is, how it reads Supabase safely, how the access tokens are
issued and rotated, and what to know before extending it into a master/admin
dashboard.

Companion to the referral-data notes (the `public.referral` schema doc). Where
the two overlap, that document is the authority on what the numbers mean.

---

## 1. What exists

| | |
|---|---|
| Live at | `https://www.macrosnap.shop/creator/#t=<token>` |
| Repo | `AlexGasic01/macrosnap-site`, branch `main` |
| Hosting | **Vercel** (moved off GitHub Pages — see §3) |
| Backend | Supabase `glugytojrxzrlvcaxsnb`, table `public.referral` |
| Status | Deployed and verified working |

One influencer, opening their own link, sees: their code, purchases,
conversion, net revenue, commission rate, earnings, when the code was last
used, a copy-a-share-message button and a payout request button.

### Files

```
api/creator-stats.js          the serverless function — the only thing that touches Supabase
creator/index.html            the page
creator/creator.js            client: reads the token, calls the endpoint, renders
styles.css                    site-wide; creator styles are in a marked section
supabase/creator_tokens.sql   DDL for the tokens table + the issue/rotate queries
```

---

## 2. Architecture, and why it is this way

```
browser  ──POST {token}──▶  /api/creator-stats  ──service role──▶  Supabase
                            (Vercel, server-side)
```

**Two constraints drive the whole design.**

**`public.referral` has RLS on with no policies.** The anon key cannot read it
at all — only the service role can. A service role key bypasses every
permission check in the database, so it can never be in anything the browser
downloads. Hence a server-side endpoint, and hence Vercel: a static host has
nowhere to put that key.

**Referral codes are public.** Influencers post them in captions. So the
dashboard cannot be keyed on the code — `#ALEX2509` would let anyone read
anyone's revenue. The browser sends an opaque **token**; the endpoint resolves
it to a code server-side. That is what makes "an influencer only sees their own
row" structurally true rather than a convention.

The token travels in the URL **fragment** (`#t=…`), not a query string.
Fragments are never sent in `Referer` headers and never reach a server log, so
the secret survives the creator tapping through to the App Store. The page
stashes it in `localStorage`, so afterwards `/creator/` alone works on that
device.

---

## 3. Deployment

Vercel, zero-config: the repo is static files, and anything in `/api` is picked
up as a Node serverless function automatically. There is no build step, no
framework, and deliberately no `package.json` — the function uses only global
`fetch`.

Two environment variables, Production scope:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://glugytojrxzrlvcaxsnb.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` |

**Vercel bakes env vars in at build time.** Adding or changing one does nothing
to the build that is already live — it needs a redeploy. This cost an hour of
debugging; see §6.

---

## 4. Tokens: issuing, rotating, revoking

### The table

`public.creator_tokens`, same access model as `referral` — RLS on, no policies,
no grants, service role only. DDL is in `supabase/creator_tokens.sql`.

```sql
create table if not exists public.creator_tokens (
  token       text primary key,
  code        text not null references public.referral(code) on delete cascade,
  label       text,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
```

> **Note:** this was applied through the Supabase SQL editor, not a migration.
> The MacroSnap repo's convention is `supabase/migrations/`. The DDL is written
> with `if not exists` throughout, so adding it as a migration later applies
> cleanly rather than erroring. **This is still outstanding.**

### Issue links for everyone who hasn't got one

Re-runnable. Skips codes that already have a live link, so it picks up new
creators without rotating anyone's existing URL.

```sql
insert into public.creator_tokens (token, code, label)
select replace(gen_random_uuid()::text, '-', '') ||
       replace(gen_random_uuid()::text, '-', ''),
       r.code,
       r.name || ' — dashboard link'
  from public.referral r
 where not exists (
       select 1 from public.creator_tokens t
        where t.code = r.code and t.revoked_at is null
     );
```

64 hex characters, 256 bits. `gen_random_uuid()` is built into Postgres 13+, so
no extension needed.

### Read the links back out

```sql
select r.name,
       r.code,
       'https://www.macrosnap.shop/creator/#t=' || t.token as link
  from public.creator_tokens t
  join public.referral r on r.code = t.code
 where t.revoked_at is null
 order by r.name;
```

### Rotate a leaked or shared token

A token **is** the credential for that dashboard — anyone holding it sees that
creator's revenue. Rotate whenever one is pasted into a chat, an email thread
that went wide, or a shared device.

```sql
-- 1. kill the old one
update public.creator_tokens
   set revoked_at = now()
 where token = '<the old token>';

-- 2. re-run the insert above — it now sees no live link for that code
--    and issues a fresh one
-- 3. re-run the select above to read the new link
-- 4. send it to the creator; the old link now 404s
```

Revoke rather than delete, so the row stays as a record of what was issued.
Revoked and unknown tokens are indistinguishable from outside — both get a
plain 404, so a caller learns nothing by probing.

**Known outstanding:** the token issued for `BANGA` during setup was pasted
into a chat transcript and should be rotated before that link is used.

---

## 5. What the endpoint returns, and what it must never return

`POST /api/creator-stats` with `{"token": "..."}`.

Selects **only** these columns:

```
code, name, active, commission_pct, code_inputs, purchases,
conversion_pct, net_revenue_usd, commission_usd,
last_input_at, last_purchase_at, created_at
```

Never selected, per the data notes — admin-only:

| Column | Why |
|---|---|
| `note` | internal notes about the creator |
| `sandbox_purchases` | TestFlight noise |
| `revenue_usd` | **gross**, before Apple's cut and tax |

They are excluded from the `select`, not filtered from the response, so they
cannot leak through a log or an error path either.

"Revenue" on the dashboard is **`net_revenue_usd`** — the figure commission is
actually paid on. Showing gross to a creator sets an expectation you cannot
meet.

Responses:

| Status | Body | Meaning |
|---|---|---|
| 200 | the row | fine |
| 404 | `{"error":"not_found"}` | unknown token, revoked token, or no such code |
| 405 | `{"error":"method_not_allowed"}` | non-POST |
| 500 | `{"error":"not_configured","missing":[...]}` | env vars absent — names only, never values |
| 502 | `{"error":"upstream"}` | Supabase rejected the read; detail is in the Vercel log, deliberately not in the response |

---

## 6. Gotchas that cost real time

Worth reading before touching any of this.

**Diagnosing a 500.** `not_configured` is the *only* 500 the function returns —
everything else is 404/405/502. So a 500 with any other body means the function
crashed before the code ran, which is a different class of problem entirely.

**`GET /api/creator-stats` is the best triage tool.** No token needed:
- `405` → function is deployed, running, routed correctly. Problem is config or Supabase.
- `500` → crashes at load; runtime/module issue.
- `404` → no function on that host; domain or routing.

**Vercel env vars need a redeploy.** They are baked in at build time. Setting
them on a live project changes nothing until Deployments → ⋯ → Redeploy. Also
check the variable is scoped to **Production**, not just Preview.

**PostgREST returns `numeric` as a JSON string.** `net_revenue_usd` arrives as
`"826.87"`, not `826.87`. The endpoint converts every numeric so the page never
has to — if you add a numeric column, convert it there too.

**`Number(null) === 0`.** A null rate silently became "0%" and paid a creator
nothing until this was caught. Always test for absence *before* calling
`Number()`; an explicit `0` and a missing value are different things.

**`conversion_pct` is null with zero inputs.** 0/0 is "nothing to divide", not
0%. It renders as a dash.

**`commission_usd` is a generated column.** Display it; never recompute it in
the UI, or the two drift.

**Rates live on `referral.commission_pct`** — set them in the Supabase table
editor. There is no separate rates table (an earlier iteration had one; it was
removed when the backend gained the column).

**Purchases are first purchases only.** Renewals are excluded by design.
The dashboard says so in its footnote, because otherwise creators ask.

---

## 7. Extending to a master / admin dashboard

The likely next step. Notes for whoever builds it:

**Do not reuse creator tokens for admin access.** They are scoped to one code
by design. An admin view needs its own authentication — a separate secret, or
proper login — and its own endpoint, e.g. `/api/admin-stats`.

**An admin view may show what the creator view must not:** gross `revenue_usd`
alongside net, `sandbox_purchases`, and `note`. That difference is the whole
reason the two endpoints should stay separate rather than one endpoint with a
flag — a flag is one bug away from leaking.

**The admin query** is the whole table, no token resolution:

```sql
select * from public.referral order by purchases desc;
```

**Reuse the front-end vocabulary.** `styles.css` already carries `.stat-grid`,
`.stat`, `.code-card`, `.payout-card`, `.notice` and the token palette
(`--bg` `#1A1A1A`, `--card` `#2E2E2E`, `--accent` `#3DD38A`, SF Pro stack).
An admin table should look like the same product.

**If you add a chart**, per-day figures exist only in
`private.referral_signups`, which is not exposed through the API on purpose.
The referral data notes sketch a `referral_daily(code)` service-role function
as the supported way in. That migration does not exist yet. Do not expose the
`private` schema.

---

## 8. Not built

- **No chart or time series** — see above.
- **No admin view** — §7.
- **The tokens table is not in a migration** — §4.
- **Refunds are not subtracted** from any figure; that is a backend property,
  not a dashboard one.
- **Payouts are manual.** The Request payout button opens a prefilled email to
  the program address; there is no payout state machine, no ledger, no record
  that a payout happened. If payouts get frequent, that is the gap to close
  next — a creator currently has no way to see what has already been paid.
