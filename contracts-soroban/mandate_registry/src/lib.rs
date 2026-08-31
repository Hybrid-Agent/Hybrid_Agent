#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, symbol_short, Address,
    BytesN, Env, Symbol,
};

#[cfg(test)]
mod test;

// ---------------------------------------------------------------------------
// Constants (mirror MandateRegistry.sol)
// ---------------------------------------------------------------------------
const MAX_COMMISSION_BPS: u32 = 3_000;

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------
const KEY_MND_CNT: Symbol = symbol_short!("MND_CNT");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[contracttype]
pub enum MandateStatus {
    None = 0,
    Pending = 1,
    Accepted = 2,
    Revoked = 3,
}

#[derive(Clone)]
#[contracttype]
pub struct Mandate {
    pub owner: Address,
    pub agent: Address,
    pub listing_ref: BytesN<32>,
    pub commission_bps: u32,
    pub expiry: u64,
    pub status: MandateStatus,
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MandateError {
    InvalidBps = 1,
    ZeroExpiry = 2,
    AgentIsOwner = 3,
    UnknownMandate = 4,
    WrongStatus = 5,
    NotAgent = 6,
    NotOwner = 7,
    Expired = 8,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MandateCreated {
    #[topic]
    pub mandate_id: u64,
    pub owner: Address,
    pub agent: Address,
    pub listing_ref: BytesN<32>,
    pub commission_bps: u32,
    pub expiry: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MandateAccepted {
    #[topic]
    pub mandate_id: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MandateRevoked {
    #[topic]
    pub mandate_id: u64,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct MandateRegistry;

#[contractimpl]
impl MandateRegistry {
    /// Owner creates a new mandate authorising `agent` to broker a listing.
    pub fn create_mandate(
        env: Env,
        owner: Address,
        agent: Address,
        listing_ref: BytesN<32>,
        commission_bps: u32,
        expiry: u64,
    ) -> u64 {
        owner.require_auth();

        if commission_bps == 0 || commission_bps > MAX_COMMISSION_BPS {
            panic!("commission bps out of range");
        }
        if expiry <= env.ledger().timestamp() {
            panic!("expiry must be in the future");
        }
        if agent == owner {
            panic!("agent cannot be the owner");
        }

        let id = Self::next_mandate_id(&env);
        let mandate = Mandate {
            owner,
            agent,
            listing_ref,
            commission_bps,
            expiry,
            status: MandateStatus::Pending,
        };
        env.storage().persistent().set(&id, &mandate);

        env.storage().instance().set(&KEY_MND_CNT, &(id + 1));

        MandateCreated {
            mandate_id: id,
            owner: mandate.owner.clone(),
            agent: mandate.agent.clone(),
            listing_ref: mandate.listing_ref.clone(),
            commission_bps: mandate.commission_bps,
            expiry: mandate.expiry,
        }
        .publish(&env);

        id
    }

    /// Agent accepts the pending mandate.
    pub fn accept_mandate(env: Env, mandate_id: u64) {
        let mut mandate = Self::read_mandate(&env, mandate_id);
        mandate.agent.require_auth();

        if mandate.status != MandateStatus::Pending {
            panic!("mandate not Pending");
        }

        mandate.status = MandateStatus::Accepted;
        Self::write_mandate(&env, mandate_id, &mandate);

        MandateAccepted { mandate_id }.publish(&env);
    }

    /// Owner revokes a Pending or Accepted mandate.
    pub fn revoke_mandate(env: Env, mandate_id: u64) {
        let mut mandate = Self::read_mandate(&env, mandate_id);
        mandate.owner.require_auth();

        if mandate.status != MandateStatus::Pending && mandate.status != MandateStatus::Accepted {
            panic!("cannot revoke in current status");
        }

        mandate.status = MandateStatus::Revoked;
        Self::write_mandate(&env, mandate_id, &mandate);

        MandateRevoked { mandate_id }.publish(&env);
    }

    // -- views --------------------------------------------------------------

    /// Validate that the mandate is active and matches the expected parties.
    /// Returns (ok, commission_bps).
    pub fn validate(
        env: Env,
        mandate_id: u64,
        owner: Address,
        agent: Address,
        listing_ref: BytesN<32>,
    ) -> (bool, u32) {
        let mandate = Self::read_mandate(&env, mandate_id);

        if mandate.status != MandateStatus::Accepted {
            return (false, 0);
        }
        if mandate.owner != owner || mandate.agent != agent || mandate.listing_ref != listing_ref {
            return (false, 0);
        }
        if env.ledger().timestamp() > mandate.expiry {
            return (false, 0);
        }

        (true, mandate.commission_bps)
    }

    pub fn get_mandate(env: Env, mandate_id: u64) -> Mandate {
        Self::read_mandate(&env, mandate_id)
    }

    pub fn next_mandate_id_view(env: Env) -> u64 {
        Self::next_mandate_id(&env)
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

#[contractimpl]
impl MandateRegistry {
    fn next_mandate_id(env: &Env) -> u64 {
        env.storage().instance().get(&KEY_MND_CNT).unwrap_or(0)
    }

    fn read_mandate(env: &Env, id: u64) -> Mandate {
        env.storage()
            .persistent()
            .get(&id)
            .unwrap_or_else(|| panic!("unknown mandate"))
    }

    fn write_mandate(env: &Env, id: u64, mandate: &Mandate) {
        env.storage().persistent().set(&id, mandate);
    }
}
