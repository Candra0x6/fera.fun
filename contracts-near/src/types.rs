use crate::errors::{fail, ArenaError};
use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

pub const MAX_SLOTS: usize = 6;
pub const MONSTER_TYPES: u8 = 5;
pub const SKIN_TYPES: u8 = 5;
pub const FEE_TO_POT_BPS: u128 = 5000;
pub const BPS: u128 = 10_000;
pub const ABORT_LOBBY_UNDERFILLED: u8 = 1;
pub const ABORT_MAX_ROUND_TIME: u8 = 3;

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
    None,
    Lobby,
    Leveling,
    Knockout,
    Settled,
    Aborted,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    None,
    Alive,
    Eliminated,
    Champion,
    Refunded,
}

#[near(serializers = [borsh, json])]
#[serde(rename_all = "camelCase")]
#[derive(Clone, Debug)]
pub struct Config {
    pub min_coins: u8,
    pub max_coins: u8,
    pub lobby_seconds: u32,
    pub leveling_epochs: u8,
    pub epoch_seconds: u32,
    pub max_round_seconds: u32,
    pub clashes_per_epoch: u8,
    pub launch_fee: U128,
    pub min_seed: U128,
    pub max_seed: U128,
    pub trade_fee_bps: u16,
    pub boost_bps: u16,
    pub consolation_bps: u16,
    pub pot_bps: u16,
    pub treasury_bps: u16,
    pub gamma_bps: u16,
    pub pool_factor_min_bps: u16,
    pub pool_factor_max_bps: u32,
    pub win_prob_min_bps: u16,
    pub win_prob_max_bps: u16,
    pub element_up_bps: u16,
    pub element_down_bps: u16,
    pub level_bonus_bps: u16,
    pub hunt_win_pct: u8,
    pub v_mon0: U128,
    pub v_tok0: U128,
    pub keeper_bounty: U128,
    pub min_seed_blocks: u64,
}

impl Config {
    pub fn validate(&self) {
        let split = u32::from(self.boost_bps)
            + u32::from(self.consolation_bps)
            + u32::from(self.pot_bps)
            + u32::from(self.treasury_bps);
        let ok = split == 10_000
            && self.min_coins >= 2
            && self.max_coins >= self.min_coins
            && usize::from(self.max_coins) <= MAX_SLOTS
            && self.clashes_per_epoch >= 1
            && self.clashes_per_epoch <= self.max_coins / 2
            && self.epoch_seconds != 0
            && self.max_round_seconds != 0
            && self.min_seed.0 != 0
            && self.min_seed.0 <= self.max_seed.0
            && self.trade_fee_bps < 10_000
            && self.pool_factor_min_bps != 0
            && u32::from(self.pool_factor_min_bps) <= self.pool_factor_max_bps
            && self.win_prob_min_bps != 0
            && self.win_prob_min_bps <= self.win_prob_max_bps
            && self.win_prob_max_bps < 10_000
            && self.hunt_win_pct <= 100
            && self.v_mon0.0 != 0
            && self.v_tok0.0 != 0
            && self.keeper_bounty.0 == 0;
        if !ok {
            fail(ArenaError::BadConfig);
        }
    }
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Coin {
    pub creator: AccountId,
    pub name: String,
    pub ticker: String,
    pub monster_type: u8,
    pub skin_id: u8,
    pub status: Status,
    pub level: u8,
    pub xp: u16,
    pub wins: u16,
    pub seed_claimed: bool,
    pub v_mon: u128,
    pub v_tok: u128,
    pub r_mon: u128,
    pub r_mon_at_lock: u128,
    pub seed_mon: u128,
    pub seed_tokens: u128,
    pub consolation_pool: u128,
    pub consolation_supply: u128,
    pub pool_paid: u128,
    pub fee_acc: u128,
    pub supply: u128,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Round {
    pub phase: Phase,
    pub locked: bool,
    pub epoch: u16,
    pub alive_count: u8,
    pub winner_coin_id: u8,
    pub created_at: u64,
    pub started_at: u64,
    pub locked_at: u64,
    pub last_epoch_resolved_at: u64,
    pub lock_height: u64,
    pub seed: [u8; 32],
    pub seed_ready: bool,
    pub prize_pot: u128,
    pub treasury: u128,
    pub redeem_pool: u128,
    pub redeem_supply: u128,
    pub redeem_paid: u128,
    pub clashes_played: u32,
    pub alive_mask: u32,
    pub alive_at_lock: u8,
    pub resolve_cursor: u8,
    pub lobby_abort: bool,
    pub sum_r_mon_at_lock: u128,
    pub launch_fees_owed: u128,
    pub coins: Vec<Coin>,
}

impl Round {
    pub fn new(created_at: u64) -> Self {
        Round {
            phase: Phase::Lobby,
            locked: false,
            epoch: 0,
            alive_count: 0,
            winner_coin_id: 0,
            created_at,
            started_at: 0,
            locked_at: 0,
            last_epoch_resolved_at: 0,
            lock_height: 0,
            seed: [0; 32],
            seed_ready: false,
            prize_pot: 0,
            treasury: 0,
            redeem_pool: 0,
            redeem_supply: 0,
            redeem_paid: 0,
            clashes_played: 0,
            alive_mask: 0,
            alive_at_lock: 0,
            resolve_cursor: 0,
            lobby_abort: false,
            sum_r_mon_at_lock: 0,
            launch_fees_owed: 0,
            coins: Vec::new(),
        }
    }

    pub fn view(&self, round_id: u64) -> RoundView {
        RoundView {
            round_id,
            phase: self.phase,
            locked: self.locked,
            epoch: self.epoch,
            coin_count: self.coins.len() as u8,
            alive_count: self.alive_count,
            cancel_streak: 0,
            winner_coin_id: self.winner_coin_id,
            created_at: self.created_at,
            started_at: self.started_at,
            locked_at: self.locked_at,
            last_epoch_resolved_at: self.last_epoch_resolved_at,
            prize_pot: U128(self.prize_pot),
            treasury: U128(self.treasury),
            redeem_pool: U128(self.redeem_pool),
            redeem_supply: U128(self.redeem_supply),
            clashes_played: self.clashes_played,
            lock_height: self.lock_height,
        }
    }
}

impl Coin {
    pub fn view(&self, round_id: u64, coin_id: u8) -> CoinView {
        CoinView {
            round_id,
            coin_id,
            token: format!("{round_id}:{coin_id}"),
            creator: self.creator.clone(),
            name: self.name.clone(),
            ticker: self.ticker.clone(),
            monster_type: self.monster_type,
            skin_id: self.skin_id,
            status: self.status,
            level: self.level,
            xp: self.xp,
            wins: self.wins,
            v_mon: U128(self.v_mon),
            v_tok: U128(self.v_tok),
            r_mon: U128(self.r_mon),
            r_mon_at_lock: U128(self.r_mon_at_lock),
            seed_mon: U128(self.seed_mon),
            consolation_pool: U128(self.consolation_pool),
            consolation_supply: U128(self.consolation_supply),
            supply: U128(self.supply),
            is_house: false,
        }
    }
}

#[near(serializers = [json])]
#[serde(rename_all = "camelCase")]
#[derive(Clone, Debug)]
pub struct RoundView {
    pub round_id: u64,
    pub phase: Phase,
    pub locked: bool,
    pub epoch: u16,
    pub coin_count: u8,
    pub alive_count: u8,
    pub cancel_streak: u8,
    pub winner_coin_id: u8,
    pub created_at: u64,
    pub started_at: u64,
    pub locked_at: u64,
    pub last_epoch_resolved_at: u64,
    pub prize_pot: U128,
    pub treasury: U128,
    pub redeem_pool: U128,
    pub redeem_supply: U128,
    pub clashes_played: u32,
    pub lock_height: u64,
}

#[near(serializers = [json])]
#[serde(rename_all = "camelCase")]
#[derive(Clone, Debug)]
pub struct CoinView {
    pub round_id: u64,
    pub coin_id: u8,
    pub token: String,
    pub creator: AccountId,
    pub name: String,
    pub ticker: String,
    pub monster_type: u8,
    pub skin_id: u8,
    pub status: Status,
    pub level: u8,
    pub xp: u16,
    pub wins: u16,
    pub v_mon: U128,
    pub v_tok: U128,
    pub r_mon: U128,
    pub r_mon_at_lock: U128,
    pub seed_mon: U128,
    pub consolation_pool: U128,
    pub consolation_supply: U128,
    pub supply: U128,
    pub is_house: bool,
}

#[near(serializers = [json])]
#[serde(rename_all = "camelCase")]
#[derive(Clone, Debug)]
pub struct ArenaSnapshot {
    pub config: Config,
    pub round: RoundView,
    pub coins: Vec<CoinView>,
    pub block_height: u64,
    pub ts_ms: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct EventRecord {
    pub seq: u64,
    pub height: u64,
    pub ts_ms: u64,
    pub name: String,
    pub args: String,
}

#[near(serializers = [json])]
#[serde(rename_all = "camelCase")]
#[derive(Clone, Debug)]
pub struct EventView {
    pub seq: u64,
    pub height: u64,
    pub ts_ms: u64,
    pub name: String,
    pub args: near_sdk::serde_json::Value,
}

#[near(serializers = [json])]
#[serde(rename_all = "camelCase")]
#[derive(Clone, Debug)]
pub struct EventsPage {
    pub events: Vec<EventView>,
    pub head_seq: u64,
    pub oldest_seq: u64,
}
