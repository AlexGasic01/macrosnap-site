/* ═══════════════════════════════════════════════════════════
   POST /api/creator-stats   { token }  ->  one creator's own row

   Runs on Vercel, server-side, holding the service role key. It exists
   because public.referral has RLS on with no policies: the anon key cannot
   read it at all, so the browser can never talk to Supabase directly.

   The browser sends a TOKEN, never a code. The code is resolved from the
   token here, so nobody can ask for a code that isn't theirs — codes are
   public (creators post them), tokens are not.

   Never returns note, sandbox_purchases or the gross revenue_usd. They are
   not even selected, so they cannot leak through a log or an error path.
   ═══════════════════════════════════════════════════════════ */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Influencer-safe columns only.
const FIELDS = [
  "code", "name", "active", "commission_pct",
  "code_inputs", "purchases", "conversion_pct",
  "net_revenue_usd", "commission_usd",
  "last_input_at", "last_purchase_at", "created_at"
].join(",");

async function sb(path) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      Accept: "application/json"
    }
  });
  if (!r.ok) throw new Error("supabase " + r.status);
  return r.json();
}

// PostgREST serialises numeric as a STRING ("1139.62"), so every numeric
// column is converted here and the page never has to remember to. null is
// preserved rather than becoming 0 — a missing figure is not a zero one.
function n(v) {
  return v === null || v === undefined ? null : Number(v);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    res.status(500).json({ error: "not_configured" });
    return;
  }

  let token = "";
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    token = String(body.token || "");
  } catch (e) {
    // Malformed body leaves the token empty, which fails the check below.
  }

  // Shape check before touching the database, so a junk token costs nothing.
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  try {
    const found = await sb(
      "creator_tokens?select=code,revoked_at&token=eq." +
      encodeURIComponent(token) + "&limit=1"
    );
    const link = found[0];

    // Same 404 for unknown and revoked: a caller learns nothing either way.
    if (!link || link.revoked_at) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const rows = await sb(
      "referral?select=" + encodeURIComponent(FIELDS) +
      "&code=eq." + encodeURIComponent(link.code) + "&limit=1"
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.status(200).json({
      code:             row.code,
      name:             row.name,
      active:           row.active,
      commission_pct:   n(row.commission_pct),
      code_inputs:      n(row.code_inputs),
      purchases:        n(row.purchases),
      conversion_pct:   n(row.conversion_pct),
      net_revenue_usd:  n(row.net_revenue_usd),
      commission_usd:   n(row.commission_usd),
      last_input_at:    row.last_input_at,
      last_purchase_at: row.last_purchase_at,
      created_at:       row.created_at
    });
  } catch (e) {
    // Deliberately opaque: upstream detail belongs in the Vercel log, not in
    // a response a stranger can poke at.
    res.status(502).json({ error: "upstream" });
  }
};
