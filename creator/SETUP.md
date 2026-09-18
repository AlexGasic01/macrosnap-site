# Creator dashboard — setup

## 1. In Supabase

The `anon` role needs to read the view. If it already can, this is a no-op:

```sql
grant select on public.referral_counts to anon;
```

That's all. Nothing writes to `referral_counts` — it's an aggregate view and
the app writes to the tables underneath it — so this can't affect the code
tracking.

## 2. In `creator.js`

```js
var SUPABASE_URL   = "https://<project>.supabase.co";
var SUPABASE_ANON  = "<anon key>";
var COMMISSION_PCT = 20;                 // a percentage: 20 means 20%
```

Both Supabase values are under **Settings → API**.

## How it works

One request per page load:

```
GET /rest/v1/referral_counts?select=name,code,code_inputs,purchases,conversion_pct,revenue_usd&code=ilike.<code>&limit=1
```

- `ilike` with no wildcards is an exact match that ignores case, so a creator
  typing `alex2509` still lands on their row.
- Named columns rather than `*`, so a column added to the view later doesn't
  start arriving here unnoticed.
- Earnings are `revenue_usd * COMMISSION_PCT / 100`, worked out in the page.
  Changing the rate is a one-line edit, no database work.
- `conversion_pct` is null for a creator with no code inputs yet — 0/0 is
  "nothing to divide", not 0% — and renders as a dash.

## Links to send creators

```
https://macrosnap.shop/creator/#ALEX2509
```

The code sits in the URL fragment, which browsers never put in `Referer`
headers or server logs, so it survives being tapped through to the App Store.
Opening `/creator/` with no fragment shows a code-entry box instead, and the
code is remembered in `localStorage` afterwards.

## Known tradeoff

The anon key is in the page source, so the whole view is readable by anyone
who opens the dashboard — the code in the URL chooses which row to display, it
does not limit which rows can be fetched. A creator who opens devtools can
read every creator's row, `revenue_usd` included.

## What this version does not show

There are no timestamps in the view, only running totals, so there is no chart
and no "this month" — a counter can't be taken apart into history. If you want
those, the app needs to write one row per event rather than incrementing a
column; totals then become a `sum()` and nothing on this page has to change
except what the view selects.
