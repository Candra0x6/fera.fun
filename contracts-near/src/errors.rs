use near_sdk::env;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ArenaError {
    UnknownRound,
    RoundInProgress,
    WrongPhase,
    RoundFull,
    BadCatalogId,
    BadName,
    BadTicker,
    CreatorCapReached,
    BadSeed,
    Expired,
    MinOutRequired,
    Locked,
    NotLocked,
    CoinNotAlive,
    ZeroOut,
    Slippage,
    Insolvent,
    LobbyNotReady,
    ZeroMaxClashes,
    EpochTooEarly,
    AbortNotOpen,
    NotClaimable,
    NotCreator,
    NothingToClaim,
    SeedAlreadyClaimed,
    NotRefundable,
    PayFailed,
    SeedBlockNotReached,
    StorageFloorBreached,
    AlreadyInitialized,
    BadConfig,
    BadDeposit,
    InsufficientBalance,
    Overflow,
}

impl ArenaError {
    pub fn name(self) -> &'static str {
        match self {
            ArenaError::UnknownRound => "UnknownRound",
            ArenaError::RoundInProgress => "RoundInProgress",
            ArenaError::WrongPhase => "WrongPhase",
            ArenaError::RoundFull => "RoundFull",
            ArenaError::BadCatalogId => "BadCatalogId",
            ArenaError::BadName => "BadName",
            ArenaError::BadTicker => "BadTicker",
            ArenaError::CreatorCapReached => "CreatorCapReached",
            ArenaError::BadSeed => "BadSeed",
            ArenaError::Expired => "Expired",
            ArenaError::MinOutRequired => "MinOutRequired",
            ArenaError::Locked => "Locked",
            ArenaError::NotLocked => "NotLocked",
            ArenaError::CoinNotAlive => "CoinNotAlive",
            ArenaError::ZeroOut => "ZeroOut",
            ArenaError::Slippage => "Slippage",
            ArenaError::Insolvent => "Insolvent",
            ArenaError::LobbyNotReady => "LobbyNotReady",
            ArenaError::ZeroMaxClashes => "ZeroMaxClashes",
            ArenaError::EpochTooEarly => "EpochTooEarly",
            ArenaError::AbortNotOpen => "AbortNotOpen",
            ArenaError::NotClaimable => "NotClaimable",
            ArenaError::NotCreator => "NotCreator",
            ArenaError::NothingToClaim => "NothingToClaim",
            ArenaError::SeedAlreadyClaimed => "SeedAlreadyClaimed",
            ArenaError::NotRefundable => "NotRefundable",
            ArenaError::PayFailed => "PayFailed",
            ArenaError::SeedBlockNotReached => "SeedBlockNotReached",
            ArenaError::StorageFloorBreached => "StorageFloorBreached",
            ArenaError::AlreadyInitialized => "AlreadyInitialized",
            ArenaError::BadConfig => "BadConfig",
            ArenaError::BadDeposit => "BadDeposit",
            ArenaError::InsufficientBalance => "InsufficientBalance",
            ArenaError::Overflow => "Overflow",
        }
    }
}

pub fn fail(e: ArenaError) -> ! {
    env::panic_str(&format!("ArenaError:{}", e.name()))
}

pub fn require(cond: bool, e: ArenaError) {
    if !cond {
        fail(e)
    }
}
