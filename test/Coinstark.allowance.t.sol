// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Coinstark} from "../src/Coinstark.sol";

/// @dev Complements the basic ERC-20 tests with authorization boundaries and
/// sequences in which balances, approval amounts and callers change independently.
/// forge-config: default.fuzz.runs = 1000
contract CoinstarkAllowanceTest is Test {
    uint256 private constant SUPPLY = 1_000_000_000 * 10 ** 18;
    Coinstark private token;
    address private holder;
    address private otherHolder;
    address private spender;
    address private otherSpender;
    address private recipient;

    function setUp() public {
        token = new Coinstark();
        holder = makeAddr("allowance holder");
        otherHolder = makeAddr("other allowance holder");
        spender = makeAddr("approved spender");
        otherSpender = makeAddr("other spender");
        recipient = makeAddr("allowance recipient");
    }

    function test_maximumTransferFailsEvenWithInfiniteApproval() public {
        uint256 maximum = type(uint256).max;
        bytes memory error =
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, address(this), SUPPLY, maximum);
        vm.expectRevert(error);
        token.transfer(recipient, maximum);

        assertTrue(token.approve(spender, maximum));
        vm.expectRevert(error);
        vm.prank(spender);
        token.transferFrom(address(this), recipient, maximum);

        assertEq(token.allowance(address(this), spender), maximum);
        assertEq(token.balanceOf(address(this)), SUPPLY);
        assertEq(token.balanceOf(recipient), 0);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function test_maximumMinusOneAllowanceIsFinite() public {
        uint256 maximum = type(uint256).max;
        assertTrue(token.approve(spender, maximum - 1));
        vm.prank(spender);
        assertTrue(token.transferFrom(address(this), recipient, 1));
        assertEq(token.allowance(address(this), spender), maximum - 2);

        assertTrue(token.approve(spender, maximum));
        vm.prank(spender);
        assertTrue(token.transferFrom(address(this), recipient, 1));
        assertEq(token.allowance(address(this), spender), maximum);

        // Replacing an infinite approval must restore ordinary finite accounting.
        assertTrue(token.approve(spender, 1));
        vm.prank(spender);
        assertTrue(token.transferFrom(address(this), recipient, 1));
        assertEq(token.allowance(address(this), spender), 0);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, spender, 0, 1));
        vm.prank(spender);
        token.transferFrom(address(this), recipient, 1);
        assertEq(token.balanceOf(recipient), 3);
        assertEq(token.balanceOf(address(this)), SUPPLY - 3);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function test_entireSupplyCanMakeADelegatedRoundTrip() public {
        assertTrue(token.approve(spender, SUPPLY));
        vm.prank(spender);
        assertTrue(token.transferFrom(address(this), holder, SUPPLY));
        assertEq(token.balanceOf(address(this)), 0);
        assertEq(token.balanceOf(holder), SUPPLY);
        assertEq(token.allowance(address(this), spender), 0);

        vm.prank(holder);
        assertTrue(token.approve(spender, SUPPLY));
        vm.prank(spender);
        assertTrue(token.transferFrom(holder, address(this), SUPPLY));
        assertEq(token.balanceOf(address(this)), SUPPLY);
        assertEq(token.balanceOf(holder), 0);
        assertEq(token.allowance(holder, spender), 0);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function test_approvalDoesNotFollowTokensToANewOwner() public {
        assertTrue(token.approve(spender, type(uint256).max));
        assertTrue(token.transfer(holder, SUPPLY));

        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, spender, 0, 1));
        vm.prank(spender);
        token.transferFrom(holder, recipient, 1);
        assertEq(token.allowance(address(this), spender), type(uint256).max);
        assertEq(token.allowance(holder, spender), 0);
        assertEq(token.balanceOf(holder), SUPPLY);
        assertEq(token.balanceOf(recipient), 0);

        vm.prank(holder);
        assertTrue(token.approve(spender, 1));
        vm.prank(spender);
        assertTrue(token.transferFrom(holder, recipient, 1));
        assertEq(token.allowance(holder, spender), 0);
        assertEq(token.balanceOf(holder), SUPPLY - 1);
        assertEq(token.balanceOf(recipient), 1);
    }

    function test_approvalCannotBeBorrowedFromAnotherOwnerOrSpender() public {
        assertTrue(token.transfer(holder, 10));
        assertTrue(token.transfer(otherHolder, 10));
        vm.prank(holder);
        assertTrue(token.approve(spender, 10));

        // Even a call originating from the holder is unauthorized when its
        // immediate caller is a different, unapproved spender.
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, otherSpender, 0, 1));
        vm.prank(otherSpender, holder);
        token.transferFrom(holder, recipient, 1);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, spender, 0, 1));
        vm.prank(spender);
        token.transferFrom(otherHolder, recipient, 1);

        assertEq(token.balanceOf(holder), 10);
        assertEq(token.balanceOf(otherHolder), 10);
        assertEq(token.balanceOf(recipient), 0);
        assertEq(token.allowance(holder, spender), 10);
        assertEq(token.allowance(holder, otherSpender), 0);
        assertEq(token.allowance(otherHolder, spender), 0);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function test_zeroAddressIsRejectedAtZeroOneAndMaximum() public {
        uint256[3] memory amounts = [uint256(0), uint256(1), type(uint256).max];
        assertTrue(token.approve(spender, type(uint256).max));
        for (uint256 i; i < amounts.length; ++i) {
            vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidSpender.selector, address(0)));
            token.approve(address(0), amounts[i]);
            vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
            token.transfer(address(0), amounts[i]);
            vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
            vm.prank(spender);
            token.transferFrom(address(this), address(0), amounts[i]);
        }
        assertEq(token.balanceOf(address(this)), SUPPLY);
        assertEq(token.balanceOf(address(0)), 0);
        assertEq(token.allowance(address(this), spender), type(uint256).max);
        assertEq(token.allowance(address(this), address(0)), 0);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function test_zeroTransferFromZeroOwnerCannotMint() public {
        // A zero-value transferFrom needs no allowance, but a zero owner is
        // still invalid. Do not depend on which internal guard rejects it.
        vm.expectRevert();
        vm.prank(spender);
        token.transferFrom(address(0), recipient, 0);
        assertEq(token.balanceOf(address(0)), 0);
        assertEq(token.balanceOf(recipient), 0);
        assertEq(token.balanceOf(address(this)), SUPPLY);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function testFuzz_approvalReplacementOnlyChangesOnePair(uint256 first, uint256 second, uint256 replacement) public {
        vm.prank(holder);
        assertTrue(token.approve(spender, first));
        vm.prank(holder);
        assertTrue(token.approve(otherSpender, second));
        vm.prank(otherHolder);
        assertTrue(token.approve(spender, second));
        vm.prank(holder);
        assertTrue(token.approve(spender, replacement));

        assertEq(token.allowance(holder, spender), replacement);
        assertEq(token.allowance(holder, otherSpender), second);
        assertEq(token.allowance(otherHolder, spender), second);
        assertEq(token.allowance(spender, holder), 0);
        assertEq(token.balanceOf(address(this)), SUPPLY);
        assertEq(token.balanceOf(holder), 0);
        assertEq(token.balanceOf(otherHolder), 0);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function testFuzz_replacementApprovalBoundsSubsequentSpending(
        uint256 rawFirst,
        uint256 rawSpent,
        uint256 rawReplacement
    ) public {
        uint256 first = bound(rawFirst, 1, SUPPLY - 1);
        uint256 spent = bound(rawSpent, 1, first);
        uint256 replacement = bound(rawReplacement, 0, SUPPLY - spent - 1);
        assertTrue(token.approve(spender, first));
        vm.prank(spender);
        assertTrue(token.transferFrom(address(this), recipient, spent));
        assertEq(token.allowance(address(this), spender), first - spent);
        assertTrue(token.approve(spender, replacement));

        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, spender, replacement, replacement + 1
            )
        );
        vm.prank(spender);
        token.transferFrom(address(this), recipient, replacement + 1);
        assertEq(token.allowance(address(this), spender), replacement);
        assertEq(token.balanceOf(recipient), spent);

        vm.prank(spender);
        assertTrue(token.transferFrom(address(this), recipient, replacement));
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, spender, 0, 1));
        vm.prank(spender);
        token.transferFrom(address(this), recipient, 1);
        assertEq(token.allowance(address(this), spender), 0);
        assertEq(token.balanceOf(recipient), spent + replacement);
        assertEq(token.balanceOf(address(this)), SUPPLY - spent - replacement);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function testFuzz_balanceFailurePreservesAnySufficientAllowance(
        uint256 rawBalance,
        uint256 rawSpend,
        uint256 rawAllowance
    ) public {
        uint256 balance = bound(rawBalance, 0, SUPPLY);
        uint256 spend = bound(rawSpend, balance + 1, type(uint256).max);
        uint256 allowed = bound(rawAllowance, spend, type(uint256).max);
        assertTrue(token.transfer(holder, balance));
        vm.prank(holder);
        assertTrue(token.approve(spender, allowed));

        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, holder, balance, spend));
        vm.prank(spender);
        token.transferFrom(holder, recipient, spend);
        assertEq(token.allowance(holder, spender), allowed);
        assertEq(token.balanceOf(holder), balance);
        assertEq(token.balanceOf(recipient), 0);
        assertEq(token.balanceOf(address(this)), SUPPLY - balance);
        assertEq(token.totalSupply(), SUPPLY);
    }

    function testFuzz_splitDelegatedTransfersMatchOneTransfer(uint256 rawTotal, uint256 rawPart, uint256 rawAllowance)
        public
    {
        uint256 total = bound(rawTotal, 0, SUPPLY);
        uint256 part = bound(rawPart, 0, total);
        uint256 allowed = bound(rawAllowance, total, type(uint256).max);
        Coinstark splitToken = new Coinstark();
        assertTrue(token.approve(spender, allowed));
        assertTrue(splitToken.approve(spender, allowed));

        vm.startPrank(spender);
        assertTrue(token.transferFrom(address(this), recipient, total));
        assertTrue(splitToken.transferFrom(address(this), recipient, part));
        assertTrue(splitToken.transferFrom(address(this), recipient, total - part));
        vm.stopPrank();

        assertEq(splitToken.balanceOf(recipient), token.balanceOf(recipient));
        assertEq(splitToken.balanceOf(address(this)), token.balanceOf(address(this)));
        assertEq(splitToken.allowance(address(this), spender), token.allowance(address(this), spender));
        assertEq(token.balanceOf(recipient), total);
        assertEq(token.balanceOf(address(this)), SUPPLY - total);
        assertEq(token.allowance(address(this), spender), allowed == type(uint256).max ? allowed : allowed - total);
        assertEq(token.totalSupply(), SUPPLY);
        assertEq(splitToken.totalSupply(), SUPPLY);
    }
}
