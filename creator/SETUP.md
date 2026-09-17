# Creator dashboard — setup

## 1. Run this in the Supabase SQL editor

Safe to re-run; edit the rates to whatever you've agreed.

```sql
-- Let the page read the stats view.
grant select on public.referral_counts to anon;

-- Per-creator commission rates. commission_pct is a PERCENTAGE: 20 means 20%.
create table if not exists public.creator_rates (
  code           text primary key,
  commission_pct numeric not null default 20,
  note           text
);

grant select on public.creator_rates to anon;

-- Read-only to everyone else; only you can change rates, from the table editor.
alter table public.creator_rates enable row level security;

drop policy if exists "creator rates are readable" on public.creator_rates;
create policy "creator rates are readable"
  on public.creator_rates for select to anon using (true);

-- Your creators.
insert into public.creator_rates (code, commission_pct) values
  ('ALEX2509', 20),
  ('BANGA',    25)
on conflict (code) do update set commission_pct = excluded.commission_pct;

-- referral_counts plus the creator's rate, as one object. This is what the
-- page reads. Wrapping rather than editing referral_counts means nothing that
-- already depends on that view can break.
create or replace view public.referral_dashboard as
select
  c.*,
  coalesce(r.commission_pct, 20) as commission_pct
from public.referral_counts c
left join public.creator_rates r on upper(r.code) = upper(c.code);

grant select on public.referral_dashboard to anon;
```

The RLS lines only apply to the new `creator_rates` table — they exist so
Supabase doesn't flag it as unprotected, and they cannot affect the code
tracking. Nothing here touches `referral_counts` or the tables beneath it.

Check it worked:

```sql
select * from public.creator_rates;
```

## 2. Fill in two values at the top of `creator.js`.

```js
var SUPABASE_URL           = "https://<project>.supabase.co";
var SUPABASE_ANON          = "<anon key>";
var DEFAULT_COMMISSION_PCT = 20;         // used when a creator has no rate row
```

The page reads `referral_dashboard` in one request:

```
GET /rest/v1/referral_dashboard?select=name,code,code_inputs,purchases,conversion_pct,revenue_usd,commission_pct&code=ilike.<code>&limit=1
```

Commission is worked out in the page — `revenue_usd * commission_pct / 100`.

## Per-creator rates

`referral_counts` is a view, so there is no column on it to hang a rate on.
The rate lives in `creator_rates`, and `referral_dashboard` joins the two so
the page still makes a single request.

### Editing referral_counts itself instead

If you would rather the column sat on `referral_counts` — skipping
`referral_dashboard` and setting `SOURCE_VIEW` back to `"referral_counts"` —
read its current definition first:

```sql
select pg_get_viewdef('public.referral_counts', true);
```

Then re-create it with that definition plus the join. Three rules, or it will
fail or quietly lose data:

- **`left join`, not `join`.** An inner join drops every creator who has no
  row in `creator_rates` — they would vanish from the view entirely.
- **The new column goes last.** `create or replace view` can append a column
  but cannot insert one in the middle, rename one, or change a type.
- **Every existing column stays, in its existing order**, for the same reason.

```sql
create or replace view public.referral_counts as
select
  <the existing select list, unchanged and in order>,
  coalesce(r.commission_pct, 20) as commission_pct
from <the existing from / joins>
left join public.creator_rates r on upper(r.code) = upper(<alias>.code);
```

The wrapper view avoids all three traps, which is why it is the default.

**`commission_pct` is a percentage, not a fraction**: `20` means 20%, and
`17.5` works too. Putting `0.2` in there would pay out 0.2%.

After that, changing someone's rate is editing one cell in the Supabase table
editor. No deploy, no code change.

Rates are optional — until the table exists, every creator falls back to
`DEFAULT_COMMISSION_PCT`, and so does anyone without a row in it. The page
never fails over a missing rate.

The `note` column is there for your own reference (why this creator is on a
different rate); the page never reads it.

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
