import { expect, test, type Page } from '@playwright/test';

// Cycle 9 (2026-05-15) — "warm slate + ember" direction verification.
//
// Three assertions per viewport:
//   1. The page ground is the new warm-slate `#e8e6e1` — read as the
//      computed background color of <html> or <body>. The cream `#f7f4ed`
//      shipped in Cycle 7 gave glass nothing to refract; this is the
//      payload move of the cycle, so we lock the value with a test.
//   2. The `.ember-glow` ambient radial is mounted at the root and visible
//      inside the viewport (top-right anchor; the element bleeds off-screen
//      via negative inset, so we just assert that its bounding box has
//      width/height and intersects the viewport).
//   3. The header's computed `backdrop-filter` carries a `blur(...)` term.
//      Headless Chromium may not paint the blur in the screenshot — some
//      compositor features require flags — but the *computed style* is
//      deterministic and is the thing we care about (the class is
//      `backdrop-blur-xl`, which Tailwind maps to `blur(24px)`).
//
// Plus the wordmark assertion: textContent on the masthead <p> must equal
// `Trove·` (with the middle-dot U+00B7). The aria-label stays `Trove` so
// assistive tech sees the brand name; the visible dot is the brand mark.
//
// Headed: this spec runs under `npx playwright test ... --headed` per the
// implementer's brief. The webServer wiring in `playwright.config.ts`
// handles starting backend + frontend.

// Cycle 9.1 (2026-05-15 PM): the ground deepened from `#e8e6e1` (warm
// slate, Cycle 9 AM) to `#c9c4ba` (deeper warm taupe) — the AM slate gave
// the header glass enough chroma to tint but not enough darkness to make
// the blur visibly refract. See `tests/e2e/glass-options-explore.spec.ts`
// for the three options considered and DESIGN.md §2.1 for the rationale.
const SLATE_HEX = '#c9c4ba';

function rgbToHex(rgb: string): string {
  // Accepts `rgb(r, g, b)` or `rgba(r, g, b, a)` and returns `#rrggbb`.
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return rgb;
  const r = Number(match[1]).toString(16).padStart(2, '0');
  const g = Number(match[2]).toString(16).padStart(2, '0');
  const b = Number(match[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

async function settle(page: Page) {
  // Settle font swap + the ember's first paint. Cheap; non-fragile.
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(400);
}

async function readGroundHex(page: Page): Promise<string> {
  // Both <html> and <body> are painted with the slate in globals.css. We
  // read whichever is non-transparent first.
  return await page.evaluate(() => {
    function pick(el: Element): string {
      const bg = getComputedStyle(el).backgroundColor;
      return bg;
    }
    const htmlBg = pick(document.documentElement);
    const bodyBg = pick(document.body);
    // Empty / rgba(0,0,0,0) means transparent → fall through.
    if (htmlBg && htmlBg !== 'rgba(0, 0, 0, 0)' && htmlBg !== 'transparent') {
      return htmlBg;
    }
    return bodyBg;
  });
}

test('warm-slate + ember @ 1280', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await settle(page);

  // (1) Ground is warm slate.
  const ground = await readGroundHex(page);
  expect(rgbToHex(ground).toLowerCase()).toBe(SLATE_HEX);

  // (2) Ember glow is mounted and inside the viewport.
  const ember = page.locator('.ember-glow');
  await expect(ember).toHaveCount(1);
  const rect = await ember.boundingBox();
  expect(rect).not.toBeNull();
  if (rect) {
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    // The element bleeds off the top-right via negative inset, but its box
    // must intersect the 1280x900 viewport.
    expect(rect.x).toBeLessThan(1280);
    expect(rect.y).toBeLessThan(900);
    expect(rect.x + rect.width).toBeGreaterThan(0);
    expect(rect.y + rect.height).toBeGreaterThan(0);
  }

  // (3) Header backdrop-filter carries a blur term.
  const header = page.locator('header').first();
  await expect(header).toBeVisible();
  const backdrop = await header.evaluate((el) =>
    getComputedStyle(el).backdropFilter ||
    // Safari prefix fallback.
    (getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string })
      .webkitBackdropFilter ||
    '',
  );
  expect(backdrop).toContain('blur');

  // Wordmark text content is exactly `Trove·` (U+00B7 middle-dot).
  const wordmark = page.locator('header p[aria-label="Trove"]').first();
  await expect(wordmark).toBeVisible();
  const text = await wordmark.textContent();
  expect(text).toBe('Trove·');

  await page.screenshot({
    path: 'tests/e2e/screenshots/warm-slate-1280.png',
    fullPage: false,
  });
});

test('warm-slate + ember @ 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await settle(page);

  const ground = await readGroundHex(page);
  expect(rgbToHex(ground).toLowerCase()).toBe(SLATE_HEX);

  const ember = page.locator('.ember-glow');
  await expect(ember).toHaveCount(1);
  const rect = await ember.boundingBox();
  expect(rect).not.toBeNull();
  if (rect) {
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(rect.x).toBeLessThan(360);
    expect(rect.y).toBeLessThan(740);
    expect(rect.x + rect.width).toBeGreaterThan(0);
    expect(rect.y + rect.height).toBeGreaterThan(0);
  }

  const header = page.locator('header').first();
  await expect(header).toBeVisible();
  const backdrop = await header.evaluate((el) =>
    getComputedStyle(el).backdropFilter ||
    (getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string })
      .webkitBackdropFilter ||
    '',
  );
  expect(backdrop).toContain('blur');

  const wordmark = page.locator('header p[aria-label="Trove"]').first();
  await expect(wordmark).toBeVisible();
  const text = await wordmark.textContent();
  expect(text).toBe('Trove·');

  await page.screenshot({
    path: 'tests/e2e/screenshots/warm-slate-360.png',
    fullPage: false,
  });
});
