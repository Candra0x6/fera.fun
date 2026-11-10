pub mod engine;
pub mod errors;
pub mod store;
pub mod types;

mod base;
mod claims;
mod round;
mod views;

use errors::{require, ArenaError as E};
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, PanicOnDefault};
use types::*;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Arena {
    pub(crate) config: Config,
    pub(crate) current_round_id: u64,
    pub(crate) head_seq: u64,
    pub(crate) liabilities: u128,
}

#[near]
impl Arena {
    #[init(ignore_state)]
    pub fn init(config: Config) -> Self {
        require(!env::state_exists(), E::AlreadyInitialized);
        config.validate();
        Arena {
            config,
            current_round_id: 0,
            head_seq: 0,
            liabilities: 0,
        }
    }

    #[payable]
    pub fn create_round(&mut self) -> u64 {
        self.do_create_round()
    }

    #[payable]
    pub fn launch_coin(
        &mut self,
        round_id: u64,
        name: String,
        ticker: String,
        monster_type: u8,
        skin_id: u8,
    ) -> u8 {
        self.do_launch_coin(round_id, name, ticker, monster_type, skin_id)
    }

    pub fn start_round(&mut self, round_id: u64) {
        self.do_start_round(round_id)
    }

    #[payable]
    pub fn buy(
        &mut self,
        round_id: u64,
        coin_id: u8,
        min_tokens_out: U128,
        deadline_ms: u64,
    ) -> U128 {
        U128(self.do_buy(round_id, coin_id, min_tokens_out.0, deadline_ms))
    }

    pub fn sell(
        &mut self,
        round_id: u64,
        coin_id: u8,
        tokens: U128,
        min_mon_out: U128,
        deadline_ms: u64,
    ) -> U128 {
        U128(self.do_sell(round_id, coin_id, tokens.0, min_mon_out.0, deadline_ms))
    }

    pub fn lock_epoch(&mut self, round_id: u64) {
        self.do_lock_epoch(round_id)
    }

    pub fn resolve_epoch(&mut self, round_id: u64, max_clashes: u8) -> bool {
        self.do_resolve_epoch(round_id, max_clashes)
    }

    pub fn abort_round(&mut self, round_id: u64) {
        self.do_abort_round(round_id)
    }

    pub fn redeem(&mut self, round_id: u64, tokens: U128) -> U128 {
        U128(self.do_redeem(round_id, tokens.0))
    }

    pub fn claim_consolation(&mut self, round_id: u64, coin_id: u8, tokens: U128) -> U128 {
        U128(self.do_claim_consolation(round_id, coin_id, tokens.0))
    }

    pub fn claim_seed(&mut self, round_id: u64, coin_id: u8) -> U128 {
        U128(self.do_claim_seed(round_id, coin_id))
    }

    pub fn claim_refund(&mut self, round_id: u64, coin_id: u8, tokens: U128) -> U128 {
        U128(self.do_claim_refund(round_id, coin_id, tokens.0))
    }

    pub fn refund_launch(&mut self, round_id: u64, coin_id: u8) -> U128 {
        U128(self.do_refund_launch(round_id, coin_id))
    }

    pub fn claim_pending(&mut self) -> U128 {
        U128(self.do_claim_pending())
    }

    #[private]
    pub fn on_payout(&mut self, to: AccountId, amount: U128) {
        self.do_on_payout(to, amount.0)
    }

    pub fn current_round_id(&self) -> u64 {
        self.current_round_id
    }

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_round(&self, round_id: u64) -> RoundView {
        self.load_round(round_id).view(round_id)
    }

    pub fn get_arena_snapshot(&self, round_id: u64) -> ArenaSnapshot {
        self.do_snapshot(round_id)
    }

    pub fn quote_buy(&self, round_id: u64, coin_id: u8, mon_in: U128) -> U128 {
        U128(self.do_quote_buy(round_id, coin_id, mon_in.0))
    }

    pub fn quote_sell(&self, round_id: u64, coin_id: u8, tokens: U128) -> U128 {
        U128(self.do_quote_sell(round_id, coin_id, tokens.0))
    }

    pub fn balance_of(&self, round_id: u64, coin_id: u8, account_id: AccountId) -> U128 {
        require((coin_id as usize) < MAX_SLOTS, E::CoinNotAlive);
        U128(self.ledger_get(round_id, &account_id)[coin_id as usize])
    }

    pub fn balances_of(&self, round_id: u64, account_id: AccountId) -> Vec<U128> {
        self.ledger_get(round_id, &account_id)
            .iter()
            .map(|b| U128(*b))
            .collect()
    }

    pub fn pending_consolation(&self, round_id: u64, coin_id: u8, account_id: AccountId) -> U128 {
        U128(self.do_pending_consolation(round_id, coin_id, &account_id))
    }

    pub fn pending_redeem(&self, round_id: u64, account_id: AccountId) -> U128 {
        U128(self.do_pending_redeem(round_id, &account_id))
    }

    pub fn liabilities(&self) -> U128 {
        U128(self.liabilities)
    }

    pub fn claimable_of(&self, account_id: AccountId) -> U128 {
        U128(self.claimable_get(&account_id))
    }

    pub fn events_since(&self, from_seq: u64, limit: u64) -> EventsPage {
        self.do_events_since(from_seq, limit)
    }
}
