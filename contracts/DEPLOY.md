# Deploy and Day-1 checks

Every command below is run by the user with a Foundry keystore the user created. No key, password or `.env` file is created or read by anything in this repo. Placeholders: `<keystore>` is the name of your Foundry keystore account, `<you>` its address.

## Local rehearsal (anvil, public dev account, mock seed)

```bash
anvil --network monad --port 8545 --accounts 40
```

In a second terminal (the sender is anvil's public first dev account, unlocked):

```bash
cd contracts
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

The script deploys `MonsterCoin`, `Arena` (reserve floor 10 MON), `MockSeedSource`, creates round 1 with the demo preset, funds the floor through `fundTreasury`, and writes `deployments/31337.json` and `deployments/31337.params.json`. The mock source delivers seeds on demand: `cast send <mockSeedSource> 'deliver(uint64,bytes32)' <id> <seed> --rpc-url ... --unlocked --from <anyone>`. Optional environment: `RESERVE_FLOOR_WEI`, `MOCK_SEED_FEE_WEI`, `KEEPER_ADDRESS`. The script refuses to run on chain 10143 or 143.

## Testnet deploy (user step)

1. Day-1 checks below, first.
2. Import the deployer key yourself (`cast wallet import <keystore> --interactive`), fund it on Monad testnet, and look up the Entropy contract and provider addresses (`0x825c0390f379C631f3Cf11A82a37D20BddF93c07` answered `getFeeV2()` on testnet when this was written; confirm with `cast call <entropy> 'getFeeV2()(uint128)' --rpc-url https://testnet-rpc.monad.xyz`).
3. Deploy:

```bash
cd contracts
export DEPLOYER_ACCOUNT=<keystore>
export ENTROPY_ADDRESS=<entropy contract>
export ENTROPY_PROVIDER=<entropy provider>
export KEEPER_ADDRESS=<public address of the keeper EOA>
forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz --account <keystore> --sender <you> --broadcast --verify --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/
```

Optional: `RESERVE_FLOOR_WEI` (default 10 ether; use 0 only if Day-1 check 2 passes) and `TREASURY_EXTRA_WEI` (extra treasury on top of the floor). The script deploys `MonsterCoin`, `Arena` (owner is the deployer), `EntropySeedSource` (callback gas 200000), calls `setSeedSource`, creates round 1 with the demo preset, sends `reserveFloor + TREASURY_EXTRA_WEI` through `fundTreasury`, and writes `deployments/10143.json` and `deployments/10143.params.json` (public addresses and preset values only). The real deploy script cannot reference `MockSeedSource`.

4. The lobby needs the floor funded before the first `launchCoin` (the script does it) and, at `startRound`, `treasury >= reserveFloor + plannedEpochs * maxEntropyFee`. With 30 coins at a 1 MON launch fee the launch fees alone cover the demo preset; with fewer coins top up with `cast send <arena> 'fundTreasury(uint64)' 1 --value <amount> --account <keystore>`.
5. Fund the keeper EOA with about 25 MON (10 MON reserve plus gas). Keeper calls should pass explicit gas limits from `GAS.md`.

## Day-1 check 1: osaka compile

```bash
cd contracts
forge build
forge inspect Arena metadata --json | jq -r '.settings.evmVersion'
```

Expected: `Compiler run successful!` and `osaka`.

## Day-1 check 2: does the reserve-balance rule apply to contract accounts

The Arena keeps a standing reserve floor (default 10 MON, `RESERVE_FLOOR_WEI`) so that no payout ever leaves it under the reserve. This check decides whether the floor is needed. Use a funded keystore account (at least 30 MON, so the sender-side rule is not part of the test).

```bash
cd contracts
RPC=https://testnet-rpc.monad.xyz
forge create test/spike/ReserveVault.sol:ReserveVault --rpc-url $RPC --account <keystore> --broadcast
cast send $VAULT --value 25ether --rpc-url $RPC --account <keystore> --gas-limit 100000
cast send $VAULT 'payOut(address,uint256)' <you> 20ether --rpc-url $RPC --account <keystore> --gas-limit 100000
cast balance $VAULT --ether
cast send $VAULT 'payAll(address)' <you> --rpc-url $RPC --account <keystore> --gas-limit 100000
cast balance $VAULT --ether
cast receipt <tx-hash-of-payAll> status --rpc-url $RPC
```

Pass (the rule does not apply to contracts): every receipt has status 1 and the vault ends at 0. Then redeploy with `RESERVE_FLOOR_WEI=0` if you want to avoid parking 10 MON.
Fail (the rule applies): the `payOut` (ending at 5 MON) or `payAll` receipt has status 0. Keep the default floor of 10 MON. Until this check has run, deploy with the default.

## Day-1 check 3: a real Entropy request

Needs the deployed `EntropySeedSource`. Run one epoch (`lockEpoch` after `epochSeconds`) and record the fee from the `TreasurySpent(SeedFee)` event, the blocks from `EpochLocked` to `SeedReady`, and the gas used by the callback. The brainstorm measured about 0.128 MON and 6 to 10 blocks (n = 3). If `maxEntropyFee` is below the live fee, `lockEpoch` reverts `TreasuryTooLow`.
