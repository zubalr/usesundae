import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://usesundae.vercel.app"),
  title: "Sundae — The shared WebMCP product-audit workspace",
  description:
    "A person and ChatGPT audit the same live page: Site Tools record evidence, the person governs decisions, and fresh recapture is required before anything is called fixed.",
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Sundae — The shared WebMCP product-audit workspace",
    description:
      "A person and ChatGPT audit the same live page: Site Tools record evidence, the person governs decisions, and fresh recapture is required before anything is called fixed.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Sundae workbench mark: ink rail, coral rule, teal evidence bar",
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
