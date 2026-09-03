// Minimal bridge: Sepolia ETH → Base Sepolia via OptimismPortal2 depositTransaction
// Uses raw fetch for JSON-RPC — no ethers provider init that can timeout on detection.
const { ethers } = require('ethers');

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL     = process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const AMOUNT_ETH  = process.env.AMOUNT_ETH || '0.0002';

// Base Sepolia OptimismPortal2 on Ethereum Sepolia (official)
const OPTIMISM_PORTAL = '0x49f53e41452C74589536e6C5BD0b7f015defd895';

async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function main() {
  if (!PRIVATE_KEY) throw new Error('Set PRIVATE_KEY env var');

  const wallet  = new ethers.Wallet(PRIVATE_KEY);
  const address = wallet.address;
  const amountWei = ethers.parseEther(AMOUNT_ETH);

  // Fetch nonce, balance, gas price via raw RPC
  const [balHex, nonceHex, gasPriceHex, chainIdHex] = await Promise.all([
    rpc('eth_getBalance',       [address, 'latest']),
    rpc('eth_getTransactionCount', [address, 'latest']),
    rpc('eth_gasPrice',         []),
    rpc('eth_chainId',          []),
  ]);

  const balance  = BigInt(balHex);
  const nonce    = Number(BigInt(nonceHex));
  const gasPrice = BigInt(gasPriceHex);
  const chainId  = Number(BigInt(chainIdHex));

  console.log(`Network:       chainId ${chainId}`);
  console.log(`Deployer:      ${address}`);
  console.log(`Sepolia ETH:   ${ethers.formatEther(balance)} ETH`);
  console.log(`Bridging:      ${AMOUNT_ETH} ETH → Base Sepolia`);

  // depositTransaction(address _to, uint256 _value, uint64 _gasLimit, bool _isCreation, bytes _data)
  const iface = new ethers.Interface([
    'function depositTransaction(address _to, uint256 _value, uint64 _gasLimit, bool _isCreation, bytes calldata _data) payable',
  ]);
  const data = iface.encodeFunctionData('depositTransaction', [
    address, amountWei, 100_000n, false, '0x',
  ]);

  // Estimate gas
  const gasLimitHex = await rpc('eth_estimateGas', [{
    from: address, to: OPTIMISM_PORTAL, value: '0x' + amountWei.toString(16), data,
  }]);
  const gasLimit = BigInt(gasLimitHex);
  const gasCost  = gasLimit * gasPrice;
  const total    = amountWei + gasCost;

  if (balance < total) {
    throw new Error(`Need ${ethers.formatEther(total)} ETH (bridge + gas), have ${ethers.formatEther(balance)}`);
  }

  // Build and sign tx
  const tx = {
    to: OPTIMISM_PORTAL,
    value: amountWei,
    data,
    nonce,
    gasLimit,
    gasPrice,
    chainId,
  };
  const signed = await wallet.signTransaction(tx);

  // Send
  const txHash = await rpc('eth_sendRawTransaction', [signed]);
  console.log(`\nBridge tx sent: ${txHash}`);
  console.log(`Etherscan:      https://sepolia.etherscan.io/tx/${txHash}`);
  console.log('\nBase Sepolia deposit finalises in ~1–2 min.');
  console.log(`Basescan:       https://sepolia.basescan.org/address/${address}`);
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
