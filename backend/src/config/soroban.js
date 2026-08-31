// Soroban / Stellar settlement-rail configuration.
//
// Kept in its own module (not merged into config/index.js) so the existing EVM
// setup is untouched. It mirrors config/index.js conventions:
//   - reads SOROBAN_* environment variables
//   - reports `configured === false` until everything required is set
//   - lazily requires the Stellar SDK so the process bootstraps even when it is
//     not yet installed (the indexer simply skips, like the EVM indexer when
//     `chainConfigured` is false).
require("dotenv").config();

const config = {
  // Stellar RPC / Horizon endpoints (public testnet = 1500, futurenet = 1501).
  rpcUrl: process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org",
  horizonUrl: process.env.SOROBAN_HORIZON_URL || "https://horizon-testnet.stellar.org",
  networkPassphrase:
    process.env.SOROBAN_NETWORK_PASSPHRASE ||
    "Test SDF Network ; September 2015",

  // Settlement token (Circle USDC on Stellar, SEP-41). Deployed as a Soroban
  // token contract; the contract ID is a C-address.
  usdcAddress: process.env.SOROBAN_USDC_ADDRESS || "",

  // Deployed contract IDs.
  mandateRegistryAddress: process.env.SOROBAN_MANDATE_REGISTRY || "",
  hybridEscrowAddress: process.env.SOROBAN_HYBRID_ESCROW || "",

  // Indexer cursor + polling, consistent with the EVM indexer.
  startLedger: Number(process.env.SOROBAN_START_LEDGER || 0),
  pollIntervalMs: Number(process.env.SOROBAN_POLL_INTERVAL_MS || 8000),
  indexerMaxRange: Number(process.env.SOROBAN_INDEXER_MAX_RANGE || 1000),

  // Secret key used to sign admin/arbiter transactions via the Soroban indexer.
  adminSecret: process.env.SOROBAN_ADMIN_SECRET || "",
};

config.configured = Boolean(
  config.rpcUrl &&
    config.usdcAddress &&
    config.mandateRegistryAddress &&
    config.hybridEscrowAddress
);

// Lazily load the Stellar SDK. Returns null when it is not installed so the
// process can still boot (the indexer will report it as unavailable).
let _sdk = null;
let _sdkError = null;
function sdk() {
  if (_sdk !== null) return _sdk;
  try {
    // eslint-disable-next-line global-require
    _sdk = { sdk: require("@stellar/stellar-sdk") };
  } catch (e) {
    _sdkError = e;
    _sdk = null;
  }
  return _sdk;
}

config.sdkAvailable = () => sdk() !== null;
config.sdkErrorMessage = () =>
  _sdkError
    ? `@stellar/stellar-sdk is not installed: ${_sdkError.message}`
    : "";

module.exports = config;
