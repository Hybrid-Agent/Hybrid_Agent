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

const approveLink = (listingId) => `${config.appBaseUrl}/claim?listingId=${listingId}&action=approve`;
const withdrawLink = (listingId) => `${config.appBaseUrl}/claim?listingId=${listingId}&action=withdraw`;

function sendListingNotice({ to, ownerName, agentName, title, listingId }) {
  return send({
    to,
    subject: `Action required: ${agentName} listed your property on HybridAgent`,
    text:
      `Hi ${ownerName || "there"},\n\n` +
      `${agentName} has listed "${title}" for sale on HybridAgent on your behalf.\n\n` +
      `WHAT YOU NEED TO DO:\n` +
      `Please review the listing and confirm you authorised ${agentName} to list this asset. ` +
      `This takes less than a minute — just click the link below, sign in with this email address, and tap Approve.\n\n` +
      `➡  Review & approve your listing:\n${approveLink(listingId)}\n\n` +
      `Once approved, a secure wallet has been reserved for you at this email. When the sale completes, ` +
      `your proceeds are paid there automatically.\n\n` +
      `If you did NOT authorise this listing, please ignore this email and contact us.\n`,
  });
}

function sendClaimReady({ to, title, listingId }) {
  return send({
    to,
    subject: `Your funds are ready to withdraw — "${title}" has sold`,
    text:
      `Great news!\n\n` +
      `The sale of "${title}" has completed and your proceeds are waiting in your reserved wallet.\n\n` +
      `WITHDRAW YOUR FUNDS:\n` +
      `Sign in with this email (magic link) to open your wallet and transfer your USDC to any address you choose:\n\n` +
      `➡  Withdraw your funds:\n${withdrawLink(listingId)}\n\n` +
      `Your funds are secured on-chain and only you can access them with this email address.\n`,
  });
}

module.exports = { send, sendListingNotice, sendClaimReady };
