mod common;

use common::*;
use fera_arena::types::{Phase, Status};
use near_sdk::json_types::U128;
use near_sdk::AccountId;

struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }

    fn pct(&mut self, p: u64) -> bool {
        self.below(100) < p
    }
}

const NAMES: [&str; 10] = ["p0", "p1", "p2", "p3", "p4", "p5", "b0", "b1", "b2", "b3"];

fn accounts() -> Vec<AccountId> {
    NAMES.iter().map(|n| acc(n)).collect()
}

fn allowed(sim: &mut Sim, who: &str, deposit: u128, f: impl FnOnce(&mut fera_arena::Arena) -> U128) -> Option<u128> {
    match sim.try_call(who, deposit, f) {
        Ok(v) => Some(v.0),
        Err(e) => {
            assert!(e.contains("ArenaError:"), "non domain panic: {e}");
            None
        }
    }
}

fn run_script(seed: u64) {
    let mut rng = Rng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1);
    let mut sim = Sim::new(wide_config());
    let accts = accounts();
    let id = sim.call("creator", 0, |a| a.create_round());
    for i in 0..6 {
        let seed_amt = TENTH / 2 + u128::from(rng.below(95)) * TENTH / 10;
        let who = NAMES[i];
        sim.call(who, TENTH + seed_amt, |a| {
            a.launch_coin(id, format!("Coin {i}"), format!("C{i}X"), (rng.below(5)) as u8, 0)
        });
    }
    sim.call("anyone", 0, |a| a.start_round(id));
    sim.check_invariants(&[id], &accts);
    let abort_script = rng.pct(10);
    let mut steps = 0;
    while sim.round(id).phase != Phase::Settled && sim.round(id).phase != Phase::Aborted && steps < 400 {
        steps += 1;
        sim.advance(rng.below(8), rng.below(3));
        let who = NAMES[rng.below(10) as usize];
        let coin = rng.below(6) as u8;
        let d = (sim.now + 600) * 1000;
        match rng.below(10) {
            0..=3 => {
                let dep = TENTH / 10 + u128::from(rng.below(300)) * TENTH / 10;
                allowed(&mut sim, who, dep, |a| a.buy(id, coin, U128(1), d));
            }
            4..=5 => {
                let held = sim.ledger(id, &acc(who))[usize::from(coin)];
                if held > 0 {
                    let amt = if rng.pct(30) { held } else { held / (1 + u128::from(rng.below(4))) };
                    if let Some(out) = allowed(&mut sim, who, 0, |a| a.sell(id, coin, U128(amt), U128(1), d)) {
                        if rng.pct(10) {
                            sim.fail_payout(who, out);
                        }
                    }
                }
            }
            6..=7 => {
                if sim.round(id).locked {
                    sim.advance(1, rng.below(5));
                    let max = 1 + rng.below(2) as u8;
                    let r = sim.try_call("keeper", 0, |a| a.resolve_epoch(id, max));
                    if let Err(e) = r {
                        assert!(e.contains("ArenaError:SeedBlockNotReached"), "{e}");
                    }
                }
            }
            _ => {
                sim.advance(15, 1);
                let _ = sim.try_call("keeper", 0, |a| a.lock_epoch(id));
            }
        }
        sim.check_invariants(&[id], &accts);
        if abort_script && steps == 60 {
            sim.advance(3_601, 10);
            sim.call("x", 0, |a| a.abort_round(id));
            sim.check_invariants(&[id], &accts);
        }
    }
    let phase = sim.round(id).phase;
    assert!(phase == Phase::Settled || phase == Phase::Aborted, "script {seed} stuck in {phase:?}");
    for who in NAMES {
        for coin in 0..6u8 {
            let held = sim.ledger(id, &acc(who))[usize::from(coin)];
            if held == 0 {
                continue;
            }
            let status = sim.round(id).coins[usize::from(coin)].status;
            let paid = match status {
                Status::Champion => allowed(&mut sim, who, 0, |a| a.redeem(id, U128(held))),
                Status::Eliminated => allowed(&mut sim, who, 0, |a| a.claim_consolation(id, coin, U128(held))),
                Status::Refunded => allowed(&mut sim, who, 0, |a| a.claim_refund(id, coin, U128(held))),
                _ => None,
            };
            if let Some(p) = paid {
                if rng.pct(10) {
                    sim.fail_payout(who, p);
                }
            }
            sim.check_invariants(&[id], &accts);
        }
        let _ = allowed(&mut sim, who, 0, |a| a.claim_pending());
        sim.check_invariants(&[id], &accts);
    }
    for i in 0..6u8 {
        let _ = allowed(&mut sim, NAMES[usize::from(i)], 0, |a| a.claim_seed(id, i));
        sim.check_invariants(&[id], &accts);
    }
    let r = sim.round(id);
    let leftover = sim.arena.liabilities().0 - r.treasury;
    assert!(leftover < 100_000, "script {seed} leftover {leftover}");
    assert!(sim.round(id).coins.iter().all(|c| c.r_mon == 0 || c.status == Status::Eliminated));
}

#[test]
fn thousand_random_scripts_keep_the_books_balanced() {
    for seed in 1..=scripts() {
        run_script(seed);
    }
}

fn scripts() -> u64 {
    std::env::var("FERA_SCRIPTS").ok().and_then(|v| v.parse().ok()).unwrap_or(1000)
}
