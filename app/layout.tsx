import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://usesundae.vercel.app"),
  title: "Sundae: Review a live product with your AI",
  description:
    "Review a live page with ChatGPT. Keep each finding tied to evidence, decide what changes, and verify fixes in the same workspace.",
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Sundae: Review a live product with your AI",
    description:
      "Review a live page with ChatGPT. Keep each finding tied to evidence, decide what changes, and verify fixes in the same workspace.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Sundae workbench with a live product on the left and verified evidence on the right.",
      },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
