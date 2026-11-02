
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

import {BaseScript} from "./base/BaseScript.sol";

contract SwapUnapprovedUsdInr is BaseScript {
    address constant USD_INR_HOOK =
        0x2F4E4cf3A5278ae09719aDEb28F9a22BA7bdd080;

    address constant UNAPPROVED_WALLET =
        0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    function run() external {
        PoolKey memory poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(USD_INR_HOOK)
        });

        bytes memory hookData = new bytes(0);

        vm.startBroadcast(UNAPPROVED_WALLET);

        token0.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(swapRouter), type(uint256).max);

        swapRouter.swapExactTokensForTokens({
            amountIn: 1e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: hookData,
            receiver: UNAPPROVED_WALLET,
            deadline: block.timestamp + 3600
        });

        vm.stopBroadcast();
    }
}
