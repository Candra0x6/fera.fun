use super::{add, div, mul, sub, MathError, MathResult, U256};

pub const BPS: u64 = 10_000;

pub struct BuyOut {
    pub out: U256,
    pub new_v_tok: U256,
}

pub struct SplitLoss {
    pub boost: U256,
    pub consolation: U256,
    pub to_pot: U256,
    pub to_treasury: U256,
}

pub struct QuoteBuy {
    pub fee: U256,
    pub net: U256,
    pub out: U256,
    pub new_v_tok: U256,
}

pub struct QuoteSell {
    pub gross: U256,
    pub fee: U256,
    pub mon_out: U256,
}

pub struct LaunchSeed {
    pub tokens: U256,
    pub v_tok: U256,
    pub v_mon: U256,
}

pub fn ceil_div(a: U256, b: U256) -> MathResult<U256> {
    if a.is_zero() {
        return Ok(U256::zero());
    }
    let q = div(a - U256::one(), b)?;
    add(q, U256::one())
}

pub fn fee_of(amount: U256, fee_bps: U256) -> MathResult<U256> {
    ceil_div(mul(amount, fee_bps)?, U256::from(BPS))
}

pub fn buy_out(v_mon: U256, v_tok: U256, mon_in_net: U256) -> MathResult<BuyOut> {
    let k = mul(v_mon, v_tok)?;
    let denom = add(v_mon, mon_in_net)?;
    let new_v_tok = ceil_div(k, denom)?;
    let out = if v_tok > new_v_tok {
        v_tok - new_v_tok
    } else {
        U256::zero()
    };
    let new_v_tok = if out.is_zero() { v_tok } else { new_v_tok };
    Ok(BuyOut { out, new_v_tok })
}

pub fn sell_gross(v_mon: U256, v_tok: U256, tokens: U256) -> MathResult<U256> {
    let k = mul(v_mon, v_tok)?;
    let denom = add(v_tok, tokens)?;
    let floor_mon = ceil_div(k, denom)?;
    Ok(if v_mon > floor_mon {
        v_mon - floor_mon
    } else {
        U256::zero()
    })
}

pub fn boosted_vtok(v_mon: U256, v_tok: U256, boost_mon: U256) -> MathResult<U256> {
    let k = mul(v_mon, v_tok)?;
    let denom = add(v_mon, boost_mon)?;
    ceil_div(k, denom)
}

pub fn split_loss(
    reserve: U256,
    boost_bps: U256,
    consolation_bps: U256,
    pot_bps: U256,
) -> MathResult<SplitLoss> {
    let bps = U256::from(BPS);
    let boost = div(mul(reserve, boost_bps)?, bps)?;
    let consolation = div(mul(reserve, consolation_bps)?, bps)?;
    let to_pot = div(mul(reserve, pot_bps)?, bps)?;
    let to_treasury = sub(sub(sub(reserve, boost)?, consolation)?, to_pot)?;
    Ok(SplitLoss {
        boost,
        consolation,
        to_pot,
        to_treasury,
    })
}

pub fn quote_buy(v_mon: U256, v_tok: U256, mon_in: U256, fee_bps: U256) -> MathResult<QuoteBuy> {
    let fee = fee_of(mon_in, fee_bps)?;
    let net = sub(mon_in, fee)?;
    let b = buy_out(v_mon, v_tok, net)?;
    Ok(QuoteBuy {
        fee,
        net,
        out: b.out,
        new_v_tok: b.new_v_tok,
    })
}

pub fn quote_sell(v_mon: U256, v_tok: U256, tokens: U256, fee_bps: U256) -> MathResult<QuoteSell> {
    let gross = sell_gross(v_mon, v_tok, tokens)?;
    let fee = fee_of(gross, fee_bps)?;
    let mon_out = sub(gross, fee)?;
    Ok(QuoteSell {
        gross,
        fee,
        mon_out,
    })
}

pub fn launch_seed(v_mon0: U256, v_tok0: U256, seed: U256) -> MathResult<LaunchSeed> {
    let b = buy_out(v_mon0, v_tok0, seed)?;
    if b.out.is_zero() {
        return Err(MathError::BadSeed);
    }
    let v_mon = add(v_mon0, seed)?;
    Ok(LaunchSeed {
        tokens: b.out,
        v_tok: b.new_v_tok,
        v_mon,
    })
}
