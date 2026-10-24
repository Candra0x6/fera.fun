// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Test} from "forge-std/Test.sol";
import {ArenaHarness} from "../Base.t.sol";
import {MockSeedSource} from "../../src/seed/MockSeedSource.sol";
import {MonsterCoin} from "../../src/MonsterCoin.sol";
import {Arena} from "../../src/Arena.sol";
import {Hostile} from "../Reentrancy.t.sol";

interface IArenaPhase {
    function isActive(uint64 id) external view returns (bool);
}

abstract contract HandlerBase is Test {
    ArenaHarness internal arena;
    MockSeedSource internal seeds;
    uint64 internal id;
    uint8 internal coins;

    constructor(ArenaHarness arena_, MockSeedSource seeds_, uint64 id_, uint8 coins_) {
        arena = arena_;
        seeds = seeds_;
        id = id_;
        coins = coins_;
    }

    function _deadline() internal view returns (uint64) {
        return uint64(block.timestamp + 1000);
    }

    function _token(uint8 coin) internal view returns (MonsterCoin) {
        return MonsterCoin(arena.coinOf(id, coin).token);
    }
}

contract PlayersHandler is HandlerBase {
    address[4] internal actors;
    uint256 public claims;

    constructor(ArenaHarness arena_, MockSeedSource seeds_, uint64 id_, uint8 coins_)
        HandlerBase(arena_, seeds_, id_, coins_)
    {
        for (uint256 i = 0; i < 4; ++i) {
            actors[i] = address(uint160(0xA11CE000 + i));
        }
    }

    function buy(uint256 a, uint256 c, uint256 amt) external {
        address who = actors[a % 4];
        uint256 v = bound(amt, 0.01 ether, 30 ether);
        vm.deal(who, who.balance + v);
        vm.prank(who);
        try arena.buy{value: v}(id, uint8(c % coins), 1, _deadline()) {} catch {}
    }

    function sell(uint256 a, uint256 c, uint256 frac) external {
        address who = actors[a % 4];
        uint8 coin = uint8(c % coins);
        uint256 bal = _token(coin).balanceOf(who);
        uint256 t = bal * (frac % 101) / 100;
        if (t == 0) return;
        vm.prank(who);
        try arena.sell(id, coin, t, 1, _deadline()) {} catch {}
    }

    function claimConsolation(uint256 a, uint256 c, uint256 frac) external {
        address who = actors[a % 4];
        uint8 coin = uint8(c % coins);
        uint256 t = _token(coin).balanceOf(who) * (frac % 101) / 100;
        if (t == 0) return;
        vm.prank(who);
        try arena.claimConsolation(id, coin, t) {
            ++claims;
        } catch {}
    }

    function claimRefund(uint256 a, uint256 c, uint256 frac) external {
        address who = actors[a % 4];
        uint8 coin = uint8(c % coins);
        uint256 t = _token(coin).balanceOf(who) * (frac % 101) / 100;
        if (t == 0) return;
        vm.prank(who);
        try arena.claimRefund(id, coin, t) {
            ++claims;
        } catch {}
    }

    function redeem(uint256 a, uint256 frac) external {
        address who = actors[a % 4];
        uint8 win = arena.getRound(id).winnerCoinId;
        uint256 t = _token(win).balanceOf(who) * (frac % 101) / 100;
        if (t == 0) return;
        vm.prank(who);
        try arena.redeem(id, t) {
            ++claims;
        } catch {}
    }

    function claimSeed(uint256 c) external {
        uint8 coin = uint8(c % coins);
        vm.prank(address(uint160(0xC0DE0000 + coin)));
        try arena.claimSeed(id, coin) {
            ++claims;
        } catch {}
    }

    function fundTreasury(uint256 amt) external {
        uint256 v = bound(amt, 0, 3 ether);
        vm.deal(address(this), address(this).balance + v);
        try arena.fundTreasury{value: v}(id) {} catch {}
    }

    receive() external payable {}
}

contract KeeperHandler is HandlerBase {
    uint256 public resolves;

    constructor(ArenaHarness arena_, MockSeedSource seeds_, uint64 id_, uint8 coins_)
        HandlerBase(arena_, seeds_, id_, coins_)
    {}

    function epoch(bytes32 seed, uint256 cap) external {
        vm.warp(block.timestamp + 21);
        try arena.lockEpoch(id) {}
        catch {
            return;
        }
        try seeds.deliver(arena.getRound(id).entropySeq, seed) {} catch {}
        try arena.resolveEpoch(id, uint8(cap % 6) + 1) {
            ++resolves;
        } catch {}
    }

    function finish(bytes32 seed) external {
        for (uint256 i = 0; i < 14; ++i) {
            IArenaPhase p = IArenaPhase(address(arena));
            if (!p.isActive(id)) return;
            vm.warp(block.timestamp + 21);
            try arena.lockEpoch(id) {}
            catch {
                return;
            }
            try seeds.deliver(arena.getRound(id).entropySeq, keccak256(abi.encode(seed, i))) {} catch {}
            try arena.resolveEpoch(id, 6) {
                ++resolves;
            } catch {
                return;
            }
        }
    }

    function stall() external {
        vm.warp(block.timestamp + 21);
        try arena.lockEpoch(id) {}
        catch {
            return;
        }
        vm.warp(block.timestamp + 61);
        try arena.cancelEpoch(id) {} catch {}
    }

    function lock() external {
        vm.warp(block.timestamp + 20);
        try arena.lockEpoch(id) {} catch {}
    }

    function deliver(bytes32 seed) external {
        uint64 sid = arena.getRound(id).entropySeq;
        try seeds.deliver(sid, seed) {} catch {}
    }

    function resolve(uint256 cap) external {
        try arena.resolveEpoch(id, uint8(cap % 6) + 1) {
            ++resolves;
        } catch {}
    }

    function cancel() external {
        vm.warp(block.timestamp + 61);
        try arena.cancelEpoch(id) {} catch {}
    }

    function abort() external {
        try arena.abortRound(id) {} catch {}
    }

    receive() external payable {}
}

contract HostileHandler is HandlerBase {
    Hostile public hostile;
    uint256 public reentries;

    constructor(ArenaHarness arena_, MockSeedSource seeds_, uint64 id_, uint8 coins_)
        HandlerBase(arena_, seeds_, id_, coins_)
    {
        hostile = new Hostile(Arena(payable(address(arena_))));
    }

    function buy(uint256 c, uint256 amt) external {
        uint256 v = bound(amt, 0.05 ether, 10 ether);
        vm.deal(address(hostile), address(hostile).balance + v);
        try hostile.call(address(arena), abi.encodeCall(Arena.buy, (id, uint8(c % coins), 1, _deadline())), v) {}
            catch {}
    }

    function sellReentrant(uint256 c, uint256 frac) external {
        uint8 coin = uint8(c % coins);
        uint256 t = _token(coin).balanceOf(address(hostile)) * (frac % 101) / 100;
        if (t == 0) return;
        hostile.arm(abi.encodeCall(Arena.sell, (id, coin, 1, 1, _deadline())));
        try hostile.call(address(arena), abi.encodeCall(Arena.sell, (id, coin, t, 1, _deadline())), 0) {} catch {}
        if (hostile.reentered()) ++reentries;
    }

    function claimReentrant(uint256 c, uint256 frac, bool redeemInstead) external {
        uint8 coin = uint8(c % coins);
        if (redeemInstead) coin = arena.getRound(id).winnerCoinId;
        uint256 t = _token(coin).balanceOf(address(hostile)) * (frac % 101) / 100;
        if (t == 0) return;
        bytes memory inner = redeemInstead
            ? abi.encodeCall(Arena.redeem, (id, 1))
            : abi.encodeCall(Arena.claimConsolation, (id, coin, 1));
        bytes memory outer = redeemInstead
            ? abi.encodeCall(Arena.redeem, (id, t))
            : abi.encodeCall(Arena.claimConsolation, (id, coin, t));
        hostile.arm(inner);
        try hostile.call(address(arena), outer, 0) {} catch {}
        if (hostile.reentered()) ++reentries;
    }
}

contract ForceSenderHandler is HandlerBase {
    uint256 public forced;

    constructor(ArenaHarness arena_, MockSeedSource seeds_, uint64 id_, uint8 coins_)
        HandlerBase(arena_, seeds_, id_, coins_)
    {}

    function force(uint256 amt) external {
        uint256 v = bound(amt, 1, 5 ether);
        vm.deal(address(arena), address(arena).balance + v);
        forced += v;
    }
}

contract TimeWarpHandler is HandlerBase {
    constructor(ArenaHarness arena_, MockSeedSource seeds_, uint64 id_, uint8 coins_)
        HandlerBase(arena_, seeds_, id_, coins_)
    {}

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 90));
    }
}
