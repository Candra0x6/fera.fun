use crate::engine::curve;
use crate::engine::{MathError, MathResult, U256};
use crate::errors::{fail, require, ArenaError as E};
use crate::store;
use crate::types::*;
use crate::Arena;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{json, Value};
use near_sdk::{env, AccountId, Gas, NearToken, Promise};

pub const CALLBACK_GAS: Gas = Gas::from_tgas(5);
pub const RING: u64 = 256;
pub const MAX_PAGE: u64 = 100;

pub fn now_s() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

pub fn u(x: u128) -> U256 {
    U256::from(x)
}

pub fn lo(x: U256) -> u128 {
    x.low_u128()
}

pub fn ok<T>(r: MathResult<T>) -> T {
    match r {
        Ok(v) => v,
        Err(MathError::BadSeed) => fail(E::BadSeed),
        Err(_) => fail(E::Overflow),
    }
}

pub fn mul_div(a: u128, b: u128, c: u128) -> u128 {
    lo(ok(crate::engine::div(ok(crate::engine::mul(u(a), u(b))), u(c))))
}

pub fn mul_bps(a: u128, bps: u128) -> u128 {
    mul_div(a, bps, BPS)
}

pub fn dec(x: u128) -> Value {
    Value::String(x.to_string())
}

pub fn hex32(bytes: &[u8; 32]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(66);
    out.push_str("0x");
    for b in bytes {
        out.push(DIGITS[(b >> 4) as usize] as char);
        out.push(DIGITS[(b & 0xf) as usize] as char);
    }
    out
}

pub fn check_name(name: &str) {
    let b = name.as_bytes();
    require(!b.is_empty() && b.len() <= 32, E::BadName);
    require(b.iter().all(|c| *c >= 0x20 && *c != 0x7f), E::BadName);
}

pub fn check_ticker(ticker: &str) {
    let b = ticker.as_bytes();
    require(b.len() >= 2 && b.len() <= 7, E::BadTicker);
    require(b.iter().all(|c| c.is_ascii_digit() || c.is_ascii_uppercase()), E::BadTicker);
}

impl Arena {
    pub(crate) fn load_round(&self, round_id: u64) -> Round {
        store::read(&store::round_key(round_id)).unwrap_or_else(|| fail(E::UnknownRound))
    }

    pub(crate) fn save_round(&self, round_id: u64, round: &Round) {
        store::write(&store::round_key(round_id), round);
    }

    pub(crate) fn ledger_get(&self, round_id: u64, account: &AccountId) -> [u128; MAX_SLOTS] {
        store::read(&store::ledger_key(round_id, account.as_str())).unwrap_or([0; MAX_SLOTS])
    }

    pub(crate) fn ledger_set(&self, round_id: u64, account: &AccountId, bal: [u128; MAX_SLOTS]) {
        let key = store::ledger_key(round_id, account.as_str());
        if bal.iter().all(|b| *b == 0) {
            store::remove(&key);
        } else {
            store::write(&key, &bal);
        }
    }

    pub(crate) fn ledger_credit(&self, round_id: u64, account: &AccountId, coin_id: u8, amount: u128) {
        let mut bal = self.ledger_get(round_id, account);
        bal[coin_id as usize] += amount;
        self.ledger_set(round_id, account, bal);
    }

    pub(crate) fn ledger_debit(&self, round_id: u64, account: &AccountId, coin_id: u8, amount: u128) {
        let mut bal = self.ledger_get(round_id, account);
        require(bal[coin_id as usize] >= amount, E::InsufficientBalance);
        bal[coin_id as usize] -= amount;
        self.ledger_set(round_id, account, bal);
    }

    pub(crate) fn claimable_get(&self, account: &AccountId) -> u128 {
        store::read(&store::claimable_key(account.as_str())).unwrap_or(0)
    }

    pub(crate) fn claimable_set(&self, account: &AccountId, amount: u128) {
        let key = store::claimable_key(account.as_str());
        if amount == 0 {
            store::remove(&key);
        } else {
            store::write(&key, &amount);
        }
    }

    pub(crate) fn emit(&mut self, name: &str, data: Value) {
        let line = json!({"standard": "fera_arena", "version": "1.0.0", "event": name, "data": data});
        env::log_str(&format!("EVENT_JSON:{line}"));
        self.head_seq += 1;
        let record = EventRecord {
            seq: self.head_seq,
            height: env::block_height(),
            ts_ms: env::block_timestamp_ms(),
            name: name.to_string(),
            args: data.to_string(),
        };
        store::write(&store::event_key(self.head_seq % RING), &record);
    }

    pub(crate) fn storage_cost() -> u128 {
        u128::from(env::storage_usage()) * env::storage_byte_cost().as_yoctonear()
    }

    pub(crate) fn assert_floor(&self) {
        let need = Self::storage_cost().saturating_add(self.liabilities);
        require(env::account_balance().as_yoctonear() >= need, E::StorageFloorBreached);
    }

    pub(crate) fn pay(&mut self, to: &AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        self.assert_floor();
        self.liabilities -= amount;
        let _ = Promise::new(to.clone())
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_payout(to.clone(), U128(amount)),
            );
    }

    pub(crate) fn between_rounds(&self) -> bool {
        if self.current_round_id == 0 {
            return true;
        }
        let r = self.load_round(self.current_round_id);
        r.phase == Phase::Settled || r.phase == Phase::Aborted
    }

    pub(crate) fn do_create_round(&mut self) -> u64 {
        let deposit = env::attached_deposit().as_yoctonear();
        require(self.between_rounds(), E::RoundInProgress);
        let previous = self.current_round_id;
        let round_id = previous + 1;
        self.current_round_id = round_id;
        let mut round = Round::new(now_s());
        let config = near_sdk::serde_json::to_value(&self.config).unwrap_or(Value::Null);
        self.emit("RoundCreated", json!({"roundId": round_id, "config": config}));
        if previous != 0 {
            let mut prev = self.load_round(previous);
            let carry = prev.treasury - prev.launch_fees_owed;
            if carry != 0 {
                prev.treasury -= carry;
                round.treasury = carry;
                self.save_round(previous, &prev);
                let funder = env::current_account_id();
                self.emit(
                    "TreasuryFunded",
                    json!({"roundId": round_id, "funder": funder, "amount": dec(carry)}),
                );
            }
        }
        if deposit != 0 {
            round.treasury += deposit;
            self.liabilities += deposit;
            let funder = env::predecessor_account_id();
            self.emit(
                "TreasuryFunded",
                json!({"roundId": round_id, "funder": funder, "amount": dec(deposit)}),
            );
        }
        self.save_round(round_id, &round);
        round_id
    }

    pub(crate) fn do_launch_coin(
        &mut self,
        round_id: u64,
        name: String,
        ticker: String,
        monster_type: u8,
        skin_id: u8,
    ) -> u8 {
        let deposit = env::attached_deposit().as_yoctonear();
        let mut round = self.load_round(round_id);
        require(round.phase == Phase::Lobby, E::WrongPhase);
        let cfg = self.config.clone();
        let coin_id = round.coins.len();
        require(coin_id < usize::from(cfg.max_coins), E::RoundFull);
        require(monster_type < MONSTER_TYPES && skin_id < SKIN_TYPES, E::BadCatalogId);
        check_name(&name);
        check_ticker(&ticker);
        let creator = env::predecessor_account_id();
        require(round.coins.iter().filter(|c| c.creator == creator).count() < 2, E::CreatorCapReached);
        require(deposit >= cfg.launch_fee.0, E::BadDeposit);
        let seed = deposit - cfg.launch_fee.0;
        require(seed >= cfg.min_seed.0 && seed <= cfg.max_seed.0, E::BadSeed);
        let l = ok(curve::launch_seed(u(cfg.v_mon0.0), u(cfg.v_tok0.0), u(seed)));
        let (tokens, v_tok, v_mon) = (lo(l.tokens), lo(l.v_tok), lo(l.v_mon));
        round.coins.push(Coin {
            creator: creator.clone(),
            name: name.clone(),
            ticker: ticker.clone(),
            monster_type,
            skin_id,
            status: Status::Alive,
            level: 1,
            xp: 0,
            wins: 0,
            seed_claimed: false,
            v_mon,
            v_tok,
            r_mon: seed,
            r_mon_at_lock: 0,
            seed_mon: seed,
            seed_tokens: tokens,
            consolation_pool: 0,
            consolation_supply: 0,
            pool_paid: 0,
            fee_acc: 0,
            supply: tokens,
        });
        round.alive_count = round.coins.len() as u8;
        round.treasury += deposit - seed;
        self.liabilities += deposit;
        self.save_round(round_id, &round);
        self.emit(
            "CoinLaunched",
            json!({
                "roundId": round_id,
                "coinId": coin_id,
                "token": format!("{round_id}:{coin_id}"),
                "creator": creator,
                "name": name,
                "ticker": ticker,
                "monsterType": monster_type,
                "skinId": skin_id,
                "seedMon": dec(seed),
                "vMon": dec(v_mon),
                "vTok": dec(v_tok),
                "supply": dec(tokens),
            }),
        );
        coin_id as u8
    }

    pub(crate) fn do_start_round(&mut self, round_id: u64) {
        let mut round = self.load_round(round_id);
        require(round.phase == Phase::Lobby, E::WrongPhase);
        let cfg = &self.config;
        let count = round.coins.len();
        let full = count >= usize::from(cfg.max_coins);
        let now = now_s();
        let deadline =
            now >= round.created_at + u64::from(cfg.lobby_seconds) && count >= usize::from(cfg.min_coins);
        require(full || deadline, E::LobbyNotReady);
        round.phase = if cfg.leveling_epochs > 0 { Phase::Leveling } else { Phase::Knockout };
        round.started_at = now;
        round.last_epoch_resolved_at = now;
        round.alive_count = count as u8;
        self.save_round(round_id, &round);
        self.emit("RoundStarted", json!({"roundId": round_id, "startedAt": now, "coins": count}));
    }

    pub(crate) fn tradable(&self, round: &Round, coin_id: u8) -> usize {
        require(round.phase == Phase::Leveling || round.phase == Phase::Knockout, E::WrongPhase);
        require(!round.locked, E::Locked);
        let idx = usize::from(coin_id);
        require(idx < round.coins.len() && round.coins[idx].status == Status::Alive, E::CoinNotAlive);
        idx
    }

    pub(crate) fn do_buy(&mut self, round_id: u64, coin_id: u8, min_out: u128, deadline_ms: u64) -> u128 {
        let deposit = env::attached_deposit().as_yoctonear();
        require(env::block_timestamp_ms() <= deadline_ms, E::Expired);
        require(min_out != 0, E::MinOutRequired);
        let mut round = self.load_round(round_id);
        let idx = self.tradable(&round, coin_id);
        let fee_bps = u128::from(self.config.trade_fee_bps);
        let q = ok(curve::quote_buy(
            u(round.coins[idx].v_mon),
            u(round.coins[idx].v_tok),
            u(deposit),
            u(fee_bps),
        ));
        let (fee, net, out, new_v_tok) = (lo(q.fee), lo(q.net), lo(q.out), lo(q.new_v_tok));
        require(out != 0, E::ZeroOut);
        require(out >= min_out, E::Slippage);
        let c = &mut round.coins[idx];
        c.v_mon += net;
        c.v_tok = new_v_tok;
        c.r_mon += net;
        c.fee_acc += fee;
        c.supply += out;
        let (r_mon, v_mon, v_tok) = (c.r_mon, c.v_mon, c.v_tok);
        self.save_round(round_id, &round);
        let trader = env::predecessor_account_id();
        self.ledger_credit(round_id, &trader, coin_id, out);
        self.liabilities += deposit;
        self.emit(
            "Trade",
            json!({
                "roundId": round_id,
                "coinId": coin_id,
                "trader": trader,
                "isBuy": true,
                "monAmount": dec(deposit),
                "tokenAmount": dec(out),
                "rMon": dec(r_mon),
                "vMon": dec(v_mon),
                "vTok": dec(v_tok),
            }),
        );
        out
    }

    pub(crate) fn do_sell(
        &mut self,
        round_id: u64,
        coin_id: u8,
        tokens: u128,
        min_out: u128,
        deadline_ms: u64,
    ) -> u128 {
        require(env::block_timestamp_ms() <= deadline_ms, E::Expired);
        require(min_out != 0, E::MinOutRequired);
        let mut round = self.load_round(round_id);
        let idx = self.tradable(&round, coin_id);
        let fee_bps = u128::from(self.config.trade_fee_bps);
        let gross = lo(ok(curve::sell_gross(
            u(round.coins[idx].v_mon),
            u(round.coins[idx].v_tok),
            u(tokens),
        )));
        require(gross <= round.coins[idx].r_mon, E::Insolvent);
        let fee = lo(ok(curve::fee_of(u(gross), u(fee_bps))));
        let out = gross - fee;
        require(out >= min_out, E::Slippage);
        let seller = env::predecessor_account_id();
        self.ledger_debit(round_id, &seller, coin_id, tokens);
        let c = &mut round.coins[idx];
        c.v_mon -= gross;
        c.v_tok += tokens;
        c.r_mon -= gross;
        c.fee_acc += fee;
        c.supply -= tokens;
        let (r_mon, v_mon, v_tok) = (c.r_mon, c.v_mon, c.v_tok);
        self.save_round(round_id, &round);
        self.emit(
            "Trade",
            json!({
                "roundId": round_id,
                "coinId": coin_id,
                "trader": seller,
                "isBuy": false,
                "monAmount": dec(out),
                "tokenAmount": dec(tokens),
                "rMon": dec(r_mon),
                "vMon": dec(v_mon),
                "vTok": dec(v_tok),
            }),
        );
        self.pay(&seller, out);
        out
    }

    pub(crate) fn do_lock_epoch(&mut self, round_id: u64) {
        let mut round = self.load_round(round_id);
        require(round.phase == Phase::Leveling || round.phase == Phase::Knockout, E::WrongPhase);
        require(!round.locked, E::Locked);
        let now = now_s();
        require(
            now >= round.last_epoch_resolved_at + u64::from(self.config.epoch_seconds),
            E::EpochTooEarly,
        );
        round.locked = true;
        round.seed = [0; 32];
        round.seed_ready = false;
        round.epoch += 1;
        round.locked_at = now;
        round.lock_height = env::block_height();
        let mut mask = 0u32;
        let mut sum = 0u128;
        let mut alive = 0u8;
        for (i, c) in round.coins.iter_mut().enumerate() {
            if c.status != Status::Alive {
                continue;
            }
            mask |= 1u32 << i;
            c.r_mon_at_lock = c.r_mon;
            sum += c.r_mon;
            alive += 1;
        }
        round.alive_mask = mask;
        round.alive_at_lock = alive;
        round.resolve_cursor = 0;
        round.sum_r_mon_at_lock = sum;
        let (epoch, lock_height) = (round.epoch, round.lock_height);
        self.save_round(round_id, &round);
        self.emit(
            "EpochLocked",
            json!({
                "roundId": round_id,
                "epoch": epoch,
                "lockHeight": lock_height,
                "aliveMask": mask,
                "lockedAt": now,
            }),
        );
    }
}
