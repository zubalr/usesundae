import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sundae — ChatGPT WebMCP product audits",
  description:
    "Let ChatGPT operate a visible product-design audit board through WebMCP Site Tools, with measured evidence, reversible previews, and fresh verification.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
