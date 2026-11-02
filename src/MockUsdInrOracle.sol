
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IUsdInrOracle {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

contract MockUsdInrOracle is IUsdInrOracle {
    address public owner;

    uint8 public constant override decimals = 8;

    int256 private currentAnswer;
    uint80 private currentRound;

    uint256 public updatedAt;

    error Unauthorized();
    error InvalidPrice();

    event AnswerUpdated(
        int256 indexed current,
        uint256 indexed roundId,
        uint256 updatedAt
    );

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(int256 initialAnswer) {
        if (initialAnswer <= 0) revert InvalidPrice();

        owner = msg.sender;
        currentRound = 1;
        currentAnswer = initialAnswer;
        updatedAt = block.timestamp;

        emit AnswerUpdated(
            initialAnswer,
            currentRound,
            block.timestamp
        );
    }

    function updateAnswer(int256 newAnswer) external onlyOwner {
        if (newAnswer <= 0) revert InvalidPrice();

        currentRound++;
        currentAnswer = newAnswer;
        updatedAt = block.timestamp;

        emit AnswerUpdated(
            newAnswer,
            currentRound,
            block.timestamp
        );
    }

    function setUpdatedAt(uint256 timestamp) external onlyOwner {
        updatedAt = timestamp;
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt_,
            uint80 answeredInRound
        )
    {
        return (
            currentRound,
            currentAnswer,
            updatedAt,
            updatedAt,
            currentRound
        );
    }
}
