# Rate Lock Period → master dashboard

A change to the MacroSnap Creator Agreement, and what a master dashboard needs
to know about it. One commit: `8e25a9f` in `AlexGasic01/macrosnap-site`.

The agreement system itself is covered by `AGREEMENT-FOR-DASHBOARD.md` and
`CREATOR-AGREEMENT.md` in that repo. This is only the new bit.

---

## 1. What changed

A creator's rate can now be **locked for a set number of days from their Start
Date**. Until the lock ends, MacroSnap cannot change their rates, commission or
Pay model. After it ends, the pre-existing mechanism applies: change them on
7 days' written notice.

Before this, MacroSnap could change a rate at any time on 7 days' notice.

### The term

One new key in a creator's `terms` jsonb:

```json
"rateLockDays": 90
```

| Value | Meaning |
|---|---|
| `0`, or the key absent | No lock. The agreement reads exactly as it did before. |
| a positive integer | Rates fixed for that many days from `startDate`. |

It is a **count of days, not a date**. The lock end is computed, never stored:

```
lockEndsAt = startDate + rateLockDays days
```

`startDate` is an ISO date string in the same `terms` object. Both live on the
creator's row in `public.creator_agreements`.

### What it produces in the agreement

- **Clause 4.4** gains the lock, and defines **"Rate Lock Period"**.
- **Schedule A** gains a `Rate Lock Period` row — `90 days from the Start Date`,
  or `None`.
- **Clause 1** gains a definition for the term, but only when a lock is set.

Clause numbering is unchanged; nothing else in the agreement moved.

---

## 2. Reading it in a dashboard

```sql
select first_name,
       last_name,
       terms->>'startDate'                          as start_date,
       coalesce((terms->>'rateLockDays')::int, 0)   as rate_lock_days,
       case
         when coalesce((terms->>'rateLockDays')::int, 0) = 0 then null
         else (terms->>'startDate')::date
              + ((terms->>'rateLockDays')::int || ' days')::interval
       end                                          as rate_revisable_from,
       signed_at
  from public.creator_agreements
 order by last_name;
```

`rate_revisable_from` is null when there is no lock, which reads correctly as
"revisable now". A dashboard panel might show:

| State | Condition |
|---|---|
| No lock | `rateLockDays` is 0 or absent |
| Locked until *date* | `now() < rate_revisable_from` |
| Revisable | `now() >= rate_revisable_from` |

**`startDate` can be absent or malformed.** It is a free-text field in a hand-
written jsonb blob, and the engine renders `[Start Date]` when it cannot parse
it. The cast above will throw on such a row. Guard it, or filter to rows where
`terms->>'startDate' ~ '^\d{4}-\d{2}-\d{2}$'`.

---

## 3. Changing a creator's lock

It is a normal jsonb update:

```sql
update public.creator_agreements
   set terms = jsonb_set(terms, '{rateLockDays}', '90'::jsonb)
 where access_code = $1;
```

**But read §4 before building a UI that does this.**

---

## 4. The thing to get right: signed vs unsigned

This is the one place a dashboard can do real damage.

**A signed agreement is immutable, and editing `terms` does not change it.**
What the creator signed is `pdf_base64` on their row, with `agreement_sha256`
as its fingerprint. Those are the record. Editing `terms` afterwards changes
only what a *freshly rendered* agreement would say — it does not alter, and
must never be presented as altering, what was agreed.

So:

- **Never show a figure recomputed from `terms` as "what they signed"** on a
  row where `signed_at` is set. Show the stored PDF, or say plainly that the
  terms have been edited since signing.
- **A dashboard that edits `terms` on a signed row should warn, or refuse.**
  The honest flow for changing a signed creator's rate is the agreement's own:
  clause 4.4's 7 days' written notice, after the Rate Lock Period. Not a silent
  database edit.
- **Editing `terms` on an *unsigned* row is fine** — they have not agreed to
  anything yet, and they will see the new terms when they open the page.

### One live consequence

Changing `terms` while a creator has the signing page **open** invalidates
their in-flight signature: the page sends a hash of the text it rendered, the
server recomputes it from the stored terms, and a mismatch is rejected with
`409 terms_changed`. That is the guard working. They reload and sign the
current version. Worth knowing so it is not mistaken for a bug.

---

## 5. Verified

- `rateLockDays` absent or `0` produces byte-identical wording to before the
  change — existing agreements are unaffected.
- `90` renders the lock in clause 4.4, the Schedule A row and the clause 1
  definition; `1` reads "1 day", not "1 days".
- No `[placeholder]` brackets left in either case, clause numbering intact.
- PDF renders correctly with the new clause.
- The signing page's five test suites still pass.

---

## 6. Not built

- **No UI for setting the lock.** It is a SQL edit, like everything else about
  a creator record.
- **Nothing enforces the lock in software.** It is a contractual term in the
  document, not a constraint in the database — a `jsonb_set` will happily
  change a locked creator's rate. If the dashboard is going to expose rate
  edits, that check is yours to add.
- **No notice workflow.** Clause 4.4 requires 7 days' written notice to change
  a rate after the lock; nothing tracks or sends that.
