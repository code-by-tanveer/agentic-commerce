// Round 2 polish (T2.11, persona-sasha) — display-name lookup for the
// `MerchantInfo.originCountry` field.
//
// The BE normalizer (`backend/src/services/normalize.ts::pickOriginCountry`)
// uppercases two-letter inputs that look like ISO-3166 alpha-2 codes and
// passes through everything else verbatim. This helper resolves the alpha-2
// codes a merchant is most likely to publish into reader-friendly names; any
// code we don't recognise (longer strings, free-form "northern Italy", or an
// alpha-2 we forgot to add) falls through unchanged so the line still renders
// instead of disappearing. Keep this list small and Western-leaning toward
// the markets the catalog actually returns — adding more codes is cheap.
//
// Why not a runtime `Intl.DisplayNames` lookup? It works, but it pulls in
// CLDR data and bloats first-paint for a one-line decoration. A 20-entry
// hand-rolled map is the right size for the value delivered.

const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  US: 'United States',
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  IT: 'Italy',
  ES: 'Spain',
  PT: 'Portugal',
  NL: 'Netherlands',
  BE: 'Belgium',
  IE: 'Ireland',
  SE: 'Sweden',
  DK: 'Denmark',
  NO: 'Norway',
  FI: 'Finland',
  CH: 'Switzerland',
  AT: 'Austria',
  JP: 'Japan',
  KR: 'South Korea',
  CN: 'China',
  IN: 'India',
  TR: 'Turkey',
  AU: 'Australia',
  NZ: 'New Zealand',
  CA: 'Canada',
  MX: 'Mexico',
  BR: 'Brazil',
};

/**
 * Resolve an `originCountry` value to a reader-friendly display string.
 * - Alpha-2 codes in the known map → the mapped name.
 * - Anything else (free-form strings, unknown codes) → the input verbatim.
 * - Empty / whitespace-only → empty string (caller should branch on this).
 */
export function originCountryDisplay(raw: string | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  const upper = trimmed.toUpperCase();
  if (upper.length === 2 && COUNTRY_NAMES[upper]) return COUNTRY_NAMES[upper];
  return trimmed;
}
