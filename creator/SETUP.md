# Creator dashboard — setup

Two steps: run the SQL once, then fill in two values in `creator.js`.

## 1. The read function

Paste this into the Supabase SQL editor. It **does not alter your table** — it
adds one read-only function next to it, so the app's writes are untouched.

> Change `influencers` to your actual table name, and `0.20` to your
> commission rate.

```sql
create or replace function public.creator_stats(p_code text)
returns table (
  name           text,
  code           text,
  code_inputs    int,
  purchases      int,
  conversion_pct numeric,
  earnings_usd   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.name,
    i.code,
    i.code_inputs,
    i.purchases,
    -- Computed, not read from the stored column: 0 inputs means "nothing to
    -- divide", which must come back null rather than 0%.
    case when i.code_inputs > 0
         then round(i.purchases::numeric * 100 / i.code_inputs, 1)
    end,
    round(coalesce(i.revenue_usd, 0) * 0.20, 2)      -- commission rate
  from influencers i
  where upper(i.code) = upper(p_code)
  limit 1;
$$;

revoke all on function public.creator_stats(text) from public;
grant execute on function public.creator_stats(text) to anon;
```

`security definer` is what lets the function read the table while the anon key
cannot. `set search_path` is not optional on a definer function.

Note what the function never returns: `revenue_usd` (your gross, as opposed to
their cut) and `sandbox_purchases` (your StoreKit testing). Those stay
server-side no matter what the page asks for.

## 2. Config

Top of `creator.js`:

```js
var SUPABASE_URL  = "https://<project>.supabase.co";
var SUPABASE_ANON = "<anon key>";
```

The anon key is public by design — it belongs in this file.

## Links to send creators

```
https://macrosnap.app/creator/#ALEX2509
```

The code sits in the URL fragment, which browsers never put in `Referer`
headers or server logs, so it survives being tapped through to the App Store.
Opening `/creator/` with no fragment shows a code-entry box instead, and the
code is remembered in `localStorage` afterwards.

## Before you send anyone a link

**Check whether RLS is enabled on the table.** If it is off, the anon key can
already read every row directly, function or no function — Supabase flags this
as "RLS disabled in public schema" on the table list.

Turning it on is a separate decision, because **it will break the app's writes
if the app authenticates with the anon key**. Check that first:

- App writes with the **service role key** (server-side) → RLS is safe to
  enable, and the app carries on working.
- App writes with the **anon key** → enable RLS *and* add an insert/update
  policy covering what the app does, or the code tracking stops recording.

## What this version does not show

There are no timestamps in the table, only running totals, so there is no
chart and no "this month" — a counter can't be taken apart into history. If
you want those, the app needs to write one row per event rather than
incrementing a column; totals then become a `sum()` and nothing on this page
has to change except what the function selects.
