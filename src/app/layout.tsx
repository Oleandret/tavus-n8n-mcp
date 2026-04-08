import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tavus ↔ n8n ↔ MCP",
  description: "Real-time Tavus CVI med n8n og MCP-integrasjon",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nb">
      <body>{children}</body>
    </html>
  );
}
