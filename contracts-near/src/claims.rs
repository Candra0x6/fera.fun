use crate::base::{dec, mul_div};
use crate::errors::{require, ArenaError as E};
use crate::types::*;
use crate::Arena;
use near_sdk::serde_json::json;
use near_sdk::{env, AccountId};

impl Arena {
    fn fixed_claim(&mut self, round_id: u64, round: &mut Round, idx: usize, tokens: u128, holder: &AccountId) -> u128 {
        let c = &mut round.coins[idx];
        require(c.consolation_supply != 0 && c.consolation_pool != 0, E::NothingToClaim);
        self.ledger_debit(round_id, holder, idx as u8, tokens);
        c.supply -= tokens;
        let pay = mul_div(tokens, c.consolation_pool, c.consolation_supply);
        c.pool_paid += pay;
        pay
    }

    pub(crate) fn do_redeem(&mut self, round_id: u64, tokens: u128) -> u128 {
        let mut round = self.load_round(round_id);
        require(round.phase == Phase::Settled, E::NotClaimable);
        require(round.redeem_supply != 0, E::NothingToClaim);
        let holder = env::predecessor_account_id();
        let winner = usize::from(round.winner_coin_id);
        self.ledger_debit(round_id, &holder, round.winner_coin_id, tokens);
        round.coins[winner].supply -= tokens;
        let pay = mul_div(tokens, round.redeem_pool, round.redeem_supply);
        round.redeem_paid += pay;
        self.save_round(round_id, &round);
        self.emit(
            "Redeemed",
            json!({"roundId": round_id, "holder": holder, "tokens": dec(tokens), "monPaid": dec(pay)}),
        );
        self.pay(&holder, pay);
        pay
    }

    pub(crate) fn do_claim_consolation(&mut self, round_id: u64, coin_id: u8, tokens: u128) -> u128 {
        let mut round = self.load_round(round_id);
        let idx = usize::from(coin_id);
        require(idx < round.coins.len() && round.coins[idx].status == Status::Eliminated, E::NotClaimable);
        let holder = env::predecessor_account_id();
        let pay = self.fixed_claim(round_id, &mut round, idx, tokens, &holder);
        self.save_round(round_id, &round);
        self.emit(
            "ConsolationClaimed",
            json!({
                "roundId": round_id,
                "coinId": coin_id,
                "holder": holder,
                "tokens": dec(tokens),
                "monPaid": dec(pay),
            }),
        );
        self.pay(&holder, pay);
        pay
    }

    pub(crate) fn do_claim_refund(&mut self, round_id: u64, coin_id: u8, tokens: u128) -> u128 {
        let mut round = self.load_round(round_id);
        let idx = usize::from(coin_id);
        require(
            idx < round.coins.len()
                && round.coins[idx].status == Status::Refunded
                && round.phase == Phase::Aborted,
            E::NotClaimable,
        );
        let holder = env::predecessor_account_id();
        let pay = self.fixed_claim(round_id, &mut round, idx, tokens, &holder);
        self.save_round(round_id, &round);
        self.emit(
            "RefundClaimed",
            json!({
                "roundId": round_id,
                "coinId": coin_id,
                "holder": holder,
                "tokens": dec(tokens),
                "monPaid": dec(pay),
            }),
        );
        self.pay(&holder, pay);
        pay
    }

    pub(crate) fn do_claim_seed(&mut self, round_id: u64, coin_id: u8) -> u128 {
        let mut round = self.load_round(round_id);
        let idx = usize::from(coin_id);
        let caller = env::predecessor_account_id();
        require(idx < round.coins.len() && round.coins[idx].creator == caller, E::NotCreator);
        require(!round.coins[idx].seed_claimed, E::SeedAlreadyClaimed);
        let status = round.coins[idx].status;
        let tokens = round.coins[idx].seed_tokens;
        let pay = match status {
            Status::Eliminated | Status::Refunded => {
                let c = &mut round.coins[idx];
                let pay = if c.consolation_supply != 0 {
                    mul_div(tokens, c.consolation_pool, c.consolation_supply)
                } else {
                    0
                };
                c.pool_paid += pay;
                pay
            }
            Status::Champion => {
                let pay = if round.redeem_supply != 0 {
                    mul_div(tokens, round.redeem_pool, round.redeem_supply)
                } else {
                    0
                };
                round.redeem_paid += pay;
                pay
            }
            _ => crate::errors::fail(E::NotClaimable),
        };
        let c = &mut round.coins[idx];
        c.seed_claimed = true;
        c.supply -= tokens;
        self.save_round(round_id, &round);
        self.emit(
            "SeedClaimed",
            json!({
                "roundId": round_id,
                "coinId": coin_id,
                "creator": caller,
                "tokens": dec(tokens),
                "monPaid": dec(pay),
            }),
        );
        self.pay(&caller, pay);
        pay
    }

    pub(crate) fn do_refund_launch(&mut self, round_id: u64, coin_id: u8) -> u128 {
        let mut round = self.load_round(round_id);
        require(round.phase == Phase::Aborted && round.lobby_abort, E::NotRefundable);
        let idx = usize::from(coin_id);
        require(idx < round.coins.len() && round.coins[idx].status == Status::Alive, E::NotRefundable);
        let caller = env::predecessor_account_id();
        require(round.coins[idx].creator == caller, E::NotCreator);
        let launch_fee = self.config.launch_fee.0;
        let c = &mut round.coins[idx];
        let seed = c.r_mon;
        let tokens = c.seed_tokens;
        c.status = Status::Refunded;
        c.r_mon = 0;
        c.seed_claimed = true;
        c.supply -= tokens;
        round.treasury -= launch_fee;
        round.launch_fees_owed -= launch_fee;
        round.alive_count -= 1;
        let paid = seed + launch_fee;
        self.save_round(round_id, &round);
        self.emit(
            "RefundClaimed",
            json!({
                "roundId": round_id,
                "coinId": coin_id,
                "holder": caller,
                "tokens": dec(tokens),
                "monPaid": dec(paid),
            }),
        );
        self.pay(&caller, paid);
        paid
    }

    pub(crate) fn do_claim_pending(&mut self) -> u128 {
        let caller = env::predecessor_account_id();
        let amount = self.claimable_get(&caller);
        require(amount != 0, E::NothingToClaim);
        self.claimable_set(&caller, 0);
        self.pay(&caller, amount);
        amount
    }

    pub(crate) fn do_on_payout(&mut self, to: AccountId, amount: u128) {
        if env::promise_result_checked(0, 16).is_err() {
            let current = self.claimable_get(&to);
            self.claimable_set(&to, current + amount);
            self.liabilities += amount;
        }
    }
}
