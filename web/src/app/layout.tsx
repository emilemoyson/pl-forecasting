import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Premier League 2025-26",
  description:
    "Season statistics for the 2025-26 Premier League and how well the PL Forecasting models predicted it against the betting market.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
            <p className="text-[13px] font-medium text-ink-2">PL Forecasting · Season review</p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-ink sm:text-[30px]">
              Premier League 2025-26
            </h1>
            <div className="mt-3">
              <Nav />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-10 text-[12px] leading-relaxed text-muted sm:px-6">
          Data: football-data.co.uk (results, match stats, odds), Understat (xG, expected points, pressing, players).
          Market probabilities use average closing odds with the margin removed proportionally. Club crests are
          trademarks of their clubs, shown for a non-commercial class project. Models from the{" "}
          <a className="underline hover:text-ink" href="https://github.com/emilemoyson/pl-forecasting">pl-forecasting</a> repo.
        </footer>
      </body>
    </html>
  );
}
