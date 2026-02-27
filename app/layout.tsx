import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Nexus",
    template: "%s | Nexus",
  },
  description: "Nexus Streamer Dashboard",
  applicationName: "Nexus",
  themeColor: "#070a12",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Nexus",
    description: "Nexus Streamer Dashboard",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Nexus Background (from globals.css) */}
        <div className="nexus-bg" />
        {children}
      </body>
    </html>
  );
}