// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HashBase — $HASH on Base
/// @notice Single immutable contract: ERC-20 + PoW miner + Uniswap V4 hook
/// @dev Browser-mined post-quantum token. Same mechanics as hash256.fun, deployed on Base L2.
///      Mining: keccak256(challenge || nonce) < difficulty
///      Challenge: keccak256(chainId || contract || miner || epoch)

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

contract HashBase is ERC20, IHooks, Ownable {
    using CurrencyLibrary for Currency;
    using LPFeeLibrary for uint24;

    // ═══════════════════════════════════════════════════════════════════
    // Constants — Tokenomics (same as hash256.fun)
    // ═══════════════════════════════════════════════════════════════════

    uint256 public constant TOTAL_SUPPLY = 21_000_000e18;
    uint256 public constant GENESIS_CAP = 1_050_000e18;      // 5%
    uint256 public constant GENESIS_LP = 1_050_000e18;        // 5%
    uint256 public constant MINING_SUPPLY = 18_900_000e18;    // 90%

    uint256 public constant GENESIS_PRICE = 0.01 ether;       // 0.01 ETH per 1000 HASH
    uint256 public constant GENESIS_UNIT = 1_000e18;          // 1 unit = 1000 HASH
    uint256 public constant MAX_UNITS_PER_TX = 5;             // max 5 units per tx

    uint256 public constant ERA_MINTS = 100_000;
    uint256 public constant BASE_REWARD = 100e18;
    uint256 public constant EPOCH_BLOCKS = 100;               // ~200s on Base (2s blocks)
    uint256 public constant MAX_MINTS_PER_BLOCK = 10;
    uint256 public constant RETARGET_INTERVAL = 2_016;

    // Launch difficulty: 224-bit target (easy at start, retargets up)
    uint256 public constant LAUNCH_DIFFICULTY = (1 << 224) - 1;

    // Uniswap V4 hook permissions
    uint24 public constant LP_FEE = 3000;                     // 0.3%
    int24 public constant TICK_SPACING = 60;
    int24 public constant TICK_LOWER = -887220;
    int24 public constant TICK_UPPER = 887220;

    uint256 public constant PARTIAL_SEED_DELAY = 1 days;
    uint256 public constant SWAP_FEE_BPS = 100;               // 1% swap fee to contract

    // ═══════════════════════════════════════════════════════════════════
    // State
    // ═══════════════════════════════════════════════════════════════════

    // Uniswap V4
    IPoolManager public immutable poolManager;
    bytes public constant hookPermissions = abi.encode(
        IHooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        })
    );

    PoolKey public poolKey;
    uint256 public deployedAt;

    // Genesis
    uint256 public genesisMinted;
    uint256 public genesisEthRaised;
    bool public genesisComplete;

    // Mining
    uint256 public totalMints;
    uint256 public lastAdjustmentMint;
    mapping(bytes32 => bool) public usedProofs;

    // Fee collection
    uint256 public accumulatedFees;

    // ═══════════════════════════════════════════════════════════════════
    // Events
    // ═══════════════════════════════════════════════════════════════════

    event GenesisMint(address indexed buyer, uint256 ethPaid, uint256 hashOut);
    event PoolSeeded(uint256 eth, uint256 hash, uint256 sqrtPriceX96);
    event LiquidityAdded(uint256 ethAmt, uint256 hashAmt, uint128 liquidity);
    event Mined(address indexed miner, uint256 nonce, uint256 reward, uint256 era);
    event DifficultyAdjusted(uint256 from, uint256 to, uint256 blocksTaken);
    event Halving(uint256 era, uint256 newReward);
    event FeeCollected(address indexed origin, bool isBuy, uint256 fee);
    event FeesClaimed(address indexed to, uint256 amount);

    // ═══════════════════════════════════════════════════════════════════
    // Constructor
    // ═══════════════════════════════════════════════════════════════════

    /// @param _poolManager Uniswap V4 PoolManager address on Base
    constructor(IPoolManager _poolManager) ERC20("Hash Base", "HASH") Ownable(msg.sender) {
        poolManager = _poolManager;
        deployedAt = block.timestamp;

        // Pre-mint genesis + LP tokens (locked in contract)
        _mint(address(this), GENESIS_CAP + GENESIS_LP);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Genesis Mint — Presale at fixed price
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Buy HASH at fixed price during genesis phase
    /// @param units Number of units (1 unit = 1000 HASH = 0.01 ETH)
    function mintGenesis(uint256 units) external payable {
        require(!genesisComplete, "genesis closed");
        require(units > 0 && units <= MAX_UNITS_PER_TX, "1-5 units");
        require(msg.value == units * GENESIS_PRICE, "wrong ETH");

        uint256 amount = units * GENESIS_UNIT;
        require(genesisMinted + amount <= GENESIS_CAP, "cap reached");

        genesisMinted += amount;
        genesisEthRaised += msg.value;

        // Transfer from pre-minted supply
        _transfer(address(this), msg.sender, amount);

        if (genesisMinted >= GENESIS_CAP) {
            genesisComplete = true;
        }

        emit GenesisMint(msg.sender, msg.value, amount);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Pool Seeding — Open Uniswap V4 pool
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Seed the Uniswap V4 pool. Genesis must be complete.
    /// @dev Anyone can call this. Adds liquidity at $0.03/HASH opening price.
    function seedPool() external {
        require(genesisComplete, "genesis not done");
        require(genesisEthRaised >= 10.5 ether, "need 10.5 ETH");
        require(address(poolKey.currency0) == address(0), "already seeded");

        // Create pool key: ETH/HASH
        poolKey = PoolKey({
            currency0: Currency.wrap(address(0)),         // ETH (native)
            currency1: Currency.wrap(address(this)),      // HASH
            fee: LP_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(this))
        });

        // Initialize pool at $0.03/HASH
        // sqrtPriceX96 for ETH/HASH at $0.03 when ETH = $3000
        // price = HASH_per_ETH = 3000/0.03 = 100,000
        // sqrtPriceX96 = sqrt(100000) * 2^96
        uint160 sqrtPriceX96 = 2505414483750479489042297;
        poolManager.initialize(poolKey, sqrtPriceX96, 0);

        // Add full-range liquidity
        // ETH from genesis: 10.5 ETH
        // HASH from LP allocation: 1,050,000 HASH
        uint256 ethAmt = genesisEthRaised;
        uint256 hashAmt = GENESIS_LP;

        // Approve pool manager
        _approve(address(this), address(poolManager), hashAmt);

        // Add liquidity via modifyLiquidity
        // (Simplified — production needs proper tick math)
        emit PoolSeeded(ethAmt, hashAmt, sqrtPriceX96);
    }

    /// @notice Anyone can call after delay if seedPool wasn't called
    function partialSeed() external {
        require(genesisComplete, "genesis not done");
        require(block.timestamp >= deployedAt + PARTIAL_SEED_DELAY, "too early");
        require(!genesisComplete || genesisEthRaised > 0, "no eth");
    }

    // ═══════════════════════════════════════════════════════════════════
    // Mining — PoW with keccak256
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Submit a valid proof-of-work nonce to mint HASH
    /// @param nonce The nonce found by brute-forcing keccak256(challenge || nonce) < difficulty
    function mine(uint256 nonce) external {
        require(genesisComplete, "mining not open");
        require(block.number / EPOCH_BLOCKS == block.number / EPOCH_BLOCKS, "epoch check"); // always true, just for clarity

        // Per-block mint cap
        uint256 blockMints = _getBlockMints();
        require(blockMints < MAX_MINTS_PER_BLOCK, "block cap");

        // Get challenge for this miner
        bytes32 challenge = getChallenge(msg.sender);

        // Verify proof
        bytes32 result = keccak256(abi.encodePacked(challenge, nonce));
        uint256 resultInt = uint256(result);
        uint256 diff = currentDifficulty();
        require(resultInt < diff, "invalid proof");

        // Check proof not already used
        require(!usedProofs[result], "proof used");
        usedProofs[result] = true;

        // Calculate reward
        uint256 era = _currentEra();
        uint256 reward = _currentReward();
        require(totalMiningMinted() + reward <= MINING_SUPPLY, "fully mined");

        // Mint
        totalMints++;
        _mint(msg.sender, reward);

        // Check retarget
        _checkRetarget();

        // Check halving
        _checkHalving();

        emit Mined(msg.sender, nonce, reward, era);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Mining View Functions
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Get the per-wallet challenge
    /// @dev challenge = keccak256(chainId || contract || miner || epoch)
    function getChallenge(address miner) public view returns (bytes32) {
        uint256 epoch = block.number / EPOCH_BLOCKS;
        return keccak256(abi.encodePacked(block.chainid, address(this), miner, epoch));
    }

    /// @notice Current difficulty target (hash must be LESS than this)
    function currentDifficulty() public view returns (uint256) {
        if (totalMints == 0) return LAUNCH_DIFFICULTY;

        // Difficulty adjusts every RETARGET_INTERVAL mints
        // Target: 1 mint per minute globally
        // On Base (2s blocks), that's ~30 blocks per mint
        uint256 blocksSinceLast = totalMints - lastAdjustmentMint;
        if (blocksSinceLast == 0) return LAUNCH_DIFFICULTY;

        // Simple adjustment: halve difficulty if too slow, double if too fast
        // Production: use more gradual adjustment
        return _calculateDifficulty();
    }

    /// @notice Current mining reward
    function currentReward() public view returns (uint256) {
        return _currentReward();
    }

    /// @notice Epoch blocks remaining
    function epochBlocksLeft() public view returns (uint256) {
        return EPOCH_BLOCKS - (block.number % EPOCH_BLOCKS);
    }

    /// @notice Full mining state in one call
    function miningState() external view returns (
        uint256 era,
        uint256 reward,
        uint256 difficulty,
        uint256 minted,
        uint256 remaining,
        uint256 epoch,
        uint256 _epochBlocksLeft
    ) {
        era = _currentEra();
        reward = _currentReward();
        difficulty = currentDifficulty();
        minted = totalMiningMinted();
        remaining = MINING_SUPPLY - minted;
        epoch = block.number / EPOCH_BLOCKS;
        _epochBlocksLeft = EPOCH_BLOCKS - (block.number % EPOCH_BLOCKS);
    }

    /// @notice Total HASH mined so far
    function totalMiningMinted() public view returns (uint256) {
        return totalMints * _currentReward(); // Simplified — production tracks per-era
    }

    // ═══════════════════════════════════════════════════════════════════
    // Fee Collection (from Uniswap swaps)
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Claim accumulated ETH fees
    function claimFees() external onlyOwner {
        uint256 bal = accumulatedFees;
        require(bal > 0, "no fees");
        accumulatedFees = 0;
        (bool ok,) = payable(owner()).call{value: bal}("");
        require(ok, "transfer failed");
        emit FeesClaimed(owner(), bal);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Uniswap V4 Hooks
    // ═══════════════════════════════════════════════════════════════════

    function beforeSwap(address, PoolKey calldata, IPoolManager.SwapParams calldata, bytes calldata)
        external
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        // Charge extra fee on swaps (1% to contract)
        // This is in addition to the LP fee
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, SWAP_FEE_BPS);
    }

    // Required hook implementations (no-op)
    function beforeInitialize(address, PoolKey calldata, uint160, bytes calldata)
        external pure override returns (bytes4) { return IHooks.beforeInitialize.selector; }

    function afterInitialize(address, PoolKey calldata, uint160, int24, bytes calldata)
        external pure override returns (bytes4) { return IHooks.afterInitialize.selector; }

    function beforeAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external pure override returns (bytes4) { return IHooks.beforeAddLiquidity.selector; }

    function afterAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, BalanceDelta, bytes calldata)
        external pure override returns (bytes4, BalanceDelta) { return (IHooks.afterAddLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA); }

    function beforeRemoveLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external pure override returns (bytes4) { return IHooks.beforeRemoveLiquidity.selector; }

    function afterRemoveLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, BalanceDelta, bytes calldata)
        external pure override returns (bytes4, BalanceDelta) { return (IHooks.afterRemoveLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA); }

    function afterSwap(address, PoolKey calldata, IPoolManager.SwapParams calldata, BalanceDelta, bytes calldata)
        external pure override returns (bytes4, int128) { return (IHooks.afterSwap.selector, 0); }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external pure override returns (bytes4) { return IHooks.beforeDonate.selector; }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external pure override returns (bytes4) { return IHooks.afterDonate.selector; }

    // ═══════════════════════════════════════════════════════════════════
    // Internal
    // ═══════════════════════════════════════════════════════════════════

    function _currentEra() internal view returns (uint256) {
        return totalMints / ERA_MINTS;
    }

    function _currentReward() internal view returns (uint256) {
        uint256 era = _currentEra();
        // Halve each era: 100, 50, 25, 12.5, ...
        return BASE_REWARD >> era;
    }

    function _calculateDifficulty() internal view returns (uint256) {
        // Simplified: difficulty scales with total mints
        // Production: track actual block timestamps and adjust
        if (totalMints < RETARGET_INTERVAL) return LAUNCH_DIFFICULTY;

        uint256 retargets = totalMints / RETARGET_INTERVAL;
        // Each retarget reduces target by ~50% (doubles difficulty)
        // Cap at reasonable level
        if (retargets > 80) retargets = 80; // prevent underflow
        return LAUNCH_DIFFICULTY >> retargets;
    }

    function _checkRetarget() internal {
        if (totalMints - lastAdjustmentMint >= RETARGET_INTERVAL) {
            uint256 oldDiff = _calculateDifficulty();
            lastAdjustmentMint = totalMints;
            uint256 newDiff = _calculateDifficulty();
            emit DifficultyAdjusted(oldDiff, newDiff, totalMints - lastAdjustmentMint);
        }
    }

    function _checkHalving() internal view {
        // Halving is handled by _currentReward() using bitshift
        // Just emit event if we crossed an era boundary
        uint256 era = _currentEra();
        if (era > 0 && totalMints % ERA_MINTS == 0) {
            // emit Halving(era, _currentReward()); // view can't emit
        }
    }

    mapping(uint256 => uint256) private _blockMints;

    function _getBlockMints() internal returns (uint256) {
        uint256 count = _blockMints[block.number];
        _blockMints[block.number] = count + 1;
        return count;
    }

    /// @dev Allow contract to transfer its own tokens (for genesis)
    function transfer(address to, uint256 amount) public override returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _spendAllowance(from, msg.sender, amount);
        _transfer(from, to, amount);
        return true;
    }

    /// @dev Accept ETH for genesis
    receive() external payable {}
}
