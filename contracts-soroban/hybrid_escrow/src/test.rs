#![cfg(test)]

use crate::{Deal, DealState, HybridEscrow, HybridEscrowClient, QuoteResult};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, BytesN, Env,
};

const COMMISSION_BPS: u32 = 500;
const PLATFORM_FEE_BPS: u32 = 100;
const PRICE: i128 = 1_000_000_000;

fn create_listing_ref(env: &Env, b: u8) -> BytesN<32> {
    let mut arr = [0u8; 32];
    arr[0] = b;
    BytesN::from_array(env, &arr)
}

fn build_env() -> (
    Env,
    Address, // contract
    Address, // usdc
    Address, // fee_recipient
    Address, // arbiter
    Address, // buyer
    Address, // seller
    Address, // agent
) {
    let env = Env::default();
    env.mock_all_auths();
    env.budget().reset_unlimited();

    let admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc = token_contract.address();

    let contract_id = env.register_contract(None, HybridEscrow);

    let fee_recipient = Address::generate(&env);
    let arbiter = Address::generate(&env);

    let escrow = HybridEscrowClient::new(&env, &contract_id);
    escrow.initialize(&usdc, &PLATFORM_FEE_BPS, &fee_recipient, &arbiter);

    let buyer = Address::generate(&env);
    let seller = Address::generate(&env);
    let agent = Address::generate(&env);

    (
        env,
        contract_id,
        usdc,
        fee_recipient,
        arbiter,
        buyer,
        seller,
        agent,
    )
}

fn mint_usdc(env: &Env, token_id: &Address, to: &Address, amount: i128) {
    let asset = StellarAssetClient::new(env, token_id);
    asset.mint(to, &amount);
}

fn balance(env: &Env, token_id: &Address, addr: &Address) -> i128 {
    let token = TokenClient::new(env, token_id);
    token.balance(addr)
}

fn create_and_fund(
    _env: &Env,
    escrow: &HybridEscrowClient,
    buyer: &Address,
    seller: &Address,
    agent: &Address,
    commission_bps: u32,
    listing_ref: &BytesN<32>,
) -> u64 {
    let deal_id = escrow.create_deal(
        seller, buyer, seller, agent, &PRICE, listing_ref, &commission_bps, &0,
    );
    escrow.fund_deal(&deal_id);
    deal_id
}

#[test]
fn test_owner_direct_flow() {
    let (env, _contract_id, usdc, _fee_recipient, _arbiter, buyer, seller, _agent) = build_env();
    let escrow = HybridEscrowClient::new(&env, &_contract_id);
    let listing_ref = create_listing_ref(&env, 1);

    mint_usdc(&env, &usdc, &buyer, PRICE);

    // owner-direct: seller is also the "agent" but commission is 0
    let deal_id = escrow.create_deal(
        &seller, &buyer, &seller, &seller, &PRICE, &listing_ref, &0, &0,
    );
    escrow.fund_deal(&deal_id);
    escrow.confirm_completion(&deal_id);

    let proceeds = PRICE - PRICE * PLATFORM_FEE_BPS as i128 / 10_000;
    assert_eq!(balance(&env, &usdc, &seller), proceeds);

    let deal: Deal = escrow.get_deal(&deal_id);
    assert_eq!(deal.state, DealState::Completed);
}

#[test]
fn test_brokered_flow_with_atomic_split() {
    let (env, _contract_id, usdc, _fee_recipient, _arbiter, buyer, seller, agent) = build_env();
    let escrow = HybridEscrowClient::new(&env, &_contract_id);
    let listing_ref = create_listing_ref(&env, 2);

    mint_usdc(&env, &usdc, &buyer, PRICE);

    let deal_id = create_and_fund(
        &env, &escrow, &buyer, &seller, &agent, COMMISSION_BPS, &listing_ref,
    );
    escrow.confirm_completion(&deal_id);

    let commission = PRICE * COMMISSION_BPS as i128 / 10_000;
    let fee = PRICE * PLATFORM_FEE_BPS as i128 / 10_000;
    let proceeds = PRICE - commission - fee;

    assert_eq!(balance(&env, &usdc, &agent), commission);
    assert_eq!(balance(&env, &usdc, &seller), proceeds);
    assert_eq!(escrow.accrued_fees(), fee);

    let deal: Deal = escrow.get_deal(&deal_id);
    assert_eq!(deal.state, DealState::Completed);
}

#[test]
fn test_quote_matches_settlement() {
    let (env, _contract_id, _usdc, _fee_recipient, _arbiter, _buyer, _seller, _agent) = build_env();
    let escrow = HybridEscrowClient::new(&env, &_contract_id);

    let q: QuoteResult = escrow.quote(&PRICE, &COMMISSION_BPS);
    let commission = PRICE * COMMISSION_BPS as i128 / 10_000;
    let fee = PRICE * PLATFORM_FEE_BPS as i128 / 10_000;
    let proceeds = PRICE - commission - fee;

    assert_eq!(q.commission, commission);
    assert_eq!(q.fee, fee);
    assert_eq!(q.proceeds, proceeds);
}

#[test]
fn test_raise_and_resolve_dispute_refund() {
    let (env, _contract_id, usdc, _fee_recipient, _arbiter, buyer, seller, agent) = build_env();
    let escrow = HybridEscrowClient::new(&env, &_contract_id);
    let listing_ref = create_listing_ref(&env, 3);

    mint_usdc(&env, &usdc, &buyer, PRICE);

    let deal_id = create_and_fund(
        &env, &escrow, &buyer, &seller, &agent, COMMISSION_BPS, &listing_ref,
    );

    escrow.raise_dispute(&deal_id, &buyer);
    let deal: Deal = escrow.get_deal(&deal_id);
    assert_eq!(deal.state, DealState::Disputed);

    // arbiter resolves -> refund buyer
    escrow.resolve_dispute(&deal_id, &false);
    assert_eq!(balance(&env, &usdc, &buyer), PRICE);

    let deal: Deal = escrow.get_deal(&deal_id);
    assert_eq!(deal.state, DealState::Cancelled);
}

#[test]
fn test_raise_and_resolve_dispute_to_seller() {
    let (env, _contract_id, usdc, _fee_recipient, _arbiter, buyer, seller, agent) = build_env();
    let escrow = HybridEscrowClient::new(&env, &_contract_id);
    let listing_ref = create_listing_ref(&env, 4);

    mint_usdc(&env, &usdc, &buyer, PRICE);

    let deal_id = create_and_fund(
        &env, &escrow, &buyer, &seller, &agent, COMMISSION_BPS, &listing_ref,
    );

    escrow.raise_dispute(&deal_id, &seller);
    escrow.resolve_dispute(&deal_id, &true);

    let commission = PRICE * COMMISSION_BPS as i128 / 10_000;
    let fee = PRICE * PLATFORM_FEE_BPS as i128 / 10_000;
    let proceeds = PRICE - commission - fee;
    assert_eq!(balance(&env, &usdc, &agent), commission);
    assert_eq!(balance(&env, &usdc, &seller), proceeds);

    let deal: Deal = escrow.get_deal(&deal_id);
    assert_eq!(deal.state, DealState::Completed);
}

#[test]
fn test_claim_after_timeout() {
    let (env, _contract_id, usdc, _fee_recipient, _arbiter, buyer, seller, agent) = build_env();
    let escrow = HybridEscrowClient::new(&env, &_contract_id);
    let listing_ref = create_listing_ref(&env, 5);

    mint_usdc(&env, &usdc, &buyer, PRICE);

    let deal_id = create_and_fund(
        &env, &escrow, &buyer, &seller, &agent, COMMISSION_BPS, &listing_ref,
    );

    // push time past dispute deadline
    env.ledger()
        .set_timestamp(env.ledger().timestamp() + 8 * 24 * 60 * 60 + 100);

    escrow.claim_after_timeout(&deal_id, &seller);

    let commission = PRICE * COMMISSION_BPS as i128 / 10_000;
    let fee = PRICE * PLATFORM_FEE_BPS as i128 / 10_000;
    let proceeds = PRICE - commission - fee;
    assert_eq!(balance(&env, &usdc, &agent), commission);
    assert_eq!(balance(&env, &usdc, &seller), proceeds);

    let deal: Deal = escrow.get_deal(&deal_id);
    assert_eq!(deal.state, DealState::Completed);
}

#[test]
fn test_cancel_unfunded_deal() {
    let (env, _contract_id, _usdc, _fee_recipient, _arbiter, buyer, seller, agent) = build_env();
    let escrow = HybridEscrowClient::new(&env, &_contract_id);
    let listing_ref = create_listing_ref(&env, 6);

    let deal_id = escrow.create_deal(
        &seller, &buyer, &seller, &agent, &PRICE, &listing_ref, &COMMISSION_BPS, &0,
    );
    escrow.cancel_deal(&deal_id, &seller);

    let deal: Deal = escrow.get_deal(&deal_id);
    assert_eq!(deal.state, DealState::Cancelled);
}

#[test]
fn test_fees_withdrawable() {
    let (env, _contract_id, usdc, fee_recipient, _arbiter, buyer, seller, agent) = build_env();
    let escrow = HybridEscrowClient::new(&env, &_contract_id);
    let listing_ref = create_listing_ref(&env, 7);

    mint_usdc(&env, &usdc, &buyer, PRICE);
    let deal_id = create_and_fund(
        &env, &escrow, &buyer, &seller, &agent, COMMISSION_BPS, &listing_ref,
    );
    escrow.confirm_completion(&deal_id);

    let fee = PRICE * PLATFORM_FEE_BPS as i128 / 10_000;
    assert_eq!(escrow.accrued_fees(), fee);

    escrow.withdraw_fees();
    assert_eq!(balance(&env, &usdc, &fee_recipient), fee);
    assert_eq!(escrow.accrued_fees(), 0);
}
