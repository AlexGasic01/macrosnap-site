/* POST /api/creator-agreement/verify  { firstName, lastName, accessCode }
 *
 * Returns that one creator's terms. The access code is never echoed back, and
 * a wrong first name, wrong surname and wrong code are indistinguishable: all
 * three give the same 401, so the response never says which part was wrong.
 */

const A = require("../_lib/agreement.js");

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

  res.status(200).json({
    creatorName: rec.first_name + " " + rec.last_name,
    firstName: rec.first_name,
    lastName: rec.last_name,
    terms: A.termsFor(rec),
    alreadySigned: Boolean(rec.signed_at),
  });
};
