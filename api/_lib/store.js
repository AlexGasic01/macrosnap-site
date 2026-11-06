/* Shared Supabase access for signed agreements.
 *
 * Same model as the creator dashboard: public.creator_agreements has RLS on
 * with no policies, so only the service role can touch it, and the key lives
 * only in Vercel's environment.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function configured() {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

function missingEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SERVICE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  return missing;
}

async function sb(path, init) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, Object.assign({
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  }, init || {}));
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error("supabase " + res.status + " " + detail.slice(0, 200));
  }
  return res.status === 204 ? null : res.json();
}

/* The signed record for an access code, or null. Never returns the PDF: it is
 * large, and nothing in the page needs it back. */
async function findSigned(accessCode) {
  const rows = await sb(
    "creator_agreements?select=access_code,signed_at,signed_date_text,agreement_sha256" +
    "&access_code=eq." + encodeURIComponent(accessCode) + "&limit=1"
  );
  return (rows && rows[0]) || null;
}

/* Insert-only: the table has a unique constraint on access_code, so a second
 * signing attempt fails at the database rather than quietly overwriting the
 * first signature. */
async function storeSigned(row) {
  return sb("creator_agreements", {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
}

module.exports = { configured, missingEnv, findSigned, storeSigned };
