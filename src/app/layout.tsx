import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrackFi - Shared Expense Tracker",
  description: "Track and split shared & personal expenses with your partner. Import, export, and manage categories.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
