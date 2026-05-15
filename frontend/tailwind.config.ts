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
          // Cycle 9.2 (2026-05-15 PM) — the `ink-*` palette is now bound to
          // CSS custom properties so it flips between the light cool-slate
          // and dark deep-charcoal themes per `<html data-theme>`. The
          // literal hex history is preserved in DESIGN.md §2.1 and §2.14.
          // Components that wrote `bg-ink-50` / `text-ink-900` / etc. don't
          // change; the resolved color flips at the variable layer.
          //
          // Mapping (see globals.css `:root` + `[data-theme="dark"]`):
          //   ink-50  → --surface-page    (page bg)
          //   ink-100 → --border-subtle   (hairlines / skeletons)
          //   ink-200 → --border-strong   (card / input borders)
          //   ink-400 → --text-tertiary   (meta, captions)
          //   ink-600 → --text-secondary  (body)
          //   ink-900 → --text-primary    (anchor)
          //
          // Cycle 9.1 history: literal `#c9c4ba` / `#bdb8af` / `#a8a39a` /
          // `#5e5d58` / `#3a3a37` / `#101010` shipped warm-taupe. Cycle 9.2
          // shifts the LIGHT palette to a cool slate-blue (`#b8c1c8`) per
          // user direction and adds a dark mode.
          50: 'var(--surface-page)',
          100: 'var(--border-subtle)',
          200: 'var(--border-strong)',
          400: 'var(--text-tertiary)',
          600: 'var(--text-secondary)',
          900: 'var(--text-primary)',
        },
        // New semantic group introduced 2026-05-15 PM (Cycle 9.2). Use
        // `bg-surface-card` / `bg-surface-rail` / `text-text-primary` in
        // new code. Existing `ink-*` continues to work; the surface group
        // is the named layer for component authors who want explicit
        // semantic intent (a "card" vs "page" surface).
        surface: {
          page: 'var(--surface-page)',
          card: 'var(--surface-card)',
          rail: 'var(--surface-rail)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        accent: {
          // Accent stays brand-stable across themes — orange is the
          // commerce-intent signal (§2.2). Same hex, light and dark.
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
