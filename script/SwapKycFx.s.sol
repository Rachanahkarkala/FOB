
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

import {BaseScript} from "./base/BaseScript.sol";

contract SwapKycFx is BaseScript {
    address constant KYC_HOOK =
        0xB75859D29014FA395327Fa1E85d90B2B62D6C080;

    function run() external {
        PoolKey memory poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(KYC_HOOK)
        });

        bytes memory hookData = new bytes(0);

        vm.startBroadcast();

        token0.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(swapRouter), type(uint256).max);

        swapRouter.swapExactTokensForTokens({
            amountIn: 1e18,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: hookData,
            receiver: getDeployer(),
            deadline: block.timestamp + 3600
        });

        vm.stopBroadcast();
    }
}
