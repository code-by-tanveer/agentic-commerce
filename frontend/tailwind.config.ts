import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', '"Inter"', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', '"Instrument Serif"', 'Georgia', 'serif'],
      },
      colors: {
        ink: {
          // Cycle 10 (2026-05-15 night) — single palette, no theme switching.
          // The Cycle 9.2 `[data-theme]`/CSS-var swap is collapsed to ONE
          // resolved set: the body paints a chromatic gradient (see
          // `globals.css :root --page-gradient`) and the ink tokens carry
          // the text + border roles ONLY. `ink-50` is no longer the "page
          // background" — the page ground is the gradient. We keep
          // `ink-50` mapped to a near-white that's only used as a CHIP
          // background (Add picker, segmented control) — anywhere else
          // that wrote `bg-ink-50` for a "page" surface needs to be
          // audited; the chip use-sites are fine on a glass card because
          // they pop slightly cooler than the card tint.
          //
          // History: Cycle 9.1 was `#c9c4ba` warm taupe; Cycle 9.2 was
          // `var(--surface-page) #b8c1c8` cool slate (with a dark twin).
          // Cycle 10 cuts both — ink-50 is a chip surface, not a page.
          50:  '#f3f1ee',
          100: 'var(--border-subtle)',  // hairlines / chip skeletons
          200: 'var(--border-strong)',  // card / input borders
          400: 'var(--text-tertiary)',
          600: 'var(--text-secondary)',
          900: 'var(--text-primary)',
        },
        // Cycle 9.2 introduced the `surface-*` semantic group. Cycle 10
        // keeps the names but flattens to single resolved values; the
        // surface-card now resolves to the tinted-glass alpha (see
        // `--surface-card-rgba` in globals.css), and surface-rail resolves
        // to its sibling. Components prefer the `.surface-glass-*` utility
        // classes for the full glass treatment (blur + saturate + border);
        // these tokens are the fallback when only the tint is needed.
        surface: {
          card: 'var(--surface-card-rgba)',
          rail: 'var(--surface-rail-rgba)',
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
          // Accent stays brand-stable — orange is the commerce-intent
          // signal (§2.2). Unchanged through every cycle.
          50: '#fff4ec',
          200: '#ffd4b8',
          500: '#ff6a13',
          600: '#e85806',
        },
      },
      boxShadow: {
        // Cycle 10 (2026-05-15 night): `soft` retuned for tinted-glass
        // cards on a chromatic ground. Slightly deeper contact + a stronger
        // lift shadow because the gradient ground absorbs softer shadows.
        // The `.surface-glass-card` utility carries its own composite
        // box-shadow including an inner white highlight for the specular
        // glass edge — `shadow-soft` remains the fallback for components
        // that opt out of the full glass treatment.
        soft: '0 4px 12px -4px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)',
        lift: '0 6px 16px -4px rgba(16,16,16,0.14), 0 24px 48px -12px rgba(16,16,16,0.22)',
        glow: '0 0 0 6px rgba(255,106,19,0.18), 0 8px 24px -8px rgba(255,106,19,0.55)',
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
