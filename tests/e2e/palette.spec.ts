import { expect, test, type Page } from '@playwright/test';

// Cycle 7 palette retune (2026-05-14) — paper-on-parchment.
//
// `ink-50` shifted from a near-white cool grey (#f7f7f5) to a paper-cream
// warm (#f7f4ed). Cards stay `bg-white`. The point of this spec is two-fold:
//
//   1) Assert the new page-background token reads as the cream we picked
//      (computed RGB sanity check on the page-bg div), and that white cards
//      remain pure white (the contrast that makes the surface read as
//      "documents on parchment").
//   2) Capture screenshots at 1280 and 360 across the three states the
//      designer eyes-on:
//        - welcome (cream bg behind the serif welcome composition)
//        - mid-conversation (cards floating on cream, shadows visible)
//        - profile (popover white over cream — should pop)
//      Files land in `tests/e2e/screenshots/palette-{viewport}-{state}.png`.
//
// The spec does NOT assert on the screenshots themselves — the design lead
// reviews those. The runtime assertions are the canary against a future
// careless `bg-ink-50` rename or token drift.

const EXPECTED_CREAM = '#f7f4ed';

// rgb(247, 244, 237) — getComputedStyle returns the rgb() form.
const EXPECTED_CREAM_RGB = 'rgb(247, 244, 237)';
const EXPECTED_WHITE_RGB = 'rgb(255, 255, 255)';

const VIEWPORTS = [
  { name: '1280', width: 1280, height: 900 },
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
  test(`palette parchment @ ${vp.name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });

    // (1) Welcome state — cream page bg + white card containing welcome serif.
    await page.goto('/');
    const input = page.getByRole('textbox', { name: 'Message' });
    await expect(input).toBeVisible();
    // Allow hydration + motion settle.
    await page.waitForTimeout(700);

    // Assert the page-level cream actually paints. We query the html element
    // bg (sourced from globals.css) AND the inner `bg-ink-50` wrapper around
    // the rail + canvas. Both should resolve to the new cream.
    const htmlBg = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).backgroundColor;
    });
    expect(htmlBg).toBe(EXPECTED_CREAM_RGB);

    // The page tree's outermost `bg-ink-50` wrapper paints the canvas region.
    const wrapperBg = await page.evaluate(() => {
      const wrapper = document.querySelector('main')?.parentElement;
      return wrapper ? getComputedStyle(wrapper).backgroundColor : null;
    });
    expect(wrapperBg).toBe(EXPECTED_CREAM_RGB);

    await page.screenshot({
      path: `tests/e2e/screenshots/palette-${vp.name}-welcome.png`,
      fullPage: false,
    });

    // (2) ProfileMenu open — popover white over cream should pop.
    const profileBtn = page.getByRole('button', { name: /Open your profile/i });
    if (await profileBtn.isVisible().catch(() => false)) {
      await profileBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `tests/e2e/screenshots/palette-${vp.name}-profile.png`,
        fullPage: false,
      });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }

    // (3) Mid-conversation — fire one product search so we get white cards
    // sitting on the cream bg. Streaming is best-effort: if the backend is
    // slow or unreachable the test still captures the in-flight screenshot
    // (spinner over cream is also a valid surface to eyeball) and skips
    // the white-card assertion. The hard palette guarantees are covered by
    // the welcome state above + the `bg-ink-50` probe test below.
    await input.fill('a chunky ceramic vase under $80');
    await input.press('Enter');
    const streamSettled = await waitForStreamingDone(page, 25_000)
      .then(() => true)
      .catch(() => false);
    await page.waitForTimeout(500);

    if (streamSettled) {
      // White cards stay white — assert the outer product card shell paints
      // pure white. `card-body` is a child inside a `bg-white` outer; we walk
      // up to the closest ancestor whose computed bg is not transparent.
      const cardShell = page
        .locator('[data-testid="card-body"]')
        .first()
        .locator('xpath=ancestor-or-self::*[contains(@class, "bg-white")][1]');
      if (await cardShell.count()) {
        const cardBg = await cardShell.first().evaluate(
          (el) => getComputedStyle(el).backgroundColor,
        );
        expect(cardBg).toBe(EXPECTED_WHITE_RGB);
      }
    }

    await page.screenshot({
      path: `tests/e2e/screenshots/palette-${vp.name}-mid-conversation.png`,
      fullPage: false,
    });
  });
}

// One-shot smoke that the token value in the Tailwind cascade is the cream
// we documented — guards against a future rename that changes the literal
// without updating DESIGN.md §2.1. Cheaper than parsing the compiled CSS.
test('ink-50 paints as parchment cream', async ({ page }) => {
  await page.goto('/');
  // Inject a probe div with the `bg-ink-50` utility, read its computed
  // background, and compare to the documented hex.
  const probeBg = await page.evaluate((cls) => {
    const probe = document.createElement('div');
    probe.className = cls;
    document.body.appendChild(probe);
    const bg = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return bg;
  }, 'bg-ink-50');
  expect(probeBg).toBe(EXPECTED_CREAM_RGB);
  expect(EXPECTED_CREAM).toBe('#f7f4ed');
});
