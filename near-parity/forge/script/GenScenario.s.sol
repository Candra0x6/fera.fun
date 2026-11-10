// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Script} from "forge-std/Script.sol";
import {Vm} from "forge-std/Vm.sol";
import {IArena} from "monad/IArena.sol";
import {Arena} from "monad/Arena.sol";
import {MonsterCoin} from "monad/MonsterCoin.sol";
import {MockSeedSource} from "monad/seed/MockSeedSource.sol";
import {ArenaProbe} from "../src/ArenaProbe.sol";

contract GenScenario is Script {
    string internal constant IN_FILE = "work/scenario-in.json";
    string internal constant OUT_FILE = "work/scenario-sol.txt";
    uint256 internal constant ACCOUNTS = 12;

    ArenaProbe internal arena;
    MockSeedSource internal seeds;
    MonsterCoin internal impl;

    struct Step {
        uint256 op;
        uint256 who;
        uint256 at;
        uint256 a0;
        uint256 a1;
        uint256 a2;
        uint256 a3;
        string s1;
        string s2;
    }

    function run() external {
        string memory json = vm.readFile(IN_FILE);
        uint256 nscn = vm.parseJsonUint(json, ".nscn");
        uint256[] memory scn = vm.parseJsonUintArray(json, ".scn");
        uint256[] memory op = vm.parseJsonUintArray(json, ".op");
        uint256[] memory who = vm.parseJsonUintArray(json, ".who");
        uint256[] memory at = vm.parseJsonUintArray(json, ".at");
        uint256[][4] memory a;
        for (uint256 k = 0; k < 4; ++k) {
            string[] memory s = vm.parseJsonStringArray(json, string.concat(".a", vm.toString(k)));
            a[k] = new uint256[](s.length);
            for (uint256 i = 0; i < s.length; ++i) {
                a[k][i] = vm.parseUint(s[i]);
            }
        }
        string[] memory s1 = vm.parseJsonStringArray(json, ".s1");
        string[] memory s2 = vm.parseJsonStringArray(json, ".s2");
        uint256[][] memory cfgs = new uint256[][](nscn);
        for (uint256 k = 0; k < nscn; ++k) {
            string[] memory s = vm.parseJsonStringArray(json, string.concat(".cfg", vm.toString(k)));
            cfgs[k] = new uint256[](s.length);
            for (uint256 i = 0; i < s.length; ++i) {
                cfgs[k][i] = vm.parseUint(s[i]);
            }
        }
        impl = new MonsterCoin();
        vm.writeFile(OUT_FILE, "");
        uint256 round = 0;
        for (uint256 i = 0; i < op.length; ++i) {
            if (i == 0 || scn[i] != scn[i - 1]) {
                _newScenario(scn[i]);
                round = 0;
            }
            Step memory st = Step(op[i], who[i], at[i], a[0][i], a[1][i], a[2][i], a[3][i], s1[i], s2[i]);
            if (st.op == 0) _cfg = cfgs[scn[i]];
            _step(i, st);
        }
    }

    uint256[] internal _cfg;

    function acct(uint256 i) internal pure returns (address) {
        return address(uint160(0x1000 + i));
    }

    function _newScenario(uint256 k) internal {
        arena = new ArenaProbe(acct(0), address(impl), 0);
        seeds = new MockSeedSource(address(arena), 0);
        vm.prank(acct(0));
        arena.setSeedSource(address(seeds));
        for (uint256 i = 0; i < ACCOUNTS; ++i) {
            vm.deal(acct(i), 1000 ether);
        }
        vm.writeLine(OUT_FILE, string.concat("SCN|", vm.toString(k), "|", vm.toString(address(arena))));
    }

    function _config() internal view returns (IArena.RoundConfig memory c) {
        uint256[] memory v = _cfg;
        c.maxCoins = uint8(v[0]);
        c.minCoins = uint8(v[1]);
        c.lobbySeconds = uint32(v[2]);
        c.levelingEpochs = uint8(v[3]);
        c.epochSeconds = uint32(v[4]);
        c.clashesPerEpoch = uint8(v[5]);
        c.seedTimeoutSeconds = uint32(v[6]);
        c.maxRoundSeconds = uint32(v[7]);
        c.launchFee = uint128(v[8]);
        c.minSeed = uint128(v[9]);
        c.maxSeed = uint128(v[10]);
        c.tradeFeeBps = uint16(v[11]);
        c.boostBps = uint16(v[12]);
        c.consolationBps = uint16(v[13]);
        c.potBps = uint16(v[14]);
        c.treasuryBps = uint16(v[15]);
        c.consolationMode = uint8(v[16]);
        c.gammaBps = uint16(v[17]);
        c.poolFactorMinBps = uint16(v[18]);
        c.poolFactorMaxBps = uint32(v[19]);
        c.levelBonusBps = uint16(v[20]);
        c.elementUpBps = uint16(v[21]);
        c.elementDownBps = uint16(v[22]);
        c.winProbMinBps = uint16(v[23]);
        c.winProbMaxBps = uint16(v[24]);
        c.huntWinPct = uint8(v[25]);
        c.keeperBounty = uint128(v[26]);
        c.maxEntropyFee = uint128(v[27]);
        c.vMon0 = uint128(v[28]);
        c.vTok0 = uint128(v[29]);
    }

    function _call(Step memory st) internal returns (bool ok, bytes memory ret) {
        uint256 op = st.op;
        address target = address(arena);
        bytes memory data;
        uint256 value = 0;
        if (op == 0) {
            data = abi.encodeCall(arena.createRound, (_config()));
        } else if (op == 1) {
            data = abi.encodeCall(arena.launchCoin, (uint64(st.a0), st.s1, st.s2, uint8(st.a2), uint8(st.a3)));
            value = st.a1;
        } else if (op == 2) {
            data = abi.encodeCall(arena.startRound, (uint64(st.a0)));
        } else if (op == 3) {
            data = abi.encodeCall(arena.buy, (uint64(st.a0), uint8(st.a1), st.a3, type(uint64).max));
            value = st.a2;
        } else if (op == 4) {
            data = abi.encodeCall(arena.sell, (uint64(st.a0), uint8(st.a1), st.a2, st.a3, type(uint64).max));
        } else if (op == 5) {
            data = abi.encodeCall(arena.lockEpoch, (uint64(st.a0)));
        } else if (op == 6) {
            target = address(seeds);
            data = abi.encodeCall(seeds.deliver, (arena.getRound(uint64(st.a0)).entropySeq, bytes32(st.a1)));
        } else if (op == 7) {
            data = abi.encodeCall(arena.resolveEpoch, (uint64(st.a0), uint8(st.a1)));
        } else if (op == 9) {
            data = abi.encodeCall(arena.abortRound, (uint64(st.a0)));
        } else if (op == 10) {
            data = abi.encodeCall(arena.refundLaunch, (uint64(st.a0), uint8(st.a1)));
        } else if (op == 11) {
            data = abi.encodeCall(arena.claimRefund, (uint64(st.a0), uint8(st.a1), st.a2));
        } else if (op == 12) {
            data = abi.encodeCall(arena.claimConsolation, (uint64(st.a0), uint8(st.a1), st.a2));
        } else if (op == 13) {
            data = abi.encodeCall(arena.redeem, (uint64(st.a0), st.a1));
        } else if (op == 14) {
            data = abi.encodeCall(arena.claimSeed, (uint64(st.a0), uint8(st.a1)));
        } else {
            revert("unknown op");
        }
        vm.prank(acct(st.who));
        (ok, ret) = target.call{value: value}(data);
    }

    function _step(uint256 i, Step memory st) internal {
        if (st.at != 0) vm.warp(st.at);
        vm.recordLogs();
        (bool ok, bytes memory ret) = _call(st);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        string memory head = string.concat("STEP|", vm.toString(i), "|", vm.toString(st.at), "|");
        if (ok) {
            uint256 r = 0;
            if (ret.length >= 32) {
                assembly {
                    r := mload(add(ret, 32))
                }
            }
            vm.writeLine(OUT_FILE, string.concat(head, "ok|", vm.toString(r)));
        } else {
            vm.writeLine(OUT_FILE, string.concat(head, "rv|", _errName(ret)));
        }
        for (uint256 k = 0; k < logs.length; ++k) {
            if (logs[k].emitter != address(arena)) continue;
            string memory topics = "";
            for (uint256 t = 0; t < logs[k].topics.length; ++t) {
                topics = string.concat(topics, t == 0 ? "" : ",", vm.toString(logs[k].topics[t]));
            }
            vm.writeLine(OUT_FILE, string.concat("L|", topics, "|", vm.toString(logs[k].data)));
        }
        _dump();
    }

    function _dump() internal {
        uint64 last = arena.currentRoundId();
        string memory native = "N";
        for (uint256 i = 0; i < ACCOUNTS; ++i) {
            native = string.concat(native, "|", vm.toString(acct(i).balance));
        }
        vm.writeLine(OUT_FILE, string.concat(native, "|", vm.toString(address(arena).balance)));
        for (uint64 r = 1; r <= last; ++r) {
            _dumpRound(r);
        }
    }

    function _dumpRound(uint64 r) internal {
        IArena.RoundView memory v = arena.getRound(r);
        string memory rid = vm.toString(uint256(r));
        string memory line = string.concat("R|", rid);
        line = string.concat(line, "|", vm.toString(uint256(uint8(v.phase))), "|", vm.toString(v.locked ? 1 : 0));
        line = string.concat(line, "|", vm.toString(uint256(v.epoch)), "|", vm.toString(uint256(v.coinCount)));
        line = string.concat(line, "|", vm.toString(uint256(v.aliveCount)), "|", vm.toString(uint256(v.cancelStreak)));
        line = string.concat(line, "|", vm.toString(uint256(v.winnerCoinId)), "|", vm.toString(uint256(v.createdAt)));
        line = string.concat(line, "|", vm.toString(uint256(v.startedAt)), "|", vm.toString(uint256(v.lockedAt)));
        line = string.concat(line, "|", vm.toString(uint256(v.lastEpochResolvedAt)), "|", vm.toString(uint256(v.entropySeq)));
        line = string.concat(line, "|", vm.toString(uint256(v.seed)), "|", vm.toString(uint256(v.prizePot)));
        line = string.concat(line, "|", vm.toString(uint256(v.treasury)), "|", vm.toString(uint256(v.redeemPool)));
        line = string.concat(line, "|", vm.toString(uint256(v.redeemSupply)), "|", vm.toString(uint256(v.clashesPlayed)));
        vm.writeLine(OUT_FILE, line);
        Arena.RoundExtra memory x = arena.extraOf(r);
        string memory xl = string.concat("X|", rid, "|", vm.toString(uint256(x.aliveMask)));
        xl = string.concat(xl, "|", vm.toString(uint256(x.aliveAtLock)), "|", vm.toString(uint256(x.resolveCursor)));
        xl = string.concat(xl, "|", vm.toString(x.lobbyAbort ? 1 : 0), "|", vm.toString(uint256(x.sumRMonAtLock)));
        xl = string.concat(xl, "|", vm.toString(uint256(x.redeemPaid)), "|", vm.toString(uint256(x.launchFeesOwed)));
        vm.writeLine(OUT_FILE, xl);
        for (uint8 c = 0; c < v.coinCount; ++c) {
            _dumpCoin(r, c);
        }
    }

    function _dumpCoin(uint64 r, uint8 c) internal {
        Arena.Coin memory k = arena.coinOf(r, c);
        string memory pre = string.concat("C|", vm.toString(uint256(r)), "|", vm.toString(uint256(c)));
        string memory l = string.concat(pre, "|", vm.toString(uint256(uint8(k.status))), "|", vm.toString(uint256(k.level)));
        l = string.concat(l, "|", vm.toString(uint256(k.xp)), "|", vm.toString(uint256(k.wins)));
        l = string.concat(l, "|", vm.toString(k.seedClaimed ? 1 : 0), "|", vm.toString(uint256(k.monsterType)));
        l = string.concat(l, "|", vm.toString(uint256(k.skinId)), "|", vm.toString(k.creator));
        l = string.concat(l, "|", vm.toString(uint256(k.vMon)), "|", vm.toString(uint256(k.vTok)));
        l = string.concat(l, "|", vm.toString(uint256(k.rMon)), "|", vm.toString(uint256(k.rMonAtLock)));
        l = string.concat(l, "|", vm.toString(uint256(k.seedMon)), "|", vm.toString(uint256(k.seedTokens)));
        l = string.concat(l, "|", vm.toString(uint256(k.consolationPool)), "|", vm.toString(uint256(k.consolationSupply)));
        l = string.concat(l, "|", vm.toString(uint256(k.poolPaid)), "|", vm.toString(uint256(k.feeAcc)));
        MonsterCoin t = MonsterCoin(k.token);
        l = string.concat(l, "|", vm.toString(t.totalSupply()));
        vm.writeLine(OUT_FILE, l);
        string memory b = string.concat("B|", vm.toString(uint256(r)), "|", vm.toString(uint256(c)));
        for (uint256 i = 0; i < ACCOUNTS; ++i) {
            b = string.concat(b, "|", vm.toString(t.balanceOf(acct(i))));
        }
        vm.writeLine(OUT_FILE, string.concat(b, "|", vm.toString(t.balanceOf(address(arena)))));
    }

    function _errName(bytes memory e) internal pure returns (string memory) {
        if (e.length >= 4) {
            bytes4 sel = bytes4(e);
            string[41] memory names = [
                "NotOwner", "NotSeedSource", "NoSeedSource", "RoundInProgress", "UnknownRound", "BadSplit",
                "BadCoinLimits", "BadSeed", "Expired", "MinOutRequired", "Locked", "NotLocked", "CoinNotAlive",
                "ZeroOut", "Slippage", "Insolvent", "LobbyNotReady", "TreasuryTooLow", "SeedNotReady", "ZeroMaxClashes",
                "EpochTooEarly", "TimeoutNotElapsed", "SeedArrived", "CancelCapReached", "AbortNotOpen", "NotClaimable",
                "NotCreator", "NothingToClaim", "SeedAlreadyClaimed", "NotRefundable", "WrongPhase", "RoundFull",
                "BadCatalogId", "BadName", "BadTicker", "CreatorCapReached", "LobbyStillOpen", "LobbyFilled",
                "ReserveFloorBreached", "ReserveNotFunded", "PayFailed"
            ];
            for (uint256 i = 0; i < names.length; ++i) {
                if (sel == bytes4(keccak256(bytes(string.concat(names[i], "()"))))) return names[i];
            }
            if (e.length == 4 + 96 && sel == bytes4(keccak256("ERC20InsufficientBalance(address,uint256,uint256)"))) {
                return "ERC20InsufficientBalance";
            }
            if (e.length == 36 && sel == bytes4(0x4e487b71)) return "Panic";
        }
        return "Other";
    }
}
