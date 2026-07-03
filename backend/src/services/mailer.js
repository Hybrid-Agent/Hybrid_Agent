// Sends email via SendGrid transactional API
const config = require("../config");

async function send({ to, subject, text }) {
  if (!config.email.configured) {
    console.log(`\n──────── EMAIL ────────\nTo: ${to}\nSubject: ${subject}\n\n${text}\n───────────────────────\n`);
    return { ok: true, channel: "console" };
  }

  // Parse "Name <email@domain.com>" format
  const fromMatches = config.email.from.match(/(.*)<(.+)>/);
  const fromEmail = fromMatches ? fromMatches[2].trim() : config.email.from.trim();
  const fromName = fromMatches ? fromMatches[1].trim() : "HybridAgent";

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.email.sendgridApiKey}`,
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName },
      subject,
      content: [{ type: "text/plain", value: text }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SendGrid API error ${res.status}: ${err}`);
  }

  return { ok: true, channel: "sendgrid" };
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
