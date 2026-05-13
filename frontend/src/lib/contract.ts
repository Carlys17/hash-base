/**
 * HashBase contract configuration
 * Deploy on Base mainnet after running: forge script script/Deploy.s.sol --rpc-url base --broadcast --verify
 */

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_HASH_ADDRESS as `0x${string}`;

export const CHAIN_ID = 8453; // Base mainnet

export const ABI = [
  // ── Read ────────────────────────────────────────────────────
  { type: "function", stateMutability: "view", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "symbol", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", stateMutability: "view", name: "decimals", inputs: [], outputs: [{ type: "uint8" }] },

  // Constants
  { type: "function", stateMutability: "view", name: "TOTAL_SUPPLY", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "GENESIS_CAP", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "GENESIS_LP", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "MINING_SUPPLY", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "GENESIS_PRICE", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "GENESIS_UNIT", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "MAX_UNITS_PER_TX", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "ERA_MINTS", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "BASE_REWARD", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "EPOCH_BLOCKS", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "MAX_MINTS_PER_BLOCK", inputs: [], outputs: [{ type: "uint256" }] },

  // Genesis
  { type: "function", stateMutability: "view", name: "genesisMinted", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "genesisEthRaised", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "genesisComplete", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", stateMutability: "view", name: "genesisState", inputs: [], outputs: [
    { name: "minted", type: "uint256" }, { name: "remaining", type: "uint256" },
    { name: "ethRaised", type: "uint256" }, { name: "complete", type: "bool" }
  ]},

  // Mining
  { type: "function", stateMutability: "view", name: "totalMints", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "lastAdjustmentMint", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "totalMiningMinted", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "currentDifficulty", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "currentReward", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "epochBlocksLeft", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", stateMutability: "view", name: "getChallenge", inputs: [{ name: "miner", type: "address" }], outputs: [{ type: "bytes32" }] },
  { type: "function", stateMutability: "view", name: "usedProofs", inputs: [{ name: "", type: "bytes32" }], outputs: [{ type: "bool" }] },
  { type: "function", stateMutability: "view", name: "miningState", inputs: [], outputs: [
    { name: "era", type: "uint256" }, { name: "reward", type: "uint256" },
    { name: "difficulty", type: "uint256" }, { name: "minted", type: "uint256" },
    { name: "remaining", type: "uint256" }, { name: "epoch", type: "uint256" },
    { name: "epochBlocksLeft", type: "uint256" }
  ]},

  // Pool
  { type: "function", stateMutability: "view", name: "poolKey", inputs: [], outputs: [
    { name: "currency0", type: "address" }, { name: "currency1", type: "address" },
    { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" },
    { name: "hooks", type: "address" }
  ]},

  // ── Write ───────────────────────────────────────────────────
  { type: "function", stateMutability: "payable", name: "mintGenesis", inputs: [{ name: "units", type: "uint256" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "seedPool", inputs: [], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "mine", inputs: [{ name: "nonce", type: "uint256" }], outputs: [] },
  { type: "function", stateMutability: "nonpayable", name: "claimFees", inputs: [], outputs: [] },

  // ── Events ──────────────────────────────────────────────────
  { type: "event", name: "GenesisMint", inputs: [
    { name: "buyer", type: "address", indexed: true },
    { name: "ethPaid", type: "uint256", indexed: false },
    { name: "hashOut", type: "uint256", indexed: false }
  ]},
  { type: "event", name: "Mined", inputs: [
    { name: "miner", type: "address", indexed: true },
    { name: "nonce", type: "uint256", indexed: false },
    { name: "reward", type: "uint256", indexed: false },
    { name: "era", type: "uint256", indexed: false }
  ]},
  { type: "event", name: "PoolSeeded", inputs: [
    { name: "eth", type: "uint256", indexed: false },
    { name: "hash", type: "uint256", indexed: false },
    { name: "sqrtPriceX96", type: "uint256", indexed: false }
  ]},
  { type: "event", name: "DifficultyAdjusted", inputs: [
    { name: "from", type: "uint256", indexed: false },
    { name: "to", type: "uint256", indexed: false },
    { name: "blocksTaken", type: "uint256", indexed: false }
  ]},
  { type: "event", name: "Halving", inputs: [
    { name: "era", type: "uint256", indexed: false },
    { name: "newReward", type: "uint256", indexed: false }
  ]},
] as const;

// ── Constants ─────────────────────────────────────────────────
export const ERA_MINTS = 100_000n;
export const BASE_REWARD = 100n * 10n ** 18n;
export const TOTAL_MINING = 18_900_000n * 10n ** 18n;
export const RETARGET_INTERVAL = 2016n;
export const GENESIS_CAP = 1_050_000n * 10n ** 18n;
export const LAUNCH_DIFFICULTY = (1n << 224n) - 1n;

export const IS_CONFIGURED = !!CONTRACT_ADDRESS;
