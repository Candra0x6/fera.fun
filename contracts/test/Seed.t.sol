// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Base} from "./Base.t.sol";
import {IArena} from "../src/IArena.sol";
import {MockEntropy} from "@pythnetwork/entropy-sdk-solidity/MockEntropy.sol";
import {EntropySeedSource} from "../src/seed/EntropySeedSource.sol";
import {MockSeedSource} from "../src/seed/MockSeedSource.sol";

contract RevertingConsumer {
    function onSeed(uint64, bytes32) external pure {
        revert("boom");
    }
}

contract SeedTest is Base {
    MockEntropy internal entropy;
    EntropySeedSource internal source;
    address internal provider = makeAddr("provider");

    function setUp() public override {
        super.setUp();
        entropy = new MockEntropy(provider);
        source = new EntropySeedSource(address(arena), address(entropy), provider, 200_000);
        vm.startPrank(owner);
        arena.setSeedSource(address(source));
        arena.createRound(demoConfig());
        vm.stopPrank();
    }

    function test_entropyFeeIsReadFromEntropy() public view {
        assertEq(source.fee(), entropy.getFeeV2(provider, 200_000));
    }

    function test_entropyRequestAndCallbackDeliverSeed() public {
        uint256 fee = source.fee();
        vm.deal(address(arena), 1 ether);
        vm.prank(address(arena));
        uint64 id = source.requestSeed{value: fee}();
        arena.lockForTest(1, id);
        vm.expectEmit(true, false, false, true);
        emit IArena.SeedReady(1, 1, bytes32(uint256(1234)));
        entropy.mockReveal(provider, id, bytes32(uint256(1234)));
        assertEq(arena.getRound(1).seed, bytes32(uint256(1234)));
    }

    function test_entropyRequestOnlyFromArena() public {
        uint256 fee = source.fee();
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(EntropySeedSource.NotArena.selector);
        source.requestSeed{value: fee}();
    }

    function test_entropyWrongFeeReverts() public {
        vm.deal(address(arena), 1 ether);
        vm.prank(address(arena));
        vm.expectRevert(EntropySeedSource.WrongFee.selector);
        source.requestSeed{value: 5}();
    }

    function test_entropyCallbackOnlyFromEntropy() public {
        vm.prank(alice);
        vm.expectRevert("Only Entropy can call this function");
        source._entropyCallback(1, provider, bytes32(uint256(1)));
    }

    function test_entropyCallbackNeverReverts() public {
        address consumer = address(new RevertingConsumer());
        EntropySeedSource hostile = new EntropySeedSource(consumer, address(entropy), provider, 200_000);
        vm.deal(consumer, 1 ether);
        uint256 fee = hostile.fee();
        vm.prank(consumer);
        uint64 id = hostile.requestSeed{value: fee}();
        entropy.mockReveal(provider, id, bytes32(uint256(5)));
    }

    function test_mockSeedFlow() public {
        MockSeedSource mock = new MockSeedSource(address(arena), 0.01 ether);
        vm.prank(owner);
        vm.expectRevert();
        arena.setSeedSource(address(mock));
        arena.setPhaseForTest(1, IArena.Phase.Settled);
        vm.prank(owner);
        arena.setSeedSource(address(mock));
        vm.prank(owner);
        arena.createRound(demoConfig());
        vm.deal(address(arena), 1 ether);
        vm.prank(address(arena));
        uint64 id = mock.requestSeed{value: 0.01 ether}();
        assertEq(id, 1);
        arena.lockForTest(2, id);
        mock.deliver(id, bytes32(uint256(77)));
        assertEq(arena.getRound(2).seed, bytes32(uint256(77)));
        vm.expectRevert(MockSeedSource.AlreadyDelivered.selector);
        mock.deliver(id, bytes32(uint256(78)));
        vm.expectRevert(MockSeedSource.UnknownRequest.selector);
        mock.deliver(99, bytes32(uint256(1)));
    }

    function test_mockRequestOnlyFromArenaWithExactFee() public {
        MockSeedSource mock = new MockSeedSource(address(arena), 0.01 ether);
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(MockSeedSource.NotArena.selector);
        mock.requestSeed{value: 0.01 ether}();
        vm.deal(address(arena), 1 ether);
        vm.prank(address(arena));
        vm.expectRevert(MockSeedSource.WrongFee.selector);
        mock.requestSeed{value: 1}();
        mock.setFee(0.02 ether);
        assertEq(mock.fee(), 0.02 ether);
    }

    function test_constructorsRejectZeroAddresses() public {
        vm.expectRevert(EntropySeedSource.ZeroAddress.selector);
        new EntropySeedSource(address(0), address(entropy), provider, 1);
        vm.expectRevert(EntropySeedSource.ZeroAddress.selector);
        new EntropySeedSource(address(arena), address(0), provider, 1);
        vm.expectRevert(EntropySeedSource.ZeroAddress.selector);
        new EntropySeedSource(address(arena), address(entropy), address(0), 1);
        vm.expectRevert(MockSeedSource.ZeroAddress.selector);
        new MockSeedSource(address(0), 1);
    }
}
