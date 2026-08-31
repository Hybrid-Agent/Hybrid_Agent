#!/usr/bin/env bash
# Deploy HybridAgent's Soroban contracts to the Stellar testnet.
#
# Builds the two .wasm blobs, then uses the `stellar` CLI (Soroban deployer) to
# deploy HybridEscrow + MandateRegistry, and prints the SOROBAN_* values to drop
# into backend/.env so the backend Soroban indexer picks them up.
#
# Usage:
#   ./deploy.sh [network] [keyname]
#
#   network  one of: testnet (default) | futurenet | local
#   keyname  stellar CLI key alias to sign with (default: hybrid-agent)
#
# Requires:
#   - Rust + the wasm32v1-none target (see README "Build")
#   - the stellar CLI  (brew install stellar   OR   cargo install --locked stellar-cli)
#
# Env overrides (all optional):
#   TOKEN                    USDC-on-Stellar SEP-41 token contract address
#                            (testnet default: Circle USDC on Stellar testnet)
#   PLATFORM_FEE_BPS         default 100
#   FEE_RECIPIENT            strkey to collect accrued platform fees
#   ARBITER                  strkey that resolves disputes

set -euo pipefail

NETWORK="${1:-testnet}"
KEYNAME="${2:-hybrid-agent}"

echo "==> Building Soroban contracts"
cargo build --release --target wasm32v1-none

ESCROW_WASM="target/wasm32v1-none/release/hybrid_escrow.wasm"
MANDATE_WASM="target/wasm32v1-none/release/mandate_registry.wasm"
if [ ! -f "$ESCROW_WASM" ] || [ ! -f "$MANDATE_WASM" ]; then
  echo "ERROR: build did not produce $ESCROW_WASM / $MANDATE_WASM" >&2
  exit 1
fi

if ! command -v stellar >/dev/null 2>&1; then
  echo "ERROR: 'stellar' CLI not found. Install it:" >&2
  echo "  brew install stellar   (or: cargo install --locked stellar-cli)" >&2
  echo "See contracts-soroban/README.md -> Deploy to Stellar testnet." >&2
  exit 1
fi

# Ensure the signing key alias exists (generate a new one if not).
if ! stellar keys ls 2>/dev/null | grep -q "^$KEYNAME\$"; then
  echo "==> Generating key '$KEYNAME'"
  stellar keys generate "$KEYNAME"
fi

KEY_ADDR="$(stellar keys address "$KEYNAME")"

# Top up the signing key with testnet XLM via the friendbot faucet (idempotent).
# Deploy transactions need a small XLM balance for the source-account reserve.
if [ "$NETWORK" = "testnet" ] || [ "$NETWORK" = "futurenet" ]; then
  echo "==> Funding $KEY_ADDR via friendbot (testnet XLM)"
  FRIENDBOT="https://friendbot.stellar.org"
  [ "$NETWORK" = "futurenet" ] && FRIENDBOT="https://friendbot-futurenet.stellar.org"
  curl -s -X GET "$FRIENDBOT?addr=$KEY_ADDR" >/dev/null \
    || echo "   (friendbot skipped/failed — manually fund $KEY_ADDR if the deploy is rejected)"
fi

# Circle USDC on Stellar (SEP-41 SAC) — testnet contract address (verified).
# Note: this USDC uses 7 decimals; pass prices in base units (1 USDC = 1e7).
TOKEN="${TOKEN:-CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA}"
PLATFORM_FEE_BPS="${PLATFORM_FEE_BPS:-100}"
FEE_RECIPIENT="${FEE_RECIPIENT:-$KEY_ADDR}"
ARBITER="${ARBITER:-$KEY_ADDR}"

echo "==> Deploying HybridEscrow to $NETWORK ..."
ESCROW_ID=$(stellar contract deploy \
  --wasm "$ESCROW_WASM" \
  --source "$KEYNAME" \
  --network "$NETWORK" | tr -d '[:space:]')

# HybridEscrow has no Soroban constructor; initialize() must be called after
# deploy to set the token (Circle USDC on Stellar), platform fee, fee recipient
# and arbiter. Without this, create_deal/fund_deal trap on unset storage.
echo "==> Initializing HybridEscrow (token, fee, recipient, arbiter) ..."
stellar contract invoke \
  --id "$ESCROW_ID" \
  --source "$KEYNAME" \
  --network "$NETWORK" \
  -- initialize \
  --token_addr "$TOKEN" \
  --platform_fee_bps "$PLATFORM_FEE_BPS" \
  --fee_recipient "$FEE_RECIPIENT" \
  --arbiter "$ARBITER" >/dev/null

echo "==> Deploying MandateRegistry to $NETWORK ..."
MANDATE_ID=$(stellar contract deploy \
  --wasm "$MANDATE_WASM" \
  --source "$KEYNAME" \
  --network "$NETWORK" | tr -d '[:space:]')

echo
echo "========================================================"
echo " Deployment complete on $NETWORK"
echo "========================================================"
echo "Add these to backend/.env to enable the Soroban indexer:"
echo
echo "SOROBAN_USDC_ADDRESS=$TOKEN"
echo "SOROBAN_HYBRID_ESCROW=$ESCROW_ID"
echo "SOROBAN_MANDATE_REGISTRY=$MANDATE_ID"
echo "SOROBAN_FEE_RECIPIENT=$FEE_RECIPIENT"
echo "SOROBAN_ARBITER=$ARBITER"
echo
echo "Then run:  cd backend && npm run indexer:soroban"
echo "========================================================"
