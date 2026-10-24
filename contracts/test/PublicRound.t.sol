// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Base} from "./Base.t.sol";
import {IArena} from "../src/IArena.sol";
import {Arena} from "../src/Arena.sol";

contract PublicRoundTest is Base {
    address internal stranger = makeAddr("stranger");

    function _liteConfig() internal pure returns (IArena.RoundConfig memory c) {
        c = _base();
        c.minCoins = 5;
        c.maxCoins = 6;
        c.clashesPerEpoch = 3;
        c.launchFee = 0.1 ether;
        c.minSeed = 0.2 ether;
        c.keeperBounty = 0.02 ether;
        c.maxEntropyFee = 0.2 ether;
    }

    function _base() internal pure returns (IArena.RoundConfig memory c) {
        c = demoConfig();
    }

    function test_createDefaultRound_revertsWithoutDefaultConfig() public {
        vm.prank(stranger);
        vm.expectRevert(Arena.NoDefaultConfig.selector);
        arena.createDefaultRound();
    }

    function test_setDefaultConfig_onlyOwner() public {
        IArena.RoundConfig memory c = _liteConfig();
        vm.prank(stranger);
        vm.expectRevert(Arena.NotOwner.selector);
        arena.setDefaultConfig(c);
        vm.prank(owner);
        arena.setDefaultConfig(c);
        assertTrue(arena.defaultConfigSet());
        assertEq(arena.getDefaultConfig().minCoins, 5);
    }

    function test_setDefaultConfig_validates() public {
        IArena.RoundConfig memory c = _liteConfig();
        c.boostBps = 1;
        vm.prank(owner);
        vm.expectRevert(Arena.BadSplit.selector);
        arena.setDefaultConfig(c);
    }

    function test_anyoneCreatesRoundWithTheOwnerConfig() public {
        vm.prank(owner);
        arena.setDefaultConfig(_liteConfig());
        vm.prank(stranger);
        uint64 id = arena.createDefaultRound();
        assertEq(id, 1);
        IArena.RoundConfig memory used = arena.getConfig(id);
        assertEq(used.keeperBounty, 0.02 ether);
        assertEq(used.maxEntropyFee, 0.2 ether);
        assertEq(used.launchFee, 0.1 ether);
        assertEq(uint8(arena.getRound(id).phase), uint8(IArena.Phase.Lobby));
    }

    function test_valueSentFundsTheNewRoundTreasury() public {
        vm.prank(owner);
        arena.setDefaultConfig(_liteConfig());
        vm.deal(stranger, 5 ether);
        vm.prank(stranger);
        uint64 id = arena.createDefaultRound{value: 2 ether}();
        assertEq(arena.getRound(id).treasury, 2 ether);
        assertEq(address(arena).balance, 2 ether);
    }

    function test_cannotCreateWhileARoundIsInProgress() public {
        vm.prank(owner);
        arena.setDefaultConfig(_liteConfig());
        vm.prank(stranger);
        arena.createDefaultRound();
        vm.prank(stranger);
        vm.expectRevert(Arena.RoundInProgress.selector);
        arena.createDefaultRound();
    }

    function test_createAgainAfterAbortCarriesTreasuryButKeepsDefaultConfig() public {
        vm.warp(1000);
        vm.prank(owner);
        arena.setDefaultConfig(_liteConfig());
        vm.deal(stranger, 5 ether);
        vm.prank(stranger);
        uint64 first = arena.createDefaultRound{value: 3 ether}();
        vm.warp(1000 + _liteConfig().lobbySeconds);
        arena.abortRound(first);
        vm.prank(alice);
        uint64 second = arena.createDefaultRound();
        assertEq(second, 2);
        assertEq(arena.getRound(second).treasury, 3 ether);
        assertEq(arena.getConfig(second).keeperBounty, 0.02 ether);
    }

    function test_ownerCanStillCreateCustomRoundButStrangerCannot() public {
        vm.prank(stranger);
        vm.expectRevert(Arena.NotOwner.selector);
        arena.createRound(_liteConfig());
        vm.prank(owner);
        assertEq(arena.createRound(_liteConfig()), 1);
    }
}
