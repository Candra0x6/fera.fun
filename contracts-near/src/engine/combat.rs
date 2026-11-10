use super::wad::{is_negative, pow_wad, WAD};
use super::{add, div, mul, MathError, MathResult, U256};
use near_sdk::env;

pub const BPS: u64 = 10_000;
pub const XP_HUNT: u16 = 10;
pub const XP_WIN: u16 = 20;
pub const BASE_STAT_BPS: u64 = 10_000;

const TAG_PAIR: &[u8] = b"PAIR";
const TAG_CLASH: &[u8] = b"CLASH";
const TAG_HUNT: &[u8] = b"HUNT";

#[derive(Clone, Copy, Debug)]
pub struct Params {
    pub gamma_bps: u16,
    pub pool_factor_min_bps: u16,
    pub pool_factor_max_bps: u32,
    pub level_bonus_bps: u16,
    pub element_up_bps: u16,
    pub element_down_bps: u16,
    pub win_prob_min_bps: u16,
    pub win_prob_max_bps: u16,
}

pub fn element_bps(a: u8, b: u8, up_bps: u64, down_bps: u64) -> MathResult<u64> {
    let a1 = a.checked_add(1).ok_or(MathError::Overflow)?;
    if u16::from(a1) % 5 == u16::from(b) {
        return Ok(up_bps);
    }
    let b1 = b.checked_add(1).ok_or(MathError::Overflow)?;
    if u16::from(b1) % 5 == u16::from(a) {
        return Ok(down_bps);
    }
    Ok(BPS)
}

pub fn level_from_xp(xp: U256) -> u8 {
    const STEPS: [u64; 9] = [320, 260, 210, 165, 125, 90, 60, 35, 15];
    for (i, t) in STEPS.iter().enumerate() {
        if xp >= U256::from(*t) {
            return 10 - i as u8;
        }
    }
    1
}

pub fn pool_factor_wad(r_lock: U256, sum_r: U256, n: u64, p: &Params) -> MathResult<U256> {
    let wad = U256::from(WAD);
    let min_wad = U256::from(p.pool_factor_min_bps) * wad / U256::from(BPS);
    let max_wad = U256::from(p.pool_factor_max_bps) * wad / U256::from(BPS);
    if sum_r.is_zero() || n == 0 {
        return Ok(if wad < min_wad {
            min_wad
        } else if wad > max_wad {
            max_wad
        } else {
            wad
        });
    }
    if r_lock.is_zero() {
        return Ok(min_wad);
    }
    let ratio = div(mul(mul(r_lock, U256::from(n))?, wad)?, sum_r)?;
    if ratio.bit(255) {
        return Err(MathError::Overflow);
    }
    if ratio.is_zero() {
        return Ok(min_wad);
    }
    let gamma_wad = U256::from(p.gamma_bps) * wad / U256::from(BPS);
    let raw = pow_wad(ratio, gamma_wad).ok_or(MathError::Overflow)?;
    if is_negative(raw) {
        return Err(MathError::Overflow);
    }
    Ok(if raw < min_wad {
        min_wad
    } else if raw > max_wad {
        max_wad
    } else {
        raw
    })
}

pub fn power(
    p: &Params,
    monster_type: u8,
    level: u8,
    opponent_type: u8,
    r_lock: U256,
    sum_r: U256,
    n: u64,
) -> MathResult<U256> {
    let pf = pool_factor_wad(r_lock, sum_r, n, p)?;
    let lvl = U256::from(BPS)
        + U256::from(p.level_bonus_bps) * U256::from(level.checked_sub(1).ok_or(MathError::Overflow)?);
    let elem = U256::from(element_bps(
        monster_type,
        opponent_type,
        u64::from(p.element_up_bps),
        u64::from(p.element_down_bps),
    )?);
    let num = mul(mul(mul(pf, lvl)?, elem)?, U256::from(BASE_STAT_BPS))?;
    Ok(num / U256::from(BPS * BPS * BPS))
}

pub fn win_prob_bps(
    p: &Params,
    type_a: u8,
    level_a: u8,
    r_lock_a: U256,
    type_b: u8,
    level_b: u8,
    r_lock_b: U256,
    sum_r: U256,
    n: u64,
) -> MathResult<u16> {
    let pa = power(p, type_a, level_a, type_b, r_lock_a, sum_r, n)?;
    let pb = power(p, type_b, level_b, type_a, r_lock_b, sum_r, n)?;
    let total = add(pa, pb)?;
    let mut bps = if total.is_zero() {
        U256::from(BPS / 2)
    } else {
        div(mul(pa, U256::from(BPS))?, total)?
    };
    let min = U256::from(p.win_prob_min_bps);
    let max = U256::from(p.win_prob_max_bps);
    if bps < min {
        bps = min;
    }
    if bps > max {
        bps = max;
    }
    Ok(bps.low_u32() as u16)
}

fn draw(seed: &[u8; 32], tag: &[u8], index: U256) -> U256 {
    let mut buf = [0u8; 96];
    buf[..32].copy_from_slice(seed);
    buf[32..32 + tag.len()].copy_from_slice(tag);
    buf[64..96].copy_from_slice(&index.to_big_endian());
    U256::from_big_endian(&env::keccak256_array(&buf))
}

pub fn pairing(seed: &[u8; 32], alive_mask: u32) -> Vec<u8> {
    let mut perm: Vec<u8> = (0u8..32).filter(|i| alive_mask & (1u32 << i) != 0).collect();
    let n = perm.len();
    let mut i = n;
    while i > 1 {
        let idx = i - 1;
        let j = (draw(seed, TAG_PAIR, U256::from(idx as u64)) % U256::from(i as u64)).low_u64() as usize;
        perm.swap(idx, j);
        i -= 1;
    }
    perm
}

pub fn clash_roll(seed: &[u8; 32], clash_id: U256) -> u16 {
    (draw(seed, TAG_CLASH, clash_id) % U256::from(BPS)).low_u32() as u16
}

pub fn hunt_roll(seed: &[u8; 32], coin_id: U256) -> u8 {
    (draw(seed, TAG_HUNT, coin_id) % U256::from(100u64)).low_u32() as u8
}
