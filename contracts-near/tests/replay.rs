mod common;

use common::*;
use fera_arena::store;
use fera_arena::types::{Config, Round};
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json, Map, Value};
use near_sdk::AccountId;

const STRING_FIELDS: [&str; 6] = [
    "launchFee",
    "minSeed",
    "maxSeed",
    "keeperBounty",
    "vMon0",
    "vTok0",
];
const DROPPED: [&str; 3] = ["seedTimeoutSeconds", "consolationMode", "maxEntropyFee"];

fn scenario_config(raw: &Value) -> Config {
    let mut out = Map::new();
    for (k, v) in raw.as_object().unwrap() {
        if DROPPED.contains(&k.as_str()) {
            continue;
        }
        let s = v.as_str().unwrap();
        if STRING_FIELDS.contains(&k.as_str()) {
            out.insert(k.clone(), json!(s));
        } else {
            out.insert(k.clone(), json!(s.parse::<u64>().unwrap()));
        }
    }
    out.insert("minSeedBlocks".into(), json!(0));
    serde_json::from_value(Value::Object(out)).unwrap()
}

fn label_to_account(label: &str) -> AccountId {
    acc(label)
}

fn normalise(v: &Value) -> Value {
    match v {
        Value::String(s) => {
            if s == "fera-arena.testnet" {
                Value::String("arena".into())
            } else {
                Value::String(s.strip_suffix(".testnet").unwrap_or(s).to_string())
            }
        }
        Value::Array(a) => Value::Array(a.iter().map(normalise).collect()),
        Value::Object(o) => {
            Value::Object(o.iter().map(|(k, v)| (k.clone(), normalise(v))).collect())
        }
        other => other.clone(),
    }
}

fn events_of(logs: &[String]) -> Vec<(String, Value)> {
    logs.iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .map(|j| {
            let v: Value = serde_json::from_str(j).unwrap();
            let name = v["event"].as_str().unwrap().to_string();
            let mut data = normalise(&v["data"]);
            if name == "EpochLocked" {
                data.as_object_mut().unwrap().remove("lockHeight");
            }
            (name, data)
        })
        .collect()
}

fn dec(v: &Value) -> u128 {
    v.as_str().unwrap().parse().unwrap_or(u128::MAX)
}

fn num(v: &Value) -> u64 {
    v.as_u64().unwrap()
}

fn compare_state(ctx: &str, sim: &Sim, state: &Value, accounts: &[String]) {
    let initial: u128 = 1_000_000_000_000_000_000_000;
    assert_eq!(
        sim.bank - RESERVE,
        dec(&state["contract_balance"]),
        "{ctx}: contract balance"
    );
    for label in accounts {
        let a = label_to_account(label);
        let paid = sim.paid.get(&a).copied().unwrap_or(0);
        let spent = sim.spent.get(&a).copied().unwrap_or(0);
        assert_eq!(
            initial + paid - spent,
            dec(&state["native"][label]),
            "{ctx}: native balance of {label}"
        );
    }
    for rj in state["rounds"].as_array().unwrap() {
        let id = num(&rj["roundId"]);
        let r: Round = store::read(&store::round_key(id)).unwrap();
        let phase = format!("{:?}", r.phase);
        assert_eq!(phase, rj["phase"].as_str().unwrap(), "{ctx}: phase");
        assert_eq!(r.locked, rj["locked"].as_bool().unwrap(), "{ctx}: locked");
        assert_eq!(u64::from(r.epoch), num(&rj["epoch"]), "{ctx}: epoch");
        assert_eq!(
            r.coins.len() as u64,
            num(&rj["coinCount"]),
            "{ctx}: coinCount"
        );
        assert_eq!(
            u64::from(r.alive_count),
            num(&rj["aliveCount"]),
            "{ctx}: aliveCount"
        );
        assert_eq!(
            u64::from(r.winner_coin_id),
            num(&rj["winnerCoinId"]),
            "{ctx}: winnerCoinId"
        );
        assert_eq!(r.created_at, num(&rj["createdAt"]), "{ctx}: createdAt");
        assert_eq!(r.started_at, num(&rj["startedAt"]), "{ctx}: startedAt");
        assert_eq!(r.locked_at, num(&rj["lockedAt"]), "{ctx}: lockedAt");
        assert_eq!(
            r.last_epoch_resolved_at,
            num(&rj["lastEpochResolvedAt"]),
            "{ctx}: lastEpochResolvedAt"
        );
        assert_eq!(r.prize_pot, dec(&rj["prizePot"]), "{ctx}: prizePot");
        assert_eq!(r.treasury, dec(&rj["treasury"]), "{ctx}: treasury");
        assert_eq!(r.redeem_pool, dec(&rj["redeemPool"]), "{ctx}: redeemPool");
        assert_eq!(
            r.redeem_supply,
            dec(&rj["redeemSupply"]),
            "{ctx}: redeemSupply"
        );
        assert_eq!(
            u64::from(r.clashes_played),
            num(&rj["clashesPlayed"]),
            "{ctx}: clashesPlayed"
        );
        assert_eq!(
            u64::from(r.alive_mask),
            num(&rj["aliveMask"]),
            "{ctx}: aliveMask"
        );
        assert_eq!(
            u64::from(r.alive_at_lock),
            num(&rj["aliveAtLock"]),
            "{ctx}: aliveAtLock"
        );
        assert_eq!(
            u64::from(r.resolve_cursor),
            num(&rj["resolveCursor"]),
            "{ctx}: resolveCursor"
        );
        assert_eq!(
            r.lobby_abort,
            rj["lobbyAbort"].as_bool().unwrap(),
            "{ctx}: lobbyAbort"
        );
        assert_eq!(
            r.sum_r_mon_at_lock,
            dec(&rj["sumRMonAtLock"]),
            "{ctx}: sumRMonAtLock"
        );
        assert_eq!(r.redeem_paid, dec(&rj["redeemPaid"]), "{ctx}: redeemPaid");
        assert_eq!(
            r.launch_fees_owed,
            dec(&rj["launchFeesOwed"]),
            "{ctx}: launchFeesOwed"
        );
        match rj["seed"].as_str() {
            Some(hex) => {
                assert!(r.seed_ready, "{ctx}: seed ready");
                let mut s = String::from("0x");
                for b in r.seed {
                    s.push_str(&format!("{b:02x}"));
                }
                assert_eq!(s, hex, "{ctx}: seed");
            }
            None => assert!(!r.seed_ready, "{ctx}: seed not ready"),
        }
        for cj in rj["coins"].as_array().unwrap() {
            let i = num(&cj["coinId"]) as usize;
            let c = &r.coins[i];
            let cc = format!("{ctx}: round {id} coin {i}");
            assert_eq!(
                format!("{:?}", c.status),
                cj["status"].as_str().unwrap(),
                "{cc}: status"
            );
            assert_eq!(u64::from(c.level), num(&cj["level"]), "{cc}: level");
            assert_eq!(u64::from(c.xp), num(&cj["xp"]), "{cc}: xp");
            assert_eq!(u64::from(c.wins), num(&cj["wins"]), "{cc}: wins");
            assert_eq!(c.v_mon, dec(&cj["vMon"]), "{cc}: vMon");
            assert_eq!(c.v_tok, dec(&cj["vTok"]), "{cc}: vTok");
            assert_eq!(c.r_mon, dec(&cj["rMon"]), "{cc}: rMon");
            assert_eq!(c.r_mon_at_lock, dec(&cj["rMonAtLock"]), "{cc}: rMonAtLock");
            assert_eq!(c.seed_mon, dec(&cj["seedMon"]), "{cc}: seedMon");
            assert_eq!(c.seed_tokens, dec(&cj["seedTokens"]), "{cc}: seedTokens");
            assert_eq!(
                c.seed_claimed,
                cj["seedClaimed"].as_bool().unwrap(),
                "{cc}: seedClaimed"
            );
            assert_eq!(
                c.consolation_pool,
                dec(&cj["consolationPool"]),
                "{cc}: consolationPool"
            );
            assert_eq!(
                c.consolation_supply,
                dec(&cj["consolationSupply"]),
                "{cc}: consolationSupply"
            );
            assert_eq!(c.pool_paid, dec(&cj["poolPaid"]), "{cc}: poolPaid");
            assert_eq!(c.fee_acc, dec(&cj["feeAcc"]), "{cc}: feeAcc");
            assert_eq!(c.supply, dec(&cj["supply"]), "{cc}: supply");
            let balances = cj["balances"].as_object().unwrap();
            for label in accounts {
                let want = balances.get(label).map(dec).unwrap_or(0);
                assert_eq!(
                    sim.ledger(id, &label_to_account(label))[i],
                    want,
                    "{cc}: balance of {label}"
                );
            }
            let arena = balances.get("arena").map(dec).unwrap_or(0);
            assert_eq!(
                if c.seed_claimed { 0 } else { c.seed_tokens },
                arena,
                "{cc}: arena seed tokens"
            );
        }
    }
}

fn run_step(sim: &mut Sim, step: &Value) -> Result<String, String> {
    let who = step["caller"].as_str().unwrap().to_string();
    let args = &step["args"];
    let deposit = args.get("deposit").map(dec).unwrap_or(0);
    let id = args.get("round_id").map(num).unwrap_or(0);
    let coin = args.get("coin_id").map(|v| num(v) as u8).unwrap_or(0);
    let tokens = args.get("tokens").map(dec).unwrap_or(0);
    match step["op"].as_str().unwrap() {
        "create_round" => sim
            .try_call(&who, deposit, |a| a.create_round())
            .map(|r| r.to_string()),
        "launch_coin" => {
            let name = args["name"].as_str().unwrap().to_string();
            let ticker = args["ticker"].as_str().unwrap().to_string();
            let mt = num(&args["monster_type"]);
            let skin = num(&args["skin_id"]);
            if mt > 255 || skin > 255 {
                return Err("ArenaError:BadCatalogId".into());
            }
            sim.try_call(&who, deposit, |a| {
                a.launch_coin(id, name, ticker, mt as u8, skin as u8)
            })
            .map(|r| r.to_string())
        }
        "start_round" => sim
            .try_call(&who, 0, |a| a.start_round(id))
            .map(|_| String::new()),
        "buy" => {
            let min = dec(&args["min_tokens_out"]);
            sim.try_call(&who, deposit, |a| a.buy(id, coin, U128(min), u64::MAX))
                .map(|r| r.0.to_string())
        }
        "sell" => {
            let min = dec(&args["min_mon_out"]);
            sim.try_call(&who, 0, |a| {
                a.sell(id, coin, U128(tokens), U128(min), u64::MAX)
            })
            .map(|r| r.0.to_string())
        }
        "lock_epoch" => sim
            .try_call(&who, 0, |a| a.lock_epoch(id))
            .map(|_| String::new()),
        "resolve_epoch" => {
            if let Some(seed) = args.get("seed").and_then(|s| s.as_str()) {
                let hex = seed.trim_start_matches("0x");
                let mut bytes = [0u8; 32];
                for i in 0..32 {
                    bytes[i] = u8::from_str_radix(&hex[2 * i..2 * i + 2], 16).unwrap();
                }
                store::write(b"TESTSEED", &bytes);
            }
            let max = num(&args["max_clashes"]) as u8;
            sim.try_call(&who, 0, |a| a.resolve_epoch(id, max))
                .map(|_| String::new())
        }
        "abort_round" => sim
            .try_call(&who, 0, |a| a.abort_round(id))
            .map(|_| String::new()),
        "refund_launch" => sim
            .try_call(&who, 0, |a| a.refund_launch(id, coin))
            .map(|r| r.0.to_string()),
        "claim_consolation" => sim
            .try_call(&who, 0, |a| a.claim_consolation(id, coin, U128(tokens)))
            .map(|r| r.0.to_string()),
        "redeem" => sim
            .try_call(&who, 0, |a| a.redeem(id, U128(tokens)))
            .map(|r| r.0.to_string()),
        "claim_seed" => sim
            .try_call(&who, 0, |a| a.claim_seed(id, coin))
            .map(|r| r.0.to_string()),
        other => panic!("unknown op {other}"),
    }
}

fn expected_revert(name: &str) -> &str {
    match name {
        "LobbyStillOpen" | "LobbyFilled" => "AbortNotOpen",
        other => other,
    }
}

#[test]
fn every_scenario_step_matches_the_solidity_arena() {
    let path = format!(
        "{}/../near-parity/scenario.json",
        env!("CARGO_MANIFEST_DIR")
    );
    let doc: Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let mut steps_total = 0;
    for sc in doc["scenarios"].as_array().unwrap() {
        let sid = sc["id"].as_str().unwrap();
        let accounts: Vec<String> = sc["accounts"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect();
        let mut sim = Sim::new(scenario_config(&sc["config"]));
        for step in sc["steps"].as_array().unwrap() {
            let i = num(&step["i"]);
            let ctx = format!("{sid} step {i} {} {:?}", step["op"], step.get("case"));
            sim.now = num(&step["at"]);
            sim.height += 5;
            let before = sim.logs.len();
            let result = run_step(&mut sim, step);
            match (step["result"]["ok"].as_bool().unwrap(), &result) {
                (true, Ok(ret)) => {
                    if let Some(want) = step["result"].get("return") {
                        assert_eq!(ret, want.as_str().unwrap(), "{ctx}: return");
                    }
                }
                (true, Err(e)) => panic!("{ctx}: unexpected revert {e}"),
                (false, Ok(_)) => panic!("{ctx}: expected revert {}", step["result"]["revert"]),
                (false, Err(e)) => {
                    let want = expected_revert(step["result"]["revert"].as_str().unwrap());
                    assert!(
                        e.contains(&format!("ArenaError:{want}")),
                        "{ctx}: expected {want}, got {e}"
                    );
                }
            }
            let got = events_of(&sim.logs[before..]);
            let want = step["events"].as_array().unwrap();
            assert_eq!(
                got.len(),
                want.len(),
                "{ctx}: event count {:?}",
                got.iter().map(|g| &g.0).collect::<Vec<_>>()
            );
            for ((gname, gargs), w) in got.iter().zip(want) {
                assert_eq!(gname, w["name"].as_str().unwrap(), "{ctx}: event order");
                if gname == "RoundCreated" {
                    assert_eq!(gargs["roundId"], w["args"]["roundId"], "{ctx}");
                } else {
                    assert_eq!(gargs, &w["args"], "{ctx}: args of {gname}");
                }
            }
            compare_state(&ctx, &sim, &step["state"], &accounts);
            steps_total += 1;
        }
    }
    assert!(steps_total >= 250, "{steps_total}");
}
