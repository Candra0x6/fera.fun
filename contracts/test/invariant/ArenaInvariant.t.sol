// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Base} from "../Base.t.sol";
import {IArena} from "../../src/IArena.sol";
import {CurveMath} from "../../src/libs/CurveMath.sol";
import {CombatMath} from "../../src/libs/CombatMath.sol";
import {MonsterCoin} from "../../src/MonsterCoin.sol";
import {PlayersHandler, KeeperHandler, HostileHandler, ForceSenderHandler, TimeWarpHandler} from "./Handlers.sol";

contract ArenaInvariantTest is Base {
    PlayersHandler internal players;
    KeeperHandler internal keeperH;
    HostileHandler internal hostileH;
    ForceSenderHandler internal forceH;
    TimeWarpHandler internal warpH;
    uint64 internal id;
    uint8 internal constant COINS = 12;

    mapping(uint8 coin => uint256 pool) internal seenPool;
    mapping(uint8 coin => uint256 supply) internal seenSupply;

    function setUp() public override {
        super.setUp();
        IArena.RoundConfig memory cfg = demoConfig();
        cfg.maxCoins = COINS;
        cfg.minCoins = 8;
        cfg.clashesPerEpoch = 4;
        cfg.levelingEpochs = 2;
        id = newRound(cfg);
        launchMany(id, COINS, 3 ether);
        startRound(id);
        players = new PlayersHandler(arena, seeds, id, COINS);
        keeperH = new KeeperHandler(arena, seeds, id, COINS);
        hostileH = new HostileHandler(arena, seeds, id, COINS);
        forceH = new ForceSenderHandler(arena, seeds, id, COINS);
        warpH = new TimeWarpHandler(arena, seeds, id, COINS);
        targetContract(address(players));
        targetContract(address(keeperH));
        targetContract(address(hostileH));
        targetContract(address(forceH));
        targetContract(address(warpH));
    }

    function afterInvariant() public {
        IArena.RoundView memory r = arena.getRound(id);
        vm.writeLine(
            "out/invariant-coverage.log", string.concat(vm.toString(uint256(r.phase)), " ", vm.toString(r.epoch))
        );
    }

    function invariant_I1_balanceCoversLiabilities() public view {
        assertGe(address(arena).balance, arena.allLiabilities());
    }

    function invariant_I2_curveSolvencyAndIdentity() public view {
        IArena.RoundConfig memory cfg = arena.getConfig(id);
        (, IArena.CoinView[] memory cs) = arena.getArenaSnapshot(id);
        for (uint256 i = 0; i < cs.length; ++i) {
            if (cs[i].status != IArena.Status.Alive) continue;
            assertEq(cs[i].vMon - cfg.vMon0, cs[i].rMon);
            assertLe(CurveMath.sellGross(cs[i].vMon, cs[i].vTok, cs[i].supply), cs[i].rMon);
        }
    }

    function invariant_I3_claimRatesFixedAndPayoutsBounded() public {
        uint256 totalClaims = players.claims();
        (, IArena.CoinView[] memory cs) = arena.getArenaSnapshot(id);
        for (uint8 i = 0; i < cs.length; ++i) {
            if (cs[i].status != IArena.Status.Eliminated && cs[i].status != IArena.Status.Refunded) continue;
            if (seenSupply[i] == 0) {
                seenPool[i] = cs[i].consolationPool;
                seenSupply[i] = cs[i].consolationSupply;
            }
            assertEq(cs[i].consolationPool, seenPool[i]);
            assertEq(cs[i].consolationSupply, seenSupply[i]);
            uint256 paid = arena.coinOf(id, i).poolPaid;
            assertLe(paid, cs[i].consolationPool);
            if (MonsterCoin(cs[i].token).totalSupply() == 0) {
                assertLe(cs[i].consolationPool - paid, totalClaims + 1);
            }
        }
        IArena.RoundView memory r = arena.getRound(id);
        if (r.phase == IArena.Phase.Settled) {
            assertLe(arena.extraOf(id).redeemPaid, r.redeemPool);
        }
    }

    function invariant_I4_noValueLeaksSurplusAtLeastForced() public view {
        assertGe(address(arena).balance, arena.allLiabilities() + forceH.forced());
    }

    function invariant_I5_resolveNeverRevertsOnceSeeded() public {
        IArena.RoundView memory r = arena.getRound(id);
        if (!r.locked || r.seed == bytes32(0)) return;
        uint256 snap = vm.snapshotState();
        vm.prank(address(keeperH));
        arena.resolveEpoch(id, 255);
        vm.revertToState(snap);
    }

    function invariant_I6_aliveCountMatchesStatuses() public view {
        IArena.RoundView memory r = arena.getRound(id);
        (, IArena.CoinView[] memory cs) = arena.getArenaSnapshot(id);
        uint256 alive;
        uint256 champions;
        for (uint256 i = 0; i < cs.length; ++i) {
            if (cs[i].status == IArena.Status.Alive) ++alive;
            if (cs[i].status == IArena.Status.Champion) ++champions;
        }
        if (r.phase == IArena.Phase.Leveling || r.phase == IArena.Phase.Knockout) {
            assertEq(alive, r.aliveCount);
            assertGe(alive, 2);
            assertEq(champions, 0);
        }
        if (r.phase == IArena.Phase.Settled) {
            assertEq(champions, 1);
            assertEq(alive, 0);
            assertEq(r.aliveCount, 1);
        }
        if (r.phase == IArena.Phase.Aborted) assertEq(alive, 0);
    }

    function invariant_I7_levelFollowsXp() public view {
        (, IArena.CoinView[] memory cs) = arena.getArenaSnapshot(id);
        for (uint256 i = 0; i < cs.length; ++i) {
            assertEq(cs[i].level, CombatMath.levelFromXp(cs[i].xp));
        }
    }

    function invariant_I8_treasuryKeepsFloorOnceStarted() public view {
        IArena.RoundView memory r = arena.getRound(id);
        assertGe(r.treasury, FLOOR);
        assertGe(address(arena).balance, FLOOR);
    }
}
