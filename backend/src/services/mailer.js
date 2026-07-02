// Sends email via Brevo transactional API (works on any host — no SMTP ports needed).
const config = require("../config");

async function send({ to, subject, text }) {
  if (!config.email.configured) {
    console.log(`\n──────── EMAIL ────────\nTo: ${to}\nSubject: ${subject}\n\n${text}\n───────────────────────\n`);
    return { ok: true, channel: "console" };
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.email.brevoApiKey,
    },
    body: JSON.stringify({
      sender: { name: "HybridAgent", email: config.email.from.replace(/.*<(.+)>/, "$1") },
      to: [{ email: to }],
      subject,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${err}`);
  }

  return { ok: true, channel: "brevo" };
}

const claimLink = (listingId) => `${config.appBaseUrl}/claim?listingId=${listingId}`;

function sendListingNotice({ to, ownerName, agentName, title, listingId }) {
  return send({
    to,
    subject: `${agentName} listed your property on HybridAgent`,
    text:
      `Hi ${ownerName || "there"},\n\n` +
      `${agentName} has listed "${title}" for sale on HybridAgent on your behalf.\n` +
      `A secure wallet has been reserved for you using this email address. When the ` +
      `sale completes, your proceeds are paid there automatically — no one can ` +
      `intercept them.\n\n` +
      `Verify & track your sale:\n${claimLink(listingId)}\n`,
  });
}

function sendClaimReady({ to, title, listingId }) {
  return send({
    to,
    subject: "Your funds are ready to claim",
    text:
      `Good news — the sale of "${title}" has completed and your funds are ready.\n\n` +
      `Sign in with this email (magic link) to open your wallet and withdraw:\n` +
      `${claimLink(listingId)}\n`,
  });
}

module.exports = { send, sendListingNotice, sendClaimReady };
