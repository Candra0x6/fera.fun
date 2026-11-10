use crate::base::{dec, hex32, lo, mul_bps, now_s, ok, u};
use crate::engine::{combat, curve};
use crate::errors::{require, ArenaError as E};
use crate::types::*;
use crate::Arena;
use near_sdk::serde_json::json;
use near_sdk::env;

struct Clash {
    epoch: u16,
    clash_id: u32,
    winner: usize,
    loser: usize,
    win_prob_bps: u16,
    roll: u16,
    boost: u128,
    consolation: u128,
    to_pot: u128,
    to_treasury: u128,
}

impl Arena {
    fn params(&self) -> combat::Params {
        let c = &self.config;
        combat::Params {
            gamma_bps: c.gamma_bps,
            pool_factor_min_bps: c.pool_factor_min_bps,
            pool_factor_max_bps: c.pool_factor_max_bps,
            level_bonus_bps: c.level_bonus_bps,
            element_up_bps: c.element_up_bps,
            element_down_bps: c.element_down_bps,
            win_prob_min_bps: c.win_prob_min_bps,
            win_prob_max_bps: c.win_prob_max_bps,
        }
    }

    pub(crate) fn do_resolve_epoch(&mut self, round_id: u64, max_clashes: u8) -> bool {
        let mut round = self.load_round(round_id);
        require(round.locked, E::NotLocked);
        require(
            env::block_height() >= round.lock_height + self.config.min_seed_blocks,
            E::SeedBlockNotReached,
        );
        require(max_clashes != 0, E::ZeroMaxClashes);
        if !round.seed_ready {
            let mut buf = Vec::with_capacity(66);
            buf.extend_from_slice(&env::random_seed_array());
            buf.extend_from_slice(&round_id.to_le_bytes());
            buf.extend_from_slice(&round.epoch.to_le_bytes());
            buf.extend_from_slice(&round.lock_height.to_le_bytes());
            buf.extend_from_slice(&env::block_height().to_le_bytes());
            round.seed = env::sha256_array(&buf);
            round.seed_ready = true;
            self.emit(
                "SeedReady",
                json!({"roundId": round_id, "epoch": round.epoch, "seed": hex32(&round.seed)}),
            );
        }
        let seed = round.seed;
        if round.phase == Phase::Knockout && !self.run_clashes(round_id, &mut round, &seed, max_clashes) {
            self.save_round(round_id, &round);
            return false;
        }
        self.finish_epoch(round_id, &mut round, &seed);
        self.save_round(round_id, &round);
        true
    }

    fn run_clashes(&mut self, round_id: u64, round: &mut Round, seed: &[u8; 32], max: u8) -> bool {
        let perm = combat::pairing(seed, round.alive_mask);
        let n = perm.len();
        let total = (n / 2).min(usize::from(self.config.clashes_per_epoch));
        let mut played = 0u8;
        while usize::from(round.resolve_cursor) < total && played < max {
            let c = usize::from(round.resolve_cursor);
            self.clash(round_id, round, seed, usize::from(perm[2 * c]), usize::from(perm[2 * c + 1]));
            round.resolve_cursor += 1;
            played += 1;
        }
        if usize::from(round.resolve_cursor) < total {
            return false;
        }
        if n % 2 == 1 && total == n / 2 {
            self.emit(
                "ByeGranted",
                json!({"roundId": round_id, "epoch": round.epoch, "coinId": perm[n - 1]}),
            );
        }
        true
    }

    fn clash(&mut self, round_id: u64, round: &mut Round, seed: &[u8; 32], id_a: usize, id_b: usize) {
        let params = self.params();
        let mut ev = Clash {
            epoch: round.epoch,
            clash_id: round.clashes_played,
            winner: 0,
            loser: 0,
            win_prob_bps: 0,
            roll: 0,
            boost: 0,
            consolation: 0,
            to_pot: 0,
            to_treasury: 0,
        };
        {
            let a = &round.coins[id_a];
            let b = &round.coins[id_b];
            ev.win_prob_bps = ok(combat::win_prob_bps(
                &params,
                a.monster_type,
                a.level,
                u(a.r_mon_at_lock),
                b.monster_type,
                b.level,
                u(b.r_mon_at_lock),
                u(round.sum_r_mon_at_lock),
                u64::from(round.alive_at_lock),
            ));
        }
        ev.roll = combat::clash_roll(seed, u(u128::from(ev.clash_id)));
        (ev.winner, ev.loser) = if ev.roll < ev.win_prob_bps { (id_a, id_b) } else { (id_b, id_a) };
        round.clashes_played = ev.clash_id + 1;
        self.merge_loser(round, &mut ev);
        self.emit(
            "ClashResolved",
            json!({
                "roundId": round_id,
                "epoch": ev.epoch,
                "clashId": ev.clash_id,
                "winner": ev.winner,
                "loser": ev.loser,
                "winProbBps": ev.win_prob_bps,
                "roll": ev.roll,
                "boost": dec(ev.boost),
                "consolation": dec(ev.consolation),
                "toPot": dec(ev.to_pot),
                "toTreasury": dec(ev.to_treasury),
            }),
        );
        self.apply_boost_and_xp(round_id, round, &ev);
        let l = &round.coins[ev.loser];
        let (pool, supply) = (l.consolation_pool, l.consolation_supply);
        self.emit(
            "CoinEliminated",
            json!({
                "roundId": round_id,
                "coinId": ev.loser,
                "consolationPool": dec(pool),
                "consolationSupply": dec(supply),
            }),
        );
    }

    fn merge_loser(&mut self, round: &mut Round, ev: &mut Clash) {
        let cfg = &self.config;
        let l = &mut round.coins[ev.loser];
        let r = l.r_mon;
        let s = ok(curve::split_loss(
            u(r),
            u(u128::from(cfg.boost_bps)),
            u(u128::from(cfg.consolation_bps)),
            u(u128::from(cfg.pot_bps)),
        ));
        ev.boost = lo(s.boost);
        let consolation = lo(s.consolation);
        ev.to_pot = lo(s.to_pot);
        ev.to_treasury = lo(s.to_treasury);
        let supply = l.supply;
        l.r_mon = 0;
        l.status = Status::Eliminated;
        l.consolation_supply = supply;
        round.alive_count -= 1;
        if supply == 0 {
            ev.to_pot += consolation;
        } else {
            l.consolation_pool = consolation;
            ev.consolation = consolation;
        }
        round.prize_pot += ev.to_pot;
        round.treasury += ev.to_treasury;
    }

    fn apply_boost_and_xp(&mut self, round_id: u64, round: &mut Round, ev: &Clash) {
        let w = &mut round.coins[ev.winner];
        if ev.boost != 0 {
            boost_coin(w, ev.boost);
        }
        w.wins += 1;
        w.xp += combat::XP_WIN;
        let new_level = combat::level_from_xp(u(u128::from(w.xp)));
        let leveled = new_level > w.level;
        if leveled {
            w.level = new_level;
        }
        let args = json!({
            "roundId": round_id,
            "epoch": ev.epoch,
            "clashId": ev.clash_id,
            "coinId": ev.winner,
            "boostMon": dec(ev.boost),
            "rMon": dec(w.r_mon),
            "vMon": dec(w.v_mon),
            "vTok": dec(w.v_tok),
            "wins": w.wins,
            "level": w.level,
            "xpGained": combat::XP_WIN,
            "xp": w.xp,
        });
        self.emit("Boosted", args);
        if leveled {
            self.emit("LevelUp", json!({"roundId": round_id, "coinId": ev.winner, "level": new_level}));
        }
    }

    fn finish_epoch(&mut self, round_id: u64, round: &mut Round, seed: &[u8; 32]) {
        let epoch = round.epoch;
        self.hunts(round_id, round, seed, epoch);
        self.sweep_fees(round_id, round, epoch);
        round.alive_mask = 0;
        round.resolve_cursor = 0;
        round.locked = false;
        round.last_epoch_resolved_at = now_s();
        if round.phase == Phase::Leveling && epoch >= u16::from(self.config.leveling_epochs) {
            round.phase = Phase::Knockout;
        }
        let settled = round.alive_count == 1;
        if settled {
            settle(round);
        }
        self.emit(
            "EpochResolved",
            json!({"roundId": round_id, "epoch": epoch, "aliveCount": round.alive_count}),
        );
        if settled {
            self.emit(
                "RoundSettled",
                json!({
                    "roundId": round_id,
                    "winnerCoinId": round.winner_coin_id,
                    "redeemPool": dec(round.redeem_pool),
                    "redeemSupply": dec(round.redeem_supply),
                }),
            );
        }
    }

    fn hunts(&mut self, round_id: u64, round: &mut Round, seed: &[u8; 32], epoch: u16) {
        let mask = round.alive_mask;
        let win_pct = self.config.hunt_win_pct;
        for i in 0..round.coins.len() {
            let c = &mut round.coins[i];
            if mask & (1u32 << i) == 0 || c.status != Status::Alive {
                continue;
            }
            let success = combat::hunt_roll(seed, u(i as u128)) < win_pct;
            let gained = if success { combat::XP_HUNT } else { 0 };
            c.xp += gained;
            let new_level = combat::level_from_xp(u(u128::from(c.xp)));
            let leveled = new_level > c.level;
            if leveled {
                c.level = new_level;
            }
            let args = json!({
                "roundId": round_id,
                "epoch": epoch,
                "coinId": i,
                "success": success,
                "xpGained": gained,
                "xp": c.xp,
                "level": c.level,
            });
            self.emit("HuntResolved", args);
            if leveled {
                self.emit("LevelUp", json!({"roundId": round_id, "coinId": i, "level": new_level}));
            }
        }
    }

    fn sweep_fees(&mut self, round_id: u64, round: &mut Round, epoch: u16) {
        let mask = round.alive_mask;
        let mut total = 0u128;
        for (i, c) in round.coins.iter_mut().enumerate() {
            if mask & (1u32 << i) == 0 {
                continue;
            }
            total += c.fee_acc;
            c.fee_acc = 0;
        }
        if total == 0 {
            return;
        }
        let to_pot = mul_bps(total, FEE_TO_POT_BPS);
        let to_treasury = total - to_pot;
        round.prize_pot += to_pot;
        round.treasury += to_treasury;
        self.emit(
            "FeesSwept",
            json!({
                "roundId": round_id,
                "epoch": epoch,
                "toPot": dec(to_pot),
                "toTreasury": dec(to_treasury),
                "prizePotAfter": dec(round.prize_pot),
                "treasuryAfter": dec(round.treasury),
            }),
        );
    }

    pub(crate) fn do_abort_round(&mut self, round_id: u64) {
        let mut round = self.load_round(round_id);
        require(round.phase != Phase::None, E::UnknownRound);
        let now = now_s();
        let cfg = self.config.clone();
        if round.phase == Phase::Lobby {
            require(
                now >= round.created_at + u64::from(cfg.lobby_seconds)
                    && round.coins.len() < usize::from(cfg.min_coins),
                E::AbortNotOpen,
            );
            round.phase = Phase::Aborted;
            round.lobby_abort = true;
            round.launch_fees_owed = round.coins.len() as u128 * cfg.launch_fee.0;
            self.save_round(round_id, &round);
            self.emit("RoundAborted", json!({"roundId": round_id, "reason": ABORT_LOBBY_UNDERFILLED}));
            return;
        }
        require(round.phase == Phase::Leveling || round.phase == Phase::Knockout, E::WrongPhase);
        require(now >= round.started_at + u64::from(cfg.max_round_seconds), E::AbortNotOpen);
        round.locked = false;
        round.alive_mask = 0;
        self.abort_alive_coins(round_id, &mut round);
        round.phase = Phase::Aborted;
        self.save_round(round_id, &round);
        self.emit("RoundAborted", json!({"roundId": round_id, "reason": ABORT_MAX_ROUND_TIME}));
    }

    fn abort_alive_coins(&mut self, round_id: u64, round: &mut Round) {
        let mut sum_r = 0u128;
        let mut fees = 0u128;
        for c in round.coins.iter_mut().filter(|c| c.status == Status::Alive) {
            sum_r += c.r_mon;
            fees += c.fee_acc;
            c.fee_acc = 0;
        }
        if fees != 0 {
            let to_pot = mul_bps(fees, FEE_TO_POT_BPS);
            round.prize_pot += to_pot;
            round.treasury += fees - to_pot;
            self.emit(
                "FeesSwept",
                json!({
                    "roundId": round_id,
                    "epoch": round.epoch,
                    "toPot": dec(to_pot),
                    "toTreasury": dec(fees - to_pot),
                    "prizePotAfter": dec(round.prize_pot),
                    "treasuryAfter": dec(round.treasury),
                }),
            );
        }
        let mut pot = round.prize_pot;
        let last = round.coins.iter().rposition(|c| c.status == Status::Alive && c.r_mon != 0);
        if sum_r == 0 || last.is_none() {
            round.treasury += pot;
            pot = 0;
        }
        round.prize_pot = 0;
        let mut given = 0u128;
        for i in 0..round.coins.len() {
            let c = &mut round.coins[i];
            if c.status != Status::Alive {
                continue;
            }
            let mut share = 0u128;
            if pot != 0 && c.r_mon != 0 {
                share = if Some(i) == last { pot - given } else { crate::base::mul_div(pot, c.r_mon, sum_r) };
                given += share;
            }
            let pool = c.r_mon + share;
            c.status = Status::Refunded;
            c.r_mon = 0;
            c.consolation_pool = pool;
            c.consolation_supply = c.supply;
            let supply = c.supply;
            self.emit(
                "CoinRefundRate",
                json!({"roundId": round_id, "coinId": i, "refundPool": dec(pool), "refundSupply": dec(supply)}),
            );
        }
        round.alive_count = 0;
    }
}

fn boost_coin(c: &mut Coin, x: u128) {
    let v_tok = lo(ok(curve::boosted_vtok(u(c.v_mon), u(c.v_tok), u(x))));
    c.v_mon += x;
    c.v_tok = v_tok;
    c.r_mon += x;
}

fn settle(round: &mut Round) {
    let found = round.coins.iter().position(|c| c.status == Status::Alive);
    if let Some(i) = found {
        let pot = round.prize_pot;
        let c = &mut round.coins[i];
        c.status = Status::Champion;
        round.winner_coin_id = i as u8;
        round.redeem_pool = c.r_mon + pot;
        round.redeem_supply = c.supply;
        c.r_mon = 0;
        round.prize_pot = 0;
        round.phase = Phase::Settled;
    }
}
