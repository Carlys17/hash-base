#!/bin/bash
# Deploy HashBase contracts to Base mainnet
set -e
cd contracts
forge script script/Deploy.s.sol --rpc-url https://mainnet.base.org --broadcast --verify
echo "Deployed to Base mainnet!"
