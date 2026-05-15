import { test, type Page } from '@playwright/test';

// Cycle 9 (2026-05-15) — exploration spec.
//
// The single ember radial shipped earlier today reads as "tiny warm spot
// on a flat slate" — the glass header has nothing chromatic + variable
// underneath, so the blur is technically applied but visually inert.
//
// This spec renders three alternative ambient/ground directions at 1280
// by injecting page-level CSS overrides BEFORE the screenshot. The actual
// code is unchanged; this is a comparison mockup pass. The winner will be
// picked from the three PNGs and shipped via a real edit in a follow-up.
//
// Headed: `npx playwright test tests/e2e/glass-options-explore.spec.ts --headed`.

async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(450);
}

/**
 * Option A — Multi-blob ambient (Framer / Vision Pro school).
 *   - Ember (existing) top-right at 12% (slight bump).
 *   - Sage green bottom-left at 10% (cool complement, calming, premium).
 *   - Soft teal middle-left at 8% (low chroma, fills the dead zone).
 * All ~480px blur, slow 8–12s drift out-of-phase. The header glass refracts
 * a NON-UNIFORM surface — that's the unlock for glass to read as glass.
 */
const OPTION_A_CSS = `
  /* Bump existing ember slightly. */
  .ember-glow {
    background: radial-gradient(closest-side, rgba(255,106,19,0.12), transparent 70%) !important;
    filter: blur(60px) !important;
  }
  /* Sage blob — bottom-left. */
  body::before {
    content: '';
    position: fixed;
    left: -8rem;
    bottom: -8rem;
    width: 60vw;
    max-width: 720px;
    height: 60vh;
    max-height: 720px;
    background: radial-gradient(closest-side, rgba(108,145,118,0.10), transparent 70%);
    filter: blur(60px);
    pointer-events: none;
    z-index: 0;
    animation: ambient-sage-drift 11s ease-in-out infinite;
    will-change: transform;
  }
  /* Teal blob — middle-left, behind the rail dead zone. */
  body::after {
    content: '';
    position: fixed;
    left: -10rem;
    top: 30vh;
    width: 50vw;
    max-width: 640px;
    height: 50vh;
    max-height: 640px;
    background: radial-gradient(closest-side, rgba(120,158,170,0.08), transparent 70%);
    filter: blur(60px);
    pointer-events: none;
    z-index: 0;
    animation: ambient-teal-drift 9s ease-in-out infinite;
    will-change: transform;
  }
  @keyframes ambient-sage-drift {
    0%   { transform: translate3d(0, 0, 0); }
    50%  { transform: translate3d(14px, -10px, 0); }
    100% { transform: translate3d(0, 0, 0); }
  }
  @keyframes ambient-teal-drift {
    0%   { transform: translate3d(0, 0, 0); }
    50%  { transform: translate3d(10px, 6px, 0); }
    100% { transform: translate3d(0, 0, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    body::before, body::after { animation: none; }
  }
`;

/**
 * Option B — Single rich gradient ground (Linear 2026 / Mercury school).
 *   - Page ground becomes a diagonal warm-cream → warm-slate gradient.
 *   - Ember stays as a soft overlay at 8% to keep a top-right warmth.
 * The header glass over a gradient ground refracts a chromatic shift across
 * its width — visible "color bend" without any blob bouncing around.
 */
const OPTION_B_CSS = `
  html, body,
  .bg-ink-50 {
    background: linear-gradient(135deg, #f1ede5 0%, #e4dfd5 50%, #dcd8d0 100%) !important;
    background-attachment: fixed !important;
  }
  /* Drop the existing blob-ish behavior and present a softer single overlay. */
  .ember-glow {
    background: radial-gradient(closest-side, rgba(255,106,19,0.08), transparent 70%) !important;
    filter: blur(60px) !important;
  }
`;

/**
 * Option C — Deeper ground (macOS Tahoe / Vision Pro school).
 *   - Page shifts from `#e8e6e1` to `#c9c4ba` (deeper warm taupe).
 *   - White cards POP harder; glass header refracts a chromatically richer,
 *     darker ground (blur visibly bends the underlying color).
 *   - Ember bumped to 14% to register against the deeper ground.
 * Risk: text-ink-400 placeholder text contrast drops — flagged in DESIGN.md.
 */
const OPTION_C_CSS = `
  html, body,
  .bg-ink-50 { background: #c9c4ba !important; }
  .ember-glow {
    background: radial-gradient(closest-side, rgba(255,106,19,0.14), transparent 70%) !important;
    filter: blur(60px) !important;
  }
`;

async function renderOption(page: Page, css: string, outPath: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await settle(page);
  await page.addStyleTag({ content: css });
  // Give the new style a beat to commit and the compositor to settle.
  await page.waitForTimeout(300);
  await page.screenshot({ path: outPath, fullPage: false });
}

test('glass option A — multi-blob @ 1280', async ({ page }) => {
  await renderOption(
    page,
    OPTION_A_CSS,
    'tests/e2e/screenshots/glass-option-a-1280.png',
  );
});

test('glass option B — gradient ground @ 1280', async ({ page }) => {
  await renderOption(
    page,
    OPTION_B_CSS,
    'tests/e2e/screenshots/glass-option-b-1280.png',
  );
});

test('glass option C — deeper ground @ 1280', async ({ page }) => {
  await renderOption(
    page,
    OPTION_C_CSS,
    'tests/e2e/screenshots/glass-option-c-1280.png',
  );
});
