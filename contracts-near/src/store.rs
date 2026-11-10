use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::env;

pub fn read<T: BorshDeserialize>(key: &[u8]) -> Option<T> {
    env::storage_read(key).map(|bytes| T::try_from_slice(&bytes).unwrap_or_else(|_| env::abort()))
}

pub fn write<T: BorshSerialize>(key: &[u8], value: &T) {
    let bytes = borsh::to_vec(value).unwrap_or_else(|_| env::abort());
    env::storage_write(key, &bytes);
}

pub fn remove(key: &[u8]) {
    env::storage_remove(key);
}

pub fn round_key(round_id: u64) -> Vec<u8> {
    let mut key = vec![b'r'];
    key.extend_from_slice(&round_id.to_be_bytes());
    key
}

pub fn ledger_key(round_id: u64, account: &str) -> Vec<u8> {
    let mut key = vec![b'l'];
    key.extend_from_slice(&round_id.to_be_bytes());
    key.extend_from_slice(account.as_bytes());
    key
}

pub fn claimable_key(account: &str) -> Vec<u8> {
    let mut key = vec![b'c'];
    key.extend_from_slice(account.as_bytes());
    key
}

pub fn event_key(slot: u64) -> Vec<u8> {
    let mut key = vec![b'e'];
    key.extend_from_slice(&slot.to_be_bytes());
    key
}
