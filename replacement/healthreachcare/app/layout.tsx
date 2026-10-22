import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HealthReachCare | Healthcare, within reach.",
  description: "A connected healthcare marketplace demonstration.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
