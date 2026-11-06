# Creator Agreement → dashboard integration

Context for a session adding the Creator Agreement to a MacroSnap dashboard.
The agreement system is **built, deployed and working**; this describes what
exists, where its data lives, and how to surface it somewhere else.

Deep detail on the signing page itself is in `CREATOR-AGREEMENT.md` in the
`AlexGasic01/macrosnap-site` repo. This file is the integration view.

---

## 1. What exists

| | |
|---|---|
| Signing page | `https://www.macrosnap.shop/creators/agreement` |
| Creator stats dashboard | `https://www.macrosnap.shop/creator/#t=<token>` |
| Repo | `AlexGasic01/macrosnap-site` — **public**, so nothing secret goes in it |
| Hosting | Vercel, static files + `/api/*` serverless functions |
| Backend | Supabase `glugytojrxzrlvcaxsnb` |

A creator opens the signing page, enters their first name, last name and an
access code, reads their personalised agreement, signs on a canvas and gets a
signed PDF. A copy is stored and emailed to the company.

### The three Supabase tables in play

| Table | Holds |
|---|---|
| `referral` | per-code stats: code_inputs, purchases, net_revenue_usd, commission_pct, commission_usd |
| `creator_tokens` | dashboard link tokens → `referral.code` |
| `creator_agreements` | agreement access records **and** signatures |

All three: RLS on, **no policies**, no grants. Only the service role reads
them. The anon key cannot touch any of it.

**These are not joined.** `creator_agreements.access_code` has no foreign key
to `referral.code`, and the names are stored separately in each. If a
dashboard needs to show stats and agreement status for one person, you have to
decide how to match them — see §5.

---

## 2. `public.creator_agreements`

One row per creator. It is both the access record and the signature; the
signature columns are null until they sign.

| Column | Type | Notes |
|---|---|---|
| `access_code` | text, PK | the secret they type. **A password — never render it in a UI or log it.** |
| `first_name` | text | matched exactly, case-sensitively |
| `last_name` | text | same |
| `terms` | jsonb | the agreement variables (see §3) |
| `created_at` | timestamptz | when the creator was added |
| `signed_at` | timestamptz | **null until signed** — this is the status flag |
| `signed_date_text` | text | the date as shown to them, e.g. `6 November 2026` |
| `agreement_sha256` | text | hash of the agreement text they signed |
| `signature_png_base64` | text | the drawn signature, transparent PNG |
| `pdf_base64` | text | the signed PDF. **Large — never `select *` in a list view.** |
| `ip_address` | text | evidence |
| `user_agent` | text | evidence |

### Listing agreement status

```sql
select first_name, last_name, created_at, signed_at, signed_date_text
  from public.creator_agreements
 order by signed_at desc nulls last;
```

`signed_at is null` → outstanding. That is the whole status model; there is no
enum and no "sent"/"viewed" state.

### Getting one signed PDF

```sql
select pdf_base64 from public.creator_agreements where access_code = $1;
```

Base64 of a real PDF. In a Node endpoint:
`Buffer.from(row.pdf_base64, "base64")` with
`Content-Type: application/pdf`.

**Do not select `pdf_base64` unless you are serving that one PDF.** It is
~170 KB per row before base64, ~230 KB after. A list view that includes it
will be slow and will blow up response sizes.

---

## 3. The `terms` jsonb, and re-rendering the agreement

`lib/agreement-engine.js` in the site repo is a dependency-free module that
turns `terms` into the agreement. It runs in a browser (`window.MS`) or in
Node (`globalThis.MS`) — `require()` it and use `globalThis.MS`.

```js
require("./lib/agreement-engine.js");
const { blocks } = MS.buildBlocks({ ...row.terms,
  creatorName: row.first_name + " " + row.last_name });

MS.toText(blocks);                      // plain text
MS.toHtml(blocks, { signSlot: true });  // HTML; leaves <div id="sign-slot">
await MS.renderPdf(PDFLib, fontkit, assets, input);   // Uint8Array
```

`creatorName` must be built from the stored `first_name`/`last_name`, never
from user input.

Useful `terms` keys for a dashboard: `payModel` (`view` / `affiliate` /
`hybrid`), `ratePer1k`, `commissionRate`, `startDate`, `minTerm`, `weeklyCap`,
`minPayout`, `currency`, `law`. Anything absent falls back to `MS.DEFAULTS`.

### If you render a PDF, read this

**Do not swap in stock Inter.** `pdf-lib`'s subsetter silently drops composite
glyphs, and Inter builds most letters as composites — the result is a PDF
whose text extracts correctly but renders as "acr nap" instead of
"MacroSnap". The fonts at `assets/agreement/Inter-{Regular,Bold}.ttf` are
official Inter 4.1 with composites decomposed and the charset subset. Use
those files. The regeneration script is in `CREATOR-AGREEMENT.md`.

`renderPdf` needs `assets.regular`, `assets.bold`, `assets.icon` (ArrayBuffer
or Buffer), plus optional `assets.signature` (the stored PNG) and
`input.signedDate`. With both, the signature is drawn above the Creator's
signature line and the date on the date line.

To rebuild a signed PDF from a row you do not need to: `pdf_base64` already
has it, byte for byte as the creator downloaded it.

---

## 4. Existing endpoints

Both are `POST`, both on Vercel, both hold the service role key server-side.

| Endpoint | Body | Returns |
|---|---|---|
| `/api/creator-agreement/verify` | `{firstName, lastName, accessCode}` | `{creatorName, firstName, lastName, terms, alreadySigned}` or 401 |
| `/api/creator-agreement/sign` | `{...identity, signedAt, signedDateText, signaturePng, pdf, agreementTextSha256}` | `{ok, signedAt, signedDateText, emailed}` |

Errors: `401 invalid` (any wrong field, deliberately indistinguishable),
`429 rate_limited`, `409 terms_changed` / `already_signed`,
`413 too_large`, `500 not_configured`, `502 upstream`.

Shared code is `api/_lib/agreement.js` (lookup, constant-time compare, rate
limit, Supabase) and `api/_lib/mail.js` (Resend).

**These are the creator's endpoints, not an admin's.** Do not reuse them for a
dashboard — see §6.

---

## 5. Matching a creator across the two systems

There is no shared key. Options, roughly best first:

1. **Add `referral_code` to `creator_agreements`** and set it when you add a
   creator. One nullable text column, a small migration, and the join becomes
   trivial. This is the right fix if the dashboard is going to show both.
2. **Match on name** — fragile, and the agreement table stores the legal name
   while `referral.name` is a handle like "Bangalifts". Expect misses.
3. **Keep them separate** — show agreement status as its own panel keyed by
   access code, not joined to stats at all.

If you pick (1), the migration belongs in the MacroSnap repo's
`supabase/migrations/`, not the site repo.

---

## 6. Rules for the dashboard you are building

**Never put the service role key in the browser.** It bypasses every
permission check in the database. It lives in Vercel's environment and is read
only by `/api/*` functions. The same rule killed the first version of the
creator dashboard — the whole reason `/api/creator-stats` exists.

**Give the admin view its own endpoint and its own auth.** Do not reuse
`verify`/`sign`: they are scoped to one creator by their access code, and
widening them with an "admin" flag is one bug away from letting a creator read
everyone's agreements. A separate endpoint with a separate secret is the
cheaper thing to get right.

**Never render or return `access_code`.** It is the credential for signing
that agreement. A dashboard that lists creators should key rows on name or an
id, not the code. The existing `verify` endpoint deliberately never echoes it.

**Treat `ip_address`, `user_agent` and `agreement_sha256` as evidence.** Fine
in an internal admin view, wrong in anything a creator sees.

**Nothing secret goes in the site repo — it is public.** No access codes, no
keys, no personal email addresses. Recipients for the agreement email are in
`AGREEMENT_EMAIL_TO` for exactly this reason.

---

## 7. Environment

| Name | Used by |
|---|---|
| `SUPABASE_URL` | everything |
| `SUPABASE_SERVICE_ROLE_KEY` | everything |
| `RESEND_API_KEY` | agreement email (optional) |
| `AGREEMENT_EMAIL_FROM` | agreement email (optional) |
| `AGREEMENT_EMAIL_TO` | agreement email (optional) |

Vercel bakes env vars in at build time: **a change needs a redeploy**, and the
symptom of forgetting is a 500 with `not_configured`.

---

## 8. Known limits, so you do not rediscover them

- **Adding a creator is a manual SQL insert.** No admin UI. If one is wanted,
  that is the obvious thing to build — the insert is in
  `supabase/creator_agreements.sql`.
- **No "resend my link"** and no way for a creator to recover an access code.
  Support does it by hand.
- **Re-signing means clearing the signature columns**, which destroys the
  evidence of the first signing. No amendment flow.
- **The company side of the PDF is unsigned** — blank signature, name and date
  lines. Only `companyTitle` prints. There is no countersigning.
- **Rate limiting is in-memory per serverless instance**, so it slows a
  guessing attack rather than stopping it. Move it into Supabase if the
  creator list grows.
- **Editing a creator's `terms` after they sign** does not change what they
  signed — `pdf_base64` and `agreement_sha256` are the record. The dashboard
  should show the stored hash, not a freshly computed one, if it displays one
  at all.
