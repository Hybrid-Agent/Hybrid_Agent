const config = require("../config");
const sorobanConfig = require("../config/soroban");

// GET /config — public chain config the frontend needs to talk to the contracts.
// Includes both the EVM rail (ethers on Ethereum Sepolia) and the Stellar rail.
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
