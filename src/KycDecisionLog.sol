
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract KycDecisionLog {
    address public immutable owner;

    enum Decision {
        None,
        Approved,
        Rejected,
        Revoked
    }

    struct DecisionRecord {
        Decision decision;
        string reason;
        address admin;
        uint64 updatedAt;
    }

    mapping(address => DecisionRecord) private records;

    error Unauthorized();
    error InvalidWallet();
    error InvalidReason();
    error ReasonTooLong();

    event KycDecisionRecorded(
        address indexed wallet,
        address indexed admin,
        Decision decision,
        string reason,
        uint256 timestamp
    );

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address admin) {
        if (admin == address(0)) revert InvalidWallet();
        owner = admin;
    }

    function recordRejection(
        address wallet,
        string calldata reason
    ) external onlyOwner {
        _record(wallet, Decision.Rejected, reason);
    }

    function recordRevocation(
        address wallet,
        string calldata reason
    ) external onlyOwner {
        _record(wallet, Decision.Revoked, reason);
    }

    function recordApproval(address wallet) external onlyOwner {
        if (wallet == address(0)) revert InvalidWallet();

        records[wallet] = DecisionRecord({
            decision: Decision.Approved,
            reason: "",
            admin: msg.sender,
            updatedAt: uint64(block.timestamp)
        });

        emit KycDecisionRecorded(
            wallet,
            msg.sender,
            Decision.Approved,
            "",
            block.timestamp
        );
    }

    function getRecord(
        address wallet
    )
        external
        view
        returns (
            Decision decision,
            string memory reason,
            address admin,
            uint64 updatedAt
        )
    {
        DecisionRecord storage record = records[wallet];

        return (
            record.decision,
            record.reason,
            record.admin,
            record.updatedAt
        );
    }

    function _record(
        address wallet,
        Decision decision,
        string calldata reason
    ) internal {
        if (wallet == address(0)) revert InvalidWallet();

        bytes calldata reasonBytes = bytes(reason);

        if (reasonBytes.length == 0) revert InvalidReason();
        if (reasonBytes.length > 500) revert ReasonTooLong();

        records[wallet] = DecisionRecord({
            decision: decision,
            reason: reason,
            admin: msg.sender,
            updatedAt: uint64(block.timestamp)
        });

        emit KycDecisionRecorded(
            wallet,
            msg.sender,
            decision,
            reason,
            block.timestamp
        );
    }
}
