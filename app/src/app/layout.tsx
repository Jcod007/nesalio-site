import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/caveat/600.css";
import "@fontsource-variable/bricolage-grotesque";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nesalio · Essaie Nesalio",
  description:
    "Pose ta question de maths ou de sciences : Nesa te répond à voix haute en dessinant l'explication au tableau. Secondaire 4-5 et cégep.",
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F6F8FC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr-CA">
      <body>
        {children}
        {/* Nesa, la mascotte du site, partagée telle quelle (élément <nesa-mascot>). */}
        <Script src="/nesa.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
