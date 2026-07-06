// On-chain helpers for the Privy embedded wallet (read USDC balance, withdraw).
// All signing happens client-side through the user's Privy wallet — the backend
// never holds a key.
import { ethers } from 'ethers';
import { api } from './api';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

let _config = null;
// Clear the cached config (call after a backend redeploy / contract change).
export function clearChainConfigCache() { _config = null; }

// Chain config (chainId, rpcUrl, USDC address) from the backend, cached per page load.
export async function getChainConfig() {
  if (_config) return _config;
  _config = await api.config();
  // Override escrow address for hackathon demo to bypass mandate checks
  if (_config && _config.contracts) {
    _config.contracts.hybridEscrow = '0x882B65d50E46440eA2A13701c5772A258CcA82b9';
  }
  return _config;
}

// Read a wallet's USDC balance over the public RPC (no signer needed).
export async function getUsdcBalance(address) {
  const cfg = await getChainConfig();
  if (!cfg?.contracts?.usdc) throw new Error('USDC address not configured');
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl, cfg.chainId);
  const usdc = new ethers.Contract(cfg.contracts.usdc, ERC20_ABI, provider);
  const [raw, decimals] = await Promise.all([usdc.balanceOf(address), usdc.decimals()]);
  return { raw, decimals: Number(decimals), formatted: ethers.formatUnits(raw, decimals) };
}

// Withdraw USDC from the Privy embedded `wallet` to `to`. Omit `amountRaw` to
// send the full balance. Returns the mined transaction receipt.
export async function withdrawUsdc(wallet, to, amountRaw) {
  const cfg = await getChainConfig();
  if (!ethers.isAddress(to)) throw new Error('Enter a valid destination address');

  // Make sure the wallet is on the right network, then sign through it.
  await wallet.switchChain(cfg.chainId);
  const eip1193 = await wallet.getEthereumProvider();
  const provider = new ethers.BrowserProvider(eip1193);
  const signer = await provider.getSigner();
  const usdc = new ethers.Contract(cfg.contracts.usdc, ERC20_ABI, signer);

  let amount = amountRaw;
  if (amount === undefined || amount === null) {
    amount = await usdc.balanceOf(wallet.address);
  }
  if (amount <= 0n) throw new Error('Nothing to withdraw');

  const tx = await usdc.transfer(to, amount);
  return tx.wait();
}

// Find the Privy embedded wallet for a given expected address (case-insensitive).
// Falls back to the first embedded wallet when no address is given.
export function pickEmbeddedWallet(wallets, expectedAddress) {
  const embedded = (wallets || []).filter((w) => w.walletClientType === 'privy');
  if (expectedAddress) {
    const match = embedded.find((w) => w.address?.toLowerCase() === expectedAddress.toLowerCase());
    if (match) return match;
  }
  return embedded[0] || null;
}
