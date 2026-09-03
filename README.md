# HybridAgent

**Live:** https://hybrid-agent-one.vercel.app

**A global Web2/Web3 escrow marketplace for property & vehicle sales — where agents who own nothing earn by helping owners sell, and their commission is guaranteed on-chain.**

In many markets, a selling agent does the work, the deal closes… and the owner refuses to pay the commission. HybridAgent fixes this: the buyer's payment settles through a **USDC escrow smart contract** that, on completion, atomically splits the funds — **agent commission**, **platform fee**, and **owner proceeds** — so no party can be cheated.

## The model

- **Owner sells their own asset** → `owner_direct` → no commission.
- **Agent sells for an owner** → `agent_brokered` → agent earns a commission, split automatically at settlement.
- A user can be both owner and agent (role is per-listing).
- The agent lists using only the **owner's email**; a secure wallet is **pre-generated** from that email so the owner is paid directly and can later claim via an email magic-link — no crypto knowledge needed.

## Repository layout

```text
frontend/   Next.js 15 (App Router) + React 19 + Tailwind v4 — the web UI
mobile/     Expo + React Native + NativeWind (Tailwind v4) — the mobile app
backend/    Express + Filebase (IPFS-pinned document store) — auth, listings, chat, reviews, indexers
contracts/  Hardhat + Solidity 0.8.24 — USDC escrow + mandate registry (deployed on Sepolia)
contracts-soroban/  Rust/Soroban (Stellar) — escrow + mandate registry port, + tests + README  ⭐ Stellar
```

### Highlights
- **Escrow** (`HybridEscrow.sol`): full-settlement USDC escrow, atomic commission split, disputes/arbiter, and platform fees that **only the deployer** can withdraw.
- ⭐ **Stellar/Soroban port** (`contracts-soroban/`): the same escrow + mandate logic rewritten in **Rust** for **Stellar**, settling in **USDC on Stellar**, with a matching backend Soroban indexer. See the [Stellar integration](#stellar--soroban-grant-appeal) section below.
- **Auth & wallets**: JWT + bcrypt; every user gets an embedded wallet **derived from their email** (Privy-ready; deterministic dev fallback).
- **Owner claim flow**: `/claim` page — email magic-link sign-in → reserved wallet → withdraw.
- **On-platform chat**: real-time Socket.IO between buyers and agents, with a "keep it on-platform" safety model.
- **Agent reviews**: rate communication & professionalism; you can only review agents you've actually chatted with.
- **Live indexers**: mirror on-chain escrow/mandate events into the document store — one for **EVM/Sepolia**, one for **Stellar/Soroban**.
- **Cross-platform**: Both Next.js web and Expo React Native mobile clients.
- **Integrations**: Resend (email), Cloudinary (images), Privy (embedded wallets), USDC on Sepolia, **USDC on Stellar**.
- Security: Helmet, CORS, rate limiting, Joi validation.

## Multi-chain architecture: EVM/Sepolia + Stellar/Soroban

HybridAgent is **multi-chain**: the same escrow product is offered on **two
independent settlement rails**, sharing one off-chain backend and one set of
listings/records. This is the "free-market" commission guarantee, ported to a
second, complementary on-chain ecosystem.

```
                         ┌─────────────────────────────────────────────┐
                         │               HybridAgent backend            │
                         │  Express · Filebase doc store · socket · auth │
                         │         ┌───────────┐  ┌─────────────┐        │
                         │  EVM indexer (Sepolia)   Soroban indexer       │
                         └────┬───────────────┬───────────────┬──────────┘
                              │               │               │
                    ┌─────────▼──────┐  ┌─────▼─────────────┐ │
                    │  EVM / Sepolia  │  │  Stellar / Soroban│ │
                    │  HybridEscrow.sol│  │  hybrid_escrow.rs │ │
                    │  MandateRegistry │  │  mandate_registry.rs│ │
                    │  settle in USDC  │  │  settle in USDC-on- │ │
                    │  (ERC-20)        │  │  Stellar (SEP-41)    │ │
                    └─────────────────┘  └────────────────────┘ │
                                          (contracts-soroban/)   │
                                                                  │
   Listings & deal records are namespaced per chain in the store: │
   db/deals/… (EVM)  vs  db/soroban/deals/… (Stellar) ───────────┘
```

- **EVM rail** (`contracts/`): Solidity 0.8.24, Hardhat, deployed to **Sepolia**,
  settling in ERC-20 **USDC**.
- **Stellar rail** (`contracts-soroban/`): **Rust → WASM on Soroban**, deploying to
  the **Stellar testnet**, settling in **Circle USDC on Stellar** (SEP-41 token
  contract — Stellar's first-party stablecoin, no new asset introduced).
- Both emit the *same* event vocabulary (`DealCreated`, `DealFunded`,
  `DealCompleted`, `DealDisputed`, `DealRefunded`, `DealCancelled`,
  `MandateCreated/Accepted/Revoked`), so one backend indexer per chain maps onto
  the same document-store record shapes.
- Records are namespaced per chain (`db/deals/…` vs `db/soroban/deals/…`) so the
  two chains never collide and reads can merge across both.

---

## ⭐ Stellar / Soroban — Grant Appeal

> This section is the one-point reference for the **Stellar relevance** of the
> project. It is not cosmetic: HybridAgent now has a real, buildable, **tested**
> Stellar-native smart-contract implementation and a matching Soroban indexer.

### 1. Stellar-native smart contracts (`contracts-soroban/`)
A faithful **Rust/Soroban port** of the escrow + mandate contracts that power
the EVM version:
- **`hybrid_escrow`** — full-settlement escrow in a Stellar stablecoin. `fund_deal`
  pulls USDC into the escrow; on `confirm_completion` / `claim_after_timeout` it
  **atomically splits** `commission → agent`, `fee → platform (accrued)`, and
  `proceeds → seller`. Disputes + arbiter resolution, cancellations, and
  `quote()` all ported 1:1 from `HybridEscrow.sol`.
- **`mandate_registry`** — on-chain "agent of record": an owner authorises an
  agent to broker a listing at an agreed bps commission and expiry; agent
  accepts; `validate()` enforces it. Ported from `MandateRegistry.sol`.
- **Settlement asset** = **Circle USDC on Stellar** (SEP-41 ), the Stellar
  ecosystem's native stablecoin — real, first-party Stellar money movement.
- **Tests**: 11 Rust unit tests using the **Soroban SDK `testutils`** (in-process
  contract + built-in Stellar asset contract as the USDC stand-in), covering
  owner-direct, brokered atomic split, disputes/refund, arbitration to seller,
  claim-after-timeout, fees withdrawal, and mandate lifecycle. `cd contracts-soroban && cargo test`.
- See `contracts-soroban/README.md` for the contract-by-contract mapping table,
  money math, SEL build/test/deploy steps, and how to deploy to the **Stellar
  testnet** with the `stellar` CLI.

### 2. Stellar backend indexer (`backend/src/indexer/soroban.js`)
A new, additive indexer that mirrors **Soroban contract events → the backend
document store**, matching the existing EVM indexer's pattern exactly
(namespaced records, ledger cursor in the meta store, polling loop, graceful
"not configured" guard). Configure it with `backend/.env` `SOROBAN_*` vars
(Soroban RPC, USDC address, contract IDs).

### 3. What this unlocks for the Stellar ecosystem
- Agents on Stellar get the same **guaranteed-commission escrow** the product
  provides on EVM, now expressible **natively in Stellar** rather than bridged.
- Demonstrates using the **Stellar Asset Contract / SEP-token** interface for
  safe, atomic multi-party payouts with an escrow + arbiter pattern.
- Positions HybridAgent as a genuinely **multi-settlement-ecosystem** product:
  EVM (Sepolia USDC) **and** Stellar (USDC on Stellar), both fully on-chain and
  broker-trustless.

---

## Getting started

Each subproject has its own `package.json` and `.env.example` (copy to `.env`).

```bash
# Contracts — EVM / Sepolia
cd contracts && npm install && npm test

# Contracts — Stellar / Soroban
cd contracts-soroban && cargo test                 # Rust unit tests
cargo build --release --target wasm32v1-none       # build deployable .wasm

# Backend  (needs the S3/Filebase doc store + optional SOROBAN_* vars)
cd backend && npm install && npm run dev      # http://localhost:4000

# Frontend
cd frontend && npm install && npm run dev     # http://localhost:3000

# Mobile
cd mobile && npm install && npm start         # Expo Dev Server
```

See `CLAUDE.md` for architecture notes and conventions.

## Status

Web UI, Mobile App, auth, listings, chat, reviews, the claim flow, and the escrow
contracts are built. Contracts are **deployed on Sepolia** (`HybridEscrow` and
`MandateRegistry`). A complete **Stellar/Soroban port** (`contracts-soroban/`) is
built and **tested** (`cargo test`, 11 tests) with buildable `.wasm` for the
Stellar testnet, plus a backend **Soroban indexer** — all additive alongside the
EVM rail. The on-chain Buy (wallet signing) and live Privy/email keys are the
remaining wiring before production.
