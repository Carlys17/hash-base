import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import { Navigation } from "@/components/Navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "$HASH — Base | Browser-mined PoW token",
  description: "Browser-mined post-quantum token on Base L2. Mine $HASH with your GPU.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Navigation />
            <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
              {children}
            </main>
            <footer className="border-t border-[var(--color-phosphor-faint)] px-4 py-4 text-[10px] text-[var(--color-muted)]">
              <div className="max-w-5xl mx-auto flex items-center justify-between">
                <span>$ hash --version 0.1.0</span>
                <div className="flex gap-4">
                  <a href="https://basescan.org" target="_blank" rel="noreferrer" className="hover:text-[var(--color-phosphor)]">basescan</a>
                  <a href="https://app.uniswap.org" target="_blank" rel="noreferrer" className="hover:text-[var(--color-phosphor)]">uniswap</a>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
