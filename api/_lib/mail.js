/* Emails the signed agreement to the company.
 *
 * Sent through Resend. Everything here is optional configuration: if the key
 * or the recipients are missing, no email is sent and signing is unaffected.
 * That is deliberate — the signature is already in the database by the time
 * this runs, and a mail outage must never cost a creator their signature.
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

/* Resolves { sent, error } and never throws: the caller treats a failure as
 * something to note, not something to fail the request over. */
async function sendSignedAgreement(rec, meta) {
  if (!enabled()) return { sent: false, error: "not_configured:" + why().join(",") };

  const name = rec.first_name + " " + rec.last_name;
  const lines = [
    `${name} has signed their MacroSnap Creator Agreement.`,
    "",
    `Signed:        ${meta.signedDateText || meta.signedAt}`,
    `Access code:   ${rec.access_code}`,
    `Agreement SHA-256: ${meta.hash}`,
    `IP address:    ${meta.ip}`,
    `User agent:    ${meta.userAgent}`,
    "",
    "The signed PDF is attached. The same copy, the signature image and these",
    "details are on the creator's row in public.creator_agreements.",
  ];

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: TO,
        subject: `Signed Creator Agreement — ${name}`,
        text: lines.join("\n"),
        attachments: [{ filename: filename(rec), content: meta.pdfBase64 }],
      }),
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

module.exports = { enabled, why, sendSignedAgreement, filename };
