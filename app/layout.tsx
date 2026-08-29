import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sundae — product design reviews with evidence",
  description:
    "Audit a public product with ChatGPT, inspect evidence-linked UI and UX findings, preview a bounded improvement, and verify what changed.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
