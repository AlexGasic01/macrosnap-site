/* Shared by the verify and sign endpoints.
 *
 * Creator records never reach the browser. They are read from, in order:
 *   1. CREATORS_JSON — a Vercel environment variable holding the JSON array.
 *   2. api/_lib/creators.json — bundled with the function. Vercel does not
 *      serve anything under /api as a static file, and the leading underscore
 *      keeps it from becoming a route, so it is not fetchable.
 *
 * Do NOT move this file to /data or any other directory: everything outside
 * /api is served as a static asset, which would publish every access code.
 */

const crypto = require("crypto");

let cache = null;

function loadCreators() {
  if (cache) return cache;
  if (process.env.CREATORS_JSON) {
    cache = JSON.parse(process.env.CREATORS_JSON);
  } else {
    cache = require("./creators.json");
  }
  if (!Array.isArray(cache)) throw new Error("creators must be an array");
  return cache;
}

/* Compares via SHA-256 digests so the comparison is constant time and does not
 * leak length either — timingSafeEqual throws on unequal-length buffers. */
function sameSecret(a, b) {
  const ha = crypto.createHash("sha256").update(String(a), "utf8").digest();
  const hb = crypto.createHash("sha256").update(String(b), "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}

/* Exact, case-sensitive match on all three fields, whitespace trimmed.
 * Every record is checked even after a hit, so the time taken does not reveal
 * the matching record's position. Returns the record or null. */
function findCreator(firstName, lastName, accessCode) {
  const f = String(firstName ?? "").trim();
  const l = String(lastName ?? "").trim();
  const c = String(accessCode ?? "").trim();
  if (!f || !l || !c) return null;

  let found = null;
  for (const rec of loadCreators()) {
    const hit =
      sameSecret(rec.accessCode, c) &
      sameSecret(rec.firstName, f) &
      sameSecret(rec.lastName, l);
    if (hit && !found) found = rec;
  }
  return found;
}

/* The terms handed to the engine. creatorName is built from the record, never
 * from what the visitor typed. */
function termsFor(rec) {
  return Object.assign({}, rec.terms, {
    creatorName: rec.firstName + " " + rec.lastName,
  });
}

/* ── Rate limiting ────────────────────────────────────────────────────────
 * Per-instance and in-memory: a serverless instance is short-lived and there
 * can be several, so this slows a guessing attack down rather than stopping
 * it dead. It is sized for a programme with a handful of creators; move the
 * counter into Supabase if the creator list ever gets long enough to be worth
 * attacking. */
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

  if (failures.size > 500) {                       // keep the map bounded
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
  findCreator, termsFor, clientIp, isRateLimited, recordFailure, readJsonBody,
  MAX_FAILURES, WINDOW_MS,
};
