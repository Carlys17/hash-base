"use client";

import { type ReactNode } from "react";

// ── Frame: Terminal-style bordered section ─────────────────────
export function Frame({ title, right, children }: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border border-[var(--color-phosphor-faint)] p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-[0.2em] text-[var(--color-phosphor-dim)]">
          ┌ {title}
        </h2>
        {right && <div className="text-xs text-[var(--color-muted)]">{right}</div>}
      </div>
      {children}
    </section>
  );
}

// ── Stat: Single label/value pair ─────────────────────────────
export function Stat({ label, value, hint, amber }: {
  label: string;
  value: ReactNode;
  hint?: string;
  amber?: boolean;
}) {
  return (
    <div className="py-2">
      <dt className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
        {label}
      </dt>
      <dd className={`text-sm font-mono ${amber ? "text-[var(--color-amber)]" : "text-[var(--color-text)]"}`}>
        {value}
      </dd>
      {hint && (
        <span className="text-[10px] text-[var(--color-muted)]">{hint}</span>
      )}
    </div>
  );
}

// ── Progress Bar ──────────────────────────────────────────────
export function ProgressBar({ progress, width = 48, amber }: {
  progress: number;
  width?: number;
  amber?: boolean;
}) {
  const filled = Math.round(Math.max(0, Math.min(1, progress)) * width);
  const empty = width - filled;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-[var(--color-muted)]">[</span>
      <span className={amber ? "text-[var(--color-amber)]" : "text-[var(--color-phosphor)]"}>
        {"█".repeat(filled)}
      </span>
      <span className="text-[var(--color-phosphor-faint)]">
        {"░".repeat(empty)}
      </span>
      <span className="text-[var(--color-muted)]">]</span>
      <span className={amber ? "text-[var(--color-amber)]" : "text-[var(--color-phosphor)]"}>
        {(progress * 100).toFixed(2)}%
      </span>
    </div>
  );
}

// ── Alert Banner ──────────────────────────────────────────────
export function Alert({ variant, children }: {
  variant: "info" | "error" | "warning";
  children: ReactNode;
}) {
  const colors = {
    info: "border-[var(--color-phosphor-faint)] text-[var(--color-phosphor-dim)]",
    error: "border-[var(--color-danger)] text-[var(--color-danger)]",
    warning: "border-[var(--color-amber)] text-[var(--color-amber)]",
  };
  return (
    <div className={`border ${colors[variant]} p-3 text-xs`}>
      {children}
    </div>
  );
}

// ── Utilities ─────────────────────────────────────────────────
export function shortAddr(addr: string, pre = 6, suf = 4): string {
  if (!addr) return "—";
  return `${addr.slice(0, pre)}…${addr.slice(-suf)}`;
}

export function shortHex(hex: string, pre = 10, suf = 6): string {
  if (!hex) return "—";
  const h = hex.startsWith("0x") ? hex : `0x${hex}`;
  return `${h.slice(0, pre)}…${h.slice(-suf)}`;
}

export function formatHashrate(hps: number): string {
  if (hps <= 0) return "0 H/s";
  const units = ["H/s", "kH/s", "MH/s", "GH/s"];
  let i = 0;
  let v = hps;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return `${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)} ${units[i]}`;
}

export function formatHASH(wei: bigint): string {
  const n = Number(wei) / 1e18;
  if (n === 0) return "0";
  if (n < 0.01) return n.toExponential(2);
  if (n < 1000) return n.toFixed(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}
