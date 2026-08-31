// Standalone Soroban / Stellar indexer runner.
//
// Starts ONLY the Soroban indexer (no HTTP API, no EVM indexer, no socket), for
// running the Stellar rail on its own process:
//
//   npm run indexer:soroban
//
// Exits cleanly immediately if the Stellar rail is not configured, so it is safe
// to run in CI / orchestration before contract IDs are set.
const db = require("../src/config/db");
const sorobanIndexer = require("../src/indexer/soroban");

async function main() {
  await db.init();
  sorobanIndexer.start();
}

main().catch((err) => {
  console.error("[soroban-indexer] fatal:", err);
  process.exit(1);
});
