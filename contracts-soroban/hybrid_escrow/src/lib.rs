#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, symbol_short, token,
    Address, BytesN, Env, Symbol,
};

#[cfg(test)]
mod test;

// ---------------------------------------------------------------------------
// Constants (mirror HybridEscrow.sol)
// ---------------------------------------------------------------------------
const MAX_PLATFORM_FEE_BPS: u32 = 1_000;
const DEFAULT_DISPUTE_WINDOW: u64 = 7 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------
const KEY_DEAL_CNT: Symbol = symbol_short!("DEAL_CNT");
const KEY_PLAT_FEE: Symbol = symbol_short!("PLAT_FEE");
const KEY_FEE_REC: Symbol = symbol_short!("FEE_REC");
const KEY_ARBITER: Symbol = symbol_short!("ARBITER");
const KEY_DSP_WIN: Symbol = symbol_short!("DSP_WIN");
const KEY_ACC_FEES: Symbol = symbol_short!("ACC_FEES");
const KEY_TOKEN: Symbol = symbol_short!("TOKEN");
const KEY_OWNER: Symbol = symbol_short!("OWNER");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[contracttype]
pub enum DealState {
    None = 0,
    Created = 1,
    Funded = 2,
    Completed = 3,
    Disputed = 4,
    Cancelled = 5,
}

#[derive(Clone)]
#[contracttype]
pub struct Deal {
    pub buyer: Address,
    pub seller: Address,
    pub agent: Address,
    pub price: i128,
    pub commission_bps: u32,
    pub platform_fee_bps: u32,
    pub mandate_id: u64,
    pub listing_ref: BytesN<32>,
    pub state: DealState,
    pub funded_at: u64,
    pub dispute_deadline: u64,
}

#[derive(Clone, PartialEq, Eq, Debug)]
#[contracttype]
pub struct QuoteResult {
    pub commission: i128,
    pub fee: i128,
    pub proceeds: i128,
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EscrowError {
    InvalidBps = 1,
    BpsOverflow = 2,
    UnknownDeal = 3,
    WrongState = 4,
    NotParty = 5,
    DisputeWindowOpen = 6,
    DisputeWindowClosed = 7,
    NotArbiter = 8,
    ZeroCommissionNeedsAgent = 9,
    AlreadySettled = 10,
    OnlyOwner = 11,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealCreated {
    #[topic]
    pub deal_id: u64,
    pub buyer: Address,
    pub seller: Address,
    pub agent: Address,
    pub price: i128,
    pub commission_bps: u32,
    pub platform_fee_bps: u32,
    pub mandate_id: u64,
    pub listing_ref: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealFunded {
    #[topic]
    pub deal_id: u64,
    pub funded_at: u64,
    pub dispute_deadline: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealCompleted {
    #[topic]
    pub deal_id: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealDisputed {
    #[topic]
    pub deal_id: u64,
    pub timestamp: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealRefunded {
    #[topic]
    pub deal_id: u64,
    pub timestamp: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DealCancelled {
    #[topic]
    pub deal_id: u64,
    pub timestamp: u64,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct HybridEscrow;

#[contractimpl]
impl HybridEscrow {
    /// One-time initialiser. Deployer becomes the contract admin.
    pub fn initialize(
        env: Env,
        token_addr: Address,
        platform_fee_bps: u32,
        fee_recipient: Address,
        arbiter: Address,
    ) {
        if platform_fee_bps > MAX_PLATFORM_FEE_BPS {
            panic!("platform fee exceeds maximum");
        }
        env.storage().instance().set(&KEY_TOKEN, &token_addr);
        env.storage()
            .instance()
            .set(&KEY_PLAT_FEE, &platform_fee_bps);
        env.storage().instance().set(&KEY_FEE_REC, &fee_recipient);
        env.storage().instance().set(&KEY_ARBITER, &arbiter);
        env.storage()
            .instance()
            .set(&KEY_DSP_WIN, &DEFAULT_DISPUTE_WINDOW);
        env.storage().instance().set(&KEY_DEAL_CNT, &0_u64);
        env.storage().instance().set(&KEY_ACC_FEES, &0_i128);
        env.storage()
            .instance()
            .set(&KEY_OWNER, &env.current_contract_address());
    }

    // -- admin setters ------------------------------------------------------

    pub fn set_platform_fee(env: Env, bps: u32) {
        Self::require_admin(&env);
        if bps > MAX_PLATFORM_FEE_BPS {
            panic!("platform fee exceeds maximum");
        }
        env.storage().instance().set(&KEY_PLAT_FEE, &bps);
    }

    pub fn set_fee_recipient(env: Env, recipient: Address) {
        Self::require_admin(&env);
        env.storage().instance().set(&KEY_FEE_REC, &recipient);
    }

    pub fn set_arbiter(env: Env, arbiter: Address) {
        Self::require_admin(&env);
        env.storage().instance().set(&KEY_ARBITER, &arbiter);
    }

    pub fn set_dispute_window(env: Env, window: u64) {
        Self::require_admin(&env);
        if window == 0 || window > 60 * 24 * 60 * 60 {
            panic!("window out of range");
        }
        env.storage().instance().set(&KEY_DSP_WIN, &window);
    }

    pub fn withdraw_fees(env: Env) {
        Self::require_admin(&env);
        let accrued: i128 = env
            .storage()
            .instance()
            .get(&KEY_ACC_FEES)
            .unwrap_or(0);
        if accrued <= 0 {
            return;
        }
        let fee_recipient: Address = env.storage().instance().get(&KEY_FEE_REC).unwrap();
        let token_addr: Address = env.storage().instance().get(&KEY_TOKEN).unwrap();
        let client = token::Client::new(&env, &token_addr);
        client.transfer(&env.current_contract_address(), &fee_recipient, &accrued);
        env.storage().instance().set(&KEY_ACC_FEES, &0_i128);
    }

    // -- deal lifecycle -----------------------------------------------------

    /// Create a new deal. `caller` must be seller, agent, or admin.
    pub fn create_deal(
        env: Env,
        caller: Address,
        buyer: Address,
        seller: Address,
        agent: Address,
        price: i128,
        listing_ref: BytesN<32>,
        commission_bps: u32,
        mandate_id: u64,
    ) -> u64 {
        caller.require_auth();

        let platform_fee_bps: u32 = env.storage().instance().get(&KEY_PLAT_FEE).unwrap();

        if price <= 0 {
            panic!("price must be positive");
        }
        if commission_bps + platform_fee_bps > 10_000 {
            panic!("total bps exceed 100%");
        }
        // owner-direct: no commission should be taken
        if commission_bps > 0 && agent == seller {
            panic!("cannot take commission when seller sells own asset");
        }
        if caller != seller && caller != agent && caller != Self::admin(&env) {
            panic!("unauthorised caller");
        }

        let deal_id = Self::next_deal_id(&env);

        env.storage()
            .instance()
            .set(&KEY_DEAL_CNT, &(deal_id + 1));

        let deal = Deal {
            buyer,
            seller,
            agent,
            price,
            commission_bps,
            platform_fee_bps,
            mandate_id,
            listing_ref,
            state: DealState::Created,
            funded_at: 0,
            dispute_deadline: 0,
        };
        env.storage().persistent().set(&deal_id, &deal);

        DealCreated {
            deal_id,
            buyer: deal.buyer.clone(),
            seller: deal.seller.clone(),
            agent: deal.agent.clone(),
            price: deal.price,
            commission_bps: deal.commission_bps,
            platform_fee_bps: deal.platform_fee_bps,
            mandate_id: deal.mandate_id,
            listing_ref: deal.listing_ref.clone(),
        }
        .publish(&env);

        deal_id
    }

    /// Buyer funds the deal by transferring USDC into the escrow.
    pub fn fund_deal(env: Env, deal_id: u64) {
        let mut deal = Self::read_deal(&env, deal_id);
        deal.buyer.require_auth();

        if deal.state != DealState::Created {
            panic!("deal not in Created state");
        }

        let token_addr: Address = env.storage().instance().get(&KEY_TOKEN).unwrap();
        let client = token::Client::new(&env, &token_addr);
        client.transfer(&deal.buyer, &env.current_contract_address(), &deal.price);

        let now = env.ledger().timestamp();
        let dispute_window: u64 = env
            .storage()
            .instance()
            .get(&KEY_DSP_WIN)
            .unwrap_or(DEFAULT_DISPUTE_WINDOW);

        deal.state = DealState::Funded;
        deal.funded_at = now;
        deal.dispute_deadline = now + dispute_window;

        env.storage().persistent().set(&deal_id, &deal);

        DealFunded {
            deal_id,
            funded_at: deal.funded_at,
            dispute_deadline: deal.dispute_deadline,
        }
        .publish(&env);
    }

    /// Buyer confirms completion -> triggers atomic settlement.
    pub fn confirm_completion(env: Env, deal_id: u64) {
        let mut deal = Self::read_deal(&env, deal_id);
        deal.buyer.require_auth();

        if deal.state != DealState::Funded {
            panic!("deal not Funded");
        }

        Self::settle(&env, &mut deal);
        env.storage().persistent().set(&deal_id, &deal);

        DealCompleted { deal_id }.publish(&env);
    }

    /// Seller/agent can claim if buyer does nothing past dispute deadline.
    pub fn claim_after_timeout(env: Env, deal_id: u64, caller: Address) {
        caller.require_auth();
        let mut deal = Self::read_deal(&env, deal_id);

        if deal.state != DealState::Funded {
            panic!("deal not Funded");
        }
        if caller != deal.seller && caller != deal.agent {
            panic!("only seller or agent can claim");
        }
        if env.ledger().timestamp() <= deal.dispute_deadline {
            panic!("dispute window still open");
        }

        Self::settle(&env, &mut deal);
        env.storage().persistent().set(&deal_id, &deal);

        DealCompleted { deal_id }.publish(&env);
    }

    /// Any party (buyer / seller / agent) can raise a dispute while window open.
    pub fn raise_dispute(env: Env, deal_id: u64, caller: Address) {
        caller.require_auth();
        let mut deal = Self::read_deal(&env, deal_id);

        if deal.state != DealState::Funded {
            panic!("deal not Funded");
        }
        if caller != deal.buyer && caller != deal.seller && caller != deal.agent {
            panic!("not a party to the deal");
        }
        if env.ledger().timestamp() > deal.dispute_deadline {
            panic!("dispute window closed");
        }

        deal.state = DealState::Disputed;
        env.storage().persistent().set(&deal_id, &deal);

        DealDisputed {
            deal_id,
            timestamp: env.ledger().timestamp(),
        }
        .publish(&env);
    }

    /// Arbiter resolves: release_to_seller == true -> settle; false -> refund buyer.
    pub fn resolve_dispute(env: Env, deal_id: u64, release_to_seller: bool) {
        let arbiter: Address = env.storage().instance().get(&KEY_ARBITER).unwrap();
        arbiter.require_auth();

        let mut deal = Self::read_deal(&env, deal_id);
        if deal.state != DealState::Disputed {
            panic!("deal not Disputed");
        }

        if release_to_seller {
            Self::settle(&env, &mut deal);
            DealCompleted { deal_id }.publish(&env);
        } else {
            let token_addr: Address = env.storage().instance().get(&KEY_TOKEN).unwrap();
            let client = token::Client::new(&env, &token_addr);
            client.transfer(&env.current_contract_address(), &deal.buyer, &deal.price);
            deal.state = DealState::Cancelled;
            DealRefunded {
                deal_id,
                timestamp: env.ledger().timestamp(),
            }
            .publish(&env);
        }

        env.storage().persistent().set(&deal_id, &deal);
    }

    /// Cancel an unfunded deal.
    pub fn cancel_deal(env: Env, deal_id: u64, caller: Address) {
        caller.require_auth();
        let mut deal = Self::read_deal(&env, deal_id);

        if deal.state != DealState::Created {
            panic!("can only cancel Created deals");
        }
        if caller != deal.buyer
            && caller != deal.seller
            && caller != deal.agent
            && caller != Self::admin(&env)
        {
            panic!("not authorised");
        }

        deal.state = DealState::Cancelled;
        env.storage().persistent().set(&deal_id, &deal);

        DealCancelled {
            deal_id,
            timestamp: env.ledger().timestamp(),
        }
        .publish(&env);
    }

    // -- views --------------------------------------------------------------

    pub fn get_deal(env: Env, deal_id: u64) -> Deal {
        Self::read_deal(&env, deal_id)
    }

    pub fn next_deal_id_view(env: Env) -> u64 {
        Self::next_deal_id(&env)
    }

    pub fn quote(env: Env, price: i128, commission_bps: u32) -> QuoteResult {
        let platform_fee_bps: u32 = env.storage().instance().get(&KEY_PLAT_FEE).unwrap();
        let commission = price * commission_bps as i128 / 10_000;
        let fee = price * platform_fee_bps as i128 / 10_000;
        let proceeds = price - commission - fee;
        QuoteResult {
            commission,
            fee,
            proceeds,
        }
    }

    pub fn platform_fee_bps(env: Env) -> u32 {
        env.storage().instance().get(&KEY_PLAT_FEE).unwrap()
    }

    pub fn accrued_fees(env: Env) -> i128 {
        env.storage().instance().get(&KEY_ACC_FEES).unwrap_or(0)
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

#[contractimpl]
impl HybridEscrow {
    fn admin(env: &Env) -> Address {
        env.storage().instance().get(&KEY_OWNER).unwrap()
    }

    fn require_admin(env: &Env) {
        Self::admin(env).require_auth();
    }

    fn next_deal_id(env: &Env) -> u64 {
        env.storage().instance().get(&KEY_DEAL_CNT).unwrap_or(0)
    }

    fn read_deal(env: &Env, deal_id: u64) -> Deal {
        env.storage()
            .persistent()
            .get(&deal_id)
            .unwrap_or_else(|| panic!("unknown deal"))
    }

    /// Atomic settlement: commission -> agent, fee -> accrued, proceeds -> seller.
    fn settle(env: &Env, deal: &mut Deal) {
        let token_addr: Address = env.storage().instance().get(&KEY_TOKEN).unwrap();
        let client = token::Client::new(&env, &token_addr);

        let commission = deal.price * deal.commission_bps as i128 / 10_000;
        let fee = deal.price * deal.platform_fee_bps as i128 / 10_000;
        let proceeds = deal.price - commission - fee;

        if commission > 0 {
            client.transfer(&env.current_contract_address(), &deal.agent, &commission);
        }

        if fee > 0 {
            let accrued: i128 = env
                .storage()
                .instance()
                .get(&KEY_ACC_FEES)
                .unwrap_or(0);
            env.storage()
                .instance()
                .set(&KEY_ACC_FEES, &(accrued + fee));
        }

        client.transfer(&env.current_contract_address(), &deal.seller, &proceeds);

        deal.state = DealState::Completed;
    }
}
