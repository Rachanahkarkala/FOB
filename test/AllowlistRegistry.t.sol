
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {AllowlistRegistry} from "../src/AllowlistRegistry.sol";

contract AllowlistRegistryTest is Test {
    AllowlistRegistry registry;

    address admin = address(1);
    address approvedUser = address(2);
    address rejectedUser = address(3);

    function setUp() public {
        vm.prank(admin);
        registry = new AllowlistRegistry();
    }

    function testAdminCanApproveWallet() public {
        vm.prank(admin);
        registry.approveWallet(approvedUser);

        assertTrue(registry.isApproved(approvedUser));
    }

    function testAdminCanRevokeWallet() public {
        vm.startPrank(admin);
        registry.approveWallet(approvedUser);
        registry.revokeWallet(approvedUser);
        vm.stopPrank();

        assertFalse(registry.isApproved(approvedUser));
    }

    function testUnapprovedWalletReturnsFalse() public view {
        assertFalse(registry.isApproved(rejectedUser));
    }

    function testNonAdminCannotApproveWallet() public {
        vm.prank(rejectedUser);
        vm.expectRevert(AllowlistRegistry.Unauthorized.selector);
        registry.approveWallet(approvedUser);
    }

    function testNonAdminCannotRevokeWallet() public {
        vm.prank(admin);
        registry.approveWallet(approvedUser);

        vm.prank(rejectedUser);
        vm.expectRevert(AllowlistRegistry.Unauthorized.selector);
        registry.revokeWallet(approvedUser);
    }

    function testCannotApproveZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(AllowlistRegistry.InvalidAddress.selector);
        registry.approveWallet(address(0));
    }

    function testCannotApproveAlreadyApprovedWallet() public {
        vm.startPrank(admin);
        registry.approveWallet(approvedUser);

        vm.expectRevert(AllowlistRegistry.AlreadyApproved.selector);
        registry.approveWallet(approvedUser);
        vm.stopPrank();
    }

    function testOwnershipTransfer() public {
        address newAdmin = address(4);

        vm.prank(admin);
        registry.transferOwnership(newAdmin);

        assertEq(registry.owner(), newAdmin);
    }
}
