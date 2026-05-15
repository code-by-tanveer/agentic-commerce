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
          // Cycle 9.1 (2026-05-15 PM): the `#e8e6e1` warm-slate shipped this
          // morning was still too light — the single ember radial gave the
          // header glass *some* chroma to refract but the underlying ground
          // remained ~93% lightness, so the blur barely registered against
          // the rest of the page. Direction C (deeper warm taupe) explored
          // in `tests/e2e/glass-options-explore.spec.ts` is the chosen
          // ground — `#c9c4ba` (deeper, more saturation, more depth). White
          // cards POP against it (the document-on-table read is now vivid),
          // and `backdrop-blur-xl` on the header *visibly* bends the darker
          // ground into a lighter, hazier strip across the top. The ember
          // radial sits at 14% alpha to register against the deeper ground
          // — see `globals.css` `.ember-glow`. Cascade re-stepped: `ink-100`
          // `#bdb8af` and `ink-200` `#a8a39a` so dividers/borders still
          // read above the new ground.
          //
          // Contrast accounting — `ink-400` shifted from `#8a8a85` to
          // `#5e5d58`. The lighter `#8a8a85` on `#c9c4ba` computes ~2.1:1
          // — fails even the large-text 3:1 carve-out. `#5e5d58` on
          // `#c9c4ba` computes ~4.1:1, which passes AA for body text and
          // restores the `text-quiet` carve-out's headroom. The optical
          // weight of the placeholder/meta tier shifts slightly darker;
          // walked through `tests/e2e/screenshots/glass-final-1280.png` to
          // confirm it doesn't read as "anchor" weight.
          //
          // Cycle 9 (2026-05-15 AM) history: cream `#f7f4ed` → warm slate
          // `#e8e6e1`. Cycle 9.1 (this commit) deepens to `#c9c4ba`. See
          // DESIGN.md §2.1 for the full chain.
          50: '#c9c4ba',
          100: '#bdb8af',
          200: '#a8a39a',
          400: '#5e5d58',
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
