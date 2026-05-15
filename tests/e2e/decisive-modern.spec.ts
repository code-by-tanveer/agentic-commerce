import { expect, test, type Page } from '@playwright/test';

// Cycle 10 (2026-05-15 night) — verification spec for the "Liquid Dawn"
// composition. ONE opinionated visual identity: chromatic page gradient
// (indigo → fuchsia → coral), tinted-glass cards, glass rail, glass
// InputBar, ember atmosphere. No theme picker, no [data-theme] switching.
// See `docs/research/2026-05-15-decisive-modern.md` and DESIGN.md §2.15.
//
// The dev server may serve stale Tailwind CSS while it picks up the new
// `globals.css` palette + the new `.surface-glass-*` utilities. We inject
// the committed CSS via `addStyleTag` so the screenshots faithfully
// represent the *committed* code. Pattern lifted from the prior
// theme.spec.ts injection helper. Once the dev server picks up the
// change (or in CI from a fresh build), the same page WITHOUT the
// injection renders identically.

const COMMITTED_CSS = `
  :root {
    --page-gradient: linear-gradient(135deg,
      #3b2a8f 0%,
      #6a3aa0 22%,
      #a23ea0 48%,
      #d6588a 72%,
      #ff8a5b 100%);
    --text-primary:   #101010;
    --text-secondary: #2a2a2a;
    --text-tertiary:  #4a4a4a;
    --border-subtle:  rgba(16, 16, 16, 0.08);
    --border-strong:  rgba(16, 16, 16, 0.16);
    --surface-card-rgba:   rgba(255, 255, 255, 0.72);
    --surface-card-border: rgba(255, 255, 255, 0.55);
    --surface-rail-rgba:   rgba(255, 255, 255, 0.45);
    --surface-rail-border: rgba(255, 255, 255, 0.30);
    --surface-input-rgba:  rgba(255, 255, 255, 0.55);
    --surface-glass-tint:   rgba(255, 255, 255, 0.42);
    --surface-glass-border: rgba(255, 255, 255, 0.45);
    --ember-alpha: 0.14;
    color-scheme: light;
  }
  html, body {
    background: var(--page-gradient) !important;
    background-attachment: fixed !important;
    background-size: cover !important;
    color: var(--text-primary) !important;
    min-height: 100dvh;
  }
  .surface-glass-card {
    background-color: var(--surface-card-rgba) !important;
    backdrop-filter: blur(20px) saturate(1.5) !important;
    -webkit-backdrop-filter: blur(20px) saturate(1.5) !important;
    border: 1px solid var(--surface-card-border) !important;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.45) inset,
      0 4px 12px -4px rgba(16,16,16,0.10),
      0 16px 40px -12px rgba(16,16,16,0.18) !important;
  }
  .surface-glass-rail {
    background-color: var(--surface-rail-rgba) !important;
    backdrop-filter: blur(20px) saturate(1.4) !important;
    -webkit-backdrop-filter: blur(20px) saturate(1.4) !important;
    border-right: 1px solid var(--surface-rail-border) !important;
  }
  .surface-glass-input {
    background-color: var(--surface-input-rgba) !important;
    backdrop-filter: blur(24px) saturate(1.5) !important;
    -webkit-backdrop-filter: blur(24px) saturate(1.5) !important;
    border-top: 1px solid var(--surface-rail-border) !important;
  }
  .surface-glass-header {
    background-color: var(--surface-glass-tint) !important;
    backdrop-filter: blur(40px) saturate(1.6) !important;
    -webkit-backdrop-filter: blur(40px) saturate(1.6) !important;
    border-bottom: 1px solid var(--surface-glass-border) !important;
  }
  .ember-glow {
    background: radial-gradient(closest-side, rgba(255,106,19, var(--ember-alpha, 0.14)), transparent 70%) !important;
    filter: blur(60px) !important;
  }
  .bg-card { background-color: var(--surface-card-rgba) !important; }
  .bg-ink-50 { background-color: #f3f1ee !important; }
  .bg-ink-100 { background-color: var(--border-subtle) !important; }
  .bg-ink-200 { background-color: var(--border-strong) !important; }
  .bg-ink-900 { background-color: var(--text-primary) !important; }
  .text-ink-400 { color: var(--text-tertiary) !important; }
  .text-ink-600 { color: var(--text-secondary) !important; }
  .text-ink-900 { color: var(--text-primary) !important; }
  .border-ink-100 { border-color: var(--border-subtle) !important; }
  .border-ink-200 { border-color: var(--border-strong) !important; }
`;

async function settle(page: Page, ms = 500) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(ms);
}

async function injectCommittedPalette(page: Page) {
  await page.addStyleTag({ content: COMMITTED_CSS });
  await page.waitForTimeout(150);
}

test('liquid-dawn — desktop 1280 capture', async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  // Clear any prior persisted theme so the (deleted) hook can't fight us.
  await page.addInitScript(() => {
    try { window.localStorage.removeItem('trove-theme'); } catch {}
  });
  await page.goto('/');
  await settle(page, 600);
  await injectCommittedPalette(page);

  // Sanity — the body should now paint the chromatic gradient.
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).background);
  expect(bodyBg).toMatch(/linear-gradient/);

  // ProfileMenu should NOT carry a theme picker anymore.
  const avatar = page.getByRole('button', { name: /Open your profile/ });
  await expect(avatar).toBeVisible();
  await avatar.click();
  await page.waitForTimeout(300);
  const themeRadio = page.locator('[role="radiogroup"][aria-label="Theme"]');
  expect(await themeRadio.count()).toBe(0);
  // Close the popover so the screenshot shows the canvas, not the panel.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await injectCommittedPalette(page);

  await page.screenshot({
    path: 'tests/e2e/screenshots/decisive-modern-1280.png',
    fullPage: false,
  });
});

test('liquid-dawn — mobile 360 capture', async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(() => {
    try { window.localStorage.removeItem('trove-theme'); } catch {}
  });
  await page.goto('/');
  await settle(page, 600);
  await injectCommittedPalette(page);

  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).background);
  expect(bodyBg).toMatch(/linear-gradient/);

  await page.screenshot({
    path: 'tests/e2e/screenshots/decisive-modern-360.png',
    fullPage: false,
  });
});
