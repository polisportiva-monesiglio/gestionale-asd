import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

// next/font scarica il font al build e lo serve dal nostro dominio: nessuna
// richiesta a Google dal browser del visitatore, quindi nessun trasferimento
// del suo indirizzo IP a terzi.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ASD Polisportiva Monesiglio",
  description:
    "Iscrizioni, tesseramenti e area personale dei soci della ASD Polisportiva Monesiglio.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
