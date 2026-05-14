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
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
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
