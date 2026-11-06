/* Emails the signed agreement, after it is saved.
 *
 * The company only — the creator gets their copy from the download button on
 * the page, not by email.
 *
 * Everything here is optional. A missing key, an unverified sender, a
 * provider outage or no configuration at all is reported back and ignored —
 * the signature is already in the database by the time this runs, and a mail
 * problem must never cost a creator their signing.
 *
 * Recipients live in AGREEMENT_EMAIL_TO rather than in the repo, which is
 * public.
 */

const API = "https://api.resend.com/emails";

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.AGREEMENT_EMAIL_FROM;
const TO = String(process.env.AGREEMENT_EMAIL_TO || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const enabled = () => Boolean(KEY && FROM && TO.length);

function why() {
  const missing = [];
  if (!KEY) missing.push("RESEND_API_KEY");
  if (!FROM) missing.push("AGREEMENT_EMAIL_FROM");
  if (!TO.length) missing.push("AGREEMENT_EMAIL_TO");
  return missing;
}

function filename(rec) {
  const safe = (s) => String(s).replace(/[^A-Za-z0-9]+/g, "");
  return `MacroSnap-Creator-Agreement-${safe(rec.first_name)}-${safe(rec.last_name)}.pdf`;
}

/* Resolves { sent, error } and never throws. */
async function send(message) {
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ from: FROM }, message)),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { sent: false, error: "resend " + res.status + " " + detail.slice(0, 200) };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: String(e && e.message).slice(0, 200) };
  }
}

/* Resolves { sent, error } and never throws. */
async function sendSignedAgreement(rec, meta) {
  if (!enabled()) return { sent: false, error: "not_configured:" + why().join(",") };

  const name = rec.first_name + " " + rec.last_name;
  const when = meta.signedDateText || meta.signedAt;

  return send({
    to: TO,
    subject: `Signed Creator Agreement — ${name}`,
    text: [
      `${name} has signed their MacroSnap Creator Agreement.`,
      "",
      `Signed:            ${when}`,
      `Access code:       ${rec.access_code}`,
      `Agreement SHA-256: ${meta.hash}`,
      `IP address:        ${meta.ip}`,
      `User agent:        ${meta.userAgent}`,
      "",
      "The signed PDF is attached. The same copy, the signature image and",
      "these details are on the creator's row in public.creator_agreements.",
    ].join("\n"),
    attachments: [{ filename: filename(rec), content: meta.pdfBase64 }],
  });
}

module.exports = { enabled, why, sendSignedAgreement, filename };
