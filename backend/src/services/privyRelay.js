// Relays EVM escrow transactions through Privy's wallet RPC with "user pays in
// USDC" gas sponsorship (Privy "User pays" mode, EIP-7702).
//
// The buyer's embedded wallet is upgraded to a smart account for the sponsored
// transaction and gas is deducted from the buyer's CANONICAL USDC balance on
// the target chain (not the repo's MockUSDC). This requires:
//   1. Privy Dashboard -> Wallet Infrastructure -> Gas sponsorship = "User pays"
//      with the target chain/token (sepolia->usdc, base sepolia->usdc) enabled.
//   2. "Server-side access to user wallets" enabled in the dashboard so the
//      backend can act on the user's embedded wallet via the wallet RPC.
const config = require("../config");

// Privy wallet RPC endpoint (raw HTTP) — supports `sponsor_options.asset` which
// the installed @privy-io/server-auth v1.32.5 sendTransaction type does not.
const WALLET_RPC_URL = "https://api.privy.io/v1/wallets";

const { ethers } = require("ethers");

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
];
const ESCROW_ABI = ["function fundDeal(uint256 id)"];

function configured() {
  return Boolean(config.privy.configured && config.privy.appId && config.privy.appSecret);
}

// Basic auth header: base64(appId:appSecret)
function authHeader() {
  const token = Buffer.from(`${config.privy.appId}:${config.privy.appSecret}`).toString("base64");
  return `Basic ${token}`;
}

// Look up the buyer's Privy user and return their embedded (privy) wallet id.
// Only present when "server-side access to user wallets" is enabled.
async function embeddedWalletId(email) {
  const { PrivyClient } = require("@privy-io/server-auth");
  const client = new PrivyClient(config.privy.appId, config.privy.appSecret);
  const user = await client.getUserByEmail(email);
  if (!user) return null;
  if (!Array.isArray(user.linkedAccounts)) return null;
  for (const acc of user.linkedAccounts) {
    if (acc.type === "wallet" && acc.chainType === "ethereum" && acc.walletClientType === "privy") {
      if (acc.id) return acc.id;
    }
  }
  return null;
}

async function rpc(walletId, body) {
  const url = `${WALLET_RPC_URL}/${walletId}/rpc`;
  const headers = {
    Authorization: authHeader(),
    "privy-app-id": config.privy.appId,
    "Content-Type": "application/json",
  };

  // Server-side wallet access requires signing the request with the app's
  // authorization private key -> `privy-authorization-signature` header.
  // IMPORTANT: the `body` in the signed input must be the *exact same object*
  // that is later JSON.stringify'd for the HTTP request so canonical ordering
  // is identical and the signature verifies correctly.
  if (config.privy.authorizationPrivateKey) {
    const { generateAuthorizationSignature } = require("@privy-io/node");
    const requestExpiry = String(Date.now() + 5 * 60 * 1000); // ms, ~5 min
    const signedHeaders = {
      "privy-app-id": config.privy.appId,
      "privy-request-expiry": requestExpiry,
    };
    // Use the same `body` reference — do NOT copy/re-serialize it here.
    const input = {
      version: 1,
      method: "POST",
      url,
      body,
      headers: signedHeaders,
    };
    const signature = generateAuthorizationSignature({
      authorizationPrivateKey: config.privy.authorizationPrivateKey,
      input,
    });
    // Privy expects a comma-separated list of signatures (one per auth key).
    headers["privy-authorization-signature"] = [signature].join(",");
    headers["privy-request-expiry"] = requestExpiry;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.message || data?.error?.message || data?.error || `privy rpc failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Build the approve() call data for the escrow's USDC (the repo's configured token).
function approveCallData(usdcAddress, escrowAddress, amount) {
  const iface = new ethers.Interface(ERC20_ABI);
  return iface.encodeFunctionData("approve", [escrowAddress, amount]);
}

function fundCallData(dealId) {
  const iface = new ethers.Interface(ESCROW_ABI);
  return iface.encodeFunctionData("fundDeal", [dealId]);
}

/**
 * Fund an escrow deal with gas paid in USDC.
 * @param {object} opts
 * @param {string} opts.email        buyer's email (maps to their Privy wallet)
 * @param {string} opts.caip2        e.g. "eip155:11155111" (Sepolia) / "eip155:84532" (Base)
 * @param {string} opts.usdcAddress  the escrow's USDC (approved toward escrow)
 * @param {string} opts.escrowAddress
 * @param {bigint|string} opts.amount  full price in USDC base units
 * @param {bigint|number|string} opts.dealId
 * @returns {{userOpHash:string, approveHash?:string, fundHash:string}}
 */
async function fundEscrowUsdcGas({ email, caip2, usdcAddress, escrowAddress, amount, dealId }) {
  if (!configured()) throw new Error("Privy is not configured on this backend");
  if (!config.privy.authorizationPrivateKey) {
    throw new Error(
      "Server-side wallet access is not configured (PRIVY_AUTHORIZATION_PRIVATE_KEY missing). " +
        "Create an authorization key in the Privy Dashboard (Wallets -> Authorization keys) and " +
        "set PRIVY_AUTHORIZATION_PRIVATE_KEY in backend/.env."
    );
  }
  if (!ethers.isAddress(usdcAddress) || !ethers.isAddress(escrowAddress)) {
    throw new Error("Invalid USDC / escrow address");
  }
  const walletId = await embeddedWalletId(email);
  if (!walletId) {
    throw new Error(
      "Could not resolve your embedded wallet for server-side relay. " +
        "Ensure 'Server-side access to user wallets' is enabled in the Privy Dashboard."
    );
  }

  const approveData = approveCallData(usdcAddress, escrowAddress, BigInt(amount));
  const fundData = fundCallData(BigInt(dealId));

  // 1) approve USDC -> escrow (gas paid in USDC)
  let approveHash = null;
  const approveRes = await rpc(walletId, {
    method: "eth_sendTransaction",
    caip2,
    sponsor: true,
    sponsor_options: { asset: "usdc" },
    params: { transaction: { to: usdcAddress, data: approveData } },
  });
  approveHash = approveRes?.data?.hash || approveRes?.hash || null;
  // A short poll for the UserOp to confirm before funding (best-effort).
  if (approveHash) await sleep(4000);

  // 2) fundDeal (gas paid in USDC)
  const fundRes = await rpc(walletId, {
    method: "eth_sendTransaction",
    caip2,
    sponsor: true,
    sponsor_options: { asset: "usdc" },
    params: { transaction: { to: escrowAddress, data: fundData } },
  });
  const fundHash = fundRes?.data?.hash || fundRes?.hash || null;

  return {
    userOpHash: fundHash,
    approveHash,
    fundHash,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { configured, fundEscrowUsdcGas, embeddedWalletId };
