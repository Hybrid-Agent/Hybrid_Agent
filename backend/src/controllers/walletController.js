const { ethers } = require("ethers");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const dealModel = require("../models/dealModel");
const db = require("../config/filebaseDB");
const { decrypt } = require("../utils/crypto");

const fmt = (base) => (Number(base) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });

// GET /wallet  (auth) — the signed-in user's payout wallet + withdrawable balance.
// Balance = funds owed to this wallet from COMPLETED escrow deals:
//   - commission, where they were the agent
//   - proceeds, where they were the seller (owner-direct)
const get = asyncHandler(async (req, res) => {
  const wallet = req.user.wallet_address.toLowerCase();
  const [asAgent, asSeller] = await Promise.all([
    dealModel.list({ agent: wallet, state: "completed" }),
    dealModel.list({ seller: wallet, state: "completed" }),
  ]);

  let commission = 0n;
  for (const d of asAgent) commission += (BigInt(d.price) * BigInt(d.commission_bps)) / 10000n;

  let proceeds = 0n;
  for (const d of asSeller) {
    const price = BigInt(d.price);
    proceeds += price - (price * BigInt(d.commission_bps)) / 10000n - (price * BigInt(d.platform_fee_bps)) / 10000n;
  }

  const total = commission + proceeds;
  res.json({
    address: req.user.wallet_address,
    balanceUsdc: fmt(total),
    balanceBase: total.toString(),
    breakdown: { commissionUsdc: fmt(commission), proceedsUsdc: fmt(proceeds) },
    completedDeals: asAgent.length + asSeller.length,
  });
});

// POST /wallet/withdraw  (auth) — send USDC out of the embedded wallet.
// Scaffold: real signing happens via the embedded-wallet provider (Privy
// magic-link) once contracts + USDC are live. We validate input and ack here.
const withdraw = asyncHandler(async (req, res) => {
  const { to } = req.body || {};
  if (to && !ethers.isAddress(to)) throw ApiError.badRequest("destination address is invalid");
  res.json({
    ok: true,
    queued: true,
    message:
      "Withdrawal request received. On-chain USDC transfer executes via your email wallet once escrow contracts are live.",
    to: to || req.user.wallet_address,
  });
});

// GET /wallet/key  (auth) — return decrypted embedded-wallet private key.
// MVP-only: moves to Privy/Web3Auth in production (key never leaves server there).
const getKey = asyncHandler(async (req, res) => {
  const raw = await db.get(`db/users/records/${req.user.id}.json`);
  if (!raw?.wallet_enc_key) throw ApiError.badRequest("no embedded wallet found for this account");
  const privateKey = decrypt(raw.wallet_enc_key);
  res.json({ privateKey });
});

const config = require("../config");

// Keep track of recent funding to prevent spam
const recentFunds = new Map();

// POST /wallet/fund-gas
const fundGas = asyncHandler(async (req, res) => {
  const { address } = req.body;
  if (!address || !ethers.isAddress(address)) {
    throw ApiError.badRequest("Valid address required");
  }

  if (!config.deployerPrivateKey) {
    throw ApiError.internal("Deployer private key not configured");
  }

  // Basic anti-spam (1 min cooldown per address)
  const lastFunded = recentFunds.get(address);
  if (lastFunded && Date.now() - lastFunded < 60 * 1000) {
    throw ApiError.tooManyRequests("Please wait before requesting gas again");
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  const wallet = new ethers.Wallet(config.deployerPrivateKey, provider);

  const targetBalance = await provider.getBalance(address);
  const minRequired = ethers.parseEther("0.0005");
  const amountToSend = ethers.parseEther("0.001");

  if (targetBalance >= minRequired) {
    return res.json({ ok: true, message: "Wallet already has sufficient gas", skipped: true });
  }

  const deployerBalance = await provider.getBalance(wallet.address);
  if (deployerBalance < amountToSend) {
    throw ApiError.internal("Deployer wallet out of gas funds");
  }

  console.log(`[faucet] Sending ${ethers.formatEther(amountToSend)} ETH to ${address}`);
  const tx = await wallet.sendTransaction({
    to: address,
    value: amountToSend,
  });
  
  recentFunds.set(address, Date.now());

  return res.json({ ok: true, txHash: tx.hash, skipped: false });
});

module.exports = { get, withdraw, getKey, fundGas };
