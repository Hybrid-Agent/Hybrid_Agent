#![cfg(test)]

use crate::{Mandate, MandateRegistry, MandateRegistryClient, MandateStatus};
use soroban_sdk::{
    testutils::Address as _,
    Address, BytesN, Env,
};

const COMMISSION_BPS: u32 = 500;

fn create_listing_ref(env: &Env, b: u8) -> BytesN<32> {
    let mut arr = [0u8; 32];
    arr[0] = b;
    BytesN::from_array(env, &arr)
}

fn build_env() -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MandateRegistry);
    let owner = Address::generate(&env);
    let agent = Address::generate(&env);
    let third = Address::generate(&env);

    (env, contract_id, owner, agent, third)
}

#[test]
fn test_create_accept_and_validate() {
    let (env, contract_id, owner, agent, _third) = build_env();
    let registry = MandateRegistryClient::new(&env, &contract_id);
    let listing_ref = create_listing_ref(&env, 1);

    let expiry = env.ledger().timestamp() + 30 * 24 * 60 * 60;
    let id = registry.create_mandate(
        &owner,
        &agent,
        &listing_ref,
        &COMMISSION_BPS,
        &expiry,
    );

    let m: Mandate = registry.get_mandate(&id);
    assert_eq!(m.status, MandateStatus::Pending);
    assert_eq!(m.owner, owner);
    assert_eq!(m.agent, agent);
    assert_eq!(m.commission_bps, COMMISSION_BPS);

    registry.accept_mandate(&id);
    let m: Mandate = registry.get_mandate(&id);
    assert_eq!(m.status, MandateStatus::Accepted);

    let (ok, bps) = registry.validate(&id, &owner, &agent, &listing_ref);
    assert!(ok);
    assert_eq!(bps, COMMISSION_BPS);
}

#[test]
fn test_validate_rejects_wrong_party() {
    let (env, contract_id, owner, agent, third) = build_env();
    let registry = MandateRegistryClient::new(&env, &contract_id);
    let listing_ref = create_listing_ref(&env, 2);

    let expiry = env.ledger().timestamp() + 30 * 24 * 60 * 60;
    let id = registry.create_mandate(&owner, &agent, &listing_ref, &COMMISSION_BPS, &expiry);
    registry.accept_mandate(&id);

    let wrong_ref = create_listing_ref(&env, 3);
    let (ok, _) = registry.validate(&id, &owner, &agent, &wrong_ref);
    assert!(!ok);

    let (ok, _) = registry.validate(&id, &third, &agent, &listing_ref);
    assert!(!ok);
}

#[test]
fn test_revoke_after_accept() {
    let (env, contract_id, owner, agent, _third) = build_env();
    let registry = MandateRegistryClient::new(&env, &contract_id);
    let listing_ref = create_listing_ref(&env, 4);

    let expiry = env.ledger().timestamp() + 30 * 24 * 60 * 60;
    let id = registry.create_mandate(&owner, &agent, &listing_ref, &COMMISSION_BPS, &expiry);
    registry.accept_mandate(&id);

    registry.revoke_mandate(&id);
    let m: Mandate = registry.get_mandate(&id);
    assert_eq!(m.status, MandateStatus::Revoked);

    let (ok, _) = registry.validate(&id, &owner, &agent, &listing_ref);
    assert!(!ok);
}
