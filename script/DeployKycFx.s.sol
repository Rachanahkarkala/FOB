
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {console2} from "forge-std/console2.sol";

import {LiquidityHelpers} from "./base/LiquidityHelpers.sol";
import {AllowlistRegistry} from "../src/AllowlistRegistry.sol";
import {KycGatedFxHook} from "../src/KycGatedFxHook.sol";

contract DeployKycFx is LiquidityHelpers {
    uint24 lpFee = 3000;
    int24 tickSpacing = 60;
    uint160 startingPrice = 2 ** 96;

    uint256 token0Amount = 100e18;
    uint256 token1Amount = 100e18;

    function run() external {
        vm.startBroadcast();

        // 1. Deploy the wallet allowlist.
        AllowlistRegistry registry = new AllowlistRegistry();

        // 2. Approve the deployer for initial testing.
        registry.approveWallet(deployerAddress);

        // 3. Mine a hook address with the required BEFORE_SWAP flag.
        uint160 flags = uint160(Hooks.BEFORE_SWAP_FLAG);

        bytes memory constructorArgs = abi.encode(
            poolManager,
            address(swapRouter),
            address(registry)
        );

        (address predictedHook, bytes32 salt) = HookMiner.find(
            CREATE2_FACTORY,
            flags,
            type(KycGatedFxHook).creationCode,
            constructorArgs
        );

        // 4. Deploy the KYC hook.
        KycGatedFxHook hook = new KycGatedFxHook{salt: salt}(
            poolManager,
            address(swapRouter),
            address(registry)
        );

        require(address(hook) == predictedHook, "Hook address mismatch");

        // 5. Create the KYC-protected pool.
        _createPool(address(hook));

        vm.stopBroadcast();

        console2.log("========== KYC FX DEPLOYMENT ==========");
        console2.log("Registry:", address(registry));
        console2.log("KYC Hook:", address(hook));
        console2.log("Trusted Router:", address(swapRouter));
        console2.log("PoolManager:", address(poolManager));
        console2.log("Initial approved wallet:", deployerAddress);
        console2.log("Token 0:", Currency.unwrap(currency0));
        console2.log("Token 1:", Currency.unwrap(currency1));
    }

    function _createPool(address hookAddress) internal {
        PoolKey memory poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: lpFee,
            tickSpacing: tickSpacing,
            hooks: IHooks(hookAddress)
        });

        bytes memory hookData = new bytes(0);

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

        (bytes memory actions, bytes[] memory mintParams) =
            _mintLiquidityParams(
                poolKey,
                tickLower,
                tickUpper,
                liquidity,
                token0Amount + 1,
                token1Amount + 1,
                deployerAddress,
                hookData
            );

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

        tokenApprovals();
        positionManager.multicall(params);
    }
}
