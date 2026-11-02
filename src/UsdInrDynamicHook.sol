
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {
    BaseOverrideFee
} from "@openzeppelin/uniswap-hooks/src/fee/BaseOverrideFee.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";

import {IUsdInrOracle} from "./MockUsdInrOracle.sol";

interface IUsdInrAllowlist {
    function isApproved(address wallet) external view returns (bool);
}

contract UsdInrDynamicHook is BaseOverrideFee {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    address public immutable trustedRouter;
    IUsdInrAllowlist public immutable registry;
    IUsdInrOracle public immutable oracle;

    address public immutable expectedCurrency0;
    address public immutable expectedCurrency1;

    address public owner;

    uint24 public baseFee = 3000;
    uint24 public maxFee = 10000;
    uint24 public feePerDeviationBps = 10;

    uint256 public maxOracleAge = 3600;

    error Unauthorized();
    error UnauthorizedRouter();
    error InvalidWallet();
    error KYCNotApproved(address wallet);
    error InvalidOraclePrice();
    error StaleOraclePrice();
    error InvalidFeeConfiguration();

    event SwapFeeApplied(
        address indexed wallet,
        uint256 poolPriceWad,
        uint256 oraclePriceWad,
        uint256 deviationBps,
        uint24 fee
    );

    event FeeConfigurationUpdated(
        uint24 baseFee,
        uint24 maxFee,
        uint24 feePerDeviationBps
    );

    event OracleAgeUpdated(uint256 maxOracleAge);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(
        IPoolManager manager,
        address router,
        address registryAddress,
        address oracleAddress,
        address currency0Address,
        address currency1Address
    ) BaseOverrideFee(manager) {
        require(router != address(0), "Invalid router");
        require(registryAddress != address(0), "Invalid registry");
        require(oracleAddress != address(0), "Invalid oracle");
        require(currency0Address != address(0), "Invalid currency0");
        require(currency1Address != address(0), "Invalid currency1");
        require(currency0Address < currency1Address, "Currencies not sorted");

        trustedRouter = router;
        registry = IUsdInrAllowlist(registryAddress);
        oracle = IUsdInrOracle(oracleAddress);

        expectedCurrency0 = currency0Address;
        expectedCurrency1 = currency1Address;

        owner = msg.sender;
    }

    function _afterInitialize(
        address sender,
        PoolKey calldata key,
        uint160 sqrtPriceX96,
        int24 tick
    ) internal override returns (bytes4) {
        _validatePool(key);

        return super._afterInitialize(sender, key, sqrtPriceX96, tick);
    }

    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    )
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        _validatePool(key);

        if (sender != trustedRouter) revert UnauthorizedRouter();

        address wallet =
            IUniswapV4Router04(payable(trustedRouter)).msgSender();

        if (wallet == address(0) || wallet == trustedRouter) {
            revert InvalidWallet();
        }

        if (!registry.isApproved(wallet)) {
            revert KYCNotApproved(wallet);
        }

        (uint24 fee, uint256 poolPrice, uint256 oraclePrice, uint256 deviation) =
            _calculateFee(key);

        emit SwapFeeApplied(
            wallet,
            poolPrice,
            oraclePrice,
            deviation,
            fee
        );

        return super._beforeSwap(sender, key, params, hookData);
    }

    function _getFee(
        address,
        PoolKey calldata key,
        SwapParams calldata,
        bytes calldata
    ) internal override returns (uint24) {
        (uint24 fee,,,) = _calculateFee(key);
        return fee;
    }

    function _calculateFee(PoolKey calldata key)
        internal
        view
        returns (
            uint24 fee,
            uint256 poolPriceWad,
            uint256 oraclePriceWad,
            uint256 deviationBps
        )
     
    {
        _validatePool(key);

        PoolId poolId = key.toId();

        (uint160 sqrtPriceX96,,,) =
            poolManager.getSlot0(poolId);

        if (sqrtPriceX96 == 0) revert InvalidPool();

        // Pool price is currency1 / currency0.
        // Both prototype tokens use 18 decimals.
        uint256 priceX96 = FullMath.mulDiv(
            uint256(sqrtPriceX96),
            uint256(sqrtPriceX96),
            1 << 96
        );

        poolPriceWad = FullMath.mulDiv(
            priceX96,
            1e18,
            1 << 96
        );

        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = oracle.latestRoundData();

        if (
            answer <= 0 ||
            updatedAt == 0 ||
            answeredInRound < roundId
        ) {
            revert InvalidOraclePrice();
        }

        if (
            updatedAt > block.timestamp ||
            block.timestamp - updatedAt > maxOracleAge
        ) {
            revert StaleOraclePrice();
        }

        uint8 oracleDecimals = oracle.decimals();

        if (oracleDecimals > 18) {
            oraclePriceWad =
                uint256(answer) / (10 ** (oracleDecimals - 18));
        } else {
            oraclePriceWad =
                uint256(answer) * (10 ** (18 - oracleDecimals));
        }

        if (oraclePriceWad == 0) revert InvalidOraclePrice();

        uint256 difference = poolPriceWad > oraclePriceWad
            ? poolPriceWad - oraclePriceWad
            : oraclePriceWad - poolPriceWad;

        deviationBps = FullMath.mulDiv(
            difference,
            10000,
            oraclePriceWad
        );

        uint256 feeIncrease =
            deviationBps * uint256(feePerDeviationBps);

        uint256 calculatedFee = uint256(baseFee) + feeIncrease;

        if (calculatedFee > maxFee) {
            calculatedFee = maxFee;
        }

        fee = uint24(calculatedFee);
    }
       /// @notice Returns the current dynamic fee and pricing information.
/// @dev Read-only function for the frontend. Does not execute a swap.
function quoteFee(PoolKey calldata key)
    external
    view
    returns (
        uint24 fee,
        uint256 poolPriceWad,
        uint256 oraclePriceWad,
        uint256 deviationBps
    )
{
    return _calculateFee(key);
}

    function _validatePool(PoolKey calldata key) internal view {
        if (
            Currency.unwrap(key.currency0) != expectedCurrency0 ||
            Currency.unwrap(key.currency1) != expectedCurrency1
        ) {
            revert InvalidPool();
        }
    }

    function setFeeConfiguration(
        uint24 newBaseFee,
        uint24 newMaxFee,
        uint24 newFeePerDeviationBps
    ) external onlyOwner {
        if (
            newBaseFee > newMaxFee ||
            newMaxFee > LPFeeLibrary.MAX_LP_FEE ||
            newFeePerDeviationBps == 0
        ) {
            revert InvalidFeeConfiguration();
        }

        baseFee = newBaseFee;
        maxFee = newMaxFee;
        feePerDeviationBps = newFeePerDeviationBps;

        emit FeeConfigurationUpdated(
            newBaseFee,
            newMaxFee,
            newFeePerDeviationBps
        );
    }

    function setMaxOracleAge(uint256 newMaxOracleAge)
        external
        onlyOwner
    {
        require(newMaxOracleAge > 0, "Invalid max age");

        maxOracleAge = newMaxOracleAge;
        emit OracleAgeUpdated(newMaxOracleAge);
    }
}
