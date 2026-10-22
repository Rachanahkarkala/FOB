
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockERC20} from "../lib/uniswap-hooks/lib/v4-core/lib/solmate/src/test/utils/mocks/MockERC20.sol";

contract DeployMockTokens is Script {
    function run() external {
        vm.startBroadcast();

        MockERC20 tokenA = new MockERC20("Token A", "TKA", 18);
        MockERC20 tokenB = new MockERC20("Token B", "TKB", 18);

        tokenA.mint(msg.sender, 1_000_000 ether);
        tokenB.mint(msg.sender, 1_000_000 ether);

        console2.log("Token A address:", address(tokenA));
        console2.log("Token B address:", address(tokenB));
        console2.log("Token A balance:", tokenA.balanceOf(msg.sender));
        console2.log("Token B balance:", tokenB.balanceOf(msg.sender));

        vm.stopBroadcast();
    }
}
