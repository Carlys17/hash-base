"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Frame, Stat, ProgressBar, formatHASH } from "@/components/ui";
import { ABI, CONTRACT_ADDRESS, IS_CONFIGURED } from "@/lib/contract";

export default function GenesisPage() {
  const { isConnected } = useAccount();
  const [units, setUnits] = useState(1);

  const { data: genesisMinted } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ABI, functionName: "genesisMinted",
    query: { enabled: IS_CONFIGURED, refetchInterval: 12_000 },
  });

  const { data: genesisEthRaised } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ABI, functionName: "genesisEthRaised",
    query: { enabled: IS_CONFIGURED, refetchInterval: 12_000 },
  });

  const { data: genesisComplete } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ABI, functionName: "genesisComplete",
    query: { enabled: IS_CONFIGURED, refetchInterval: 12_000 },
  });

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const minted = genesisMinted ?? 0n;
  const remaining = 1_050_000n * 10n ** 18n - minted;
  const ethRaised = genesisEthRaised ?? 0n;
  const progress = Number(minted) / Number(1_050_000e18);

  const handleMint = () => {
    reset();
    writeContract({
      address: CONTRACT_ADDRESS!, abi: ABI, functionName: "mintGenesis",
      args: [BigInt(units)],
      value: BigInt(units) * 10_000_000_000_000_000n, // 0.01 ETH per unit
    });
  };

  if (!IS_CONFIGURED) {
    return <Frame title="not configured"><p className="text-sm text-[var(--color-muted)]">Contract not deployed yet.</p></Frame>;
  }

  if (genesisComplete) {
    return (
      <div className="space-y-6">
        <Frame title="genesis complete">
          <div className="text-lg text-[var(--color-phosphor)] term-glow mb-4">
            Genesis sold out. Pool seeded. Mining is open.
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="minted" value={`${formatHASH(minted)} HASH`} amber />
            <Stat label="eth raised" value={`${Number(ethRaised) / 1e18} ETH`} />
            <Stat label="pool" value="V4 · locked forever" />
            <Stat label="left to mine" value="18,900,000 HASH" hint="~290 days" />
          </div>
          <a href="/mine" className="term-btn term-btn-amber inline-block mt-4">▸ start mining</a>
        </Frame>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl term-glow uppercase tracking-widest">genesis mint</h1>
        <p className="text-sm text-[var(--color-muted)]">Buy HASH at fixed price. All ETH locked until pool seeds.</p>
      </header>

      <Frame title="genesis">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8">
          <Stat label="price" value="0.01 ETH / 1,000 HASH" />
          <Stat label="$ per hash" value="$0.03" />
          <Stat label="max per tx" value="5,000 HASH · 0.05 ETH" />
          <Stat label="remaining" value={`${formatHASH(remaining)} HASH`} amber />
          <Stat label="raised" value={`${Number(ethRaised) / 1e18} ETH`} />
          <Stat label="progress" value={`${(progress * 100).toFixed(2)}%`} />
        </dl>

        <div className="mt-6">
          <ProgressBar progress={progress} amber />
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-xs text-[var(--color-muted)] uppercase tracking-widest">units</label>
            <div className="flex gap-2">
              {[1, 2, 3, 5].map(u => (
                <button key={u} className={`term-btn ${units === u ? "term-btn-amber" : ""}`} onClick={() => setUnits(u)}>
                  {u}
                </button>
              ))}
            </div>
            <span className="text-xs text-[var(--color-muted)]">
              = {units * 1000} HASH · {(units * 0.01).toFixed(2)} ETH
            </span>
          </div>

          {isConnected ? (
            <div className="flex gap-3">
              <button className="term-btn term-btn-amber" onClick={handleMint} disabled={isPending || isConfirming}>
                {isPending ? "▸ confirm in wallet..." : isConfirming ? "▸ confirming..." : "▸ mint"}
              </button>
            </div>
          ) : (
            <ConnectButton />
          )}

          {txHash && (
            <div className="text-xs">
              <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-[var(--color-phosphor-dim)]">
                ↗ tx {txHash.slice(0, 10)}…{txHash.slice(-6)}
              </a>
              {isSuccess && <span className="ml-2 text-[var(--color-phosphor)]">✓ minted — HASH delivered</span>}
            </div>
          )}
        </div>
      </Frame>

      {/* Phase info */}
      <Frame title="phases">
        <div className="space-y-4 text-sm">
          <div>
            <div className="text-[var(--color-phosphor-dim)] uppercase tracking-widest text-xs mb-1">phase 1 · genesis</div>
            <ul className="text-[var(--color-muted)] space-y-1">
              <li>Buy at fixed $0.03 per HASH</li>
              <li>No per-wallet cap · first come first served</li>
              <li>Closes at 1,050,000 HASH sold</li>
              <li>All ETH locked until pool seeds</li>
            </ul>
          </div>
          <div>
            <div className="text-[var(--color-phosphor-dim)] uppercase tracking-widest text-xs mb-1">phase 2 · seed</div>
            <ul className="text-[var(--color-muted)] space-y-1">
              <li>Anyone calls seedPool()</li>
              <li>Hook mints 1,050,000 HASH</li>
              <li>Seeds V4 pool: ETH + HASH</li>
              <li>Pool opens at $0.03. LP locked forever</li>
            </ul>
          </div>
          <div>
            <div className="text-[var(--color-phosphor-dim)] uppercase tracking-widest text-xs mb-1">phase 3 · mining</div>
            <ul className="text-[var(--color-muted)] space-y-1">
              <li>Browser GPU + WASM fallback</li>
              <li>Era 1: 100 HASH per solution</li>
              <li>Halvings every 100,000 mints</li>
              <li>~290 days to fully distribute</li>
            </ul>
          </div>
        </div>
      </Frame>
    </div>
  );
}
