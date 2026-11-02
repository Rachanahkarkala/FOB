
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {console2} from "forge-std/console2.sol";
import {BaseScript} from "./base/BaseScript.sol";

contract SwapIdentityProbe is BaseScript {

    address constant IDENTITY_PROBE_HOOK =
        0x477125D8f173f7fb6D09DEeF830B05EE5C4e0080;

    function run() external {
        PoolKey memory poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(IDENTITY_PROBE_HOOK)
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

        console2.log("Identity Probe swap successful");
    }
}
