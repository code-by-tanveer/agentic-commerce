import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Inter, Instrument_Serif } from 'next/font/google';
import './globals.css';
import { THEME_BOOT_SCRIPT } from '@/hooks/useTheme';

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
  // Cycle 9.2 (2026-05-15 PM) — read the per-request CSP nonce so the
  // theme-boot inline script passes script-src. The CSP middleware in
  // `frontend/middleware.ts` writes `script-src 'self' 'nonce-<x>'` on
  // every page response; without a matching `nonce` attribute the inline
  // script would be blocked (per spec, when CSP includes a nonce source,
  // `'unsafe-inline'` is IGNORED for inline scripts that don't carry it).
  // `headers().get('x-nonce')` is the same lookup Next 14's framework
  // uses internally to nonce its own bootstrap scripts.
  const nonce = headers().get('x-nonce') ?? undefined;
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable}`}>
      <head>
        {/* Cycle 9.2 (2026-05-15 PM) — theme boot. The inline script runs
            synchronously in <head> BEFORE React hydrates, reading the
            persisted `trove-theme` value from localStorage (or falling
            back to `prefers-color-scheme`) and writing `data-theme` on
            <html>. Without this the page would paint the light-mode
            default and swap to dark on the first effect tick — a visible
            flash on every cold load for dark-mode users. `next-themes`
            ships this exact pattern; we inline the four-line equivalent
            ourselves per the constraint to roll the toggle in-house.
            The `nonce` is required because the CSP middleware writes a
            strict `script-src 'self' 'nonce-<x>'`; the inline script
            would otherwise be blocked. See `hooks/useTheme.ts` for the
            source string + DESIGN.md §2.14. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}
        />
      </head>
      <body className="font-sans antialiased">
        {/* Cycle 9 (2026-05-15) — `ember-glow` ambient radial. Fixed,
            pointer-events-none, z-index 0; mounted at the root so it
            appears on every page (chat shell, /s/[id] summary, share).
            Paints `accent-500` at 14% alpha in the top-right (Cycle 9.1
            bump from 10% — the deeper `#c9c4ba` ground absorbed the
            softer ember; 14% restores the warmth without crossing into
            "decorative AI gradient"). See DESIGN.md §2.13. Decorative —
            `aria-hidden`. */}
        <div className="ember-glow" aria-hidden />
        {children}
      </body>
    </html>
  );
}
