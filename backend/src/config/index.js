require("dotenv").config();

const config = {
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4000),
  corsOrigin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
    : "*",

  jwtSecret: process.env.JWT_SECRET || "dev-insecure-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),
  keyEncryptionSecret:
    process.env.KEY_ENCRYPTION_SECRET || "dev-insecure-key-encryption-secret-change",

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX || 150),
    authMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  },

  filebase: {
    accessKey: process.env.FILEBASE_ACCESS_KEY || "",
    secretKey: process.env.FILEBASE_SECRET_KEY || "",
    bucket: process.env.FILEBASE_BUCKET || "",
    folder: process.env.FILEBASE_FOLDER || "hybrid-agent",
  },

  chainId: Number(process.env.CHAIN_ID || 84532),
  rpcUrl: process.env.RPC_URL || "https://sepolia.base.org",
  usdcAddress: process.env.USDC_ADDRESS || "",
  mandateRegistryAddress: process.env.MANDATE_REGISTRY_ADDRESS || "",
  hybridEscrowAddress: process.env.HYBRID_ESCROW_ADDRESS || "",
  deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY || "",

  startBlock: Number(process.env.START_BLOCK || 0),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 8000),
  // Max blocks per eth_getLogs page. Alchemy free tier caps this at 10.
  indexerMaxRange: Number(process.env.INDEXER_MAX_RANGE || 2000),

  // Public URL of the frontend (for claim links in emails).
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:3000",

  // Privy embedded-wallet provider (email magic-link). Pre-generates the owner's
  // smart wallet from their email server-side. Falls back to a deterministic dev
  // wallet when not configured.
  privy: {
    appId: process.env.PRIVY_APP_ID || "",
    appSecret: process.env.PRIVY_APP_SECRET || "",
  },

  // Transactional email via SendGrid API. Logs to console when unconfigured.
  email: {
    from: process.env.EMAIL_FROM || "HybridAgent <no-reply@hybridagent.local>",
    sendgridApiKey: process.env.SENDGRID_API_KEY || "",
  },
};

config.privy.configured = Boolean(config.privy.appId && config.privy.appSecret);
config.email.configured = Boolean(config.email.sendgridApiKey);

config.chainConfigured = Boolean(
  config.rpcUrl && config.mandateRegistryAddress && config.hybridEscrowAddress
);
config.filebaseConfigured = Boolean(
  config.filebase.accessKey && config.filebase.secretKey && config.filebase.bucket
);

module.exports = config;
