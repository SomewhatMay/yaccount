import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { RepoBootstrap } from "@/features/RepoBootstrap";
import { AppShell } from "@/features/AppShell";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
// Fraunces: soft, characterful serif — used only for display moments (§ design pass).
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "yaccount",
  description: "Local-first personal finance",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(geist.variable, geistMono.variable, fraunces.variable)}
    >
      <body className="bg-background min-h-screen font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <RepoBootstrap>
            <AppShell>{children}</AppShell>
            <Toaster position="bottom-right" />
          </RepoBootstrap>
        </ThemeProvider>
      </body>
    </html>
  );
}
