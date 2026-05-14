import type { Metadata } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
import './globals.css';

// Cycle-7 fix: Instrument Serif was only loaded inside the OG image route
// (Satori), so the in-browser `font-display` token in tailwind.config.ts
// (`['"Instrument Serif"', 'Georgia', 'serif']`) silently fell back to
// Georgia / Times for every serif moment in the app — Header wordmark,
// welcome held-shape headline, ProductCard total price, ProfileMenu
// "About you" eyebrow. Load both via next/font here so the cascade
// resolves the intended typeface across the whole shell.
// 2026-05-14: `display: optional` on the serif means: use the loaded font
// only if it arrives in the first 100ms; otherwise stay on the cascade
// fallback (Georgia / serif) for this load. No visible font-swap mid-page,
// no FOIT/FOUT flicker — the user perceives instant paint. Inter stays on
// `swap` because UI text needs the real font for line-metrics fidelity.
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'optional',
});

export const metadata: Metadata = {
  title: 'Trove',
  description: 'Conversational product discovery powered by Shopify Catalog MCP.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
