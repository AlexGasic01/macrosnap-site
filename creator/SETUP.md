# Creator dashboard — setup

One step: fill in two values at the top of `creator.js`.

```js
var SUPABASE_URL    = "https://<project>.supabase.co";
var SUPABASE_ANON   = "<anon key>";
var COMMISSION_RATE = 0.20;              // change to your rate
```

The page reads the `referral_counts` view directly:

```
GET /rest/v1/referral_counts?select=name,code,code_inputs,purchases,conversion_pct,revenue_usd&code=ilike.<code>&limit=1
```

Commission is worked out in the page — `revenue_usd * COMMISSION_RATE` — so
nothing in Supabase needs changing to alter the rate.

## Requirement

The `anon` role needs select on the view. Check with:

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'referral_counts';
```

If `anon` isn't listed, grant it:

```sql
grant select on public.referral_counts to anon;
```

Nothing writes to `referral_counts` — it's an aggregate view, and the app
writes to the tables underneath it. So no grant here affects the code
tracking.

## Links to send creators

```
https://macrosnap.app/creator/#ALEX2509
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

Two ways to close that later, neither requiring changes to this page's layout:

- Return the row through a `security definer` function that takes the code and
  selects one row, then revoke `anon`'s select on the view.
- Or keep the direct read but move the dashboard behind a per-creator secret
  slug instead of the public code.

## What this version does not show

There are no timestamps in the view, only running totals, so there is no chart
and no "this month" — a counter can't be taken apart into history. If you want
those, the app needs to write one row per event rather than incrementing a
column; totals then become a `sum()` and nothing on this page has to change
except what the view selects.
