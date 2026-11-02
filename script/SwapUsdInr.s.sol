
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

import {BaseScript} from "./base/BaseScript.sol";

contract SwapUsdInr is BaseScript {
    address constant USD_INR_HOOK =
        0x2F4E4cf3A5278ae09719aDEb28F9a22BA7bdd080;

    address constant TRADER =
        0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    function run() external {
        PoolKey memory poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(USD_INR_HOOK)
        });

        bytes memory hookData = new bytes(0);

        vm.startBroadcast();

        // Approve the router to spend both mock tokens.
        token0.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(swapRouter), type(uint256).max);

        // Swap 1 USD (TKB) for INR (TKA).
        swapRouter.swapExactTokensForTokens({
            amountIn: 1e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: hookData,
            receiver: TRADER,
            deadline: block.timestamp + 3600
        });

        vm.stopBroadcast();
    }
}
