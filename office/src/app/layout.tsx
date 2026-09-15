import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GUILDLESS Office",
  description: "3D AI office visualizing real GUILDLESS activity."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
