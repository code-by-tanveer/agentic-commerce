import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// radix-cmdk — verifies the Cycle 11 Radix migration + the new ⌘K
// command palette (DESIGN §2.16):
//   1. ProfileMenu opens as role=dialog and closes on Escape.
//   2. ⌘K opens the command palette; typing "new" + Enter creates a
//      fresh session.
//   3. ChatHistoryMenu (phone width) traps focus on Tab.
//   4. Captures the rail-cohesion screenshot at 1280 and the
//      palette-open screenshot at 1280.
// All four checks run in headed-equivalent mode via the default
// chromium project; the screenshots are written under
// `tests/e2e/screenshots/`.
// ---------------------------------------------------------------------------

const SCREENSHOT_DIR = resolve(__dirname, 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function getStoredSessionId(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem('agentic.sessionId'));
}

test('rail cohesion screenshot @ 1280', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  // Wait for the desktop rail to be visible — it's the load-bearing
  // surface this screenshot documents.
  const desktopRail = page.locator('nav[aria-label="Chat history"]').first();
  await expect(desktopRail).toBeVisible();

  // Sanity: rail width is still 260px.
  const railBox = await desktopRail.boundingBox();
  expect(railBox?.width).toBeGreaterThanOrEqual(258);
  expect(railBox?.width).toBeLessThanOrEqual(262);

  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, 'rail-cohesion-1280.png'),
    fullPage: false,
  });
});

test('ProfileMenu opens as dialog, Escape closes', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  // Click the avatar trigger. Its aria-label includes "Open your profile".
  const avatar = page.getByRole('button', { name: /open your profile/i });
  await expect(avatar).toBeVisible();
  await avatar.click();

  // Radix Popover surfaces Content as role="dialog". The popover's
  // aria-label is wired off the empty-state title; we match by role to
  // stay decoupled from the body copy.
  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible({ timeout: 3000 });

  // Press Escape — Radix should close the popover and return focus to
  // the trigger.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden({ timeout: 3000 });
});

test('⌘K opens command palette; "new" + Enter creates a fresh session', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  // Wait for the session id to land in localStorage so we have a
  // baseline to compare against.
  await expect
    .poll(() => getStoredSessionId(page), {
      timeout: 10_000,
      message: 'session id should be stored on mount',
    })
    .not.toBeNull();
  const sidBefore = await getStoredSessionId(page);

  // Make sure focus is somewhere sensible (the document body) before
  // pressing the shortcut so the ⌘K listener at document level fires.
  await page.locator('body').click({ position: { x: 100, y: 100 } });

  // ⌘K on Mac / Ctrl+K on Linux. Playwright maps "Meta" to ⌘.
  const isMac = process.platform === 'darwin';
  await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');

  // The palette is a Radix Dialog with aria-label="Command palette".
  const palette = page.getByRole('dialog', { name: /command palette/i });
  await expect(palette).toBeVisible({ timeout: 3000 });

  // Capture screenshot of the palette open. Done here (mid-test) so the
  // screenshot reflects the actual interaction.
  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, 'cmdk-palette-1280.png'),
    fullPage: false,
  });

  // Type "new" — cmdk fuzzy-filters and the "New chat" action should
  // become the only/first match.
  const input = palette.getByPlaceholder(/type a command/i);
  await input.fill('new');

  // Enter selects the highlighted item. cmdk auto-highlights the top
  // match when the filter narrows to one row.
  await page.keyboard.press('Enter');

  // The palette closes, then a fresh session is minted and the stored
  // id changes.
  await expect(palette).toBeHidden({ timeout: 3000 });
  await expect
    .poll(() => getStoredSessionId(page), {
      timeout: 10_000,
      message: 'expected New chat to mint a fresh session id',
    })
    .not.toBe(sidBefore);
});

test('ChatHistoryMenu at phone width: Tab cycles inside the popover', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto('/');

  // The phone-only chat-history trigger lives in the header. Its
  // accessible name matches "Open chat history".
  const trigger = page.getByRole('button', { name: /open chat history/i });
  await expect(trigger).toBeVisible();
  await trigger.click();

  // The popover content surfaces with aria-label="Recent chats".
  const popover = page.getByRole('dialog', { name: /recent chats/i });
  await expect(popover).toBeVisible({ timeout: 3000 });

  // Press Tab a handful of times — focus must stay inside the popover.
  // Radix's focus scope cycles back to the first focusable when Tab
  // reaches the last one. We assert by asking the active element if it
  // is contained within the popover element.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const isContained = await page.evaluate(() => {
      const el = document.activeElement;
      // Radix surfaces the popover Content with role="dialog". Find
      // the open one and check containment.
      const dialog = document.querySelector('[role="dialog"]');
      return !!dialog && !!el && dialog.contains(el);
    });
    expect(isContained, `Tab #${i + 1} should land focus inside the popover`).toBe(true);
  }
});
