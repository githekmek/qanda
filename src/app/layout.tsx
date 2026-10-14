import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
  title: "Q&A – Das Spiel zu unserem Podcast",
  description: "Zwei-Spieler Frage-Antwort-Spiel: Stellt euch abwechselnd Fragen und deckt die Antworten gemeinsam auf.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  const user = session ? await prisma.user.findUnique({ where: { id: session.userId }, select: { theme: true } }) : null;
  return (
    <html
      lang="de"
      data-theme={user?.theme ?? "standard"}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
