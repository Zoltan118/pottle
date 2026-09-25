// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {Pottle, IFiatToken} from "../src/Pottle.sol";

/// forge script script/Deploy.s.sol --rpc-url $ARC_RPC_URL --broadcast
contract Deploy is Script {
    // circle's usdc on arc, same address on mainnet and testnet
    IFiatToken constant USDC = IFiatToken(0x3600000000000000000000000000000000000000);
    // circle's eurc on arc, different address per network
    IFiatToken constant EURC_MAINNET = IFiatToken(0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1);
    IFiatToken constant EURC_TESTNET = IFiatToken(0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a);

    function run() external returns (Pottle pottle) {
        require(block.chainid == 5042 || block.chainid == 5042002, "not an arc network");
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        pottle = new Pottle(USDC, block.chainid == 5042 ? EURC_MAINNET : EURC_TESTNET);
        vm.stopBroadcast();
        console.log("Pottle", address(pottle));
        console.log("block", block.number);
    }
}
