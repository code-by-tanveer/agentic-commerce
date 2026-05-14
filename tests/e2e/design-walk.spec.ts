import { expect, test, type Page } from '@playwright/test';

// Cycle 7 elevation pass — visual audit only. Captures three viewports
// (1280, 800, 360) × four states (welcome, mid-conversation, expanded
// ProductCard, ProfileMenu). Screenshots are saved to
// `tests/e2e/screenshots/design-walk-{view}-{state}.png` and the directory
// is already gitignored. The spec asserts nothing about pixels — Playwright
// takes the shots and the design lead reviews them.

const VIEWPORTS = [
  { name: '1280', width: 1280, height: 900 },
  { name: '800', width: 800, height: 900 },
  { name: '360', width: 360, height: 740 },
];

async function waitForStreamingDone(page: Page, timeout = 25_000) {
  const sendBtn = page.getByRole('button', { name: 'Send' });
  await expect
    .poll(
      async () => {
        const html = (await sendBtn.innerHTML()).toLowerCase();
        return html.includes('animate-spin');
      },
      { timeout, message: 'expected streaming to end (spinner to clear)' },
    )
    .toBe(false);
}

for (const vp of VIEWPORTS) {
  test(`design walk @ ${vp.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });

    // (1) Welcome state — fresh load.
    await page.goto('/');
    const input = page.getByRole('textbox', { name: 'Message' });
    await expect(input).toBeVisible();
    // Wait for hydration + motion settle so the welcome composition is in
    // its rendered state before we screenshot.
    await page.waitForTimeout(700);
    await page.screenshot({
      path: `tests/e2e/screenshots/design-walk-${vp.name}-welcome.png`,
      fullPage: false,
    });

    // (2) ProfileMenu popover open from welcome — no products yet.
    const profileBtn = page.getByRole('button', { name: /Open your profile/i });
    if (await profileBtn.isVisible().catch(() => false)) {
      await profileBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `tests/e2e/screenshots/design-walk-${vp.name}-profile.png`,
        fullPage: false,
      });
      // Close the popover (Escape) so we can carry on with the conversation.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }

    // (3) Mid-conversation — fire one product search.
    await input.fill('a chunky ceramic vase under $80');
    await input.press('Enter');
    await waitForStreamingDone(page, 25_000);
    // Let card entry motion finish.
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `tests/e2e/screenshots/design-walk-${vp.name}-mid.png`,
      fullPage: false,
    });

    // (4) Expanded ProductCard. The collapsed card body is `data-testid="card-body"`.
    const cardBody = page.locator('[data-testid="card-body"]').first();
    if (await cardBody.isVisible().catch(() => false)) {
      await cardBody.click();
      await page.waitForTimeout(400);
      // Try to scroll the expanded card into view.
      await cardBody.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(150);
      await page.screenshot({
        path: `tests/e2e/screenshots/design-walk-${vp.name}-expanded.png`,
        fullPage: false,
      });
    }
  });
}
