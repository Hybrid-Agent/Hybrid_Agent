import { ethers } from 'ethers';
import { api } from './api';

// Minimal ABI fragments — only what the mobile app needs
const ESCROW_ABI = [
  'function createDeal(bytes32 listingRef, address seller, address agent, uint256 commissionBps) external returns (uint256 dealId)',
  'function fundDeal(uint256 dealId) external',
  'function confirmCompletion(uint256 dealId) external',
  'function cancelDeal(uint256 dealId) external',
  'event DealCreated(uint256 indexed dealId, bytes32 indexed listingRef, address buyer, address seller)',
  'event DealFunded(uint256 indexed dealId)',
  'event DealCompleted(uint256 indexed dealId)',
] as const;

const USDC_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
] as const;

// Re-export utilities that screens need, so they don't have to import ethers directly
export const ZeroAddress = ethers.ZeroAddress;
export const ethersId    = ethers.id;

export interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  contracts: { usdc: string; mandateRegistry: string; hybridEscrow: string };
}

let _config: ChainConfig | null = null;

// Call this to bust the config cache (e.g. after a backend redeploy).
export function clearConfigCache() { _config = null; }

async function getConfig(): Promise<ChainConfig> {
  if (_config) return _config;
  _config = await api.chainConfig();
  return _config;
}

// Returns a read-only provider (no signer needed for queries)
async function getProvider(): Promise<ethers.JsonRpcProvider> {
  const cfg = await getConfig();
  return new ethers.JsonRpcProvider(cfg.rpcUrl);
}

// Returns a signer backed by the given private key
async function getSigner(privateKey: string): Promise<{ signer: ethers.Wallet; config: ChainConfig }> {
  const config   = await getConfig();
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer   = new ethers.Wallet(privateKey, provider);
  return { signer, config };
}

// Approve HybridEscrow to spend USDC then call createDeal + fundDeal
export async function buyListing(params: {
  privateKey: string;
  listingRef: string;    // bytes32 hex
  seller: string;        // seller wallet address
  agent: string;         // agent wallet address (or address(0) for owner_direct)
  commissionBps: number;
  priceUsdc: string;     // USDC base units (6 decimals)
}) {
  const { signer, config } = await getSigner(params.privateKey);
  const usdc   = new ethers.Contract(config.contracts.usdc, USDC_ABI, signer);
  const escrow = new ethers.Contract(config.contracts.hybridEscrow, ESCROW_ABI, signer);

  // Approve escrow to spend the full price
  const approveTx = await usdc.approve(config.contracts.hybridEscrow, params.priceUsdc);
  await approveTx.wait();

  // Create deal — emits DealCreated with dealId
  const createTx = await escrow.createDeal(
    params.listingRef,
    params.seller,
    params.agent,
    params.commissionBps
  );
  const receipt = await createTx.wait();
  const dealCreatedLog = receipt.logs.find(
    (l: any) => l.fragment?.name === 'DealCreated'
  );
  const dealId = dealCreatedLog?.args?.[0] as bigint;

  // Fund the deal
  const fundTx = await escrow.fundDeal(dealId);
  await fundTx.wait();

  return { dealId: dealId.toString(), txHash: fundTx.hash };
}

// Confirm deal completion (buyer releases funds)
export async function confirmDeal(privateKey: string, dealId: string) {
  const { signer, config } = await getSigner(privateKey);
  const escrow = new ethers.Contract(config.contracts.hybridEscrow, ESCROW_ABI, signer);
  const tx = await escrow.confirmCompletion(BigInt(dealId));
  await tx.wait();
  return tx.hash;
}

// Query USDC balance (no private key needed)
export async function getUsdcBalance(address: string): Promise<string> {
  const provider = await getProvider();
  const config   = await getConfig();
  const usdc     = new ethers.Contract(config.contracts.usdc, USDC_ABI, provider);
  const raw: bigint = await usdc.balanceOf(address);
  return ethers.formatUnits(raw, 6); // USDC has 6 decimals
}
