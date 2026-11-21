import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { parseTheme, THEME_COLOR } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Display face for card headings (weight 500 only: hierarchy comes from size, not weight)
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], weight: ["500"] });

export const metadata: Metadata = {
  title: { default: "Spend Analyser", template: "%s · Spend Analyser" },
  description: "Track expenses and income, plan budgets, and understand where your money goes.",
  applicationName: "Spend Analyser",
  manifest: "/manifest.webmanifest",
};

// Browser chrome colour follows the chosen theme (the theme cookie); "system" follows the OS.
export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get("theme")?.value);
  return {
    themeColor:
      theme === "system"
        ? [
            { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
            { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
          ]
        : THEME_COLOR[theme],
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = parseTheme((await cookies()).get("theme")?.value);
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full`}
    >
      <body className="min-h-full">
        {children}
        <Toaster theme={theme} position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
