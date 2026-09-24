// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {Pottle, IUSDC} from "../src/Pottle.sol";

/// forge script script/Deploy.s.sol --rpc-url $ARC_RPC_URL --broadcast
contract Deploy is Script {
    // circle's usdc on arc, same address on mainnet and testnet
    IUSDC constant USDC = IUSDC(0x3600000000000000000000000000000000000000);

    function run() external returns (Pottle pottle) {
        require(block.chainid == 5042 || block.chainid == 5042002, "not an arc network");
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        pottle = new Pottle(USDC);
        vm.stopBroadcast();
        console.log("Pottle", address(pottle));
        console.log("block", block.number);
    }
}
