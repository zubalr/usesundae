import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sundae — evidence-backed product design review",
  description:
    "Turn a public product page into a prioritized visual review with measured UI evidence, high-taste design judgment, honest coverage gaps, and a transparent ChatGPT handoff.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
