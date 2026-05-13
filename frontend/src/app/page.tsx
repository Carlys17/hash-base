"use client";

export default function Home() {
  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <h1 className="text-4xl term-glow uppercase tracking-widest">$HASH</h1>
        <p className="text-[var(--color-muted)] max-w-2xl">
          Browser-mined · post-quantum · Base L2
        </p>
        <p className="text-sm text-[var(--color-muted)] max-w-2xl">
          Mine $HASH from your browser. Phone or PC. No downloads. WebGPU when your browser has it, WASM otherwise.
          The same quantum-resistant cryptography, running on Base.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <a href="/genesis" className="border border-[var(--color-phosphor-faint)] p-4 hover:border-[var(--color-phosphor)] transition-colors">
          <div className="text-xs text-[var(--color-phosphor-dim)] uppercase tracking-widest mb-2">Phase 1</div>
          <div className="text-lg text-[var(--color-phosphor)] term-glow">Genesis</div>
          <div className="text-xs text-[var(--color-muted)] mt-1">Buy at fixed $0.03/HASH</div>
        </a>
        <a href="/mine" className="border border-[var(--color-phosphor-faint)] p-4 hover:border-[var(--color-phosphor)] transition-colors">
          <div className="text-xs text-[var(--color-phosphor-dim)] uppercase tracking-widest mb-2">Phase 3</div>
          <div className="text-lg text-[var(--color-phosphor)] term-glow">Mine</div>
          <div className="text-xs text-[var(--color-muted)] mt-1">Brute-force keccak256</div>
        </a>
        <a href="/pool" className="border border-[var(--color-phosphor-faint)] p-4 hover:border-[var(--color-phosphor)] transition-colors">
          <div className="text-xs text-[var(--color-phosphor-dim)] uppercase tracking-widest mb-2">Pool</div>
          <div className="text-lg text-[var(--color-phosphor)] term-glow">Uniswap V4</div>
          <div className="text-xs text-[var(--color-muted)] mt-1">ETH/HASH liquidity</div>
        </a>
      </div>

      <section className="border border-[var(--color-phosphor-faint)] p-6 space-y-4">
        <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--color-phosphor-dim)]">┌ supply</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">total</dt>
            <dd className="text-[var(--color-phosphor)]">21,000,000 HASH</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">genesis · 5%</dt>
            <dd>1,050,000 HASH @ $0.03</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">mining · 90%</dt>
            <dd>18,900,000 HASH (PoW)</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">team / vc / airdrop</dt>
            <dd className="text-[var(--color-phosphor)]">0%</dd>
          </div>
        </dl>
      </section>

      <section className="border border-[var(--color-phosphor-faint)] p-6 space-y-3">
        <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--color-phosphor-dim)]">┌ emission</h2>
        <div className="text-sm space-y-1">
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">era 1</span><span>100 HASH/mint · ~69 days</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">era 2</span><span>50 HASH/mint</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">era 3</span><span>25 HASH/mint</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">era 4</span><span>12.5 HASH/mint</span></div>
          <div className="flex justify-between"><span className="text-[var(--color-muted)]">halving cadence</span><span>every 100,000 mints</span></div>
          <div className="flex justify-between text-[var(--color-phosphor)]"><span>full distribution</span><span>~290 days</span></div>
        </div>
      </section>
    </div>
  );
}
