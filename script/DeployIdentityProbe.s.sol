
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {console2} from "forge-std/console2.sol";

import {LiquidityHelpers} from "./base/LiquidityHelpers.sol";

contract DeployIdentityProbePool is LiquidityHelpers {

    address constant IDENTITY_PROBE_HOOK =
        0x477125D8f173f7fb6D09DEeF830B05EE5C4e0080;

    uint24 lpFee = 3000;
    int24 tickSpacing = 60;
    uint160 startingPrice = 2 ** 96;

    uint256 token0Amount = 100e18;
    uint256 token1Amount = 100e18;

    function run() external {
        vm.startBroadcast();

        tokenApprovals();
        _createPool();

        vm.stopBroadcast();

        console2.log("Identity Probe Pool created");
        console2.log("Identity Probe Hook:", IDENTITY_PROBE_HOOK);
        console2.log("Token 0:", Currency.unwrap(currency0));
        console2.log("Token 1:", Currency.unwrap(currency1));
    }

    function _createPool() internal {
        PoolKey memory poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: lpFee,
            tickSpacing: tickSpacing,
            hooks: IHooks(IDENTITY_PROBE_HOOK)
        });

        bytes memory hookData = new bytes(0);

        (bytes memory actions, bytes[] memory mintParams) =
            _buildMintParams(poolKey, hookData);

        bytes[] memory params = new bytes[](2);

        params[0] = abi.encodeWithSelector(
            positionManager.initializePool.selector,
            poolKey,
            startingPrice,
            hookData
        );

        params[1] = abi.encodeWithSelector(
            positionManager.modifyLiquidities.selector,
            abi.encode(actions, mintParams),
            block.timestamp + 3600
        );

        positionManager.multicall(params);
    }

    function _buildMintParams(
        PoolKey memory poolKey,
        bytes memory hookData
    ) internal view returns (bytes memory actions, bytes[] memory mintParams) {

        int24 currentTick = TickMath.getTickAtSqrtPrice(startingPrice);

        int24 tickLower = truncateTickSpacing(
            currentTick - 750 * tickSpacing,
            tickSpacing
        );

        int24 tickUpper = truncateTickSpacing(
            currentTick + 750 * tickSpacing,
            tickSpacing
        );

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            startingPrice,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            token0Amount,
            token1Amount
        );

        return _mintLiquidityParams(
            poolKey,
            tickLower,
            tickUpper,
            liquidity,
            token0Amount + 1,
            token1Amount + 1,
            deployerAddress,
            hookData
        );
    }
}
