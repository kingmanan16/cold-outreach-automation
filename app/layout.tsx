import type { Metadata } from "next";
import { Instrument_Sans, Fraunces } from "next/font/google";
import "./globals.css";

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cold Outreach",
  description: "Sequence outreach — track follow-ups, schedule, and replies",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${sans.variable} ${display.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
