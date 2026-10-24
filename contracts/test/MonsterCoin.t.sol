// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {MonsterCoin} from "../src/MonsterCoin.sol";

contract MonsterCoinTest is Test {
    MonsterCoin internal impl;
    MonsterCoin internal coin;
    address internal arenaAddr = makeAddr("arena");
    address internal alice = makeAddr("alice");

    function setUp() public {
        impl = new MonsterCoin();
        coin = MonsterCoin(Clones.clone(address(impl)));
        coin.initialize(arenaAddr, "Fire Drake", "DRAKE");
    }

    function test_cloneMetadata() public view {
        assertEq(coin.name(), "Fire Drake");
        assertEq(coin.symbol(), "DRAKE");
        assertEq(coin.decimals(), 18);
        assertEq(coin.arena(), arenaAddr);
    }

    function test_implementationCannotBeInitialized() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize(arenaAddr, "x", "X");
    }

    function test_cloneInitializesOnce() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        coin.initialize(alice, "y", "Y");
    }

    function test_initializeRejectsZeroArena() public {
        MonsterCoin other = MonsterCoin(Clones.clone(address(impl)));
        vm.expectRevert(MonsterCoin.ZeroAddress.selector);
        other.initialize(address(0), "z", "Z");
    }

    function test_onlyArenaMintsAndBurns() public {
        vm.prank(alice);
        vm.expectRevert(MonsterCoin.NotArena.selector);
        coin.mint(alice, 1);
        vm.prank(arenaAddr);
        coin.mint(alice, 100);
        assertEq(coin.balanceOf(alice), 100);
        assertEq(coin.totalSupply(), 100);
        vm.prank(alice);
        vm.expectRevert(MonsterCoin.NotArena.selector);
        coin.burn(alice, 1);
        vm.prank(arenaAddr);
        coin.burn(alice, 40);
        assertEq(coin.balanceOf(alice), 60);
    }

    function test_transfersWork() public {
        vm.prank(arenaAddr);
        coin.mint(alice, 10);
        vm.prank(alice);
        coin.transfer(address(this), 4);
        assertEq(coin.balanceOf(address(this)), 4);
    }
}
