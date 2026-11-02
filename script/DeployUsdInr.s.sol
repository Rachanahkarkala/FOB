
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {console2} from "forge-std/console2.sol";

import {LiquidityHelpers} from "./base/LiquidityHelpers.sol";
import {AllowlistRegistry} from "../src/AllowlistRegistry.sol";
import {UsdInrDynamicHook} from "../src/UsdInrDynamicHook.sol";

contract DeployUsdInr is LiquidityHelpers {
    // Reuse existing deployed contracts.
    address constant REGISTRY =
        0x7a2088a1bFc9d81c55368AE168C2C02570cB814F;

    address constant ORACLE =
        0x998abeb3E57409262aE5b751f60747921B33613E;

    // Already approved LP wallet: Anvil Account #0.
    address constant LP_RECIPIENT =
        0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    int24 constant TICK_SPACING = 60;

    uint256 constant TOKEN0_AMOUNT = 100e18;
    uint256 constant TOKEN1_AMOUNT = 100e18;

    function run() external {
        require(block.chainid == 31337, "Local Anvil only");

        vm.startBroadcast();

        // 1. Reuse the existing KYC registry.
        AllowlistRegistry registry = AllowlistRegistry(REGISTRY);

        require(
            registry.isApproved(LP_RECIPIENT),
            "LP wallet is not KYC approved"
        );

        // 2. Reuse the existing oracle.
        // Its current reference price is ₹84 per USD.
        require(ORACLE.code.length > 0, "Oracle not deployed");

        // 3. Mine an address with the required hook permissions.
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_INITIALIZE_FLAG
        );

        bytes memory constructorArgs = abi.encode(
            poolManager,
            address(swapRouter),
            address(registry),
            ORACLE,
            Currency.unwrap(currency0),
            Currency.unwrap(currency1)
        );

        (address predictedHook, bytes32 salt) = HookMiner.find(
            CREATE2_FACTORY,
            flags,
            type(UsdInrDynamicHook).creationCode,
            constructorArgs
        );

        // 4. Deploy the updated hook containing quoteFee().
        UsdInrDynamicHook hook =
            new UsdInrDynamicHook{salt: salt}(
                poolManager,
                address(swapRouter),
                address(registry),
                ORACLE,
                Currency.unwrap(currency0),
                Currency.unwrap(currency1)
            );

        require(
            address(hook) == predictedHook,
            "Hook address mismatch"
        );

        // 5. Create a fresh USD/INR pool at ₹84 per USD.
        _createPool(address(hook));

        vm.stopBroadcast();

        console2.log("========== UPDATED USD/INR DEPLOYMENT ==========");
        console2.log("Registry:", address(registry));
        console2.log("Existing Oracle:", ORACLE);
        console2.log("Updated Dynamic KYC Hook:", address(hook));
        console2.log("Trusted Router:", address(swapRouter));
        console2.log("PoolManager:", address(poolManager));
        console2.log("LP recipient:", LP_RECIPIENT);
        console2.log("Currency 0 (USD/TKB):", Currency.unwrap(currency0));
        console2.log("Currency 1 (INR/TKA):", Currency.unwrap(currency1));
        console2.log("Initial pool price: 84 INR per USD");
        console2.log("Pool fee mode: Dynamic");
        console2.log("Frontend fee quoting: Enabled");
    }

    function _createPool(address hookAddress) internal {
        PoolKey memory poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(hookAddress)
        });

        bytes memory hookData = new bytes(0);

        // Pool price = currency1 / currency0 = ₹84 per USD.
        uint160 startingPrice = uint160(
            _sqrt(uint256(84) << 192)
        );

        int24 currentTick =
            TickMath.getTickAtSqrtPrice(startingPrice);

        int24 tickLower = truncateTickSpacing(
            currentTick - 750 * TICK_SPACING,
            TICK_SPACING
        );

        int24 tickUpper = truncateTickSpacing(
            currentTick + 750 * TICK_SPACING,
            TICK_SPACING
        );

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            startingPrice,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            TOKEN0_AMOUNT,
            TOKEN1_AMOUNT
        );

        require(liquidity > 0, "Liquidity is zero");

        (bytes memory actions, bytes[] memory mintParams) =
            _mintLiquidityParams(
                poolKey,
                tickLower,
                tickUpper,
                liquidity,
                TOKEN0_AMOUNT + 1,
                TOKEN1_AMOUNT + 1,
                LP_RECIPIENT,
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

    // Integer square root using the Babylonian method.
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;

        uint256 z = (x + 1) / 2;
        y = x;

        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}
