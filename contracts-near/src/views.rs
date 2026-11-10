use crate::base::{lo, mul_div, ok, u, MAX_PAGE, RING};
use crate::engine::curve;
use crate::errors::{require, ArenaError as E};
use crate::store;
use crate::types::*;
use crate::Arena;
use near_sdk::serde_json::{self, Value};
use near_sdk::{env, AccountId};

impl Arena {
    fn view_coin(&self, round_id: u64, coin_id: u8) -> (Round, usize) {
        let round = self.load_round(round_id);
        let idx = usize::from(coin_id);
        require(idx < round.coins.len(), E::CoinNotAlive);
        (round, idx)
    }

    pub(crate) fn do_snapshot(&self, round_id: u64) -> ArenaSnapshot {
        let round = self.load_round(round_id);
        let coins = round
            .coins
            .iter()
            .enumerate()
            .map(|(i, c)| c.view(round_id, i as u8))
            .collect();
        ArenaSnapshot {
            config: self.config.clone(),
            round: round.view(round_id),
            coins,
            block_height: env::block_height(),
            ts_ms: env::block_timestamp_ms(),
        }
    }

    pub(crate) fn do_quote_buy(&self, round_id: u64, coin_id: u8, mon_in: u128) -> u128 {
        let (round, idx) = self.view_coin(round_id, coin_id);
        let c = &round.coins[idx];
        let q = ok(curve::quote_buy(
            u(c.v_mon),
            u(c.v_tok),
            u(mon_in),
            u(u128::from(self.config.trade_fee_bps)),
        ));
        lo(q.out)
    }

    pub(crate) fn do_quote_sell(&self, round_id: u64, coin_id: u8, tokens: u128) -> u128 {
        let (round, idx) = self.view_coin(round_id, coin_id);
        let c = &round.coins[idx];
        let q = ok(curve::quote_sell(
            u(c.v_mon),
            u(c.v_tok),
            u(tokens),
            u(u128::from(self.config.trade_fee_bps)),
        ));
        lo(q.mon_out)
    }

    pub(crate) fn do_pending_consolation(&self, round_id: u64, coin_id: u8, holder: &AccountId) -> u128 {
        let (round, idx) = self.view_coin(round_id, coin_id);
        let c = &round.coins[idx];
        if (c.status != Status::Eliminated && c.status != Status::Refunded) || c.consolation_supply == 0 {
            return 0;
        }
        mul_div(self.ledger_get(round_id, holder)[idx], c.consolation_pool, c.consolation_supply)
    }

    pub(crate) fn do_pending_redeem(&self, round_id: u64, holder: &AccountId) -> u128 {
        let round = self.load_round(round_id);
        if round.phase != Phase::Settled || round.redeem_supply == 0 {
            return 0;
        }
        let bal = self.ledger_get(round_id, holder)[usize::from(round.winner_coin_id)];
        mul_div(bal, round.redeem_pool, round.redeem_supply)
    }

    pub(crate) fn do_events_since(&self, from_seq: u64, limit: u64) -> EventsPage {
        let head = self.head_seq;
        let oldest = head.saturating_sub(RING - 1).max(1);
        let start = from_seq.saturating_add(1).max(oldest);
        let count = limit.min(MAX_PAGE);
        let mut events = Vec::new();
        let mut seq = start;
        while seq <= head && (events.len() as u64) < count {
            if let Some(rec) = store::read::<EventRecord>(&store::event_key(seq % RING)) {
                if rec.seq == seq {
                    events.push(EventView {
                        seq: rec.seq,
                        height: rec.height,
                        ts_ms: rec.ts_ms,
                        name: rec.name,
                        args: serde_json::from_str(&rec.args).unwrap_or(Value::Null),
                    });
                }
            }
            seq += 1;
        }
        EventsPage { events, head_seq: head, oldest_seq: oldest }
    }
}
