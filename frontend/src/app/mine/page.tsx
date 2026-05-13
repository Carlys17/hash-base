"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Frame, Stat, ProgressBar, formatHASH, formatHashrate, shortHex } from "@/components/ui";
import { ABI, CONTRACT_ADDRESS, IS_CONFIGURED, LAUNCH_DIFFICULTY, ERA_MINTS, RETARGET_INTERVAL } from "@/lib/contract";
import { WebGPUMiner, hasWebGPU } from "@/lib/webgpu-miner";

type MinerStatus = "idle" | "loading" | "running" | "found" | "stopped" | "error";

interface MinerState {
  status: MinerStatus;
  hashes: number;
  hashrate: number;
  elapsedMs: number;
  backend: "gpu" | "wasm";
  gpuLabel: string | null;
  hit: { nonce: string; hash: string } | null;
  error: string | null;
}

const EMPTY_STATE: MinerState = {
  status: "idle", hashes: 0, hashrate: 0, elapsedMs: 0,
  backend: "wasm", gpuLabel: null, hit: null, error: null,
};

export default function MinePage() {
  const { address, isConnected } = useAccount();
  const [tipGwei, setTipGwei] = useState(2);

  // ── On-chain reads ───────────────────────────────────────
  const { data: miningState } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ABI, functionName: "miningState",
    query: { enabled: IS_CONFIGURED, refetchInterval: 12_000 },
  });

  const { data: totalMints } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ABI, functionName: "totalMints",
    query: { enabled: IS_CONFIGURED, refetchInterval: 12_000 },
  });

  const { data: challenge } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ABI, functionName: "getChallenge",
    args: address ? [address] : undefined,
    query: { enabled: IS_CONFIGURED && !!address, refetchInterval: 12_000 },
  });

  const { data: balance } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ABI, functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: IS_CONFIGURED && !!address, refetchInterval: 15_000 },
  });

  const { data: lastAdj } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ABI, functionName: "lastAdjustmentMint",
    query: { enabled: IS_CONFIGURED, refetchInterval: 12_000 },
  });

  const [era, reward, difficulty, minted, remaining, epoch, epochBlocksLeft] =
    miningState ?? [0n, 0n, 0n, 0n, 0n, 0n, 0n];

  // ── Miner state ──────────────────────────────────────────
  const [miner, setMiner] = useState<MinerState>(EMPTY_STATE);
  const gpuMinerRef = useRef<WebGPUMiner | null>(null);
  const workersRef = useRef<Worker[]>([]);
  const foundRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => () => {
    gpuMinerRef.current?.destroy();
    workersRef.current.forEach(w => w.terminate());
  }, []);

  // ── Start mining ─────────────────────────────────────────
  const startMining = useCallback(async () => {
    if (!challenge || !difficulty) return;

    setMiner({ ...EMPTY_STATE, status: "loading" });
    foundRef.current = false;

    const challengeHex = "0x" + (challenge as string).slice(2).padStart(64, "0");
    const difficultyHex = "0x" + difficulty.toString(16).padStart(64, "0");

    // Try WebGPU first
    if (await hasWebGPU()) {
      try {
        const gpu = new WebGPUMiner();
        await gpu.init();
        gpuMinerRef.current = gpu;

        setMiner(s => ({ ...s, status: "loading", backend: "gpu" }));

        await gpu.start(challengeHex, difficultyHex, {
          onProgress: ({ hashes, hashrate, elapsedMs }) => {
            setMiner(s => ({ ...s, status: "running", hashes, hashrate, elapsedMs }));
          },
          onFound: ({ nonce, hash, hashes, elapsedMs }) => {
            if (foundRef.current) return;
            foundRef.current = true;
            setMiner(s => ({ ...s, status: "found", hashes, elapsedMs, hit: { nonce, hash } }));
          },
        });
        return;
      } catch (e) {
        console.warn("WebGPU failed, falling back to WASM:", e);
      }
    }

    // WASM fallback
    const numWorkers = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    const workers: Worker[] = [];
    workersRef.current = workers;

    for (let i = 0; i < numWorkers; i++) {
      const w = new Worker(new URL("../workers/miner.worker.ts", import.meta.url));
      w.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "progress") {
          setMiner(s => ({
            ...s, status: "running",
            hashes: workers.reduce((a, _) => a + msg.hashes, 0),
            hashrate: msg.hashrate * numWorkers,
            elapsedMs: msg.elapsedMs,
          }));
        } else if (msg.type === "found" && !foundRef.current) {
          foundRef.current = true;
          workers.forEach(w => w.postMessage({ type: "stop" }));
          setMiner(s => ({
            ...s, status: "found", hashes: msg.hashes, elapsedMs: msg.elapsedMs,
            hit: { nonce: msg.nonce, hash: msg.result },
          }));
        }
      };
      workers.push(w);
    }

    setMiner(s => ({ ...s, status: "loading", backend: "wasm" }));

    workers.forEach(w => {
      w.postMessage({ type: "start", challenge: challengeHex, difficulty: difficultyHex, batchSize: 5000 });
    });
  }, [challenge, difficulty]);

  // ── Stop mining ──────────────────────────────────────────
  const stopMining = () => {
    gpuMinerRef.current?.stop();
    workersRef.current.forEach(w => w.postMessage({ type: "stop" }));
    setMiner(s => ({ ...s, status: "stopped" }));
  };

  // ── Submit mine(nonce) ───────────────────────────────────
  const { writeContract, data: txHash, isPending, reset: resetWrite } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, isError: txError } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) {
      setMiner(s => ({ ...s, status: "idle", hit: null }));
    }
  }, [isSuccess]);

  const submitMine = () => {
    if (!miner.hit) return;
    resetWrite();
    writeContract({
      address: CONTRACT_ADDRESS, abi: ABI, functionName: "mine",
      args: [BigInt(miner.hit.nonce)],
      maxPriorityFeePerGas: BigInt(Math.round(tipGwei * 1e9)),
    });
  };

  // ── Derived values ───────────────────────────────────────
  const diffBits = difficulty > 0n ? difficulty.toString(2).length : 0;
  const zeroBits = 256 - diffBits;
  const eraMints = totalMints ? totalMints % ERA_MINTS : 0n;
  const retargetLeft = totalMints && lastAdj ? RETARGET_INTERVAL - (totalMints - lastAdj) : RETARGET_INTERVAL;
  const eraProgress = totalMints ? Number(eraMints) / Number(ERA_MINTS) : 0;
  const totalProgress = minted ? Number(minted) / Number(18_900_000e18) : 0;

  // ETA calculation
  const diffNum = Number(difficulty);
  const prob = diffNum > 0 ? diffNum / (2 ** 256) : 0;
  const etaSec = miner.hashrate > 0 && prob > 0 ? 1 / (miner.hashrate * prob) : Infinity;
  const etaStr = !isFinite(etaSec) ? "—" : etaSec < 60 ? `~${etaSec.toFixed(0)}s` : etaSec < 3600 ? `~${(etaSec/60).toFixed(1)}m` : `~${(etaSec/3600).toFixed(1)}h`;

  if (!IS_CONFIGURED) {
    return (
      <Frame title="not configured">
        <p className="text-sm text-[var(--color-muted)]">
          Set <code>NEXT_PUBLIC_HASH_ADDRESS</code> in .env.local after deploying the contract.
        </p>
      </Frame>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mining State */}
      <Frame title="mining state" right={`era ${Number(era) + 1}`}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          <Stat label="era" value={Number(era) + 1} amber />
          <Stat label="reward / mint" value={`${formatHASH(reward)} HASH`} amber />
          <Stat label="difficulty" value={`${zeroBits}-bit target`} hint={`${zeroBits} leading zero bits needed`} />
          <Stat label="next retarget" value={`${Number(retargetLeft).toLocaleString()} / 2,016 mints`} />
          <Stat label="epoch" value={epoch.toString()} />
          <Stat label="epoch rotates" value={`in ${epochBlocksLeft.toString()} blocks (~${(Number(epochBlocksLeft) * 2)}s)`} />
          <Stat label="minted" value={`${formatHASH(minted)} HASH`} />
          <Stat label="remaining" value={`${formatHASH(remaining)} HASH`} />
          <Stat label="your balance" value={balance !== undefined ? `${formatHASH(balance)} HASH` : "—"} />
        </dl>
        <div className="mt-6 space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-muted)] mb-1">total mining progress</div>
            <ProgressBar progress={totalProgress} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-muted)] mb-1">
              this era · {Number(eraMints).toLocaleString()} / 100,000 mints
            </div>
            <ProgressBar progress={eraProgress} amber />
          </div>
        </div>
      </Frame>

      {/* Miner */}
      <Frame title="browser miner"
        right={miner.backend === "gpu" ? `● GPU` : miner.status !== "idle" ? `○ WASM` : "wasm not loaded"}
      >
        {isConnected ? (
          <>
            <pre className="text-sm text-[var(--color-phosphor)] term-glow whitespace-pre-wrap">
              {miner.status === "running"
                ? `searching · ${formatHashrate(miner.hashrate)} · ${miner.hashes.toLocaleString()} hashes · ${(miner.elapsedMs / 1000).toFixed(1)}s`
                : miner.status === "loading" ? "loading wasm..."
                : miner.status === "found" ? `solution found in ${miner.hashes.toLocaleString()} hashes`
                : miner.status === "stopped" ? "stopped"
                : miner.status === "error" ? `error: ${miner.error}`
                : "idle · connect wallet to mine"
              }
              <span className="term-cursor" />
            </pre>

            {miner.status === "running" && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                <Stat label="hashrate" value={<span className="term-glow">{formatHashrate(miner.hashrate)}</span>} />
                <Stat label="ETA · current diff" value={etaStr} />
                <Stat label="hashes tried" value={miner.hashes.toLocaleString()} />
                <Stat label="elapsed" value={`${(miner.elapsedMs / 1000).toFixed(1)} s`} />
                <Stat label="challenge" value={challenge ? shortHex(challenge as string) : "—"} />
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3 items-center">
              {miner.status === "running" ? (
                <button className="term-btn term-btn-danger" onClick={stopMining}>■ stop</button>
              ) : miner.status === "found" && miner.hit ? (
                <div className="flex gap-3">
                  <button className="term-btn term-btn-amber" onClick={submitMine} disabled={isPending || isConfirming}>
                    {isPending ? "confirm in wallet..." : isConfirming ? "confirming..." : "▸ submit"}
                  </button>
                  <button className="term-btn" onClick={startMining}>▸ mine next</button>
                </div>
              ) : (
                <button className="term-btn" onClick={startMining} disabled={miner.status === "loading"}>
                  ▸ start mining
                </button>
              )}

              <label className="inline-flex items-center gap-2 text-xs text-[var(--color-muted)]">
                <span>tip</span>
                <input type="range" min={0.5} max={25} step={0.5} value={tipGwei}
                  onChange={e => setTipGwei(parseFloat(e.target.value))}
                  className="w-28 cursor-pointer" />
                <span className="text-[var(--color-phosphor)] w-14 text-right">{tipGwei.toFixed(1)} gwei</span>
              </label>
            </div>

            {/* Recent tx */}
            {txHash && (
              <div className="mt-4 text-xs">
                <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-[var(--color-phosphor-dim)] hover:text-[var(--color-phosphor)]">
                  ↗ tx {txHash.slice(0, 10)}…{txHash.slice(-6)}
                </a>
                <span className="ml-2 text-[var(--color-muted)]">
                  {isSuccess ? "✓ confirmed" : txError ? "✗ failed" : isConfirming ? "confirming..." : "pending"}
                </span>
              </div>
            )}

            {txError && (
              <div className="mt-4 border border-[var(--color-danger)] p-3 text-xs text-[var(--color-danger)]">
                tx reverted — epoch rotated, block-cap full, or outbid
              </div>
            )}

            {isSuccess && (
              <div className="mt-4 border border-[var(--color-phosphor-faint)] p-3 text-xs text-[var(--color-phosphor)]">
                Block accepted. +{formatHASH(reward)} HASH delivered to your wallet.
              </div>
            )}
          </>
        ) : (
          <>
            <pre className="text-sm text-[var(--color-muted)]">
              idle · preview only · connect wallet to mine
              <span className="term-cursor" />
            </pre>
            <div className="mt-6">
              <ConnectButton />
            </div>
            <p className="mt-3 text-xs text-[var(--color-muted)] max-w-md">
              your address is part of the challenge — solutions are per-wallet, unstealable from the mempool.
            </p>
          </>
        )}
      </Frame>

      {/* How it works */}
      <Frame title="how it works">
        <ol className="text-sm space-y-2">
          <li><span className="text-[var(--color-phosphor-dim)]">01</span> Browser fetches a per-wallet challenge: keccak256(chainId ‖ contract ‖ you ‖ epoch).</li>
          <li><span className="text-[var(--color-phosphor-dim)]">02</span> N GPU/WASM workers run in parallel, each searching a disjoint nonce range until keccak256(challenge ‖ nonce) &lt; difficulty.</li>
          <li><span className="text-[var(--color-phosphor-dim)]">03</span> On a hit, the page auto-submits mine(nonce) from your wallet. Contract verifies, mints, halves at era boundaries.</li>
          <li><span className="text-[var(--color-phosphor-dim)]">04</span> Epochs rotate every 100 blocks (~200s on Base). The miner hot-swaps the challenge automatically.</li>
        </ol>
        <p className="mt-4 text-xs text-[var(--color-muted)]">
          Address-bound challenges mean nobody can steal your solution from the mempool.
          Max 10 mints per block. Difficulty retargets every 2,016 mints to hold 1 mint/minute globally.
        </p>
      </Frame>
    </div>
  );
}
