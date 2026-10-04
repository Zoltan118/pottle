// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Pottle, IFiatToken} from "../src/Pottle.sol";
import {MockUSDC} from "./MockUSDC.sol";

/// drives pottle with random sequences: create, chip in, time passes, release, refund all, claim.
contract Handler is Test {
    Pottle public pottle;
    MockUSDC public usdc;
    MockUSDC public eurc;
    address[4] public actors = [address(0xA11CE), address(0xB0B), address(0xCA7), address(0xD0D)];
    uint256[] public ids;

    constructor(Pottle p, MockUSDC u, MockUSDC e) {
        pottle = p; usdc = u; eurc = e;
        for (uint256 i; i < actors.length; ++i) {
            u.mint(actors[i], 1e15); e.mint(actors[i], 1e15);
            vm.startPrank(actors[i]);
            u.approve(address(p), type(uint256).max);
            e.approve(address(p), type(uint256).max);
            vm.stopPrank();
        }
    }

    function potCount() external view returns (uint256) { return ids.length; }

    function create(uint256 who, uint128 goal, uint64 len, bool euro) external {
        goal = uint128(bound(goal, 1, 100_000)) * 1e4; // whole cents, as the contract requires
        len = uint64(bound(len, 1, 90 days));
        vm.prank(actors[who % 4]);
        ids.push(pottle.create(goal, uint64(block.timestamp) + len, 0, euro ? 1 : 0, "pot", "org"));
    }

    function chip(uint256 who, uint256 pick, uint128 amount) external {
        if (ids.length == 0) return;
        uint256 id = ids[pick % ids.length];
        amount = uint128(bound(amount, 1, 60_000)) * 1e4;
        vm.prank(actors[who % 4]);
        try pottle.chipIn(id, amount, "friend") {} catch {}
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 40 days));
    }

    function release(uint256 pick) external {
        if (ids.length == 0) return;
        try pottle.release(ids[pick % ids.length]) {} catch {}
    }

    function refundAll(uint256 pick) external {
        if (ids.length == 0) return;
        try pottle.refundAll(ids[pick % ids.length]) {} catch {}
    }

    function claim(uint256 who, uint256 pick) external {
        if (ids.length == 0) return;
        vm.prank(actors[who % 4]);
        try pottle.claimRefund(ids[pick % ids.length]) {} catch {}
    }
}

contract PottleInvariantTest is Test {
    Pottle pottle;
    MockUSDC usdc;
    MockUSDC eurc;
    Handler handler;

    function setUp() public {
        vm.warp(1_790_000_000);
        usdc = new MockUSDC("USDC");
        eurc = new MockUSDC("EURC");
        pottle = new Pottle(IFiatToken(address(usdc)), IFiatToken(address(eurc)));
        handler = new Handler(pottle, usdc, eurc);
        targetContract(address(handler));
    }

    /// the contract holds exactly what it still owes, in each currency
    function invariant_holdsExactlyWhatItOwes() public view {
        uint256 owedUsd;
        uint256 owedEur;
        for (uint256 i; i < handler.potCount(); ++i) {
            uint256 id = handler.ids(i);
            (Pottle.Pot memory p,,,,) = pottle.getPot(id);
            if (p.released) continue;
            if (p.currency == 1) owedEur += p.raised; else owedUsd += p.raised;
        }
        assertEq(usdc.balanceOf(address(pottle)), owedUsd);
        assertEq(eurc.balanceOf(address(pottle)), owedEur);
    }

    /// every unpaid pot's total is exactly the sum of what its contributors still have in it
    function invariant_potTotalsMatchContributions() public view {
        for (uint256 i; i < handler.potCount(); ++i) {
            uint256 id = handler.ids(i);
            (Pottle.Pot memory p,, , , uint256[] memory amounts) = pottle.getPot(id);
            if (p.released) continue;
            uint256 sum;
            for (uint256 k; k < amounts.length; ++k) sum += amounts[k];
            assertEq(sum, p.raised);
        }
    }

    /// the beta cap holds: no pot ever takes in more than MAX_POT
    function invariant_noPotAboveTheCap() public view {
        for (uint256 i; i < handler.potCount(); ++i) {
            (Pottle.Pot memory p,,,,) = pottle.getPot(handler.ids(i));
            assertLe(p.raised, pottle.MAX_POT());
        }
    }

    /// P-2: every pot stays on the cent grid, so one below its goal always has room for a last chip-in
    function invariant_openPotsCanAlwaysFinish() public view {
        for (uint256 i; i < handler.potCount(); ++i) {
            (Pottle.Pot memory p,,,,) = pottle.getPot(handler.ids(i));
            assertEq(p.raised % pottle.MIN_CHIP(), 0);
            if (p.raised < p.goal) assertGe(p.goal - p.raised, pottle.MIN_CHIP());
        }
    }

    /// the status never contradicts the refund rule, and a paid-out pot never reopens
    function invariant_statusMatchesRefundable() public view {
        for (uint256 i; i < handler.potCount(); ++i) {
            uint256 id = handler.ids(i);
            Pottle.Status st = pottle.statusOf(id);
            bool r = pottle.refundable(id);
            if (st == Pottle.Status.Reached || st == Pottle.Status.Open || st == Pottle.Status.Released) assertFalse(r);
            if (r) assertTrue(st == Pottle.Status.Refunding || st == Pottle.Status.Refunded);
        }
    }

    /// once refunds start, the organiser never gets paid from that pot
    function invariant_noPayoutAfterRefunds() public view {
        for (uint256 i; i < handler.potCount(); ++i) {
            uint256 id = handler.ids(i);
            (Pottle.Pot memory p,,,,) = pottle.getPot(id);
            if (pottle.refundsStarted(id)) assertFalse(p.released);
        }
    }
}
