import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // CSS-var first so next/font's loader controls the font face (display:
        // swap, subset narrowing, hash-stable filenames). Georgia / Times stay
        // as the cascade fallback for the brief moment before next/font hands
        // back the buffer — see `app/layout.tsx` for the next/font wiring.
        sans: ['var(--font-sans)', '"Inter"', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', '"Instrument Serif"', 'Georgia', 'serif'],
      },
      colors: {
        ink: {
          // Cycle 9 (2026-05-15): the cream `#f7f4ed` ground gave glass
          // nothing to refract — see `docs/research/2026-05-14-modern-color-glass.md`.
          // Retuned to `#e8e6e1` (warm slate / muted putty). The shift gives
          // the header glass a tinted ground to blur, and lets `accent-500`
          // sit as ambient color (the ember radial in `globals.css`) over a
          // canvas with real chroma instead of paper. Cards stay white —
          // the white-card / slate-page contrast is the document-on-table
          // read. `ink-100` and `ink-200` re-stepped so the cascade stays
          // coherent (dividers/borders still read above the new ground).
          50: '#e8e6e1',
          100: '#dad7d1',
          200: '#c4c1bb',
          400: '#8a8a85',
          600: '#3a3a37',
          900: '#101010',
        },
        accent: {
          50: '#fff4ec',
          200: '#ffd4b8',
          500: '#ff6a13',
          600: '#e85806',
        },
      },
      boxShadow: {
        // Cycle 7 (2026-05-14): `soft` retuned for the paper-on-parchment
        // paradigm — the cream page bg needs a slightly heavier card shadow
        // for the document-on-parchment read. Layered: a tight contact
        // shadow + a broader 12px-blur lift. Still shadow-only — §2.7
        // (shadow XOR border) is preserved; do NOT add a 1px border to
        // cards to "amp it up further".
        soft: '0 4px 12px -4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        lift: '0 2px 4px rgba(16,16,16,0.06), 0 16px 40px -12px rgba(16,16,16,0.14)',
        glow: '0 0 0 6px rgba(255,106,19,0.12), 0 8px 24px -8px rgba(255,106,19,0.45)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};

export default config;
