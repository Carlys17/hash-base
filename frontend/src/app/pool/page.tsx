"use client";

import { useReadContract } from "wagmi";
import { Frame, Stat } from "@/components/ui";
import { ABI, CONTRACT_ADDRESS, IS_CONFIGURED } from "@/lib/contract";

export default function PoolPage() {
  const { data: poolKey } = useReadContract({
    address: CONTRACT_ADDRESS, abi: ABI, functionName: "poolKey",
    query: { enabled: IS_CONFIGURED },
  });

  const isSeeded = poolKey && poolKey[0] !== "0x0000000000000000000000000000000000000000";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl term-glow uppercase tracking-widest">pool</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Uniswap V4 ETH/HASH pool. Single full-range LP, permanently locked.
        </p>
      </header>

      {isSeeded ? (
        <>
          <Frame title="pool snapshot" right={<span className="text-[var(--color-phosphor)]">● live</span>}>
            <dl className="grid grid-cols-2 gap-x-8">
              <Stat label="pool" value="Uniswap V4" />
              <Stat label="fee" value={`${Number(poolKey![2]) / 10000}%`} />
              <Stat label="tick spacing" value={poolKey![3].toString()} />
              <Stat label="hooks" value={poolKey![4] === CONTRACT_ADDRESS ? "HashBase" : poolKey![4]} />
            </dl>
            <div className="mt-4 text-xs text-[var(--color-muted)]">
              Uniswap V4 full-range LP · permanently locked to the contract.
            </div>
          </Frame>

          <a
            href={`https://app.uniswap.org/swap?chain=base&inputCurrency=ETH&outputCurrency=${CONTRACT_ADDRESS}`}
            target="_blank" rel="noreferrer"
            className="term-btn inline-block"
          >
            ↗ trade on uniswap
          </a>
        </>
      ) : (
        <Frame title="pool not open">
          <p className="text-sm text-[var(--color-muted)]">
            Pool is not open yet. Genesis must sell out and seedPool() must be called to open trading at $0.03.
          </p>
          <a href="/genesis" className="term-btn inline-block mt-4">▸ go to genesis</a>
        </Frame>
      )}
    </div>
  );
}
