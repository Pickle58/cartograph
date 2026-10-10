import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeSync } from "@/components/theme-sync";
import { themeBootScript } from "@/lib/theme";
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
  title: "Cartograph",
  description: "A dependency map of a public GitHub repository.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The boot script rewrites data-theme before React hydrates.
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeSync />
        <ClerkProvider
          appearance={{
            cssLayerName: "clerk",
            // CSS variables, so Clerk's components switch with the theme
            // instead of needing a second light/dark config.
            variables: {
              colorPrimary: "var(--accent)",
              colorPrimaryForeground: "var(--accent-fg)",
              colorBackground: "var(--surface-raised)",
              colorForeground: "var(--fg)",
              colorMutedForeground: "var(--muted)",
              colorMuted: "var(--surface-sunken)",
              colorInput: "var(--surface)",
              colorInputForeground: "var(--fg)",
              colorBorder: "var(--border)",
              colorNeutral: "var(--fg)",
              fontFamily: "var(--font-geist-sans)",
              fontFamilyMono: "var(--font-geist-mono)",
              fontSize: "13px",
              borderRadius: "4px",
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
