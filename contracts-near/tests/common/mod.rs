#![allow(dead_code)]

use fera_arena::store;
use fera_arena::types::{Config, Phase, Round, Status};
use fera_arena::Arena;
use near_sdk::mock::MockAction;
use near_sdk::serde_json::{self, json, Value};
use near_sdk::test_utils::{get_created_receipts, get_logs, VMContextBuilder};
use near_sdk::{testing_env, AccountId, NearToken, PromiseResult};
use std::panic::{catch_unwind, AssertUnwindSafe};

pub const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
pub const TENTH: u128 = NEAR / 10;
pub const RESERVE: u128 = 25 * NEAR;

pub fn config_json() -> Value {
    json!({
        "minCoins": 6, "maxCoins": 6, "lobbySeconds": 10800, "levelingEpochs": 1, "epochSeconds": 14,
        "maxRoundSeconds": 3600, "clashesPerEpoch": 2,
        "launchFee": "100000000000000000000000", "minSeed": "100000000000000000000000",
        "maxSeed": "100000000000000000000000",
        "tradeFeeBps": 100, "boostBps": 5000, "consolationBps": 3000, "potBps": 1500, "treasuryBps": 500,
        "gammaBps": 8800, "poolFactorMinBps": 1000, "poolFactorMaxBps": 100000,
        "winProbMinBps": 1500, "winProbMaxBps": 8500, "elementUpBps": 11500, "elementDownBps": 8700,
        "levelBonusBps": 400, "huntWinPct": 50,
        "vMon0": "20000000000000000000000000", "vTok0": "1000000000000000000000000000",
        "keeperBounty": "0", "minSeedBlocks": 3
    })
}

pub fn config() -> Config {
    serde_json::from_value(config_json()).unwrap()
}

pub fn wide_config() -> Config {
    let mut v = config_json();
    v["minSeed"] = json!("50000000000000000000000");
    v["maxSeed"] = json!("1000000000000000000000000");
    serde_json::from_value(v).unwrap()
}

pub fn acc(name: &str) -> AccountId {
    format!("{name}.testnet").parse().unwrap()
}

pub struct Sim {
    pub arena: Arena,
    pub bank: u128,
    pub now: u64,
    pub height: u64,
    pub seed_byte: u8,
    pub logs: Vec<String>,
}

pub fn panic_of<T>(r: Result<T, Box<dyn std::any::Any + Send>>) -> String {
    match r {
        Ok(_) => String::new(),
        Err(e) => panic_text(e),
    }
}

pub fn panic_text(e: Box<dyn std::any::Any + Send>) -> String {
    if let Some(s) = e.downcast_ref::<String>() {
        s.clone()
    } else if let Some(s) = e.downcast_ref::<&str>() {
        (*s).to_string()
    } else {
        String::new()
    }
}

impl Sim {
    pub fn new(config: Config) -> Sim {
        env_for("deployer", 0, 1_000_000, 1_000, 7, RESERVE, None);
        Sim {
            arena: Arena::init(config),
            bank: RESERVE,
            now: 1_000_000,
            height: 1_000,
            seed_byte: 7,
            logs: Vec::new(),
        }
    }

    fn set_env(&mut self, who: &str, deposit: u128, promise: Option<PromiseResult>) {
        env_for(who, deposit, self.now, self.height, self.seed_byte, self.bank, promise);
    }

    pub fn advance(&mut self, secs: u64, blocks: u64) {
        self.now += secs;
        self.height += blocks;
        self.seed_byte = self.seed_byte.wrapping_add(13);
    }

    pub fn try_call<R>(
        &mut self,
        who: &str,
        deposit: u128,
        f: impl FnOnce(&mut Arena) -> R,
    ) -> Result<R, String> {
        self.bank += deposit;
        self.set_env(who, deposit, None);
        let r = catch_unwind(AssertUnwindSafe(|| f(&mut self.arena)));
        match r {
            Ok(v) => {
                for receipt in get_created_receipts() {
                    for action in receipt.actions {
                        if let MockAction::Transfer { deposit, .. } = action {
                            self.bank -= deposit.as_yoctonear();
                        }
                    }
                }
                self.logs.extend(get_logs());
                Ok(v)
            }
            Err(e) => {
                self.bank -= deposit;
                Err(panic_text(e))
            }
        }
    }

    pub fn call<R>(&mut self, who: &str, deposit: u128, f: impl FnOnce(&mut Arena) -> R) -> R {
        match self.try_call(who, deposit, f) {
            Ok(v) => v,
            Err(e) => panic!("unexpected panic: {e}"),
        }
    }

    pub fn expect_err<R>(&mut self, who: &str, deposit: u128, code: &str, f: impl FnOnce(&mut Arena) -> R) {
        match self.try_call(who, deposit, f) {
            Ok(_) => panic!("expected ArenaError:{code}, call succeeded"),
            Err(e) => assert!(e.contains(&format!("ArenaError:{code}")), "expected {code}, got {e}"),
        }
    }

    pub fn view<R>(&mut self, f: impl FnOnce(&Arena) -> R) -> R {
        self.set_env("viewer", 0, None);
        f(&self.arena)
    }

    pub fn fail_payout(&mut self, to: &str, amount: u128) {
        self.bank += amount;
        self.set_env("fera-arena", 0, Some(PromiseResult::Failed));
        self.arena.on_payout(acc(to), near_sdk::json_types::U128(amount));
    }

    pub fn round(&self, id: u64) -> Round {
        store::read(&store::round_key(id)).unwrap()
    }

    pub fn ledger(&self, id: u64, who: &AccountId) -> [u128; 6] {
        store::read(&store::ledger_key(id, who.as_str())).unwrap_or([0; 6])
    }

    pub fn claimable(&self, who: &AccountId) -> u128 {
        store::read(&store::claimable_key(who.as_str())).unwrap_or(0)
    }

    pub fn start_full_round(&mut self, seeds: &[u128]) -> u64 {
        let id = self.call("creator", 0, |a| a.create_round());
        for (i, seed) in seeds.iter().enumerate() {
            let who = format!("p{i}");
            let name = format!("Coin {i}");
            let ticker = format!("C{i}X");
            self.call(&who, TENTH + seed, |a| a.launch_coin(id, name, ticker, (i % 5) as u8, 0));
        }
        self.call("anyone", 0, |a| a.start_round(id));
        id
    }

    pub fn step_epoch(&mut self, id: u64, max_clashes: u8) -> bool {
        self.advance(15, 1);
        self.call("keeper", 0, |a| a.lock_epoch(id));
        self.advance(1, 4);
        self.call("keeper", 0, |a| a.resolve_epoch(id, max_clashes))
    }

    pub fn check_invariants(&self, ids: &[u64], accounts: &[AccountId]) {
        let mut owed = 0u128;
        for id in ids {
            let r = self.round(*id);
            owed += r.prize_pot + r.treasury;
            if r.phase == Phase::Settled {
                owed += r.redeem_pool - r.redeem_paid;
            }
            for (i, c) in r.coins.iter().enumerate() {
                owed += c.r_mon + c.fee_acc;
                if matches!(c.status, Status::Eliminated | Status::Refunded) {
                    owed += c.consolation_pool - c.pool_paid;
                }
                let held: u128 = accounts.iter().map(|a| self.ledger(*id, a)[i]).sum();
                let seed = if c.seed_claimed { 0 } else { c.seed_tokens };
                assert_eq!(c.supply, held + seed, "supply of coin {i} in round {id}");
            }
        }
        for a in accounts {
            owed += self.claimable(a);
        }
        let liabilities = self.arena.liabilities().0;
        assert_eq!(liabilities, owed, "liabilities counter");
        let storage = 307_200u128 * 10_000_000_000_000_000_000u128;
        assert!(self.bank >= storage + liabilities, "storage floor: bank {} liabilities {}", self.bank, liabilities);
    }
}

#[allow(deprecated)]
fn env_for(
    who: &str,
    deposit: u128,
    now: u64,
    height: u64,
    seed_byte: u8,
    bank: u128,
    promise: Option<PromiseResult>,
) {
    let mut b = VMContextBuilder::new();
    b.predecessor_account_id(acc(who))
        .signer_account_id(acc(who))
        .current_account_id("fera-arena.testnet".parse().unwrap())
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_timestamp(now * 1_000_000_000)
        .block_height(height)
        .account_balance(NearToken::from_yoctonear(bank))
        .random_seed([seed_byte; 32]);
    let ctx = b.build();
    match promise {
        Some(p) => near_sdk::test_utils::testing_env_with_promise_results(ctx, p),
        None => testing_env!(ctx),
    }
}
