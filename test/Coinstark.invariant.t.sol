// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Coinstark} from "../src/Coinstark.sol";

/// @dev Test-only actors and an independent ledger for sequences of ERC-20 operations.
contract CoinstarkHandler is Test {
    Coinstark public immutable token;
    address[4] public actors;
    mapping(address actor => uint256 balance) public expectedBalance;
    mapping(address owner => mapping(address spender => uint256 amount)) public expectedAllowance;

    constructor(Coinstark token_) {
        token = token_;
        actors[0] = makeAddr("invariant alice");
        actors[1] = makeAddr("invariant bob");
        actors[2] = makeAddr("invariant carol");
        actors[3] = makeAddr("invariant dave");
        // Fund every actor through real transfers in setUp so early sequences can move value.
        for (uint256 i; i < actors.length; ++i) {
            expectedBalance[actors[i]] = 250_000_000 * 10 ** 18;
        }
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 rawAmount) public {
        address from = actors[fromSeed % actors.length];
        address to = actors[toSeed % actors.length];
        uint256 amount = bound(rawAmount, 0, expectedBalance[from]);

        vm.prank(from);
        assertTrue(token.transfer(to, amount));
        expectedBalance[from] -= amount;
        expectedBalance[to] += amount;
    }

    function approve(uint256 ownerSeed, uint256 spenderSeed, uint256 amount) public {
        address owner = actors[ownerSeed % actors.length];
        address spender = actors[spenderSeed % actors.length];

        vm.prank(owner);
        assertTrue(token.approve(spender, amount));
        expectedAllowance[owner][spender] = amount;
    }

    function transferFrom(uint256 ownerSeed, uint256 spenderSeed, uint256 toSeed, uint256 rawAmount) external {
        address owner = actors[ownerSeed % actors.length];
        address spender = actors[spenderSeed % actors.length];
        address to = actors[toSeed % actors.length];
        uint256 allowed = expectedAllowance[owner][spender];
        uint256 maximum = expectedBalance[owner] < allowed ? expectedBalance[owner] : allowed;
        uint256 amount = bound(rawAmount, 0, maximum);

        vm.prank(spender);
        assertTrue(token.transferFrom(owner, to, amount));
        expectedBalance[owner] -= amount;
        expectedBalance[to] += amount;
        if (allowed != type(uint256).max) {
            expectedAllowance[owner][spender] -= amount;
        }
    }

    /// @dev Reach revocation, dust, finite and infinite approval boundaries repeatedly.
    function approveAtBoundary(uint256 ownerSeed, uint256 spenderSeed, uint8 choice) external {
        uint256[5] memory amounts = [
            uint256(0),
            uint256(1),
            expectedBalance[actors[ownerSeed % actors.length]],
            type(uint256).max - 1,
            type(uint256).max
        ];
        approve(ownerSeed, spenderSeed, amounts[choice % amounts.length]);
    }

    function transferFullBalance(uint256 fromSeed, uint256 toSeed) external {
        transfer(fromSeed, toSeed, expectedBalance[actors[fromSeed % actors.length]]);
    }

    // Rejected calls leave the independent ledger unchanged. The invariant checks all
    // balances and every owner/spender pair after each call, including unrelated actors.
    function transferAboveBalance(uint256 fromSeed, uint256 toSeed, uint256 rawAmount) external {
        address from = actors[fromSeed % actors.length];
        address to = actors[toSeed % actors.length];
        uint256 balance = expectedBalance[from];
        uint256 amount = bound(rawAmount, balance + 1, type(uint256).max);

        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, from, balance, amount));
        vm.prank(from);
        token.transfer(to, amount);
    }

    function transferFromAboveBalance(
        uint256 ownerSeed,
        uint256 spenderSeed,
        uint256 toSeed,
        uint256 rawAmount,
        bool infinite
    ) external {
        address owner = actors[ownerSeed % actors.length];
        address spender = actors[spenderSeed % actors.length];
        address to = actors[toSeed % actors.length];
        uint256 balance = expectedBalance[owner];
        uint256 amount = bound(rawAmount, balance + 1, type(uint256).max - 1);
        // The allowance check must succeed, so this reaches the balance check and
        // verifies rollback of a finite allowance that was already debited.
        approve(ownerSeed, spenderSeed, infinite ? type(uint256).max : amount);

        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, owner, balance, amount));
        vm.prank(spender);
        token.transferFrom(owner, to, amount);
    }

    function transferFromAboveAllowance(uint256 ownerSeed, uint256 spenderSeed, uint256 rawAllowance) external {
        // Pick a funded owner without discarding a fuzz input. At least one exists
        // because the closed actor set owns the fixed, positive supply.
        uint256 ownerIndex = ownerSeed % actors.length;
        for (uint256 i; i < actors.length && expectedBalance[actors[ownerIndex]] == 0; ++i) {
            ownerIndex = (ownerIndex + 1) % actors.length;
        }
        address owner = actors[ownerIndex];
        address spender = actors[spenderSeed % actors.length];
        address to = actors[(ownerIndex + 1) % actors.length];
        uint256 balance = expectedBalance[owner];
        assertGt(balance, 0, "no funded actor remains");
        uint256 allowed = bound(rawAllowance, 0, balance - 1);
        approve(ownerIndex, spenderSeed, allowed);

        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, spender, allowed, allowed + 1)
        );
        vm.prank(spender);
        token.transferFrom(owner, to, allowed + 1);
    }

    function rejectZeroAddress(uint256 ownerSeed, uint256 spenderSeed, uint256 rawAmount, uint8 operation) external {
        address owner = actors[ownerSeed % actors.length];
        address spender = actors[spenderSeed % actors.length];
        uint256 amount = bound(rawAmount, 0, expectedBalance[owner]);

        if (operation % 3 == 0) {
            vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidSpender.selector, address(0)));
            vm.prank(owner);
            token.approve(address(0), rawAmount);
        } else if (operation % 3 == 1) {
            vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
            vm.prank(owner);
            token.transfer(address(0), amount);
        } else {
            approve(ownerSeed, spenderSeed, amount);
            vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
            vm.prank(spender);
            token.transferFrom(owner, address(0), amount);
        }
    }
}

/// forge-config: default.invariant.runs = 256
/// forge-config: default.invariant.depth = 128
/// forge-config: default.invariant.fail-on-revert = true
contract CoinstarkInvariantTest is Test {
    uint256 private constant SUPPLY = 1_000_000_000_000_000_000_000_000_000;
    Coinstark private token;
    CoinstarkHandler private handler;

    function setUp() public {
        token = new Coinstark();
        handler = new CoinstarkHandler(token);
        for (uint256 i; i < 4; ++i) {
            assertTrue(token.transfer(handler.actors(i), SUPPLY / 4));
        }

        bytes4[] memory selectors = new bytes4[](9);
        selectors[0] = CoinstarkHandler.transfer.selector;
        selectors[1] = CoinstarkHandler.approve.selector;
        selectors[2] = CoinstarkHandler.transferFrom.selector;
        selectors[3] = CoinstarkHandler.approveAtBoundary.selector;
        selectors[4] = CoinstarkHandler.transferFullBalance.selector;
        selectors[5] = CoinstarkHandler.transferAboveBalance.selector;
        selectors[6] = CoinstarkHandler.transferFromAboveBalance.selector;
        selectors[7] = CoinstarkHandler.transferFromAboveAllowance.selector;
        selectors[8] = CoinstarkHandler.rejectZeroAddress.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    function invariant_balancesAndAllowancesMatchIndependentLedger() public view {
        uint256 sum;
        for (uint256 i; i < 4; ++i) {
            address actor = handler.actors(i);
            uint256 balance = token.balanceOf(actor);
            assertEq(balance, handler.expectedBalance(actor));
            sum += balance;
            assertEq(token.allowance(actor, address(0)), 0);
            for (uint256 j; j < 4; ++j) {
                address spender = handler.actors(j);
                assertEq(token.allowance(actor, spender), handler.expectedAllowance(actor, spender));
            }
        }
        assertEq(sum, SUPPLY);
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(address(this)), 0);
        assertEq(token.balanceOf(address(token)), 0);
        assertEq(token.balanceOf(address(handler)), 0);
        assertEq(token.balanceOf(address(0)), 0);
    }

    /// @dev After every random sequence, every holder can still move their entire
    /// balance. No freeze, dust, fee or sequence-dependent lock may strand tokens.
    function afterInvariant() public {
        for (uint256 i; i < 4; ++i) {
            handler.transferFullBalance(i, 0);
        }
        invariant_balancesAndAllowancesMatchIndependentLedger();
        assertEq(token.balanceOf(handler.actors(0)), SUPPLY);
    }

    function test_handlerReachesSuccessfulAndRejectedTransitions() public {
        handler.approveAtBoundary(0, 1, 4);
        handler.transferFrom(0, 1, 2, 1);
        assertEq(token.balanceOf(handler.actors(2)), SUPPLY / 4 + 1);
        assertEq(token.allowance(handler.actors(0), handler.actors(1)), type(uint256).max);
        invariant_balancesAndAllowancesMatchIndependentLedger();

        handler.transferAboveBalance(0, 2, type(uint256).max);
        invariant_balancesAndAllowancesMatchIndependentLedger();
        handler.transferFromAboveBalance(0, 1, 2, SUPPLY, false);
        invariant_balancesAndAllowancesMatchIndependentLedger();
        handler.transferFromAboveBalance(0, 1, 2, SUPPLY, true);
        invariant_balancesAndAllowancesMatchIndependentLedger();
        handler.transferFromAboveAllowance(0, 1, 0);
        invariant_balancesAndAllowancesMatchIndependentLedger();
        for (uint8 i; i < 3; ++i) {
            handler.rejectZeroAddress(0, 1, 1, i);
            invariant_balancesAndAllowancesMatchIndependentLedger();
        }
        afterInvariant();
    }
}
