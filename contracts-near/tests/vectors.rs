use fera_arena::engine::combat::{self, Params};
use fera_arena::engine::curve;
use fera_arena::engine::{MathError, MathResult, U256};
use near_sdk::serde_json::{self, Value};
use std::fs;

fn load(name: &str) -> Value {
    let path = format!("{}/../near-parity/{}", env!("CARGO_MANIFEST_DIR"), name);
    let text = fs::read_to_string(&path).unwrap();
    serde_json::from_str(&text).unwrap()
}

fn num(row: &Value, key: &str) -> U256 {
    U256::from_dec_str(row["in"][key].as_str().unwrap()).unwrap()
}

fn out(row: &Value, key: &str) -> String {
    row["out"][key].as_str().unwrap().to_string()
}

fn seed(row: &Value) -> [u8; 32] {
    let hex = row["in"]["seed"].as_str().unwrap().trim_start_matches("0x");
    let mut s = [0u8; 32];
    for i in 0..32 {
        s[i] = u8::from_str_radix(&hex[2 * i..2 * i + 2], 16).unwrap();
    }
    s
}

fn expect_err<T>(row: &Value, r: MathResult<T>) {
    let code = row["revert"].as_str().unwrap();
    let err = match r {
        Ok(_) => panic!("expected revert {row}"),
        Err(e) => e,
    };
    let want = match code {
        "div_zero" => MathError::DivZero,
        "bad_seed" => MathError::BadSeed,
        _ => MathError::Overflow,
    };
    if matches!(code, "div_zero" | "bad_seed") {
        assert_eq!(err, want, "{row}");
    }
}

fn params(row: &Value) -> Params {
    let g = |k: &str| row["in"].get(k).map(|v| v.as_str().unwrap().parse::<u64>().unwrap()).unwrap_or(0);
    Params {
        gamma_bps: g("gamma_bps") as u16,
        pool_factor_min_bps: g("pool_factor_min_bps") as u16,
        pool_factor_max_bps: g("pool_factor_max_bps") as u32,
        level_bonus_bps: g("level_bonus_bps") as u16,
        element_up_bps: g("element_up_bps") as u16,
        element_down_bps: g("element_down_bps") as u16,
        win_prob_min_bps: g("win_prob_min_bps") as u16,
        win_prob_max_bps: g("win_prob_max_bps") as u16,
    }
}

fn small(row: &Value, key: &str) -> u64 {
    row["in"][key].as_str().unwrap().parse().unwrap()
}

#[test]
fn curve_vectors() {
    let doc = load("curve.json");
    let rows = doc["rows"].as_array().unwrap();
    let mut checked = 0;
    for row in rows {
        let f = row["fn"].as_str().unwrap();
        let reverts = row.get("revert").is_some();
        match f {
            "ceil_div" => {
                let r = curve::ceil_div(num(row, "a"), num(row, "b"));
                if reverts {
                    expect_err(row, r);
                } else {
                    assert_eq!(r.unwrap().to_string(), out(row, "r"), "{row}");
                }
            }
            "fee_of" => {
                let r = curve::fee_of(num(row, "amount"), num(row, "fee_bps"));
                if reverts {
                    expect_err(row, r);
                } else {
                    assert_eq!(r.unwrap().to_string(), out(row, "fee"), "{row}");
                }
            }
            "buy_out" => {
                let r = curve::buy_out(num(row, "v_mon"), num(row, "v_tok"), num(row, "mon_in_net"));
                if reverts {
                    expect_err(row, r);
                } else {
                    let b = r.unwrap();
                    assert_eq!(b.out.to_string(), out(row, "out"), "{row}");
                    assert_eq!(b.new_v_tok.to_string(), out(row, "new_v_tok"), "{row}");
                }
            }
            "sell_gross" => {
                let r = curve::sell_gross(num(row, "v_mon"), num(row, "v_tok"), num(row, "tokens"));
                if reverts {
                    expect_err(row, r);
                } else {
                    assert_eq!(r.unwrap().to_string(), out(row, "gross"), "{row}");
                }
            }
            "boosted_vtok" => {
                let r = curve::boosted_vtok(num(row, "v_mon"), num(row, "v_tok"), num(row, "boost_mon"));
                if reverts {
                    expect_err(row, r);
                } else {
                    assert_eq!(r.unwrap().to_string(), out(row, "new_v_tok"), "{row}");
                }
            }
            "split_loss" => {
                let r = curve::split_loss(
                    num(row, "reserve"),
                    num(row, "boost_bps"),
                    num(row, "consolation_bps"),
                    num(row, "pot_bps"),
                );
                if reverts {
                    expect_err(row, r);
                } else {
                    let s = r.unwrap();
                    assert_eq!(s.boost.to_string(), out(row, "boost"), "{row}");
                    assert_eq!(s.consolation.to_string(), out(row, "consolation"), "{row}");
                    assert_eq!(s.to_pot.to_string(), out(row, "to_pot"), "{row}");
                    assert_eq!(s.to_treasury.to_string(), out(row, "to_treasury"), "{row}");
                }
            }
            "quote_buy" => {
                let r = curve::quote_buy(num(row, "v_mon"), num(row, "v_tok"), num(row, "mon_in"), num(row, "fee_bps"));
                if reverts {
                    expect_err(row, r);
                } else {
                    let q = r.unwrap();
                    assert_eq!(q.fee.to_string(), out(row, "fee"), "{row}");
                    assert_eq!(q.net.to_string(), out(row, "net"), "{row}");
                    assert_eq!(q.out.to_string(), out(row, "out"), "{row}");
                    assert_eq!(q.new_v_tok.to_string(), out(row, "new_v_tok"), "{row}");
                }
            }
            "quote_sell" => {
                let r = curve::quote_sell(num(row, "v_mon"), num(row, "v_tok"), num(row, "tokens"), num(row, "fee_bps"));
                if reverts {
                    expect_err(row, r);
                } else {
                    let q = r.unwrap();
                    assert_eq!(q.gross.to_string(), out(row, "gross"), "{row}");
                    assert_eq!(q.fee.to_string(), out(row, "fee"), "{row}");
                    assert_eq!(q.mon_out.to_string(), out(row, "mon_out"), "{row}");
                }
            }
            "launch_seed" => {
                let r = curve::launch_seed(num(row, "v_mon0"), num(row, "v_tok0"), num(row, "seed"));
                if reverts {
                    expect_err(row, r);
                } else {
                    let l = r.unwrap();
                    assert_eq!(l.tokens.to_string(), out(row, "tokens"), "{row}");
                    assert_eq!(l.v_tok.to_string(), out(row, "v_tok"), "{row}");
                    assert_eq!(l.v_mon.to_string(), out(row, "v_mon"), "{row}");
                }
            }
            other => panic!("unknown fn {other}"),
        }
        checked += 1;
    }
    assert_eq!(checked, rows.len());
    assert!(checked >= 6000);
}

#[test]
fn combat_vectors() {
    let doc = load("combat.json");
    let rows = doc["rows"].as_array().unwrap();
    let mut checked = 0;
    for row in rows {
        let f = row["fn"].as_str().unwrap();
        let reverts = row.get("revert").is_some();
        match f {
            "pool_factor_wad" => {
                let r = combat::pool_factor_wad(
                    num(row, "r_lock"),
                    num(row, "sum_r"),
                    small(row, "n"),
                    &params(row),
                );
                if reverts {
                    assert!(r.is_err(), "{row}");
                } else {
                    assert_eq!(r.unwrap().to_string(), out(row, "pool_factor_wad"), "{row}");
                }
            }
            "power" => {
                let p = params(row);
                let (r_lock, sum_r, n) = (num(row, "r_lock"), num(row, "sum_r"), small(row, "n"));
                let r = combat::power(
                    &p,
                    small(row, "monster_type") as u8,
                    small(row, "level") as u8,
                    small(row, "opponent_type") as u8,
                    r_lock,
                    sum_r,
                    n,
                );
                if reverts {
                    assert!(r.is_err(), "{row}");
                } else {
                    assert_eq!(r.unwrap().to_string(), out(row, "power"), "{row}");
                    let pf = combat::pool_factor_wad(r_lock, sum_r, n, &p).unwrap();
                    assert_eq!(pf.to_string(), out(row, "pool_factor_wad"), "{row}");
                }
            }
            "win_prob_bps" => {
                let p = params(row);
                let (sum_r, n) = (num(row, "sum_r"), small(row, "n"));
                let (ta, tb) = (small(row, "type_a") as u8, small(row, "type_b") as u8);
                let (la, lb) = (small(row, "level_a") as u8, small(row, "level_b") as u8);
                let (ra, rb) = (num(row, "r_lock_a"), num(row, "r_lock_b"));
                let r = combat::win_prob_bps(&p, ta, la, ra, tb, lb, rb, sum_r, n);
                if reverts {
                    assert!(r.is_err(), "{row}");
                } else {
                    assert_eq!(r.unwrap().to_string(), out(row, "win_prob_bps"), "{row}");
                    let pa = combat::power(&p, ta, la, tb, ra, sum_r, n).unwrap();
                    let pb = combat::power(&p, tb, lb, ta, rb, sum_r, n).unwrap();
                    assert_eq!(pa.to_string(), out(row, "power_a"), "{row}");
                    assert_eq!(pb.to_string(), out(row, "power_b"), "{row}");
                }
            }
            "pairing" => {
                let mask = small(row, "alive_mask") as u32;
                let perm = combat::pairing(&seed(row), mask);
                let want: Vec<u8> = row["out"]["perm"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|v| v.as_str().unwrap().parse().unwrap())
                    .collect();
                assert_eq!(perm, want, "{row}");
            }
            "clash_roll" => {
                let id = num(row, "clash_id");
                assert_eq!(combat::clash_roll(&seed(row), id).to_string(), out(row, "roll"), "{row}");
            }
            "hunt_roll" => {
                let id = num(row, "coin_id");
                assert_eq!(combat::hunt_roll(&seed(row), id).to_string(), out(row, "roll"), "{row}");
            }
            "element_bps" => {
                let r = combat::element_bps(
                    small(row, "monster_type") as u8,
                    small(row, "opponent_type") as u8,
                    small(row, "element_up_bps"),
                    small(row, "element_down_bps"),
                );
                if reverts {
                    assert!(r.is_err(), "{row}");
                } else {
                    assert_eq!(r.unwrap().to_string(), out(row, "bps"), "{row}");
                }
            }
            "level_from_xp" => {
                assert_eq!(combat::level_from_xp(num(row, "xp")).to_string(), out(row, "level"), "{row}");
            }
            other => panic!("unknown fn {other}"),
        }
        checked += 1;
    }
    assert_eq!(checked, rows.len());
    assert!(checked >= 11_000);
}
