import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sundae — The shared WebMCP product-audit workspace",
  description:
    "A person and ChatGPT audit the same live page: Site Tools record evidence, the person governs decisions, and fresh recapture is required before anything is called fixed.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
