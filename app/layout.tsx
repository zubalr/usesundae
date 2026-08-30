import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sundae — Audit the same live page together",
  description:
    "A shared WebMCP audit workspace where ChatGPT measures and organizes evidence, the person governs judgment, and Sundae requires fresh proof before a fix is verified.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
