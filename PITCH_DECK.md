# HybridAgent
### The On-Chain Escrow Marketplace for Property & Vehicle Sales

---

## Slide 1 — The Problem

Real estate and vehicle deals involve three parties: **an owner, a buyer, and an agent**.

The agent finds the buyer, negotiates the deal, and does all the work —
but they get paid **last**, if at all.

### What goes wrong today

- The buyer pays the seller directly (cash, bank transfer).
- The seller holds the full amount.
- The agent chases their commission — sometimes for months.
- The seller can simply refuse to pay. There is no enforceable mechanism.

> **Agents lose commissions every day because trust breaks down at the moment money moves.**

---

## Slide 2 — The Solution

**HybridAgent** is a marketplace where the buyer's payment settles fully **on-chain in USDC**
and the agent's commission is carved out **atomically in the same transaction** —
before a single dollar reaches the seller.

The agent cannot be cheated because the money never touches the seller's wallet
until the agent's share has already been sent.

### What makes it work

- A smart contract holds the buyer's full payment in escrow.
- The agreed commission is locked in a signed on-chain mandate before the deal opens.
- On completion, one transaction pays **agent → commission**, **platform → fee**, **seller → the rest** — simultaneously.

---

## Slide 3 — Who Is It For

| Role | Who they are |
|---|---|
| **Owner / Seller** | A person or company selling a property or vehicle |
| **Agent / Broker** | A licensed agent or independent broker representing the seller |
| **Buyer** | Anyone purchasing a listed asset |

> A user can be both an owner and an agent — the role is **per-listing**, not per-account.

---

## Slide 4 — Two Listing Types

### 1. Owner Direct
- The owner lists their **own** asset.
- No agent is involved.
- **Commission = 0%.**
- Buyer pays → escrow holds → seller confirms → funds released directly to seller.

### 2. Agent Brokered
- An agent lists a property or vehicle on **behalf of an owner**.
- Owner and agent agree on a commission rate (up to **30%**) and sign a **mandate on-chain**.
- When the deal closes, the commission is paid to the agent automatically — no chase, no delay.

---

## Slide 5 — How to Use the Platform (What's Live Today)

### Step 1 — Register
- Create an account with your name, email, and phone number.
- Complete KYC (identity verification) to unlock transacting features.

### Step 2 — Sign In with Your Email Wallet
- Sign in via email — a secure embedded wallet is created automatically using **Privy**.
- No browser extension needed. No seed phrase to manage.
- Your wallet address is shown in the navbar once connected.

### Step 3 — Browse Listings
- View all open properties and vehicles on the Listings page.
- Each listing shows the price in USDC, commission rate, and agent details.
- A live **price quote** breaks down exactly what the agent earns and what the seller receives.

### Step 4 — Create a Listing (Agents)
- Choose listing type: **Owner Direct** or **Agent Brokered**.
- Add title, asset type, price in USDC, and photos.
- For agent-brokered: enter the owner's name and email.
  The owner receives an email notification that their asset was listed and a wallet was reserved for their proceeds.

### Step 5 — On-Chain Settlement *(contracts deployed, UI integration in progress)*
- The buyer funds the full sale price into the **HybridEscrow** smart contract.
- A 7-day dispute window opens.
- On confirmation, one transaction splits the funds: agent gets commission, platform gets fee, seller gets the rest.

---

## Slide 6 — How Everyone Gets Paid

When a deal settles, one atomic transaction distributes the funds:

```
Buyer pays:   $100,000 USDC (full price)
              ─────────────────────────────
Agent gets:    $5,000   (5% commission — agreed in mandate)
Platform gets: $2,000   (2% platform fee)
Seller gets:  $93,000   (remainder — price minus commission and fee)
```

### Caps enforced by the smart contract
- Maximum agent commission: **30%**
- Maximum platform fee: **10%**
- Commission + fee combined cannot exceed **100%** of the sale price.

> No one is waiting. No one is chasing. The contract does it in one block.

---

## Slide 7 — What If Something Goes Wrong?

### Dispute Resolution
- Either party can raise a dispute **within 7 days** of the buyer funding escrow.
- A neutral **arbiter** reviews the case.
- The arbiter has two options:
  1. **Release** — settle normally (agent + platform + seller get paid).
  2. **Refund** — return the full amount to the buyer.

### Seller Timeout Claim
- If the buyer funds the deal but never confirms and never disputes,
  the **seller can claim the funds** after the 7-day window closes automatically.

---

## Slide 8 — The Mandate: Agent Protection Built In

Before any deal opens, the agent's commission is locked in a **MandateRegistry** contract.

| Step | Who acts | What happens |
|---|---|---|
| 1 | Owner | Creates a mandate: assigns agent, sets commission %, sets expiry |
| 2 | Agent | Accepts the mandate on-chain |
| 3 | Deal opens | Commission rate is **snapshotted** into the escrow deal |
| 4 | Deal closes | Commission is paid from that snapshot — owner cannot change it |

The owner can revoke a mandate before it is consumed by a deal, but **not after**.

---

## Slide 9 — Market Size & Business Model

### The Opportunity
- **TAM (Total Addressable Market):** The global real estate market is valued at over $300 Trillion. The global used car market adds another $1.5 Trillion.
- **SAM (Serviceable Addressable Market):** Real estate and vehicle broker commissions account for over $100 Billion annually in the US alone.
- **SOM (Serviceable Obtainable Market):** Capturing just 1% of the brokerage market represents a $1 Billion+ revenue opportunity.

### How We Make Money
HybridAgent employs a simple, transparent fee structure extracted atomically at the moment of settlement:
1. **Platform Fee:** A flat 1% to 2% fee on every successful transaction.
2. **Premium Agent Features:** (Future) Monthly subscription for top-tier agents providing advanced analytics, featured listings, and CRM integrations.
3. **Yield Generation:** (Future) Generating yield on funds held in escrow during the 7-day settlement window.

---

## Slide 10 — What's Built vs What's Next

| Feature | Status |
|---|---|
| User registration + KYC-gated routes | Live |
| Email login + embedded wallet (Privy) | Live |
| Listing creation — owner direct & agent brokered | Live |
| Owner email notification on listing creation | Live |
| Browse listings + listing detail page | Live |
| Price quote (commission split preview) | Live |
| Leaderboard + agent reviews | Live |
| HybridEscrow smart contract (Sepolia) | Deployed |
| MandateRegistry smart contract (Sepolia) | Deployed |
| On-chain buy flow (buyer funds escrow via UI) | In progress |
| On-chain mandate signing via UI | In progress |
| Deal confirmation + dispute via UI | In progress |

---

## Slide 11 — Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 15 (App Router), React 19, Tailwind CSS v4 |
| **Wallet / Auth** | Privy — email login, embedded smart wallet, no extension needed |
| **Smart Contracts** | Solidity 0.8.24, Hardhat, OpenZeppelin — deployed on Ethereum Sepolia |
| **Backend API** | Node.js, Express, PostgreSQL (Railway) |
| **Payments** | USDC (ERC-20 stablecoin) on Ethereum Sepolia |
| **File Storage** | Cloudinary (listing images) |
| **Email** | Resend — transactional notifications |
| **Indexer** | ethers v6, polling on-chain events into Postgres for fast reads |

---

## Slide 12 — Summary

| The old way | HybridAgent |
|---|---|
| Agent trusts the seller to pay | Commission locked in smart contract before deal opens |
| Payment by bank transfer — manual, slow | USDC escrow — instant, on-chain, auditable |
| Disputes handled by lawyers | 7-day window + neutral arbiter on-chain |
| Agent chases commission for months | Agent paid in the same block the deal closes |
| No transparency on commission | Commission rate visible and immutable on-chain |

> **HybridAgent makes agent commission theft structurally impossible.**

---

*Built for ProdfestHackathon · hybrid-agent-ecru.vercel.app*
