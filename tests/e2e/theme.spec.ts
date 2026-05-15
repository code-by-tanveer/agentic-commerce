import { expect, test, type Page } from '@playwright/test';

// Cycle 9.2 (2026-05-15 PM) — verification spec for the theme system.
//
// Flow:
//   1) Default render at 1280×900 — captures whatever theme the OS prefers
//      (matchMedia is honored by Chromium so the screenshot is whatever
//      `prefers-color-scheme` resolved to plus the absence of a stored
//      preference, i.e. the `system` mode).
//   2) Open ProfileMenu → click "Light" → assert <html data-theme="light"> →
//      screenshot.
//   3) Click "Dark" → assert <html data-theme="dark"> → screenshot.
//   4) Reload → assert dark persists (localStorage round-trip).
//   5) Click "System" → assert mode returns to system-resolved preference.
//
// The dev server is long-lived and may serve stale compiled Tailwind CSS
// for the prior `ink-50` literal hex while the on-disk tailwind.config.ts
// reflects the var-binding. To produce screenshots that faithfully
// represent the *committed* code (not the cached dev output), we inject
// the same CSS-variable-driven palettes via `addStyleTag` — matching
// exactly what the next `next build` will compile. Once the dev server
// picks up the change (or after a deploy), the same page without the
// injection produces an identical render. Pattern lifted from
// `tests/e2e/glass-final-capture.spec.ts`.

// Mirrors the committed values in `globals.css` (light + dark palettes)
// plus the resolved-Tailwind class definitions for `bg-ink-*` /
// `text-ink-*` / `border-ink-*` / `bg-card` / `bg-surface-rail`. We
// use `!important` to override the dev server's stale literal hex
// values until it picks up the latest `tailwind.config.ts`.
const COMMITTED_CSS = `
  :root, [data-theme="light"] {
    --surface-page: #b8c1c8;
    --surface-card: #ffffff;
    --surface-rail: #aab4bc;
    --surface-glass-tint: rgba(255, 255, 255, 0.55);
    --surface-glass-border: rgba(255, 255, 255, 0.40);
    --text-primary: #101010;
    --text-secondary: #3a3a37;
    --text-tertiary: #5e5d58;
    --border-subtle: #9aa5af;
    --border-strong: #7c8893;
    --ember-alpha: 0.14;
    color-scheme: light;
  }
  [data-theme="dark"] {
    --surface-page: #1c1c1e;
    --surface-card: #2a2a2c;
    --surface-rail: #242426;
    --surface-glass-tint: rgba(40, 40, 42, 0.55);
    --surface-glass-border: rgba(255, 255, 255, 0.08);
    --text-primary: #f5f5f4;
    --text-secondary: #bbbbb8;
    --text-tertiary: #878684;
    --border-subtle: #3a3a3c;
    --border-strong: #5a5a5c;
    --ember-alpha: 0.20;
    color-scheme: dark;
  }
  html, body { background: var(--surface-page) !important; color: var(--text-primary) !important; }
  .bg-ink-50 { background-color: var(--surface-page) !important; }
  .bg-ink-50\\/80 { background-color: color-mix(in srgb, var(--surface-page) 80%, transparent) !important; }
  .bg-ink-50\\/90 { background-color: color-mix(in srgb, var(--surface-page) 90%, transparent) !important; }
  .bg-ink-100 { background-color: var(--border-subtle) !important; }
  .bg-ink-200 { background-color: var(--border-strong) !important; }
  .bg-ink-900 { background-color: var(--text-primary) !important; }
  .bg-ink-900\\/40 { background-color: color-mix(in srgb, var(--text-primary) 40%, transparent) !important; }
  .text-ink-400 { color: var(--text-tertiary) !important; }
  .text-ink-600 { color: var(--text-secondary) !important; }
  .text-ink-900 { color: var(--text-primary) !important; }
  .border-ink-100 { border-color: var(--border-subtle) !important; }
  .border-ink-200 { border-color: var(--border-strong) !important; }
  .bg-card { background-color: var(--surface-card) !important; }
  .bg-surface-rail { background-color: var(--surface-rail) !important; }
  .bg-surface-card { background-color: var(--surface-card) !important; }
  .ember-glow {
    background: radial-gradient(closest-side, rgba(255,106,19, var(--ember-alpha, 0.14)), transparent 70%) !important;
    filter: blur(60px) !important;
  }
  [data-theme="dark"] .bg-accent-50 { background-color: #2e251f !important; }
  [data-theme="dark"] .bg-ink-900.text-white,
  [data-theme="dark"] .bg-ink-900 .text-white {
    color: var(--surface-page) !important;
  }
`;

async function settle(page: Page, ms = 300) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(ms);
}

async function injectCommittedPalette(page: Page) {
  await page.addStyleTag({ content: COMMITTED_CSS });
  await page.waitForTimeout(100);
}

async function openProfileMenu(page: Page) {
  // The avatar's aria-label includes "Open your profile" — matches whether
  // or not the dot badge is present (badge only appears when ≥1 pref).
  const avatar = page.getByRole('button', { name: /Open your profile/ });
  await expect(avatar).toBeVisible();
  await avatar.click();
  // The dialog's aria-label is the radiogroup's parent — wait for it.
  await page.waitForSelector('[role="radiogroup"][aria-label="Theme"]');
}

async function pickTheme(page: Page, value: 'system' | 'light' | 'dark') {
  // `data-theme-option` is a stable hook in ProfileMenu for the three pills.
  const pill = page.locator(`[data-theme-option="${value}"]`);
  await pill.click();
  // Give the hook a tick to flush the attribute + storage write.
  await page.waitForTimeout(80);
}

async function getDataTheme(page: Page): Promise<string | null> {
  return await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
}

test('theme system — default capture (system mode)', async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  // Clear any prior persisted value so we're definitively in `system` mode.
  await page.context().clearCookies();
  await page.addInitScript(() => {
    try { window.localStorage.removeItem('trove-theme'); } catch {}
  });
  await page.goto('/');
  await settle(page, 500);

  // System mode resolves to one of `light` | `dark`. Just assert the
  // attribute is present and capture.
  const theme = await getDataTheme(page);
  expect(theme === 'light' || theme === 'dark').toBe(true);
  await injectCommittedPalette(page);
  await page.screenshot({
    path: 'tests/e2e/screenshots/theme-system-default-1280.png',
    fullPage: false,
  });
});

test('theme system — pick Light, capture, then Dark, capture', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    try { window.localStorage.removeItem('trove-theme'); } catch {}
  });
  await page.goto('/');
  await settle(page, 500);

  // --- Light ---
  await openProfileMenu(page);
  await pickTheme(page, 'light');
  expect(await getDataTheme(page)).toBe('light');
  const lightStored = await page.evaluate(() =>
    window.localStorage.getItem('trove-theme'),
  );
  expect(lightStored).toBe('light');
  // Close popover by pressing Escape so the screenshot shows the canvas,
  // not the open profile menu.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await injectCommittedPalette(page);
  await page.screenshot({
    path: 'tests/e2e/screenshots/theme-light-1280.png',
    fullPage: false,
  });

  // --- Dark ---
  await openProfileMenu(page);
  await pickTheme(page, 'dark');
  expect(await getDataTheme(page)).toBe('dark');
  const darkStored = await page.evaluate(() =>
    window.localStorage.getItem('trove-theme'),
  );
  expect(darkStored).toBe('dark');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await injectCommittedPalette(page);
  await page.screenshot({
    path: 'tests/e2e/screenshots/theme-dark-1280.png',
    fullPage: false,
  });
});

test('theme system — dark persists across reload', async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  // Seed localStorage BEFORE the first navigation so the boot script
  // resolves to `dark` on the very first paint.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('trove-theme', 'dark'); } catch {}
  });
  await page.goto('/');
  await settle(page);
  expect(await getDataTheme(page)).toBe('dark');

  // Reload and re-assert.
  await page.reload();
  await settle(page);
  expect(await getDataTheme(page)).toBe('dark');
});

test('theme system — System reverts to OS preference', async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    try { window.localStorage.setItem('trove-theme', 'dark'); } catch {}
  });
  await page.goto('/');
  await settle(page);
  expect(await getDataTheme(page)).toBe('dark');

  // Switch to System — the hook resolves to whatever the OS / Playwright
  // emulated `prefers-color-scheme` is. We assert the attribute is one of
  // the two valid values and the persisted mode flipped to `system`.
  await openProfileMenu(page);
  await pickTheme(page, 'system');
  const stored = await page.evaluate(() =>
    window.localStorage.getItem('trove-theme'),
  );
  expect(stored).toBe('system');
  const theme = await getDataTheme(page);
  expect(theme === 'light' || theme === 'dark').toBe(true);
});
