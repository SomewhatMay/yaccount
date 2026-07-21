import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { RepoBootstrap } from "@/features/RepoBootstrap";

export const metadata: Metadata = {
  title: "yaccount",
  description: "Local-first personal finance",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <RepoBootstrap>
          <header className="border-b border-black/10 dark:border-white/10">
            <nav className="mx-auto flex max-w-2xl items-center gap-4 px-6 py-3 text-sm">
              <span className="font-semibold tracking-tight">yaccount</span>
              <Link href="/" className="opacity-70 hover:opacity-100">
                Ledger
              </Link>
              <Link href="/categories" className="opacity-70 hover:opacity-100">
                Categories
              </Link>
            </nav>
          </header>
          {children}
        </RepoBootstrap>
      </body>
    </html>
  );
}
