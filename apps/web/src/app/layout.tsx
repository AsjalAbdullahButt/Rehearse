import type { Metadata } from "next";
import { headers } from "next/headers";
import { Bricolage_Grotesque, Geist, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { SmoothScrollProvider } from "@/components/theme/smooth-scroll-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ToastProvider } from "@/components/ui/toast";

import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Rehearse — AI mock interview coach",
    template: "%s — Rehearse",
  },
  description:
    "Practice interviews out loud. Rehearse transcribes your answer, measures filler words, pace and pauses, scores behavioral, technical, and situational answers, and shows a stronger sample answer.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading the request's headers opts the whole app into per-request rendering. The CSP
  // (src/proxy.ts) carries a fresh nonce on every response, and Next can only stamp that nonce
  // onto a page's scripts while rendering the request — a prerendered page has none, so the
  // browser blocks all of its scripts and the page never hydrates (caught only by loading the
  // production build in a real browser). The same nonce goes to next-themes' inline script,
  // which otherwise is blocked too and the saved theme isn't applied before first paint.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${geist.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="font-body flex min-h-full flex-col">
        <ThemeProvider
          nonce={nonce}
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <SmoothScrollProvider>
            <ToastProvider>{children}</ToastProvider>
          </SmoothScrollProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
