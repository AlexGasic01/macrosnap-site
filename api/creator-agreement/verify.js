/* POST /api/creator-agreement/verify  { firstName, lastName, accessCode }
 *
 * Returns that one creator's terms. The access code is never echoed back, and
 * a wrong first name, wrong surname and wrong code are indistinguishable: all
 * three give the same 401, so the response never says which part was wrong.
 */

const {
  findCreator, termsFor, clientIp, isRateLimited, recordFailure, readJsonBody,
} = require("../_lib/creators.js");
const store = require("../_lib/store.js");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    res.status(429).json({ error: "rate_limited" });
    return;
  }

  const body = readJsonBody(req);
  const rec = findCreator(body.firstName, body.lastName, body.accessCode);

  if (!rec) {
    recordFailure(ip);
    res.status(401).json({ error: "invalid" });
    return;
  }

  let alreadySigned = false;
  if (store.configured()) {
    try {
      alreadySigned = Boolean(await store.findSigned(rec.accessCode));
    } catch (e) {
      // A storage outage must not lock a creator out of reading their
      // agreement. They see the unsigned state; the sign endpoint is the one
      // that has to be right, and it re-checks there.
      alreadySigned = false;
    }
  }

  res.status(200).json({
    creatorName: rec.firstName + " " + rec.lastName,
    firstName: rec.firstName,
    lastName: rec.lastName,
    terms: termsFor(rec),
    alreadySigned,
  });
};
