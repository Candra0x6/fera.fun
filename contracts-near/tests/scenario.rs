mod common;

use common::*;
use fera_arena::types::{Phase, Status};
use fera_arena::Arena;
use near_sdk::json_types::U128;
use near_sdk::serde_json::Value;
use near_sdk::AccountId;
use std::collections::BTreeSet;

fn everyone() -> Vec<AccountId> {
    let mut v: Vec<AccountId> = (0..6).map(|i| acc(&format!("p{i}"))).collect();
    v.push(acc("buyer"));
    v.push(acc("creator"));
    v
}

fn deadline(sim: &Sim) -> u64 {
    (sim.now + 600) * 1000
}

fn play_to_settle(sim: &mut Sim, id: u64, ids: &[u64], accounts: &[AccountId]) {
    for _ in 0..12 {
        if sim.round(id).phase == Phase::Settled {
            return;
        }
        sim.step_epoch(id, 2);
        sim.check_invariants(ids, accounts);
    }
    assert_eq!(sim.round(id).phase, Phase::Settled);
}

#[test]
fn full_round_settles_and_every_claim_pays() {
    let mut sim = Sim::new(config());
    let accounts = everyone();
    let id = sim.start_full_round(&[TENTH; 6]);
    assert_eq!(sim.round(id).phase, Phase::Leveling);
    sim.check_invariants(&[id], &accounts);

    let d = deadline(&sim);
    for coin in 0..6u8 {
        let out = sim.call("buyer", NEAR, |a| a.buy(id, coin, U128(1), d));
        assert!(out.0 > 0);
        sim.check_invariants(&[id], &accounts);
    }
    let bal = sim.view(|a| a.balance_of(id, 2, acc("buyer"))).0;
    let q = sim.view(|a| a.quote_sell(id, 2, U128(bal / 2))).0;
    let paid = sim.call("buyer", 0, |a| a.sell(id, 2, U128(bal / 2), U128(1), d));
    assert_eq!(paid.0, q);
    sim.check_invariants(&[id], &accounts);

    play_to_settle(&mut sim, id, &[id], &accounts);
    let round = sim.round(id);
    let winner = round.winner_coin_id;
    assert_eq!(round.coins[usize::from(winner)].status, Status::Champion);
    assert_eq!(round.alive_count, 1);
    assert_eq!(round.coins.iter().filter(|c| c.status == Status::Eliminated).count(), 5);

    let before = sim.bank;
    let held = sim.ledger(id, &acc("buyer"))[usize::from(winner)];
    sim.call("buyer", 0, |a| a.redeem(id, U128(held)));
    assert!(sim.bank < before);
    sim.check_invariants(&[id], &accounts);

    for coin in 0..6u8 {
        if coin == winner {
            continue;
        }
        let held = sim.ledger(id, &acc("buyer"))[usize::from(coin)];
        if held > 0 {
            sim.call("buyer", 0, |a| a.claim_consolation(id, coin, U128(held)));
            sim.check_invariants(&[id], &accounts);
        }
    }
    for i in 0..6u8 {
        let who = format!("p{i}");
        sim.call(&who, 0, |a| a.claim_seed(id, i));
        sim.check_invariants(&[id], &accounts);
        sim.expect_err(&who, 0, "SeedAlreadyClaimed", |a| a.claim_seed(id, i));
    }
    let r = sim.round(id);
    assert!(r.coins.iter().all(|c| c.seed_claimed));
    assert_eq!(sim.view(|a| a.pending_redeem(id, acc("buyer"))).0, 0);

    let next = sim.call("creator", 5 * TENTH, |a| a.create_round());
    assert_eq!(next, id + 1);
    sim.check_invariants(&[id, next], &accounts);
    assert!(sim.round(next).treasury >= 5 * TENTH);
}

#[test]
fn resolve_waits_for_the_seed_block_and_can_be_chunked() {
    let mut sim = Sim::new(config());
    let id = sim.start_full_round(&[TENTH; 6]);
    sim.advance(15, 1);
    sim.call("keeper", 0, |a| a.lock_epoch(id));
    sim.advance(1, 2);
    sim.expect_err("keeper", 0, "SeedBlockNotReached", |a| a.resolve_epoch(id, 2));
    sim.advance(1, 1);
    assert!(sim.call("keeper", 0, |a| a.resolve_epoch(id, 2)));
    assert_eq!(sim.round(id).phase, Phase::Knockout);

    sim.advance(15, 1);
    sim.call("keeper", 0, |a| a.lock_epoch(id));
    sim.advance(1, 4);
    sim.expect_err("keeper", 0, "ZeroMaxClashes", |a| a.resolve_epoch(id, 0));
    assert!(!sim.call("keeper", 0, |a| a.resolve_epoch(id, 1)));
    assert_eq!(sim.round(id).clashes_played, 1);
    assert!(sim.round(id).locked);
    assert!(sim.call("keeper", 0, |a| a.resolve_epoch(id, 1)));
    assert_eq!(sim.round(id).clashes_played, 2);
    assert!(!sim.round(id).locked);
    assert_eq!(sim.round(id).alive_count, 4);
}

#[test]
fn guarded_calls_fail_with_named_errors() {
    let mut sim = Sim::new(config());
    let id = sim.start_full_round(&[TENTH; 6]);
    let d = deadline(&sim);
    sim.expect_err("buyer", NEAR, "Slippage", |a| a.buy(id, 0, U128(u128::MAX), d));
    sim.expect_err("buyer", NEAR, "MinOutRequired", |a| a.buy(id, 0, U128(0), d));
    sim.expect_err("buyer", NEAR, "Expired", |a| a.buy(id, 0, U128(1), 1));
    sim.expect_err("buyer", NEAR, "CoinNotAlive", |a| a.buy(id, 9, U128(1), d));
    sim.expect_err("buyer", 0, "ZeroOut", |a| a.buy(id, 0, U128(1), d));
    sim.expect_err("buyer", 0, "InsufficientBalance", |a| a.sell(id, 0, U128(1_000_000_000_000_000_000_000), U128(1), d));
    sim.expect_err("buyer", 0, "RoundInProgress", |a| a.create_round());
    sim.expect_err("buyer", 0, "WrongPhase", |a| a.start_round(id));
    sim.expect_err("buyer", 0, "EpochTooEarly", |a| a.lock_epoch(id));
    sim.expect_err("buyer", 0, "NotLocked", |a| a.resolve_epoch(id, 2));
    sim.expect_err("buyer", 0, "AbortNotOpen", |a| a.abort_round(id));
    sim.expect_err("buyer", 0, "NotClaimable", |a| a.redeem(id, U128(1)));
    sim.expect_err("buyer", 0, "NotCreator", |a| a.claim_seed(id, 0));
    sim.expect_err("buyer", 0, "NothingToClaim", |a| a.claim_pending());
    sim.expect_err("buyer", 0, "UnknownRound", |a| a.get_round(77).round_id);
    sim.advance(15, 1);
    sim.call("keeper", 0, |a| a.lock_epoch(id));
    sim.expect_err("buyer", NEAR, "Locked", |a| a.buy(id, 0, U128(1), d));
    sim.expect_err("buyer", 0, "Locked", |a| a.lock_epoch(id));
    assert_eq!(sim.view(|a| a.current_round_id()), id);
}

#[test]
fn launch_rules() {
    let mut sim = Sim::new(config());
    let id = sim.call("creator", 0, |a| a.create_round());
    let n = |s: &str| s.to_string();
    sim.expect_err("p0", TENTH - 1, "BadSeed", |a| a.launch_coin(id, n("Fox"), n("FOX"), 0, 0));
    sim.expect_err("p0", 3 * TENTH, "BadSeed", |a| a.launch_coin(id, n("Fox"), n("FOX"), 0, 0));
    sim.expect_err("p0", 2 * TENTH, "BadName", |a| a.launch_coin(id, n(""), n("FOX"), 0, 0));
    sim.expect_err("p0", 2 * TENTH, "BadTicker", |a| a.launch_coin(id, n("Fox"), n("fox"), 0, 0));
    sim.expect_err("p0", 2 * TENTH, "BadTicker", |a| a.launch_coin(id, n("Fox"), n("F"), 0, 0));
    sim.expect_err("p0", 2 * TENTH, "BadCatalogId", |a| a.launch_coin(id, n("Fox"), n("FOX"), 5, 0));
    sim.call("p0", 2 * TENTH, |a| a.launch_coin(id, n("Fox"), n("FOX"), 0, 0));
    sim.call("p0", 2 * TENTH, |a| a.launch_coin(id, n("Fox2"), n("FOXB"), 1, 0));
    sim.expect_err("p0", 2 * TENTH, "CreatorCapReached", |a| a.launch_coin(id, n("Fox3"), n("FOXC"), 2, 0));
    sim.expect_err("p1", 0, "LobbyNotReady", |a| a.start_round(id));
    for i in 1..5 {
        let who = format!("p{i}");
        sim.call(&who, 2 * TENTH, |a| a.launch_coin(id, n("Cat"), n("CAT"), 2, 0));
    }
    sim.expect_err("p9", 2 * TENTH, "RoundFull", |a| a.launch_coin(id, n("Cat"), n("CAT"), 2, 0));
    let c = sim.view(|a| a.get_arena_snapshot(id));
    assert_eq!(c.coins.len(), 6);
    assert_eq!(c.coins[0].token, format!("{id}:0"));
    assert_eq!(c.round.treasury.0, 6 * TENTH);
}

#[test]
fn init_twice_and_bad_config_are_rejected() {
    let sim = Sim::new(config());
    near_sdk::env::state_write(&sim.arena);
    let again = std::panic::catch_unwind(|| Arena::init(config()));
    assert!(panic_of(again).contains("ArenaError:AlreadyInitialized"));
    let mut bad = config();
    bad.boost_bps = 4000;
    let r = std::panic::catch_unwind(|| {
        near_sdk::env::storage_remove(b"STATE");
        Arena::init(bad)
    });
    assert!(panic_of(r).contains("ArenaError:BadConfig"));
}

#[test]
fn failed_transfer_credits_claimable_and_can_be_claimed() {
    let mut sim = Sim::new(config());
    let accounts = everyone();
    let id = sim.start_full_round(&[TENTH; 6]);
    let d = deadline(&sim);
    sim.call("buyer", NEAR, |a| a.buy(id, 1, U128(1), d));
    let held = sim.ledger(id, &acc("buyer"))[1];
    let out = sim.call("buyer", 0, |a| a.sell(id, 1, U128(held), U128(1), d)).0;
    sim.fail_payout("buyer", out);
    assert_eq!(sim.claimable(&acc("buyer")), out);
    assert_eq!(sim.view(|a| a.claimable_of(acc("buyer"))).0, out);
    sim.check_invariants(&[id], &accounts);
    let before = sim.bank;
    assert_eq!(sim.call("buyer", 0, |a| a.claim_pending()).0, out);
    assert_eq!(sim.bank, before - out);
    assert_eq!(sim.claimable(&acc("buyer")), 0);
    sim.check_invariants(&[id], &accounts);
}

#[test]
fn underfilled_lobby_aborts_and_refunds_launches() {
    let mut sim = Sim::new(config());
    let accounts = everyone();
    let id = sim.call("creator", 0, |a| a.create_round());
    for i in 0..3 {
        let who = format!("p{i}");
        sim.call(&who, 2 * TENTH, |a| a.launch_coin(id, format!("Cat{i}"), "CAT".into(), 2, 0));
    }
    sim.expect_err("x", 0, "AbortNotOpen", |a| a.abort_round(id));
    sim.advance(10_801, 10);
    sim.expect_err("x", 0, "LobbyNotReady", |a| a.start_round(id));
    sim.call("x", 0, |a| a.abort_round(id));
    sim.check_invariants(&[id], &accounts);
    let before = sim.bank;
    assert_eq!(sim.call("p0", 0, |a| a.refund_launch(id, 0)).0, 2 * TENTH);
    assert_eq!(sim.bank, before - 2 * TENTH);
    sim.expect_err("p0", 0, "NotRefundable", |a| a.refund_launch(id, 0));
    sim.expect_err("p1", 0, "NotCreator", |a| a.refund_launch(id, 2));
    sim.check_invariants(&[id], &accounts);
    assert_eq!(sim.round(id).treasury, 2 * TENTH);
    let next = sim.call("creator", 0, |a| a.create_round());
    assert_eq!(next, id + 1);
    sim.check_invariants(&[id, next], &accounts);
}

#[test]
fn stalled_round_aborts_and_refunds_holders() {
    let mut sim = Sim::new(config());
    let accounts = everyone();
    let id = sim.start_full_round(&[TENTH; 6]);
    let d = deadline(&sim);
    sim.call("buyer", NEAR, |a| a.buy(id, 3, U128(1), d));
    sim.advance(3_601, 100);
    sim.call("x", 0, |a| a.abort_round(id));
    assert_eq!(sim.round(id).phase, Phase::Aborted);
    assert!(sim.round(id).coins.iter().all(|c| c.status == Status::Refunded));
    sim.check_invariants(&[id], &accounts);
    let held = sim.ledger(id, &acc("buyer"))[3];
    let paid = sim.call("buyer", 0, |a| a.claim_refund(id, 3, U128(held))).0;
    assert!(paid > 0 && paid < NEAR);
    sim.check_invariants(&[id], &accounts);
    for i in 0..6u8 {
        let who = format!("p{i}");
        sim.call(&who, 0, |a| a.claim_seed(id, i));
        sim.check_invariants(&[id], &accounts);
    }
}

fn arg_names_from_ts() -> std::collections::BTreeMap<String, BTreeSet<String>> {
    let path = format!("{}/../shared/src/events.ts", env!("CARGO_MANIFEST_DIR"));
    let text = std::fs::read_to_string(path).unwrap();
    let start = text.find("EVENT_ARG_NAMES").unwrap();
    let body = &text[start..text[start..].find("\n}\n").map(|e| start + e).unwrap()];
    let mut map = std::collections::BTreeMap::new();
    let mut rest = &body[body.find('{').unwrap() + 1..];
    while let Some(colon) = rest.find(": [") {
        let name = rest[..colon].trim().rsplit(|c: char| !c.is_alphanumeric()).next().unwrap().to_string();
        let close = rest.find(']').unwrap();
        let list = &rest[colon + 3..close];
        let args: BTreeSet<String> = list
            .split(',')
            .map(|s| s.trim().trim_matches('\'').to_string())
            .filter(|s| !s.is_empty())
            .collect();
        map.insert(name, args);
        rest = &rest[close + 1..];
    }
    map
}

fn emitted(logs: &[String]) -> Vec<(String, BTreeSet<String>)> {
    logs.iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .map(|j| {
            let v: Value = near_sdk::serde_json::from_str(j).unwrap();
            assert_eq!(v["standard"], "fera_arena");
            assert_eq!(v["version"], "1.0.0");
            let keys = v["data"].as_object().unwrap().keys().cloned().collect();
            (v["event"].as_str().unwrap().to_string(), keys)
        })
        .collect()
}

#[test]
fn event_arg_names_match_the_shared_contract() {
    let ts = arg_names_from_ts();
    assert_eq!(ts.len(), 25);
    let mut sim = Sim::new(config());
    let accounts = everyone();
    let id = sim.start_full_round(&[TENTH; 6]);
    let d = deadline(&sim);
    for coin in 0..6u8 {
        sim.call("buyer", NEAR, |a| a.buy(id, coin, U128(1), d));
    }
    let held = sim.ledger(id, &acc("buyer"))[0];
    sim.call("buyer", 0, |a| a.sell(id, 0, U128(held / 2), U128(1), d));
    play_to_settle(&mut sim, id, &[id], &accounts);
    let winner = sim.round(id).winner_coin_id;
    for i in 0..6u8 {
        let who = format!("p{i}");
        sim.call(&who, 0, |a| a.claim_seed(id, i));
    }
    for coin in 0..6u8 {
        let held = sim.ledger(id, &acc("buyer"))[usize::from(coin)];
        if held > 0 && coin != winner {
            sim.call("buyer", 0, |a| a.claim_consolation(id, coin, U128(held)));
        }
    }
    let held = sim.ledger(id, &acc("buyer"))[usize::from(winner)];
    if held > 0 {
        sim.call("buyer", 0, |a| a.redeem(id, U128(held)));
    }
    sim.call("creator", NEAR, |a| a.create_round());
    let next = id + 1;
    for i in 0..6 {
        let who = format!("p{i}");
        sim.call(&who, 2 * TENTH, |a| a.launch_coin(next, "Cat".into(), "CAT".into(), 2, 0));
    }
    sim.call("x", 0, |a| a.start_round(next));
    let d2 = deadline(&sim);
    sim.call("buyer", NEAR, |a| a.buy(next, 0, U128(1), d2));
    sim.advance(3_601, 100);
    sim.call("x", 0, |a| a.abort_round(next));
    let held = sim.ledger(next, &acc("buyer"))[0];
    sim.call("buyer", 0, |a| a.claim_refund(next, 0, U128(held)));
    sim.call("p0", 0, |a| a.claim_seed(next, 0));
    let mut five = config_json();
    five["minCoins"] = 5.into();
    five["maxCoins"] = 5.into();
    let mut sim5 = Sim::new(near_sdk::serde_json::from_value(five).unwrap());
    let id5 = sim5.start_full_round(&[TENTH; 5]);
    play_to_settle(&mut sim5, id5, &[id5], &accounts);
    let mut logs = sim.logs.clone();
    logs.extend(sim5.logs.clone());
    let seen = emitted(&logs);
    let skip = ["EpochCancelled", "CoinImage", "TreasurySpent"];
    let mut names = BTreeSet::new();
    for (name, keys) in &seen {
        let mut want = ts[name].clone();
        if name == "EpochLocked" {
            want.remove("entropySeq");
            want.insert("lockHeight".to_string());
        }
        assert_eq!(keys, &want, "args of {name}");
        names.insert(name.clone());
    }
    for name in ts.keys() {
        if !skip.contains(&name.as_str()) {
            assert!(names.contains(name), "{name} never emitted");
        }
    }
}

#[test]
fn ring_keeps_the_last_256_events() {
    let mut sim = Sim::new(config());
    let mut ids = Vec::new();
    for _ in 0..6 {
        let id = sim.start_full_round(&[TENTH; 6]);
        ids.push(id);
        play_to_settle(&mut sim, id, &ids, &everyone());
    }
    let page = sim.view(|a| a.events_since(0, 100));
    assert!(page.head_seq > 256, "head {}", page.head_seq);
    assert_eq!(page.oldest_seq, page.head_seq - 255);
    assert_eq!(page.events.len(), 100);
    assert_eq!(page.events[0].seq, page.oldest_seq);
    for w in page.events.windows(2) {
        assert_eq!(w[1].seq, w[0].seq + 1);
    }
    let tail = sim.view(|a| a.events_since(page.head_seq - 3, 100));
    assert_eq!(tail.events.len(), 3);
    assert_eq!(tail.events.last().map(|e| e.seq), Some(page.head_seq));
    assert!(sim.view(|a| a.events_since(page.head_seq, 100)).events.is_empty());
    assert_eq!(sim.view(|a| a.events_since(0, 1000)).events.len(), 100);
}
