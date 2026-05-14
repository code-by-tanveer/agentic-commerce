import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// layout-sticky — three bugs caught in 2026-05-14 live user testing of the
// new left-rail layout (DESIGN §5, commits b76ea40 + c67e5ca):
//
//   1. Rail scrolled with the chat instead of staying fixed beside it.
//   2. No visible panel break between the rail and the canvas (both bg-ink-50).
//   3. "Latest" jump-to-bottom button visible on a fresh tab (welcome only).
//
// Each test asserts the post-fix invariant. Bug 2 is captured as a
// before/after screenshot — there's no clean numeric assertion for "the eye
// reads a panel break", but the screenshot is decisive enough to eyeball.
// ---------------------------------------------------------------------------

const SCREENSHOT_DIR = resolve(__dirname, 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

test('bug 1: rail stays sticky to the viewport when the page scrolls', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const desktopRail = page.locator('nav[aria-label="Chat history"]').first();
  await expect(desktopRail).toBeVisible();

  // Pre-scroll: rail's top is at the viewport top.
  const topBefore = await desktopRail.evaluate(
    (el) => el.getBoundingClientRect().top,
  );
  expect(topBefore).toBeLessThanOrEqual(1);

  // Force the page to be scrollable. We don't need to send a real chat to
  // exercise the sticky behavior — the rail's `position: sticky` contract
  // is about what happens when the document scrolls past it. Inject a
  // tall spacer into <main> so 400px of scroll is guaranteed regardless of
  // backend response timing.
  await page.evaluate(() => {
    const m = document.querySelector('main');
    if (m) (m as HTMLElement).style.paddingBottom = '1600px';
  });

  await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'auto' }));
  // Let the browser settle the scroll position.
  await page.waitForFunction(() => window.scrollY >= 380);

  const topAfter = await desktopRail.evaluate(
    (el) => el.getBoundingClientRect().top,
  );
  // The fix: rail is `sticky top-0 h-dvh`, so it locks to the viewport top.
  // Tolerance of 10px is generous and covers any sub-pixel rounding.
  expect(topAfter).toBeGreaterThanOrEqual(-10);
  expect(topAfter).toBeLessThanOrEqual(10);
});

test('bug 2: rail has a visible border-r separating it from the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const desktopRail = page.locator('nav[aria-label="Chat history"]').first();
  await expect(desktopRail).toBeVisible();

  // Post-fix, the rail's `border-right-color` resolves to the `ink-200`
  // token (#d6d6d1). Pre-fix it was `ink-100` (#ededea), which read as
  // ~invisible on the cream bg. The numeric assertion: the resolved
  // border-right-color is darker than ink-100.
  const { borderRightColor, borderRightWidth } = await desktopRail.evaluate(
    (el) => {
      const s = window.getComputedStyle(el);
      return {
        borderRightColor: s.borderRightColor,
        borderRightWidth: s.borderRightWidth,
      };
    },
  );
  expect(borderRightWidth).toBe('1px');
  // ink-200 = #d6d6d1 = rgb(214, 214, 209). ink-100 = #ededea = rgb(237,
  // 237, 234). The fix asserts the channel sum is at most 700 (ink-200's
  // sum is 637; ink-100's is 708). This is a quiet but decisive check.
  const m = borderRightColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  expect(m).not.toBeNull();
  if (m) {
    const sum = Number(m[1]) + Number(m[2]) + Number(m[3]);
    expect(sum).toBeLessThanOrEqual(700);
  }

  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, 'rail-separation-after.png'),
    fullPage: false,
  });
});

test('bug 3: "Latest" button is NOT in the DOM on a fresh tab (welcome only)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  // Wait for the welcome to render so the canvas has measured its layout.
  await expect(
    page.getByRole('heading', { name: /what are you/i }),
  ).toBeVisible();

  // Give the scroll handler a chance to fire its on-mount onScroll() call.
  // Two RAFs is enough for layout + the effect's initial run.
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => r()),
        ),
      ),
  );

  const jumpBtn = page.locator('[aria-label="Jump to latest message"]');
  await expect(jumpBtn).toHaveCount(0);

  // Sanity: also assert at a shorter viewport where the welcome held-shape's
  // `py-8 sm:py-16` might push scrollHeight just over viewport height — the
  // exact case that flipped showJump to true pre-fix.
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => r()),
        ),
      ),
  );
  await expect(jumpBtn).toHaveCount(0);
});
