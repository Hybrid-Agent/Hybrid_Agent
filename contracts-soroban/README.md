# HybridAgent — Soroban (Stellar) Contracts

This directory contains the **Stellar / Soroban** port of HybridAgent's escrow
and mandate-registry smart contracts. It is the on-chain heart of the **Stellar
"Wave"** integration: full-settlement escrow in a Stellar-native stablecoin with
atomic commission splitting, this time written in **Rust** running on **Soroban**
instead of Solidity on EVM.

It is intentionally **additive**: the existing Solidity contracts under
`../contracts` (Sepolia) are untouched. Both languages/settlement rails coexist
(see the root `README.md`, *Multi-Chain Architecture*).

## What's here

```
contracts-soroban/
├── Cargo.toml                 # workspace: hybrid_escrow + mandate_registry
├── rust-toolchain.toml        # pins nightly + wasm32v1-none target
├── .cargo/config.toml
├── hybrid_escrow/
│   └── src/
│       ├── lib.rs             # HybridEscrow (escrow + atomic commission split)
│       └── test.rs            # 8 tests (SDK testutils)
└── mandate_registry/
    └── src/
        ├── lib.rs             # MandateRegistry (agent-of-record agreements)
        └── test.rs            # 3 tests
```

## Why Soroban / Stellar

- Soroban is Stellar's native smart-contract platform (Rust → WASM) with
  deterministic, fee-bounded execution on the same proven Stellar consensus
  network.
- Settlement is in a **Stellar-native stablecoin** — Circle **USDC on Stellar**
  (SEP-41 token contract), Stellar's answer to the USDC already used on EVM.
  No new stablecoin is introduced (per repo conventions).
- Atomic, multi-party transfers (commission → agent, fee → platform, proceeds →
  seller in one transaction) are a natural fit for Soroban's built-in
  cross-contract token calls.

## Mapping to the existing Solidity contracts

| Solidity (`contracts/`)          | Soroban (`contracts-soroban/`)     | Notes |
|----------------------------------|------------------------------------|-------|
| `HybridEscrow.sol`               | `hybrid_escrow/src/lib.rs`         | `HybridEscrow` contract |
| `MandateRegistry.sol`            | `mandate_registry/src/lib.rs`      | `MandateRegistry` contract |
| `Deal` struct                    | `Deal` `#[contracttype]` struct    | identical fields |
| `Mandate` struct                 | `Mandate` `#[contracttype]` struct | identical fields |
| `DealState` enum                 | `DealState` `#[contracttype]` enum | `None/Created/Funded/Completed/Disputed/Cancelled` |
| `createDeal()`                   | `create_deal()`                    | 9 args (caller, buyer, seller, agent, price, listing_ref, commission_bps, mandate_id) |
| `fundDeal()`                     | `fund_deal()`                      | buyer transfers USDC into escrow; records `dispute_deadline` |
| `confirmCompletion()`            | `confirm_completion()`             | buyer confirms → `settle()` |
| `claimAfterTimeout()`            | `claim_after_timeout()`            | seller/agent claim past deadline |
| `raiseDispute()` / `resolveDispute()` | `raise_dispute()` / `resolve_dispute()` | disputable window + arbiter |
| `cancelDeal()`                   | `cancel_deal()`                    | unfunded deals only |
| `quote()`                        | `quote()`                          | returns `QuoteResult{commission,fee,proceeds}` |
| `_settle()` internal             | `settle()` internal                | atomic split |
| `withdrawFees()` + `accruedFees` | `withdraw_fees()` + `accrued_fees` | platform fee accumulates in contract |
| `address(0)` = owner-direct      | `agent == seller && commission_bps == 0` | Soroban `Address` has no zero — owner-direct is encoded as seller-is-agent with 0 commission |

### Commission model (identical)

At settlement the contract atomically computes, from the deal's `price`:

```
commission = price * commission_bps / 10_000     # -> agent (0 for owner-direct)
fee        = price * platform_fee_bps / 10_000   # -> platform (accrued, not sent)
proceeds   = price - commission - fee            # -> seller
```

bps caps mirror the Solidity contract: commission ≤ 3000 bps, platform fee ≤
1000 bps, `commission_bps + platform_fee_bps ≤ 10_000`.

### Storage keyed by value

State is stored under the contract **instance** for config (token, fee bps,
recipient, arbiter, dispute window, accrued fees) and under **persistent**
entries keyed by `u64` id for deals (`deal_id`) and mandates (`mandate_id`) —
same shape the Filebase/Postgres indexer consumes.

## Build

Requires Rust with the **`wasm32v1-none`** target (Soroban ≥ 22 uses it instead
of `wasm32-unknown-unknown`):

```bash
# pinned nightly + target are declared in rust-toolchain.toml
rustup target add wasm32v1-none --toolchain nightly-2026-03-16

# compile-check the Rust source
cargo check

# produce the deployable .wasm blobs (goes to target/wasm32v1-none/release/*.wasm)
cargo build --release --target wasm32v1-none
```

## Test

Uses the Soroban SDK's `testutils` (register in-process contract, built-in
Stellar asset contract as the USDC stand-in, `mock_all_auths`, ledger-time
manipulation):

```bash
cargo test            # runs hybrid_escrow + mandate_registry unit tests
```

Covered flows (mirroring `contracts/test/escrow.test.js`):

- owner-direct sale with no commission
- brokered sale with the full atomic split (agent commission, platform fee,
  seller proceeds)
- `quote()` matching actual settlement
- dispute raised then resolved → **refund buyer**, and → **release to seller**
- claim-after-timeout
- cancel unfunded deal
- platform fees accruing and withdrawn to `fee_recipient`
- mandate create → accept → validate (incl. wrong-party rejection) and revoke

## Deploy to Stellar testnet (Futurenet / Testnet)

Soroban deployment uses the `soroban` CLI (via `stellar`). There is a one-shot
**deploy script** that does build + key generation + **auto-funding via the
friendbot faucet** + both deploys, then prints the `SOROBAN_*` values for
`backend/.env`:

```bash
./deploy.sh testnet hybrid-agent       # arg1=network, arg2=stellar CLI key alias
```

or step-by-step:

```bash
# 1) install the CLI
#    brew install stellar  (or: cargo install --locked stellar-cli)

# 2) create an account + get testnet XLM (friendbot / faucet)
stellar keys generate alice

# 3) deploy HybridEscrow (WASM must build with SIMD disabled — see .cargo/config.toml)
stellar contract deploy \
  --wasm target/wasm32v1-none/release/hybrid_escrow.wasm \
  --source alice --network testnet

# 4) HybridEscrow has no constructor — initialize() is called separately
#    (token_addr = Circle USDC on Stellar SEP-41 SAC; fee/recipient/arbiter)
ESCROW_ID=CBJB4M5PZRBOV36QC6CBKJP7SKFGT7CLHCCPM62VYB62NYZ4HJ72FKW2
stellar contract invoke \
  --id "$ESCROW_ID" --source alice --network testnet -- initialize \
  --token_addr CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA \
  --platform_fee_bps 100 \
  --fee_recipient <fee-recipient-address> \
  --arbiter <arbiter-address>

# 5) deploy MandateRegistry (no constructor args needed)
stellar contract deploy \
  --wasm target/wasm32v1-none/release/mandate_registry.wasm \
  --source alice --network testnet
```

> The `deploy.sh` script automates steps 3–5 (including the `initialize` call).
> `token_addr` is Circle's **USDC on Stellar** SEP-41 contract address
> (testnet: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`).
> Note this USDC uses **7 decimals** — pass prices in base units (1 USDC = 1e7),
> unlike the 6-decimal USDC on EVM. Store the returned deployed contract IDs in
> `backend/.env` as `SOROBAN_HYBRID_ESCROW` / `SOROBAN_MANDATE_REGISTRY` (see
> backend `.env.example`), then start the Soroban indexer standalone with:

```bash
cd backend && npm run indexer:soroban
```

## Events emitted (indexer-relevant)

The `#[contractevent]` types map to the Solidity events the Sepolia indexer
already watches. Note the topic symbol Soroban publishes is **snake_case**
(e.g. `deal_created`); the backend indexer matches both the snake_case topic
and the PascalCase struct name.

| Soroban topic (on-chain) | Struct    | Solidity event    | id in data |
|--------------------------|-----------|-------------------|------------|
| `deal_created`           | `DealCreated`   | `DealCreated`  | `deal_id` |
| `deal_funded`            | `DealFunded`    | `DealFunded`   | `deal_id` |
| `deal_completed`         | `DealCompleted` | `DealCompleted`| `deal_id` |
| `deal_disputed`          | `DealDisputed`  | `DealDisputed` | `deal_id` |
| `deal_refunded`          | `DealRefunded`  | `DealRefunded` | `deal_id` |
| `deal_cancelled`         | `DealCancelled` | `DealCancelled`| `deal_id` |
| `mandate_created` / `mandate_accepted` / `mandate_revoked` | respective structs | same names | `mandate_id` |

See the backend Soroban indexer (`backend/src/indexer/soroban.js`) which mirrors
these into the document store just like the Sepolia indexer.
