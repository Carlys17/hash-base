# $HASH — Base

Browser-mined post-quantum token on Base L2. Same mechanics as [hash256.fun](https://hash256.fun), deployed on Base.

## Architecture

```
hash-base/
├── contracts/                    # Foundry project
│   ├── src/HashBase.sol          # Main contract (ERC20 + PoW + Uniswap V4 hook)
│   ├── test/                     # Tests
│   ├── script/Deploy.s.sol       # Deployment script
│   └── foundry.toml
├── frontend/                     # Next.js 14 app
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx          # Home
│   │   │   ├── mine/page.tsx     # Mining page (WebGPU + WASM)
│   │   │   ├── genesis/page.tsx  # Genesis presale
│   │   │   └── pool/page.tsx     # Uniswap V4 pool info
│   │   ├── components/
│   │   │   ├── Providers.tsx     # RainbowKit + wagmi + React Query
│   │   │   ├── Navigation.tsx    # Top nav with wallet connect
│   │   │   └── ui.tsx            # Frame, Stat, ProgressBar, etc.
│   │   ├── lib/
│   │   │   ├── contract.ts       # ABI + constants
│   │   │   ├── webgpu-miner.ts   # WebGPU miner class
│   │   │   └── keccak.wgsl       # WebGPU compute shader
│   │   └── workers/
│   │       └── miner.worker.ts   # WASM fallback miner
│   └── package.json
└── README.md
```

## Tokenomics (same as hash256.fun)

- **Total Supply**: 21,000,000 HASH
- **Genesis**: 5% (1,050,000 HASH) @ $0.03
- **LP**: 5% (1,050,000 HASH)
- **Mining**: 90% (18,900,000 HASH via PoW)
- **Team/VC/Airdrop**: 0%

### Mining Parameters

- Era 1 reward: 100 HASH per mint
- Halving: every 100,000 mints
- Epoch: 100 blocks (~200s on Base with 2s blocks)
- Max mints per block: 10
- Difficulty retarget: every 2,016 mints
- Full distribution: ~290 days

## Quick Start

### 1. Deploy Contract (Foundry)

```bash
cd contracts

# Install Foundry (if not installed)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install dependencies
forge install Uniswap/v4-core Uniswap/v4-periphery OpenZeppelin/openzeppelin-contracts

# Set env
export DEPLOYER_PRIVATE_KEY=0x...
export BASE_RPC_URL=https://mainnet.base.org
export BASESCAN_API_KEY=...

# Deploy to Base mainnet
forge script script/Deploy.s.sol --rpc-url base --broadcast --verify

# Copy the deployed address
```

### 2. Run Frontend

```bash
cd frontend

# Install deps
npm install

# Set contract address
cp .env.local.example .env.local
# Edit .env.local: set NEXT_PUBLIC_HASH_ADDRESS to deployed address

# Run dev server
npm run dev
```

Open http://localhost:3000

### 3. Mine

1. Open `/genesis` — buy HASH during presale
2. Once genesis sells out, anyone calls `seedPool()` to open Uniswap V4 pool
3. Open `/mine` — connect wallet, start mining

## How Mining Works

1. **Challenge**: `keccak256(chainId ‖ contract ‖ miner ‖ epoch)` — per-wallet, changes every epoch
2. **Search**: Find `nonce` where `keccak256(challenge ‖ nonce) < difficulty`
3. **Submit**: Call `mine(nonce)` on-chain. Contract verifies and mints.

### Mining Backends

- **WebGPU**: Runs keccak256 on GPU via WGSL compute shader (~100-500 MH/s)
- **WASM**: Fallback Web Workers for browsers without WebGPU (~10-50 kH/s)

### Difficulty

- Launch: 224-bit target (easy)
- Adjusts every 2,016 mints to maintain ~1 mint/minute globally
- Retargets by halving/doubling the target threshold

## Chain: Base Mainnet

- Chain ID: 8453
- Block time: ~2 seconds
- Uniswap V4 PoolManager: `0x498581fF718922c3f8e6A244956aE097610f7fDe`
- Explorer: https://basescan.org

## Security

- Contract is immutable (no proxy, no upgrade)
- No team allocation, no premine
- Address-bound challenges prevent mempool sniping
- Per-block mint cap (10) prevents burst exploitation
- All ETH from genesis locked until pool seeds

## Development

```bash
# Contract tests
cd contracts && forge test

# Frontend build
cd frontend && npm run build

# Frontend lint
cd frontend && npm run lint
```

## License

MIT
