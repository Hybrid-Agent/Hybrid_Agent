const nodemailer = require("nodemailer");
const config = require("../config");

let _transport = null;
function transport() {
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host: config.email.smtpHost,
      port: config.email.smtpPort,
      secure: Number(config.email.smtpPort) === 465, // Implicit SSL on 465, STARTTLS otherwise
      auth: { user: config.email.smtpUser, pass: config.email.smtpPass },
    });
  }
  return _transport;
}

async function send({ to, subject, text }) {
  if (config.email.configured) {
    await transport().sendMail({ from: config.email.from, to, subject, text });
    return { ok: true, channel: "brevo" };
  }
  console.log(`\n──────── EMAIL ────────\nTo: ${to}\nSubject: ${subject}\n\n${text}\n───────────────────────\n`);
  return { ok: true, channel: "console" };
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
