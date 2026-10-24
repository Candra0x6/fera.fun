// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Base} from "./Base.t.sol";
import {Vm} from "forge-std/Vm.sol";
import {IArena} from "../src/IArena.sol";
import {Arena} from "../src/Arena.sol";

contract ImageTest is Base {
    uint64 internal id;

    function setUp() public override {
        super.setUp();
        id = newRound(demoConfig());
    }

    function _launchWith(string memory uri) internal returns (uint8) {
        address who = creatorOf(1);
        vm.deal(who, 10 ether);
        vm.prank(who);
        return arena.launchCoinWithImage{value: 3 ether}(id, "Moon", "MOON", 0, 0, uri);
    }

    function test_launchWithImage_emitsCoinImageAndLaunches() public {
        vm.expectEmit(true, true, false, true);
        emit IArena.CoinImage(id, 0, "data:image/webp;base64,AAAA");
        uint8 coinId = _launchWith("data:image/webp;base64,AAAA");
        assertEq(coinId, 0);
        assertEq(arena.getRound(id).coinCount, 1);
    }

    function test_launchWithImage_acceptsHttpsAndIpfs() public {
        _launchWith("ipfs://bafyexample");
        vm.deal(creatorOf(2), 10 ether);
        vm.prank(creatorOf(2));
        arena.launchCoinWithImage{value: 3 ether}(id, "Two", "TWO", 1, 0, "https://example.com/a.png");
        assertEq(arena.getRound(id).coinCount, 2);
    }

    function test_launchWithImage_rejectsEmptyOversizedAndUnknownScheme() public {
        vm.deal(creatorOf(1), 10 ether);
        vm.startPrank(creatorOf(1));
        vm.expectRevert(Arena.BadImage.selector);
        arena.launchCoinWithImage{value: 3 ether}(id, "Moon", "MOON", 0, 0, "");
        vm.expectRevert(Arena.BadImage.selector);
        arena.launchCoinWithImage{value: 3 ether}(id, "Moon", "MOON", 0, 0, "javascript:alert(1)");
        vm.expectRevert(Arena.BadImage.selector);
        arena.launchCoinWithImage{value: 3 ether}(id, "Moon", "MOON", 0, 0, "http://insecure.example/a.png");
        bytes memory big = new bytes(16_385);
        for (uint256 i = 0; i < big.length; i++) {
            big[i] = "a";
        }
        string memory prefix = "data:image/png;base64,";
        vm.expectRevert(Arena.BadImage.selector);
        arena.launchCoinWithImage{value: 3 ether}(id, "Moon", "MOON", 0, 0, string.concat(prefix, string(big)));
        vm.stopPrank();
        assertEq(arena.getRound(id).coinCount, 0);
    }

    function test_launchWithImage_maxSizeAllowed() public {
        bytes memory body = new bytes(16_384 - 22);
        for (uint256 i = 0; i < body.length; i++) {
            body[i] = "a";
        }
        _launchWith(string.concat("data:image/png;base64,", string(body)));
        assertEq(arena.getRound(id).coinCount, 1);
    }

    function test_plainLaunchStillWorksAndEmitsNoImage() public {
        vm.deal(creatorOf(3), 10 ether);
        vm.recordLogs();
        vm.prank(creatorOf(3));
        arena.launchCoin{value: 3 ether}(id, "Plain", "PLN", 0, 0);
        assertEq(arena.getRound(id).coinCount, 1);
        bytes32 sig = keccak256("CoinImage(uint64,uint8,string)");
        vm.getRecordedLogs();
        vm.deal(creatorOf(4), 10 ether);
        vm.prank(creatorOf(4));
        arena.launchCoin{value: 3 ether}(id, "Plain2", "PL2", 0, 0);
        bool seen;
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == sig) seen = true;
        }
        assertFalse(seen);
    }
}
