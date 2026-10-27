import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Premier League 2025-26",
  description:
    "Season statistics for the 2025-26 Premier League and how well the PL Forecasting models predicted it against the betting market.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
