pub mod combat;
pub mod curve;
pub mod wad;

use uint::construct_uint;

construct_uint! {
    pub struct U256(4);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MathError {
    Overflow,
    DivZero,
    BadSeed,
}

pub type MathResult<T> = Result<T, MathError>;

pub fn add(a: U256, b: U256) -> MathResult<U256> {
    a.checked_add(b).ok_or(MathError::Overflow)
}

pub fn sub(a: U256, b: U256) -> MathResult<U256> {
    a.checked_sub(b).ok_or(MathError::Overflow)
}

pub fn mul(a: U256, b: U256) -> MathResult<U256> {
    a.checked_mul(b).ok_or(MathError::Overflow)
}

pub fn div(a: U256, b: U256) -> MathResult<U256> {
    a.checked_div(b).ok_or(MathError::DivZero)
}
