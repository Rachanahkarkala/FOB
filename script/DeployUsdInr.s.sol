
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {Deployers} from "../test/utils/Deployers.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

import {AllowlistRegistry} from "../src/AllowlistRegistry.sol";
import {UsdInrDynamicHook} from "../src/UsdInrDynamicHook.sol";
import {IUsdInrOracle} from "../src/MockUsdInrOracle.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";

contract DeployUsdInr is Script, Deployers {
    // Anvil Account #0. Run the script with --sender set to this address.
    address constant ADMIN =
        0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    // Polygon Mainnet Chainlink INR/USD feed.
    // Its answer represents USD per INR.
    address constant CHAINLINK_INR_USD =
        0xDA0F8Df6F5dB15b346f4B8D1156722027E194E60;

    int24 constant TICK_SPACING = 60;

    uint256 constant TOKEN_AMOUNT = 100_000 ether;
    uint256 constant MAX_ORACLE_AGE = 3600;

    MockERC20 public usdToken;
    MockERC20 public inrToken;

    AllowlistRegistry public registry;
    UsdInrDynamicHook public hook;

    function run() external {
        require(block.chainid == 31337, "Local Anvil only");

        vm.startBroadcast();

        // 1. Deploy fresh Uniswap infrastructure.
        deployArtifacts();

        // 2. Deploy prototype USD and INR tokens.
        _deployTokens();

        // 3. Deploy allowlist and approve the admin/LP wallet.
        _deployRegistry();

        // 4. Verify the real Chainlink feed.
        _validateOracle();

        // 5. Deploy the KYC-gated dynamic-fee hook.
        _deployHook();

        // 6. Initialize the pool and add initial liquidity.
        _createPool();

        vm.stopBroadcast();

        _printDeployment();
    }

    // ------------------------------------------------------------
    // TOKEN DEPLOYMENT
    // ------------------------------------------------------------

    function _deployTokens() internal {
        usdToken = new MockERC20("US Dollar", "USD", 18);
        inrToken = new MockERC20("Indian Rupee", "INR", 18);

        // The hook expects USD as currency0 and INR as currency1.
        require(
            address(usdToken) < address(inrToken),
            "USD/INR token ordering invalid"
        );

        usdToken.mint(ADMIN, TOKEN_AMOUNT);
        inrToken.mint(ADMIN, TOKEN_AMOUNT);
    }

    // ------------------------------------------------------------
    // KYC REGISTRY
    // ------------------------------------------------------------

    function _deployRegistry() internal {
        registry = new AllowlistRegistry();
        registry.approveWallet(ADMIN);

        require(registry.isApproved(ADMIN), "Admin approval failed");
    }

    // ------------------------------------------------------------
    // CHAINLINK VALIDATION
    // ------------------------------------------------------------

    function _validateOracle() internal view {
        require(
            CHAINLINK_INR_USD.code.length > 0,
            "Chainlink feed not found"
        );

        IUsdInrOracle oracle = IUsdInrOracle(CHAINLINK_INR_USD);

        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = oracle.latestRoundData();

        require(
            answer > 0 &&
            updatedAt > 0 &&
            answeredInRound >= roundId,
            "Invalid Chainlink answer"
        );

        require(
            updatedAt <= block.timestamp &&
            block.timestamp - updatedAt <= MAX_ORACLE_AGE,
            "Chainlink answer is stale"
        );
    }

    // ------------------------------------------------------------
    // HOOK DEPLOYMENT
    // ------------------------------------------------------------

    function _deployHook() internal {
        Currency currency0 = Currency.wrap(address(usdToken));
        Currency currency1 = Currency.wrap(address(inrToken));

        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.AFTER_INITIALIZE_FLAG
        );

        bytes memory constructorArgs = abi.encode(
            poolManager,
            address(swapRouter),
            address(registry),
            CHAINLINK_INR_USD,
            Currency.unwrap(currency0),
            Currency.unwrap(currency1)
        );

        (address predictedHook, bytes32 salt) = HookMiner.find(
            CREATE2_FACTORY,
            flags,
            type(UsdInrDynamicHook).creationCode,
            constructorArgs
        );

        hook = new UsdInrDynamicHook{salt: salt}(
            poolManager,
            address(swapRouter),
            address(registry),
            CHAINLINK_INR_USD,
            Currency.unwrap(currency0),
            Currency.unwrap(currency1)
        );

        require(
            address(hook) == predictedHook,
            "Hook address mismatch"
        );
    }

    // ------------------------------------------------------------
    // POOL CREATION
    // ------------------------------------------------------------

    function _createPool() internal {
        Currency currency0 = Currency.wrap(address(usdToken));
        Currency currency1 = Currency.wrap(address(inrToken));

        PoolKey memory poolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook))
        });

        (uint160 startingPrice, uint256 inrPerUsdWad) =
            _getStartingPrice();

        int24 currentTick =
            TickMath.getTickAtSqrtPrice(startingPrice);

        int24 tickLower = _truncateTickSpacing(
            currentTick - 750 * TICK_SPACING
        );

        int24 tickUpper = _truncateTickSpacing(
            currentTick + 750 * TICK_SPACING
        );

        _initializeAndAddLiquidity(
            poolKey,
            startingPrice,
            tickLower,
            tickUpper
        );

        console2.log(
            "Pool price INR per USD (18 decimals):",
            inrPerUsdWad
        );

        console2.log(
            "Initial sqrtPriceX96:",
            uint256(startingPrice)
        );
    }

    // ------------------------------------------------------------
    // ORACLE PRICE -> UNISWAP SQRT PRICE
    // ------------------------------------------------------------

    function _getStartingPrice()
        internal
        view
        returns (uint160 startingPrice, uint256 inrPerUsdWad)
    {
        IUsdInrOracle oracle = IUsdInrOracle(CHAINLINK_INR_USD);

        (, int256 answer,,,) = oracle.latestRoundData();

        uint8 oracleDecimals = oracle.decimals();

        require(
            answer > 0 && oracleDecimals <= 18,
            "Invalid oracle price"
        );

        // Chainlink feed gives USD per INR.
        uint256 usdPerInrWad =
            uint256(answer) * (10 ** (18 - oracleDecimals));

        require(usdPerInrWad > 0, "Zero oracle price");

        // Invert to obtain INR per USD.
        inrPerUsdWad = FullMath.mulDiv(
            1e18,
            1e18,
            usdPerInrWad
        );

        // sqrtPriceX96 = sqrt(price * 2^192 / 1e18).
        uint256 priceX192 = FullMath.mulDiv(
            inrPerUsdWad,
            uint256(1) << 192,
            1e18
        );

        startingPrice = uint160(_sqrt(priceX192));
    }

    // ------------------------------------------------------------
    // INITIALIZE POOL AND ADD LIQUIDITY
    // ------------------------------------------------------------

    function _initializeAndAddLiquidity(
        PoolKey memory poolKey,
        uint160 startingPrice,
        int24 tickLower,
        int24 tickUpper
    ) internal {
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            startingPrice,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            TOKEN_AMOUNT,
            TOKEN_AMOUNT
        );

        require(liquidity > 0, "Liquidity is zero");

        _approveToken(usdToken);
        _approveToken(inrToken);

        _mintPosition(
            poolKey,
            startingPrice,
            tickLower,
            tickUpper,
            liquidity
        );
    }

    // ------------------------------------------------------------
    // POSITION MANAGER
    // ------------------------------------------------------------

    function _mintPosition(
        PoolKey memory poolKey,
        uint160 startingPrice,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity
    ) internal {
        bytes memory actions = abi.encodePacked(
            uint8(Actions.MINT_POSITION),
            uint8(Actions.SETTLE_PAIR),
            uint8(Actions.SWEEP),
            uint8(Actions.SWEEP)
        );

        bytes[] memory mintParams = _buildMintParams(
            poolKey,
            tickLower,
            tickUpper,
            liquidity
        );

        bytes[] memory multicallParams = new bytes[](2);

        multicallParams[0] = abi.encodeWithSelector(
            positionManager.initializePool.selector,
            poolKey,
            startingPrice,
            bytes("")
        );

        multicallParams[1] = abi.encodeWithSelector(
            positionManager.modifyLiquidities.selector,
            abi.encode(actions, mintParams),
            block.timestamp + 3600
        );

        positionManager.multicall(multicallParams);
    }

    function _buildMintParams(
        PoolKey memory poolKey,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity
    ) internal pure returns (bytes[] memory params) {
        params = new bytes[](4);

        params[0] = abi.encode(
            poolKey,
            tickLower,
            tickUpper,
            liquidity,
            TOKEN_AMOUNT,
            TOKEN_AMOUNT,
            ADMIN,
            bytes("")
        );

        params[1] = abi.encode(
            poolKey.currency0,
            poolKey.currency1
        );

        params[2] = abi.encode(
            poolKey.currency0,
            ADMIN
        );

        params[3] = abi.encode(
            poolKey.currency1,
            ADMIN
        );
    }

    // ------------------------------------------------------------
    // TOKEN APPROVALS
    // ------------------------------------------------------------

    function _approveToken(MockERC20 token) internal {
        token.approve(address(permit2), type(uint256).max);

        token.approve(address(swapRouter), type(uint256).max);

        permit2.approve(
            address(token),
            address(positionManager),
            type(uint160).max,
            type(uint48).max
        );

        permit2.approve(
            address(token),
            address(poolManager),
            type(uint160).max,
            type(uint48).max
        );

        permit2.approve(
            address(token),
            address(swapRouter),
            type(uint160).max,
            type(uint48).max
        );
    }

    // ------------------------------------------------------------
    // HELPERS
    // ------------------------------------------------------------

    function _truncateTickSpacing(int24 tick)
        internal
        pure
        returns (int24)
    {
        return (tick / TICK_SPACING) * TICK_SPACING;
    }

    function _sqrt(uint256 x)
        internal
        pure
        returns (uint256 y)
    {
        if (x == 0) return 0;

        uint256 z = (x + 1) / 2;
        y = x;

        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    // ------------------------------------------------------------
    // ANVIL PERMIT2 SETUP
    // ------------------------------------------------------------

    function _etch(
        address target,
        bytes memory bytecode
    ) internal override {
        if (block.chainid != 31337) {
            revert("Local Anvil only");
        }

        vm.rpc(
            "anvil_setCode",
            string.concat(
                '["',
                vm.toString(target),
                '","',
                vm.toString(bytecode),
                '"]'
            )
        );
    }

    // ------------------------------------------------------------
    // DEPLOYMENT SUMMARY
    // ------------------------------------------------------------

    function _printDeployment() internal view {
        console2.log("");
        console2.log("========== USD/INR DEPLOYMENT ==========");

        console2.log("Admin:", ADMIN);
        console2.log("USD token:", address(usdToken));
        console2.log("INR token:", address(inrToken));

        console2.log("Registry:", address(registry));
        console2.log("Chainlink feed:", CHAINLINK_INR_USD);
        console2.log("Dynamic KYC hook:", address(hook));

        console2.log("Permit2:", address(permit2));
        console2.log("PoolManager:", address(poolManager));
        console2.log("PositionManager:", address(positionManager));
        console2.log("Hookmate router:", address(swapRouter));

        console2.log("Currency0: USD");
        console2.log("Currency1: INR");

        console2.log("Initial liquidity:", TOKEN_AMOUNT);
        console2.log("Dynamic fee: Enabled");
        console2.log("KYC allowlist: Enabled");

        console2.log("=======================================");
    }
}
