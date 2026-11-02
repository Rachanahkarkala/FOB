
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {IUniswapV4Router04} from "hookmate/interfaces/router/IUniswapV4Router04.sol";

interface IAllowlistRegistry {
    function isApproved(address wallet) external view returns (bool);
}

contract KycGatedFxHook is BaseHook {
    address public immutable trustedRouter;
    IAllowlistRegistry public immutable registry;

    error UnauthorizedRouter();
    error InvalidWallet();
    error KYCNotApproved(address wallet);

    event SwapIdentityVerified(address indexed wallet);

    constructor(
        IPoolManager manager,
        address router,
        address registryAddress
    ) BaseHook(manager) {
        require(router != address(0), "Invalid router");
        require(registryAddress != address(0), "Invalid registry");

        trustedRouter = router;
        registry = IAllowlistRegistry(registryAddress);
    }

    function getHookPermissions()
        public
        pure
        override
        returns (Hooks.Permissions memory)
    {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function _beforeSwap(
        address sender,
        PoolKey calldata,
        SwapParams calldata,
        bytes calldata
    )
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (sender != trustedRouter) {
            revert UnauthorizedRouter();
        }

        address wallet =
            IUniswapV4Router04(payable(trustedRouter)).msgSender();

        if (wallet == address(0) || wallet == trustedRouter) {
            revert InvalidWallet();
        }

        if (!registry.isApproved(wallet)) {
            revert KYCNotApproved(wallet);
        }

        emit SwapIdentityVerified(wallet);

        return (
            BaseHook.beforeSwap.selector,
            BeforeSwapDeltaLibrary.ZERO_DELTA,
            0
        );
    }
}
