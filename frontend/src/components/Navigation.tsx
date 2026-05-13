"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";

export function Navigation() {
  return (
    <nav className="border-b border-[var(--color-phosphor-faint)] px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-[var(--color-phosphor)] term-glow text-sm uppercase tracking-widest">
            $HASH
          </Link>
          <span className="text-[10px] text-[var(--color-muted)] uppercase tracking-widest hidden sm:inline">
            // browser-mined · base L2
          </span>
          <div className="flex gap-4 text-xs">
            <Link href="/genesis" className="text-[var(--color-muted)] hover:text-[var(--color-phosphor)]">genesis</Link>
            <Link href="/mine" className="text-[var(--color-muted)] hover:text-[var(--color-phosphor)]">mine</Link>
            <Link href="/pool" className="text-[var(--color-muted)] hover:text-[var(--color-phosphor)]">pool</Link>
          </div>
        </div>
        <ConnectButton chainStatus="icon" showBalance={false} />
      </div>
    </nav>
  );
}
