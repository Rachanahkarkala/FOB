
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract AllowlistRegistry {
    address public owner;

    mapping(address => bool) private approvedWallets;

    error Unauthorized();
    error InvalidAddress();
    error AlreadyApproved();
    error NotApproved();

    event WalletApproved(address indexed wallet, address indexed admin);
    event WalletRevoked(address indexed wallet, address indexed admin);
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function approveWallet(address wallet) external onlyOwner {
        if (wallet == address(0)) revert InvalidAddress();
        if (approvedWallets[wallet]) revert AlreadyApproved();

        approvedWallets[wallet] = true;

        emit WalletApproved(wallet, msg.sender);
    }

    function revokeWallet(address wallet) external onlyOwner {
        if (wallet == address(0)) revert InvalidAddress();
        if (!approvedWallets[wallet]) revert NotApproved();

        approvedWallets[wallet] = false;

        emit WalletRevoked(wallet, msg.sender);
    }

    function isApproved(address wallet) external view returns (bool) {
        return approvedWallets[wallet];
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();

        address previousOwner = owner;
        owner = newOwner;

        emit OwnershipTransferred(previousOwner, newOwner);
    }
}
