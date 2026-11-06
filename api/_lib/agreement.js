/* Creator agreement records, in Supabase like everything else on this site.
 *
 * One row per creator in public.creator_agreements, created by hand in the
 * table editor. The signature columns are null until they sign, so the same
 * row is both "who may open this agreement" and "what they signed".
 *
 * Same access model as public.referral: RLS on, no policies, service role
 * only. Nothing here is ever in the repo or in the browser.
 */

const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const configured = () => Boolean(SUPABASE_URL && SERVICE_KEY);

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

/* Digest comparison so neither content nor length leaks through timing —
 * timingSafeEqual throws on buffers of different lengths. */
function sameSecret(a, b) {
  const ha = crypto.createHash("sha256").update(String(a), "utf8").digest();
  const hb = crypto.createHash("sha256").update(String(b), "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}

/* Looks the row up by access code — Postgres text equality is already exact
 * and case-sensitive — then checks both names in constant time. Returns the
 * row or null; a wrong code and a wrong name are indistinguishable to the
 * caller. */
async function findCreator(firstName, lastName, accessCode) {
  const f = String(firstName ?? "").trim();
  const l = String(lastName ?? "").trim();
  const c = String(accessCode ?? "").trim();
  if (!f || !l || !c) return null;

  const rows = await sb(
    "creator_agreements?select=access_code,first_name,last_name,terms,signed_at" +
    "&access_code=eq." + encodeURIComponent(c) + "&limit=1"
  );
  const rec = rows && rows[0];
  if (!rec) {
    // Spend the same work on a miss so a bad code is not obviously faster.
    sameSecret(f, f);
    sameSecret(l, l);
    return null;
  }
  const ok = sameSecret(rec.first_name, f) & sameSecret(rec.last_name, l);
  return ok ? rec : null;
}

/* The terms handed to the engine. creatorName comes from the stored record,
 * never from what the visitor typed. */
function termsFor(rec) {
  return Object.assign({}, rec.terms, {
    creatorName: rec.first_name + " " + rec.last_name,
  });
}

/* Fills in the signature on a row that has not been signed. The
 * `signed_at=is.null` filter is what makes signing twice impossible: the
 * second attempt matches no row and updates nothing. */
async function recordSignature(accessCode, fields) {
  const updated = await sb(
    "creator_agreements?access_code=eq." + encodeURIComponent(accessCode) +
    "&signed_at=is.null",
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: "Bearer " + SERVICE_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(fields),
    }
  );
  return Array.isArray(updated) && updated.length > 0;
}

/* ── Rate limiting ────────────────────────────────────────────────────────
 * Per-instance and in-memory: a serverless instance is short-lived and there
 * can be several, so this slows a guessing attack rather than stopping it
 * dead. Sized for a programme with a handful of creators. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map();

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return String(req.headers["x-real-ip"] || "unknown");
}

function isRateLimited(ip) {
  const hits = (failures.get(ip) || []).filter((t) => Date.now() - t < WINDOW_MS);
  if (hits.length) failures.set(ip, hits);
  else failures.delete(ip);
  return hits.length >= MAX_FAILURES;
}

function recordFailure(ip) {
  const hits = (failures.get(ip) || []).filter((t) => Date.now() - t < WINDOW_MS);
  hits.push(Date.now());
  failures.set(ip, hits);
  if (failures.size > 500) {
    for (const [k, v] of failures) {
      if (!v.some((t) => Date.now() - t < WINDOW_MS)) failures.delete(k);
    }
  }
}

function readJsonBody(req) {
  try {
    return typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    return {};
  }
}

module.exports = {
  configured, missingEnv, findCreator, termsFor, recordSignature,
  clientIp, isRateLimited, recordFailure, readJsonBody,
};
