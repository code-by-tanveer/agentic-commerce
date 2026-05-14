import { expect, test, type Page } from '@playwright/test';

// Brand-identity v1 — DESIGN.md §1.1 (added 2026-05-14).
//
// The header wordmark gained a custom-cut serif "T" mark (inline SVG, drawer-
// pull terminal serif + finial dot on the left tip). Wordmark reads "Trove"
// as text; mark is decorative and `aria-hidden`. This spec captures the
// masthead at both viewport breakpoints we ship to so the "is this a brand
// or still a styled word?" review has eyes-on artefacts to point at.
//
// Two screenshots:
//   - `brand-identity-1280.png` — desktop masthead crop (whole header)
//   - `brand-identity-360.png`  — phone masthead crop (whole header)
//
// No streaming, no input, no agent — the wordmark + mark are visible the
// moment `<Header />` paints, and the brief is identity, not interaction.

async function waitForMark(page: Page) {
  // The wordmark's <p> carries the aria-label "Trove". The mark is the
  // inline <svg aria-hidden> inside the same <p>. We wait for the SVG so
  // the screenshot lands AFTER the font has swapped (Instrument Serif via
  // next/font/google `display: swap`) and the mark has measured itself
  // against the resolved `1em` height.
  const wordmark = page.locator('header p[aria-label="Trove"]').first();
  await expect(wordmark).toBeVisible();
  const mark = wordmark.locator('svg[aria-hidden="true"]').first();
  await expect(mark).toBeVisible();
  // Settle the webfont swap.
  await page.waitForTimeout(800);
}

test('brand identity @ 1280 — wordmark + mark', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await waitForMark(page);
  await page.screenshot({
    path: 'tests/e2e/screenshots/brand-identity-1280.png',
    clip: { x: 0, y: 0, width: 1280, height: 120 },
  });
});

test('brand identity @ 360 — wordmark + mark', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await waitForMark(page);
  await page.screenshot({
    path: 'tests/e2e/screenshots/brand-identity-360.png',
    clip: { x: 0, y: 0, width: 360, height: 100 },
  });
});
