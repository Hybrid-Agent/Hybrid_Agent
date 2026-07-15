# HybridAgent

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
backend/    Express + Postgres (Railway) — auth, listings, chat, reviews, indexer
contracts/  Hardhat + Solidity 0.8.24 — USDC escrow + mandate registry (deployed on Sepolia)
```

### Highlights
- **Escrow** (`HybridEscrow.sol`): full-settlement USDC escrow, atomic commission split, disputes/arbiter, and platform fees that **only the deployer** can withdraw.
- **Auth & wallets**: JWT + bcrypt; every user gets an embedded wallet **derived from their email** (Privy-ready; deterministic dev fallback).
- **Owner claim flow**: `/claim` page — email magic-link sign-in → reserved wallet → withdraw.
- **On-platform chat**: real-time Socket.IO between buyers and agents, with a "keep it on-platform" safety model.
- **Agent reviews**: rate communication & professionalism; you can only review agents you've actually chatted with.
- **Live indexer**: mirrors on-chain escrow/mandate events into Postgres.
- **Cross-platform**: Both Next.js web and Expo React Native mobile clients.
- **Integrations**: Resend (email), Cloudinary (images), Privy (embedded wallets), USDC on Sepolia.
- Security: Helmet, CORS, rate limiting, Joi validation.

## Getting started

Each subproject has its own `package.json` and `.env.example` (copy to `.env`).

```bash
# Contracts
cd contracts && npm install && npm test

# Backend  (needs a Postgres DATABASE_URL, e.g. Railway)
cd backend && npm install && npm run dev      # http://localhost:4000

# Frontend
cd frontend && npm install && npm run dev     # http://localhost:3000

# Mobile
cd mobile && npm install && npm start         # Expo Dev Server
```

See `CLAUDE.md` for architecture notes and conventions.

## Status

Web UI, Mobile App, auth, listings, chat, reviews, the claim flow, and the escrow contracts are built. Contracts are **deployed on Sepolia** (`HybridEscrow` and `MandateRegistry`). The on-chain Buy (wallet signing) and live Privy/email keys are the remaining wiring before production.
