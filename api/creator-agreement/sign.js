/* POST /api/creator-agreement/sign
 *   { firstName, lastName, accessCode, signedAt, signedDateText,
 *     signaturePng (base64), pdf (base64), agreementTextSha256 }
 *
 * Re-verifies the creator, recomputes the agreement text from the STORED
 * terms with the same engine, and refuses if its hash differs from the one
 * the browser signed. That is what stops a creator signing one document while
 * a different one is on file.
 */

const crypto = require("crypto");
const A = require("../_lib/agreement.js");

require("../../lib/agreement-engine.js");        // defines globalThis.MS
const MS = globalThis.MS;

const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_SIG_BYTES = 2 * 1024 * 1024;
const b64len = (s) => Math.floor((String(s || "").length * 3) / 4);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  if (!A.configured()) {
    res.status(500).json({ error: "not_configured", missing: A.missingEnv() });
    return;
  }

  const ip = A.clientIp(req);
  if (A.isRateLimited(ip)) {
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  const body = A.readJsonBody(req);

  let rec;
  try {
    rec = await A.findCreator(body.firstName, body.lastName, body.accessCode);
  } catch (e) {
    res.status(502).json({ error: "upstream" });
    return;
  }
  if (!rec) {
    A.recordFailure(ip);
    res.status(401).json({ error: "invalid" });
    return;
  }
  if (rec.signed_at) {
    res.status(409).json({ error: "already_signed" });
    return;
  }

  if (!body.pdf || !body.signaturePng) {
    res.status(400).json({ error: "missing_signature" });
    return;
  }
  if (b64len(body.pdf) > MAX_PDF_BYTES || b64len(body.signaturePng) > MAX_SIG_BYTES) {
    res.status(413).json({ error: "too_large" });
    return;
  }

  // The agreement the browser signed must be the agreement on file.
  const text = MS.toText(MS.buildBlocks(A.termsFor(rec)).blocks);
  const expected = crypto.createHash("sha256").update(text, "utf8").digest("hex");
  if (String(body.agreementTextSha256 || "").toLowerCase() !== expected) {
    res.status(409).json({ error: "terms_changed" });
    return;
  }

  const signedAt = Date.parse(body.signedAt) ? new Date(body.signedAt).toISOString()
                                             : new Date().toISOString();

  let stored;
  try {
    stored = await A.recordSignature(rec.access_code, {
      signed_at: signedAt,
      signed_date_text: String(body.signedDateText || "").slice(0, 64),
      agreement_sha256: expected,
      signature_png_base64: String(body.signaturePng),
      pdf_base64: String(body.pdf),
      ip_address: ip,
      user_agent: String(req.headers["user-agent"] || "").slice(0, 512),
    });
  } catch (e) {
    res.status(502).json({ error: "upstream" });
    return;
  }

  // The update is filtered on signed_at being null, so matching no row means
  // someone signed in between the check above and this write.
  if (!stored) {
    res.status(409).json({ error: "already_signed" });
    return;
  }

  res.status(200).json({ ok: true, signedAt, signedDateText: body.signedDateText || "" });
};
