import type { Metadata } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
import './globals.css';

// Cycle-7 fix: Instrument Serif was only loaded inside the OG image route
// (Satori), so the in-browser `font-display` token in tailwind.config.ts
// silently fell back to Georgia for every serif moment in the app. Load
// both via next/font here so the cascade resolves the intended typeface.
// 2026-05-14: `display: optional` on the serif means: use the loaded font
// only if it arrives in the first 100ms; otherwise stay on the cascade
// fallback (Georgia / serif) for this load. No visible font-swap mid-page.
// Inter stays on `swap` because UI text needs the real font for line-
// metrics fidelity.
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
  // Cycle 10 (2026-05-15 night) — the Cycle-9.2 `THEME_BOOT_SCRIPT` inline
  // <head> script and the `headers().get('x-nonce')` lookup it required are
  // both removed. Cycle 10 ships ONE palette (Liquid Dawn — see
  // `globals.css` and `docs/research/2026-05-15-decisive-modern.md`), so
  // there is no theme attribute to write before hydration. The CSP nonce
  // path stays untouched at the middleware layer — nothing in this file
  // emits an inline script anymore.
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable}`}>
      <body className="font-sans antialiased">
        {/* Cycle 9 (2026-05-15) — `ember-glow` ambient radial. Fixed,
            pointer-events-none, z-index 0; mounted at the root so it
            appears on every page. Cycle 10 keeps the radial in role: it's
            the warm pull anchor in the top-right, now reinforcing the
            chromatic gradient's coral terminus instead of fighting a
            neutral ground. Alpha unchanged at 0.14. Decorative — aria-
            hidden. See DESIGN.md §2.13 + §2.15. */}
        <div className="ember-glow" aria-hidden />
        {children}
      </body>
    </html>
  );
}
