# Creator dashboard — setup

Two steps: run the SQL once, then fill in two values in `creator.js`.

## 1. The read function

Paste this into the Supabase SQL editor. It **does not alter your table** — it
adds one read-only function next to it, so the app's writes are untouched.

> Change `0.20` to your commission rate. The source is `referral_counts`,
> which is a **view**, not a table — see the note below on what that means.

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
  from referral_counts i
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

`referral_counts` is a view (the eye icon on its tab in the Supabase editor),
which matters here for one specific reason: **a view reads its underlying
tables as the view's owner, not as the caller.** So row-level security on the
base tables does not protect the view. If `anon` can select from
`referral_counts`, it can read every creator's row — RLS or no RLS.

Check who can:

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'referral_counts';
```

If `anon` is in that list, close it:

```sql
revoke all on public.referral_counts from anon, authenticated;
```

That leaves `creator_stats()` as the only way in, which is the point of the
function. It **cannot break the app's writes**: this is an aggregate view and
nothing writes to it — the app writes to the tables underneath, which this
does not touch. The only thing to check first is whether anything *else* reads
the view with the anon key (another page, a no-code tool); those would need
the same treatment.

RLS on the base tables is a separate question, and the one with teeth: turning
it on **will stop the app recording code uses if the app writes with the anon
key**. If the app writes with the service role key, RLS is safe to enable and
the app carries on working. Worth settling, but it is not needed for this
page.

## If the function errors on type mismatch

`returns table (... code_inputs int, purchases int ...)` has to match what the
view actually produces. A view built on `count()` yields `bigint`, not `int` —
the editor showed `int4`, so this should be fine, but if Postgres complains
about a return type, change those two to `bigint` and it will match.

## What this version does not show

There are no timestamps in the table, only running totals, so there is no
chart and no "this month" — a counter can't be taken apart into history. If
you want those, the app needs to write one row per event rather than
incrementing a column; totals then become a `sum()` and nothing on this page
has to change except what the function selects.
