import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://usesundae.vercel.app"),
  title: "Sundae — Review a live product with your AI",
  description:
    "Inspect a real page with ChatGPT, keep every finding tied to evidence, and verify improvements on the same visible workspace.",
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Sundae — Review a live product with your AI",
    description:
      "Inspect a real page with ChatGPT, keep every finding tied to evidence, and verify improvements on the same visible workspace.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Sundae split workbench: live product on the left, evidence and a verified finding on the right, with the line Review a live product with your AI—and see the proof.",
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
