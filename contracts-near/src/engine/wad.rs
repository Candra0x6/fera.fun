use super::U256;

const EXP_LN2_96: U256 = U256([15118436252839555992, 2977044471, 0, 0]);
const EXP_A1: U256 = U256([4021714997422814800, 72987764733, 0, 0]);
const EXP_A2: U256 = U256([15103936341470079466, 3098401593211, 0, 0]);
const EXP_A3: U256 = U256([10850458028954966636, 5106676214411, 0, 0]);
const EXP_A4: U256 = U256([11323734702077600848, 1556861282905762, 0, 0]);
const EXP_A5: U256 = U256([11023459180255945820, 237726099735116, 0, 0]);
const EXP_Q1: U256 = U256([12887555761442761468, 154823495327, 0, 0]);
const EXP_Q2: U256 = U256([14438380032906984665, 2711622357455, 0, 0]);
const EXP_Q3: U256 = U256([7660730384882190788, 28939797259087, 0, 0]);
const EXP_Q4: U256 = U256([14958195001563919525, 195419703473219, 0, 0]);
const EXP_Q5: U256 = U256([5884290600356364053, 781905387190095, 0, 0]);
const EXP_Q6: U256 = U256([5163562563322150231, 1433813381519787, 0, 0]);
const EXP_SCALE: U256 = U256([17181495799676635891, 7188640403681034642, 11234296709, 0]);
const LN_P1: U256 = U256([4888844647271231096, 177445160325, 0, 0]);
const LN_P2: U256 = U256([13722888491643914388, 1345937092346, 0, 0]);
const LN_P3: U256 = U256([10678604579903613857, 2355780811621, 0, 0]);
const LN_P4: U256 = U256([7719155103063290935, 602356115802, 0, 0]);
const LN_P5: U256 = U256([12418243842072731793, 2440740191729, 0, 0]);
const LN_P6: U256 = U256([12870198306019084238, 797255784468, 0, 0]);
const LN_P7: U256 = U256([14729475240386013290, 43105939588, 0, 0]);
const LN_Q1: U256 = U256([13501653466868644400, 302114845371, 0, 0]);
const LN_Q2: U256 = U256([15396857313312465774, 3886586950674, 0, 0]);
const LN_Q3: U256 = U256([2015734598288473548, 15365694620163, 0, 0]);
const LN_Q4: U256 = U256([15677912927235416593, 21775479119185, 0, 0]);
const LN_Q5: U256 = U256([17835278202621563182, 11061489050590, 0, 0]);
const LN_Q6: U256 = U256([9922876465348103746, 1726803362762, 0, 0]);
const LN_Q7: U256 = U256([6082387026812904743, 49300297527, 0, 0]);
const LN_SCALE: U256 = U256([6696670060420420870, 15753826755151634833, 4928, 0]);
const LN_K: U256 = U256([15565476582146962099, 8508605878662066247, 12940911783117004858, 2644146654357]);
const LN_C: U256 = U256([16718079191102669444, 3848919035412515418, 8176266154714820771, 95732107772300]);
const EXP_LOWER: U256 = U256([4553043526473719081, 2, 0, 0]);
const EXP_UPPER: U256 = U256([6178790852926370277, 7, 0, 0]);

pub const WAD: u64 = 1_000_000_000_000_000_000;
const FIVE_POW_18: u64 = 3_814_697_265_625;

fn is_neg(x: U256) -> bool {
    x.bit(255)
}

fn neg(x: U256) -> U256 {
    (!x).overflowing_add(U256::one()).0
}

fn wadd(a: U256, b: U256) -> U256 {
    a.overflowing_add(b).0
}

fn wsub(a: U256, b: U256) -> U256 {
    a.overflowing_sub(b).0
}

fn wmul(a: U256, b: U256) -> U256 {
    a.overflowing_mul(b).0
}

fn shl(x: U256, n: u32) -> U256 {
    if n >= 256 {
        U256::zero()
    } else {
        x << (n as usize)
    }
}

fn shr(x: U256, n: u32) -> U256 {
    if n >= 256 {
        U256::zero()
    } else {
        x >> (n as usize)
    }
}

fn sar(x: U256, n: u32) -> U256 {
    if is_neg(x) {
        if n >= 256 {
            U256::MAX
        } else {
            !((!x) >> (n as usize))
        }
    } else {
        shr(x, n)
    }
}

fn abs(x: U256) -> U256 {
    if is_neg(x) {
        neg(x)
    } else {
        x
    }
}

fn sdiv(a: U256, b: U256) -> U256 {
    if b.is_zero() {
        return U256::zero();
    }
    let q = abs(a) / abs(b);
    if is_neg(a) != is_neg(b) {
        neg(q)
    } else {
        q
    }
}

fn slt(a: U256, b: U256) -> bool {
    match (is_neg(a), is_neg(b)) {
        (true, false) => true,
        (false, true) => false,
        _ => a < b,
    }
}

fn small_signed(x: U256) -> i64 {
    if is_neg(x) {
        -(neg(x).low_u64() as i64)
    } else {
        x.low_u64() as i64
    }
}

pub fn exp_wad(x: U256) -> Option<U256> {
    if !slt(neg(EXP_LOWER), x) {
        return Some(U256::zero());
    }
    if !slt(x, EXP_UPPER) {
        return None;
    }
    let x = sdiv(shl(x, 78), U256::from(FIVE_POW_18));
    let k = sar(wadd(sdiv(shl(x, 96), EXP_LN2_96), shl(U256::one(), 95)), 96);
    let x = wsub(x, wmul(k, EXP_LN2_96));
    let y = wadd(x, EXP_A1);
    let y = wadd(sar(wmul(y, x), 96), EXP_A2);
    let p = wsub(wadd(y, x), EXP_A3);
    let p = wadd(sar(wmul(p, y), 96), EXP_A4);
    let p = wadd(wmul(p, x), shl(EXP_A5, 96));
    let q = wsub(x, EXP_Q1);
    let q = wadd(sar(wmul(q, x), 96), EXP_Q2);
    let q = wsub(sar(wmul(q, x), 96), EXP_Q3);
    let q = wadd(sar(wmul(q, x), 96), EXP_Q4);
    let q = wsub(sar(wmul(q, x), 96), EXP_Q5);
    let q = wadd(sar(wmul(q, x), 96), EXP_Q6);
    let r = sdiv(p, q);
    let shift = 195 - small_signed(k);
    Some(shr(wmul(r, EXP_SCALE), shift as u32))
}

pub fn ln_wad(x: U256) -> Option<U256> {
    if x.is_zero() || is_neg(x) {
        return None;
    }
    let r = U256::from(255 - (x.bits() as u64 - 1));
    let x = shr(shl(x, r.low_u32()), 159);
    let p = wsub(sar(wmul(wadd(LN_P3, sar(wmul(wadd(LN_P2, sar(wmul(wadd(LN_P1, x), x), 96)), x), 96)), x), 96), LN_P4);
    let p = wsub(sar(wmul(p, x), 96), LN_P5);
    let p = wsub(sar(wmul(p, x), 96), LN_P6);
    let p = wsub(wmul(p, x), shl(LN_P7, 96));
    let q = wadd(LN_Q1, x);
    let q = wadd(LN_Q2, sar(wmul(x, q), 96));
    let q = wadd(LN_Q3, sar(wmul(x, q), 96));
    let q = wadd(LN_Q4, sar(wmul(x, q), 96));
    let q = wadd(LN_Q5, sar(wmul(x, q), 96));
    let q = wadd(LN_Q6, sar(wmul(x, q), 96));
    let q = wadd(LN_Q7, sar(wmul(x, q), 96));
    let p = sdiv(p, q);
    let p = wmul(LN_SCALE, p);
    let p = wadd(wmul(LN_K, wsub(U256::from(159u64), r)), p);
    let p = wadd(LN_C, p);
    Some(sar(p, 174))
}

pub fn pow_wad(x: U256, y: U256) -> Option<U256> {
    let ln = ln_wad(x)?;
    let prod = sdiv(wmul(ln, y), U256::from(WAD));
    exp_wad(prod)
}

pub fn is_negative(x: U256) -> bool {
    is_neg(x)
}
