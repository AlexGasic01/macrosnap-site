# Creator Agreement signing page

Where a creator unlocks their personal Creator Agreement with their name and
an access code, reads it, signs it on screen, and gets a signed PDF. A copy is
stored server-side as the evidence of the e-signature.

Live at `https://www.macrosnap.shop/creators/agreement`.

---

## 1. Files

```
creators/agreement/index.html     the page
creators/agreement/agreement.js   unlock, render, PDF, rail, signature pad
creators/agreement/agreement.css  styling
lib/agreement-engine.js           the agreement text + HTML/PDF renderers (verbatim; do not edit)
api/_lib/agreement.js             creator lookup, constant-time match, rate limit, Supabase
api/_lib/mail.js                  emails the signed PDF (optional)
api/creator-agreement/verify.js   POST: name + code -> that creator's terms
api/creator-agreement/sign.js     POST: store the signed agreement
assets/agreement/Inter-*.ttf      fonts for the PDF (see §5 — not stock Inter)
assets/agreement/Inter-*.woff2    fonts for the page
assets/agreement/icon.png         160×160 rounded app icon, drawn in every PDF header
assets/vendor/pdf-lib.min.js      pdf-lib 1.17.1, vendored
assets/vendor/fontkit.umd.min.js  @pdf-lib/fontkit 1.1.1, vendored
supabase/creator_agreements.sql   migration for the creator_agreements table
```

The libraries are vendored rather than loaded from a CDN: this is a signing
flow, and it should not stop working because someone else's CDN is down.

---

## 2. Adding a creator

One row in `public.creator_agreements`, added in the Supabase table editor —
the same place you manage referral codes and rates. No deploy, and no creator
data in the repo or in the browser.

| Column | |
|---|---|
| `access_code` | the secret they type. Treat it as a password. |
| `first_name`, `last_name` | matched exactly, case-sensitively |
| `terms` | jsonb, the same fields as the Creator Agreement Builder |

Anything left out of `terms` falls back to `MS.DEFAULTS` in the engine.
`creatorName` is always built from the stored `first_name` + `last_name`,
never from what the visitor typed.

`payModel` is `view`, `affiliate` or `hybrid`. `schedule` is `daily`, `every2`,
`every3`, `everyN` or `perWeek`.

`supabase/creator_agreements.sql` has a ready-made insert that generates an
unguessable access code and returns it.

**The row is both halves of the job**: it says who may open the agreement, and
it holds the signature once they sign. The signature columns stay null until
then, which is how `alreadySigned` is decided and how signing twice is
prevented.

## 3. Setup

### Migration

`supabase/creator_agreements.sql` — copy into the MacroSnap repo's
`supabase/migrations/` and apply there. Same access model as the rest:
RLS on, no policies, service role only, so the table is unreachable with the
anon key and nothing about a creator is ever in the repo.

### Environment

Already set for the creator dashboard, and reused here:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://glugytojrxzrlvcaxsnb.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` |

Vercel bakes env vars in at build time, so a change needs a redeploy.

### Emailing the signed PDF (optional)

On a successful signing the PDF is emailed to the company through
[Resend](https://resend.com). Three more variables turn it on:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | from resend.com → API Keys |
| `AGREEMENT_EMAIL_FROM` | a sender on a domain verified in Resend, e.g. `agreements@macrosnap.shop` |
| `AGREEMENT_EMAIL_TO` | comma-separated recipients |

Recipients are an environment variable rather than code because this repo is
public and the addresses are personal.

Resend needs the sending domain verified by DNS before it will send to
arbitrary addresses — its test sender only reaches the account's own signup
address. Add `macrosnap.shop` under Resend → Domains and apply the records it
gives you.

**Email never affects signing.** It is sent after the row is written, and any
failure — bad key, unverified domain, Resend down, nothing configured at all —
is logged and ignored. The creator still sees a successful signing, and the
PDF is still on the row in Supabase. The sign response carries `emailed: true`
or `false` so the Vercel log tells you which.

If it is not sending, the function log line is `agreement email not sent:` and
the reason.

---

## 4. How access works

The check is server-side. A code in browser JavaScript can be read by anyone
who opens dev tools, so the page never holds the creator list — it posts the
three fields and gets back one creator's terms.

- **Exact and case-sensitive** on all three fields, surrounding whitespace
  trimmed. Compared by SHA-256 digest through `timingSafeEqual`, so neither
  the content nor the length leaks through timing, and every record is checked
  even after a hit so position does not leak either.
- **One message for every failure.** A wrong first name, wrong surname and
  wrong code are indistinguishable: all three give `401 {"error":"invalid"}`.
- **Rate limit**: 5 failures per IP per 15 minutes, then `429`. In-memory and
  per serverless instance, so it slows a guessing attack rather than stopping
  it dead. Fine for a handful of creators; move the counter into Supabase if
  the list ever gets long enough to be worth attacking.
- The verified record lives in page memory only. A refresh means unlocking
  again — there is no cookie and no token.

### Signing

On **Sign agreement** the page builds the signed PDF and posts it with a
SHA-256 of `MS.toText(...)`. The endpoint recomputes that hash from the
**stored** terms and refuses with `409` if it differs — that is what stops a
creator signing one document while a different one is on file.

The signature is written with `PATCH ... &signed_at=is.null`, so a second
attempt matches no row and updates nothing — the first signature cannot be
overwritten, even by two requests racing. After signing, `verify` returns
`alreadySigned: true` and the page opens read-only with the signed PDF
available.

Stored on the row: the PDF, the signature PNG, `signed_at`, the hash of the
agreement text, the IP address and the user agent. The terms are already
there — they are what was signed.

---

## 5. The fonts are modified Inter — do not replace them with stock files

This is the one real trap in here.

`pdf-lib`'s subsetter silently drops **composite glyphs**, and Inter builds
most of its letters as composites — 345 of the first 400. With stock Inter and
the engine's `{ subset: true }`, the PDF renders "MacroSnap" as "acr nap":
the text is correct and extracts fine, but half the glyphs do not draw.

The shipped `assets/agreement/Inter-*.ttf` are official Inter 4.1 statics with
every composite glyph **decomposed into simple contours**, then subset to
Latin-1 + Latin Extended-A + punctuation + currency. That makes them immune to
the bug and drops them from 411 KB to 62 KB.

To regenerate them (needs `fonttools` and `brotli`):

```python
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools import subset

f = TTFont("Inter-Regular.ttf")            # extras/ttf/ from the rsms/inter release
glyf, gs = f["glyf"], f.getGlyphSet()
rebuilt = {}
for name in f.getGlyphOrder():
    if glyf[name].isComposite():
        rec = DecomposingRecordingPen(gs); gs[name].draw(rec)
        tp = TTGlyphPen(None); rec.replay(tp)
        rebuilt[name] = tp.glyph()
for name, g in rebuilt.items():
    glyf[name] = g
f.save("flat.ttf")

opts = subset.Options(); opts.layout_features = []
opts.drop_tables += ["GDEF", "GSUB", "GPOS"]; opts.notdef_outline = True
sf = subset.load_font("flat.ttf", opts)
s = subset.Subsetter(options=opts)
s.populate(unicodes=subset.parse_unicodes(
    "U+0020-00FF,U+0100-017F,U+2000-206F,U+20A0-20BF,U+2122,U+2190-2193"))
s.subset(sf); subset.save_font(sf, "Inter-Regular.ttf", opts)
```

A character outside those ranges renders as `?` — the engine's own `clean()`
does that for anything the font lacks. The ranges cover European names and
currency symbols; widen them if a creator needs more.

---

## 6. What was verified

Both suites run against the real endpoint modules and the real page, with the
Supabase table faked in memory. 23 API checks and 34 browser checks, all
passing:

- Wrong case in any of the three fields → generic 401; exact match unlocks.
- A second creator's code, name and terms never appear in any response, and
  signing one creator leaves the other's row untouched.
- Supabase being down gives a 502 rather than letting anyone through.
- Rate limit trips on the 6th failure, per IP.
- Hash mismatch → 409; signing twice → 409; oversized PDF → 413.
- No `[placeholder]` brackets in the rendered agreement.
- Download works before and after signing; the signed PDF carries the
  signature above the Creator line and the date on the date line.
- Rail fills while scrolling, the pill scrolls to the signatures, hides there
  and stays hidden after signing.
- Pen cursor over the pad; drawing does not scroll the page.
- Reload after signing shows the read-only signed state.
- 375px wide: no horizontal overflow; every control has a visible focus ring.

---

## 7. Known limits

- **Rate limiting is per serverless instance** (§4).
- **No "resend my link"** — a creator who cannot get in has to be helped by
  hand through support.
- **Re-signing means clearing the signature columns**, which destroys the
  evidence of the first signing. There is no amendment flow. The SQL file has
  the statement.
- **Company's side is unsigned.** The PDF leaves the Company signature, name
  and date lines blank; only `companyTitle` is printed. If MacroSnap needs to
  countersign, that is not built.
- **The agreement is rendered client-side** from terms the server supplies.
  The stored PDF is the one the creator's browser produced, which is why the
  endpoint checks its hash against the server's own render before accepting it.
