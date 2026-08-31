const http = require("http");
const app = require("./app");
const config = require("./config");
const db = require("./config/db");
const indexer = require("./indexer");
const sorobanIndexer = require("./indexer/soroban");
const { initSocket } = require("./socket");

async function main() {
  if (config.env === "production") {
    if (config.jwtSecret.startsWith("dev-")) throw new Error("JWT_SECRET must be set in production");
    if (config.keyEncryptionSecret.startsWith("dev-")) throw new Error("KEY_ENCRYPTION_SECRET must be set in production");
  }

  await db.init();

  const server = http.createServer(app);
  const io = initSocket(server);
  app.set("io", io);
  console.log("[socket] chat gateway ready");

  server.listen(config.port, () => {
    console.log(`[api] listening on http://localhost:${config.port}`);
    indexer.start();
    sorobanIndexer.start();
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
