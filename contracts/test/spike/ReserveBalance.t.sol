// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Test} from "forge-std/Test.sol";
import {ReserveVault} from "./ReserveVault.sol";

contract ReserveBalanceSpikeTest is Test {
    ReserveVault internal vault;

    function setUp() public {
        vault = new ReserveVault();
    }

    function test_spike_osakaClzOpcodeRuns() public view {
        assertEq(vault.clz(1), 255);
        assertEq(vault.clz(0), 256);
        assertEq(vault.clz(type(uint256).max), 0);
    }

    function test_spike_vaultPaysItsWholeBalanceDownToZero() public {
        vm.deal(address(this), 25 ether);
        (bool ok,) = address(vault).call{value: 25 ether}("");
        assertTrue(ok);
        uint256 paid;
        for (uint256 i = 0; i < 9; ++i) {
            address payable to = payable(address(uint160(0xA000 + i)));
            vault.payOut(to, 2.5 ether);
            paid += 2.5 ether;
            assertEq(to.balance, 2.5 ether);
        }
        assertEq(address(vault).balance, 2.5 ether);
        vault.payAll(payable(address(0xB000)));
        assertEq(address(vault).balance, 0);
        assertEq(address(0xB000).balance, 2.5 ether);
        assertEq(paid + 2.5 ether, 25 ether);
    }

    function test_spike_forceSentMonRaisesBalanceOnly() public {
        vm.deal(address(vault), 3 ether);
        assertEq(address(vault).balance, 3 ether);
        vault.payAll(payable(address(0xC000)));
        assertEq(address(vault).balance, 0);
    }
}
