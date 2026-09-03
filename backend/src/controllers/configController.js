const config = require("../config");
const sorobanConfig = require("../config/soroban");

// GET /config — public chain config the frontend needs to talk to the contracts.
// Includes the EVM rail (Ethereum Sepolia), the Base rail, and the Stellar rail.
function get(req, res) {
  res.json({
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    contracts: {
      usdc: config.usdcAddress,
      mandateRegistry: config.mandateRegistryAddress,
      hybridEscrow: config.hybridEscrowAddress,
    },
    chainConfigured: config.chainConfigured,
    // Base Sepolia settlement rail.
    base: {
      chainId: config.base.chainId,
      rpcUrl: config.base.rpcUrl,
      configured: Boolean(config.base.usdcAddress && config.base.hybridEscrowAddress),
      contracts: {
        usdc: config.base.usdcAddress,
        hybridEscrow: config.base.hybridEscrowAddress,
      },
    },
    stellar: {
      configured: sorobanConfig.configured,
      usdcAddress: sorobanConfig.usdcAddress,
      hybridEscrow: sorobanConfig.hybridEscrowAddress,
      mandateRegistry: sorobanConfig.mandateRegistryAddress,
      horizonUrl: sorobanConfig.horizonUrl,
      rpcUrl: sorobanConfig.rpcUrl,
      networkPassphrase: sorobanConfig.networkPassphrase,
    },
  });
}

module.exports = { get };
