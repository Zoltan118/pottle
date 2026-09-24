// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Pottle, IUSDC} from "../src/Pottle.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract PottleTest is Test {
    MockUSDC usdc;
    Pottle pottle;

    address deniz = makeAddr("deniz"); // organiser
    address mert = makeAddr("mert");
    address ayla = makeAddr("ayla");
    address relayer = makeAddr("relayer");
    uint256 ecePk = 0xE0CE;
    address ece;

    uint64 deadline;

    function setUp() public {
        vm.warp(1_790_000_000);
        usdc = new MockUSDC();
        pottle = new Pottle(IUSDC(address(usdc)));
        ece = vm.addr(ecePk);
        deadline = uint64(block.timestamp + 3 days);
        for (uint256 i; i < 3; ++i) {
            address a = [mert, ayla, ece][i];
            usdc.mint(a, 1_000e6);
            vm.prank(a);
            usdc.approve(address(pottle), type(uint256).max);
        }
    }

    function _pot(uint128 goal) internal returns (uint256 id) {
        vm.prank(deniz);
        id = pottle.create(goal, deadline, "sarah's gift", "deniz");
    }

    function _chip(address who, uint256 id, uint128 amt, string memory name) internal {
        vm.prank(who);
        pottle.chipIn(id, amt, name);
    }

    function _sign(uint256 pk, uint256 id, uint128 amt, string memory name, bytes32 salt, uint256 validBefore)
        internal view returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 nonce = pottle.authNonce(id, name, salt);
        bytes32 structHash = keccak256(abi.encode(
            usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), vm.addr(pk), address(pottle), uint256(amt), uint256(0), validBefore, nonce
        ));
        (v, r, s) = vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash)));
    }

    // ---------------------------------------------------------------- create

    function test_create() public {
        uint256 id = _pot(200e6);
        (Pottle.Pot memory p,,,,) = pottle.getPot(id);
        assertEq(p.organiser, deniz); assertEq(p.deadline, deadline); assertFalse(p.released);
        assertEq(p.goal, 200e6); assertEq(p.raised, 0); assertEq(p.title, "sarah's gift"); assertEq(p.organiserName, "deniz");
        assertEq(uint256(pottle.statusOf(id)), uint256(Pottle.Status.Open));
    }

    function test_create_rejectsBadInput() public {
        vm.expectRevert(Pottle.BadGoal.selector);
        pottle.create(0, deadline, "x", "d");
        vm.expectRevert(Pottle.BadGoal.selector);
        pottle.create(10_000e6 + 1, deadline, "x", "d");
        vm.expectRevert(Pottle.BadDeadline.selector);
        pottle.create(1e6, uint64(block.timestamp), "x", "d");
        vm.expectRevert(Pottle.BadDeadline.selector);
        pottle.create(1e6, uint64(block.timestamp + 91 days), "x", "d");
        vm.expectRevert(Pottle.BadText.selector);
        pottle.create(1e6, deadline, "", "d");
        vm.expectRevert(Pottle.BadText.selector);
        pottle.create(1e6, deadline, "x", "");
    }

    // ---------------------------------------------------------------- happy path

    function test_goalHit_releasesToOrganiser() public {
        uint256 id = _pot(40e6);
        _chip(mert, id, 20e6, "mert");
        _chip(ayla, id, 20e6, "ayla");
        assertEq(uint256(pottle.statusOf(id)), uint256(Pottle.Status.Reached));

        vm.prank(relayer); // anyone can trigger the payout
        pottle.release(id);
        assertEq(usdc.balanceOf(deniz), 40e6);
        assertEq(usdc.balanceOf(address(pottle)), 0);
        assertEq(uint256(pottle.statusOf(id)), uint256(Pottle.Status.Released));
    }

    function test_overfunding_goesToOrganiser() public {
        uint256 id = _pot(30e6);
        _chip(mert, id, 20e6, "mert");
        _chip(ayla, id, 20e6, "ayla");
        pottle.release(id);
        assertEq(usdc.balanceOf(deniz), 40e6);
    }

    function test_releaseAfterDeadline_ifGoalWasHit() public {
        uint256 id = _pot(20e6);
        _chip(mert, id, 20e6, "mert");
        vm.warp(deadline + 10 days);
        pottle.release(id);
        assertEq(usdc.balanceOf(deniz), 20e6);
    }

    // ---------------------------------------------------------------- nobody takes it early

    function test_cannotReleaseBelowGoal() public {
        uint256 id = _pot(200e6);
        _chip(mert, id, 20e6, "mert");
        vm.prank(deniz);
        vm.expectRevert(Pottle.GoalNotReached.selector);
        pottle.release(id);
    }

    function test_cannotReleaseTwice() public {
        uint256 id = _pot(20e6);
        _chip(mert, id, 20e6, "mert");
        pottle.release(id);
        vm.expectRevert(Pottle.PotClosed.selector);
        pottle.release(id);
    }

    function test_cannotChipAfterDeadlineOrRelease() public {
        uint256 id = _pot(20e6);
        _chip(mert, id, 20e6, "mert");
        pottle.release(id);
        vm.prank(ayla);
        vm.expectRevert(Pottle.PotClosed.selector);
        pottle.chipIn(id, 5e6, "ayla");

        uint256 id2 = _pot(200e6);
        vm.warp(deadline);
        vm.prank(ayla);
        vm.expectRevert(Pottle.PotClosed.selector);
        pottle.chipIn(id2, 5e6, "ayla");
    }

    function test_chipIn_rejectsDustAndBadNames() public {
        uint256 id = _pot(200e6);
        vm.startPrank(mert);
        vm.expectRevert(Pottle.TooSmall.selector);
        pottle.chipIn(id, 1e4 - 1, "mert");
        vm.expectRevert(Pottle.BadText.selector);
        pottle.chipIn(id, 1e6, "");
        vm.expectRevert(Pottle.BadText.selector);
        pottle.chipIn(id, 1e6, "a name that is far too long");
        vm.expectRevert(Pottle.NoSuchPot.selector);
        pottle.chipIn(99, 1e6, "mert");
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- refunds

    function test_missedGoal_everyoneClaimsBack() public {
        uint256 id = _pot(200e6);
        _chip(mert, id, 20e6, "mert");
        _chip(ayla, id, 50e6, "ayla");

        vm.prank(mert);
        vm.expectRevert(Pottle.NotRefunding.selector); // not before the deadline
        pottle.claimRefund(id);

        vm.warp(deadline);
        assertEq(uint256(pottle.statusOf(id)), uint256(Pottle.Status.Refunding));
        vm.prank(mert);
        pottle.claimRefund(id);
        assertEq(usdc.balanceOf(mert), 1_000e6);

        vm.prank(mert);
        vm.expectRevert(Pottle.NothingToRefund.selector);
        pottle.claimRefund(id);
    }

    function test_refundAll_isAutomaticForEveryone() public {
        uint256 id = _pot(200e6);
        _chip(mert, id, 20e6, "mert");
        _chip(ayla, id, 50e6, "ayla");
        _chip(mert, id, 10e6, "mert");
        vm.warp(deadline);

        vm.prank(relayer);
        pottle.refundAll(id);

        assertEq(usdc.balanceOf(mert), 1_000e6);
        assertEq(usdc.balanceOf(ayla), 1_000e6);
        assertEq(usdc.balanceOf(address(pottle)), 0);
        (Pottle.Pot memory p,,,,) = pottle.getPot(id);
        assertEq(p.raised, 0);
    }

    function test_refundAll_skipsABlockedAddressWithoutLosingTheirMoney() public {
        uint256 id = _pot(200e6);
        _chip(mert, id, 20e6, "mert");
        _chip(ayla, id, 50e6, "ayla");
        vm.warp(deadline);
        usdc.setBlocked(mert, true);

        pottle.refundAll(id);

        assertEq(usdc.balanceOf(ayla), 1_000e6);
        assertEq(pottle.chipped(id, mert), 20e6); // still owed, claimable later
        assertEq(usdc.balanceOf(address(pottle)), 20e6);
    }

    function test_noRefundsOnceGoalHit() public {
        uint256 id = _pot(20e6);
        _chip(mert, id, 20e6, "mert");
        vm.warp(deadline);
        vm.prank(mert);
        vm.expectRevert(Pottle.NotRefunding.selector);
        pottle.claimRefund(id);
    }

    // ---------------------------------------------------------------- one-signature chip in

    function test_chipInWithAuthorization_relayedAndSponsored() public {
        uint256 id = _pot(200e6);
        bytes32 salt = keccak256("1");
        uint256 validBefore = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(ecePk, id, 20e6, "ece", salt, validBefore);

        vm.prank(relayer); // someone else pays the fee
        pottle.chipInWithAuthorization(id, ece, 20e6, "ece", 0, validBefore, salt, v, r, s);

        assertEq(pottle.chipped(id, ece), 20e6);
        assertEq(usdc.balanceOf(ece), 980e6);
    }

    function test_chipInWithAuthorization_cannotBeRedirectedOrRenamed() public {
        uint256 id = _pot(200e6);
        uint256 other = _pot(200e6);
        bytes32 salt = keccak256("1");
        uint256 validBefore = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _sign(ecePk, id, 20e6, "ece", salt, validBefore);

        vm.expectRevert(bytes("bad signature"));
        pottle.chipInWithAuthorization(other, ece, 20e6, "ece", 0, validBefore, salt, v, r, s);
        vm.expectRevert(bytes("bad signature"));
        pottle.chipInWithAuthorization(id, ece, 20e6, "not ece", 0, validBefore, salt, v, r, s);
        vm.expectRevert(bytes("bad signature"));
        pottle.chipInWithAuthorization(id, ece, 50e6, "ece", 0, validBefore, salt, v, r, s);

        pottle.chipInWithAuthorization(id, ece, 20e6, "ece", 0, validBefore, salt, v, r, s);
        vm.expectRevert(bytes("used"));
        pottle.chipInWithAuthorization(id, ece, 20e6, "ece", 0, validBefore, salt, v, r, s);
    }

    // ---------------------------------------------------------------- invariant-ish fuzz

    function testFuzz_moneyIsConserved(uint128 a, uint128 b, bool hit) public {
        a = uint128(bound(a, 1e4, 500e6));
        b = uint128(bound(b, 1e4, 500e6));
        uint256 id = _pot(hit ? a + b : a + b + 1);
        _chip(mert, id, a, "mert");
        _chip(ayla, id, b, "ayla");
        if (hit) {
            pottle.release(id);
            assertEq(usdc.balanceOf(deniz), uint256(a) + b);
        } else {
            vm.warp(deadline);
            pottle.refundAll(id);
            assertEq(usdc.balanceOf(mert), 1_000e6);
            assertEq(usdc.balanceOf(ayla), 1_000e6);
        }
        assertEq(usdc.balanceOf(address(pottle)), 0);
    }

    // ---------------------------------------------------------------- page data

    function test_getPot_returnsPeopleNamesAndAmounts() public {
        uint256 id = _pot(200e6);
        _chip(mert, id, 20e6, "mert");
        _chip(ayla, id, 50e6, "ayla");
        _chip(mert, id, 5e6, "mert k"); // chipping again updates the name, not the list
        (Pottle.Pot memory p, Pottle.Status st, address[] memory people, string[] memory names, uint256[] memory amounts) =
            pottle.getPot(id);
        assertEq(p.raised, 75e6);
        assertEq(uint256(st), uint256(Pottle.Status.Open));
        assertEq(people.length, 2);
        assertEq(people[0], mert); assertEq(names[0], "mert k"); assertEq(amounts[0], 25e6);
        assertEq(people[1], ayla); assertEq(names[1], "ayla"); assertEq(amounts[1], 50e6);
    }

    function test_potFull_after100People() public {
        uint256 id = _pot(10_000e6);
        for (uint256 i; i < 100; ++i) {
            address a = address(uint160(0x1000 + i));
            usdc.mint(a, 1e6);
            vm.startPrank(a);
            usdc.approve(address(pottle), 1e6);
            pottle.chipIn(id, 1e6, "x");
            vm.stopPrank();
        }
        vm.prank(mert);
        vm.expectRevert(Pottle.PotFull.selector);
        pottle.chipIn(id, 1e6, "mert");
    }
}
