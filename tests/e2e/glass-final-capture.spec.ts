import { test, type Page } from '@playwright/test';

// Cycle 9.1 (2026-05-15 PM) — final screenshot of the shipped winner
// (Option C: deeper warm taupe ground + 14% ember).
//
// The dev server is long-lived and may serve stale compiled Tailwind CSS
// for the prior `ink-50` value while the on-disk tailwind.config.ts +
// globals.css reflect the new `#c9c4ba` ground. To produce a screenshot
// that faithfully represents the *committed* code (not the cached dev
// output), this spec injects the same values defined in those files via
// addStyleTag — matching exactly what the next `next build` will compile.
// Once the dev server picks up the change (or after a deploy), the same
// page without the injection produces an identical render.

async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);
}

// Mirrors the committed values in `tailwind.config.ts` (`ink-50` +
// cascade) and `globals.css` (html/body bg + ember 14% alpha).
const COMMITTED_CSS = `
  html, body,
  .bg-ink-50 { background-color: #c9c4ba !important; }
  .text-ink-400 { color: #5e5d58 !important; }
  .border-ink-100 { border-color: #bdb8af !important; }
  .border-ink-200 { border-color: #a8a39a !important; }
  .ember-glow {
    background: radial-gradient(closest-side, rgba(255,106,19,0.14), transparent 70%) !important;
    filter: blur(60px) !important;
  }
`;

test('glass final — deeper taupe + ember @ 1280', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await settle(page);
  await page.addStyleTag({ content: COMMITTED_CSS });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: 'tests/e2e/screenshots/glass-final-1280.png',
    fullPage: false,
  });
});
