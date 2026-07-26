import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://example.com"),
  title: "Горн — кузница",
  description: "Бей по наковальне, копи слитки, нанимай подмастерьев и куй легендарное оружие.",
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: "/",
    title: "Горн — кузница",
    description: "Бей по наковальне, копи слитки, нанимай подмастерьев и куй легендарное оружие.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Горн — кузница" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Горн — кузница",
    description: "Бей по наковальне, копи слитки, нанимай подмастерьев и куй легендарное оружие.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
