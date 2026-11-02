
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {KycDecisionLog} from "../src/KycDecisionLog.sol";

contract DeployKycDecisionLog is Script {
    address constant ADMIN =
        0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    function run() external {
        vm.startBroadcast();

        KycDecisionLog decisionLog =
            new KycDecisionLog(ADMIN);

        vm.stopBroadcast();

        console2.log("KYC Decision Log deployed:");
        console2.logAddress(address(decisionLog));
        console2.log("Administrator:");
        console2.logAddress(ADMIN);
    }
}
