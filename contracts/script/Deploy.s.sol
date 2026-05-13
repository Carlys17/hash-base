// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {HashBase} from "../src/HashBase.sol";

/// @title Deploy HashBase to Base Mainnet
/// @notice Run: forge script script/Deploy.s.sol --rpc-url base --broadcast --verify
contract DeployHashBase is Script {
    // Base mainnet Uniswap V4 PoolManager
    // https://docs.uniswap.org/contracts/v4/deployments
    address constant BASE_V4_POOL_MANAGER = 0x498581fF718922c3f8e6A244956aE097610f7fDe;

    function run() external returns (HashBase) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        console.log("Deploying HashBase...");
        console.log("Deployer:", vm.addr(deployerKey));
        console.log("PoolManager:", BASE_V4_POOL_MANAGER);

        HashBase hashBase = new HashBase(IPoolManager(BASE_V4_POOL_MANAGER));

        console.log("HashBase deployed at:", address(hashBase));
        console.log("Total Supply:", hashBase.TOTAL_SUPPLY() / 1e18, "HASH");
        console.log("Genesis Cap:", hashBase.GENESIS_CAP() / 1e18, "HASH");
        console.log("Mining Supply:", hashBase.MINING_SUPPLY() / 1e18, "HASH");

        vm.stopBroadcast();
        return hashBase;
    }
}
