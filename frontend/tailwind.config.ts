import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      colors: {
        ink: {
          50: '#f7f7f5',
          100: '#ededea',
          200: '#d6d6d1',
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
        soft: '0 1px 2px rgba(16,16,16,0.04), 0 8px 24px -8px rgba(16,16,16,0.08)',
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
