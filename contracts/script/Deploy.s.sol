// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {Pottle, IFiatToken} from "../src/Pottle.sol";

/// forge script script/Deploy.s.sol --rpc-url $ARC_RPC_URL --broadcast
/// EXPECTED_DEPLOYER must be set to the address of DEPLOYER_PRIVATE_KEY. forge loads contracts/.env on its
/// own, so a mainnet deploy run without the mainnet env would otherwise quietly use the testnet key
interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

contract Deploy is Script {
    // circle's usdc on arc, same address on mainnet and testnet
    IFiatToken constant USDC = IFiatToken(0x3600000000000000000000000000000000000000);
    // circle's eurc on arc, different address per network
    IFiatToken constant EURC_MAINNET = IFiatToken(0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1);
    IFiatToken constant EURC_TESTNET = IFiatToken(0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a);

    function run() external returns (Pottle pottle) {
        require(block.chainid == 5042 || block.chainid == 5042002, "not an arc network");
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        require(vm.addr(key) == vm.envAddress("EXPECTED_DEPLOYER"), "DEPLOYER_PRIVATE_KEY is not the expected deployer");
        IFiatToken eurc = block.chainid == 5042 ? EURC_MAINNET : EURC_TESTNET;
        // both tokens really are there on this chain, with 6 decimals
        require(address(USDC).code.length > 0 && address(eurc).code.length > 0, "token missing on this chain");
        require(IERC20Decimals(address(USDC)).decimals() == 6 && IERC20Decimals(address(eurc)).decimals() == 6, "unexpected decimals");
        vm.startBroadcast(key);
        pottle = new Pottle(USDC, eurc);
        vm.stopBroadcast();
        console.log("Pottle", address(pottle));
        console.log("block", block.number);
    }
}
