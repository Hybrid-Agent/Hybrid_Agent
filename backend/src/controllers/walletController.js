const { ethers } = require("ethers");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const dealModel = require("../models/dealModel");
const stellarWallet = require("../services/stellarWallet");
const config = require("../config");

const fmt = (base) => (Number(base) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });

// Server-side ERC-20 balanceOf (no CORS issues)
async function erc20Balance(rpcUrl, tokenAddr, ownerAddr, decimals = 6) {
  try {
    const data = "0x70a08231" + ownerAddr.replace("0x", "").padStart(64, "0");
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: tokenAddr, data }, "latest"] }),
    });
    const { result } = await res.json();
    if (!result || result === "0x") return null;
    return (Number(BigInt(result)) / 10 ** decimals).toFixed(2);
  } catch { return null; }
}

async function ethBalance(rpcUrl, addr) {
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [addr, "latest"] }),
    });
    const { result } = await res.json();
    return (Number(BigInt(result)) / 1e18).toFixed(4);
  } catch { return null; }
}

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
  let stellar = null;
  try {
    stellar = await stellarWallet.getForUser(req.user);
  } catch (e) {
    stellar = { error: e.message };
  }

  // Server-side multi-chain balances (avoids CORS in browser)
  const ethSepoliaRpc = config.rpcUrl || "https://ethereum-sepolia-rpc.publicnode.com";
  const baseRpc = config.base.rpcUrl || "https://sepolia.base.org";
  const baseUsdcAddr = config.base.usdcAddress;

  const [ethSepoliaEth, baseEth, baseUsdc] = await Promise.all([
    ethBalance(ethSepoliaRpc, wallet),
    ethBalance(baseRpc, wallet),
    baseUsdcAddr ? erc20Balance(baseRpc, baseUsdcAddr, wallet) : Promise.resolve(null),
  ]);

  res.json({
    address: req.user.wallet_address,
    balanceUsdc: fmt(total),
    balanceBase: total.toString(),
    breakdown: { commissionUsdc: fmt(commission), proceedsUsdc: fmt(proceeds) },
    completedDeals: asAgent.length + asSeller.length,
    stellar,
    chains: {
      ethSepolia: { eth: ethSepoliaEth },
      baseSepolia: { eth: baseEth, usdc: baseUsdc },
    },
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

// POST /wallet/stellar/activate — fund the user's derived Stellar wallet
// (testnet friendbot) and create its USDC trustline so it can hold XLM/USDC.
const stellarActivate = asyncHandler(async (req, res) => {
  if (!stellarWallet.configured()) {
    throw ApiError.internal("Stellar rail is not configured (SOROBAN_*)");
  }
  const keypair = stellarWallet.keypairFor(req.user);
  const balances = await stellarWallet.activate(keypair);
  res.json({ ok: true, address: keypair.publicKey(), balances });
});

// POST /wallet/stellar/withdraw — send XLM or USDC (Stellar) from the user's
// derived Stellar wallet to a destination Stellar address.
const stellarWithdraw = asyncHandler(async (req, res) => {
  if (!stellarWallet.configured()) {
    throw ApiError.internal("Stellar rail is not configured (SOROBAN_*)");
  }
  const { asset, to, amount } = req.body || {};
  if (!to) throw ApiError.badRequest("destination Stellar address is required");
  const keypair = stellarWallet.keypairFor(req.user);

  const result = await stellarWallet.transfer({
    keypair,
    to,
    asset,
    amountStr: amount,
  });
  res.json({ ok: true, ...result });
});

module.exports = { get, withdraw, fundGas, stellarActivate, stellarWithdraw };
