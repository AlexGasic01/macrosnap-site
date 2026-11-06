/* Emails the signed agreement, after it is saved.
 *
 * Two separate messages, not one with both parties on it:
 *   - the company gets the audit detail (IP, user agent, hash)
 *   - the creator gets their own copy, and none of that framing
 *
 * Everything here is optional. A missing key, an unverified sender, a
 * provider outage or no configuration at all is reported back and ignored —
 * the signature is already in the database by the time this runs, and a mail
 * problem must never cost a creator their signing.
 *
 * Company recipients live in AGREEMENT_EMAIL_TO rather than in the repo,
 * which is public. The creator's address comes from their own record.
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

/* Deliberately conservative: anything that is not plainly one address is
 * treated as absent rather than guessed at, so a typo in the record cannot
 * send a signed contract somewhere unintended. */
function creatorEmail(rec) {
  const e = String((rec.terms && rec.terms.creatorEmail) || "").trim();
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e) ? e : "";
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

/* Resolves { company, creator }, each { sent, error } — and never throws. */
async function sendSignedAgreement(rec, meta) {
  if (!enabled()) {
    const skipped = { sent: false, error: "not_configured:" + why().join(",") };
    return { company: skipped, creator: skipped };
  }

  const name = rec.first_name + " " + rec.last_name;
  const attachment = { filename: filename(rec), content: meta.pdfBase64 };
  const when = meta.signedDateText || meta.signedAt;

  const company = await send({
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
      `Copy to creator:   ${creatorEmail(rec) || "no email on their record"}`,
      "",
      "The signed PDF is attached. The same copy, the signature image and",
      "these details are on the creator's row in public.creator_agreements.",
    ].join("\n"),
    attachments: [attachment],
  });

  const to = creatorEmail(rec);
  const creator = to
    ? await send({
        to: [to],
        reply_to: TO[0],
        subject: "Your signed MacroSnap Creator Agreement",
        text: [
          `Hi ${rec.first_name},`,
          "",
          `Thanks for signing. Your Creator Agreement is attached, signed on ${when}.`,
          "Keep it somewhere safe — it is your copy of what you agreed to.",
          "",
          "Just reply to this email if anything looks wrong or you have a question.",
          "",
          "MacroSnap",
        ].join("\n"),
        attachments: [attachment],
      })
    : { sent: false, error: "no creatorEmail on the record" };

  return { company, creator };
}

module.exports = { enabled, why, sendSignedAgreement, filename, creatorEmail };
