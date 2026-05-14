import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// history-rail — DESIGN §5 (2026-05-14) migration: chat-history moved from
// the header pill to a left rail. Three viewport tests assert the three
// surfaces:
//   - Desktop (≥1025): full rail visible. New-chat button in the rail.
//   - Tablet  (641–1024): 56px icon strip. Toggle button expands an overlay.
//   - Phone   (≤640): rail hidden. Bottom-sheet trigger lives in the header.
//
// Each test also screenshots its final state to `tests/e2e/screenshots/`
// (gitignored — these are evidence for the migration, not regression art).
// ---------------------------------------------------------------------------

const SCREENSHOT_DIR = resolve(__dirname, 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

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

async function getStoredSessionId(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    window.localStorage.getItem('agentic.sessionId'),
  );
}

async function seedHistory(page: Page) {
  // Drive the FE through the same path the real user takes so two cookie
  // rows exist by the time the rail renders. First-message labelling lives
  // in `useConversation.send` → `upsertEntry`; we then mint a brand-new
  // session so the previous one becomes a row in the rail.
  const input = page.getByRole('textbox', { name: 'Message' });
  await input.fill('vintage wool sweater');
  await input.press('Enter');
  await waitForStreamingDone(page);
}

test('desktop (1280): rail is visible, can switch chats', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  // Rail is the <nav aria-label="Chat history"> sibling. At desktop widths
  // there are two such elements in the tree (desktop + tablet); the
  // desktop one is the only one in flow (the tablet one is `hidden`).
  const desktopRail = page.locator('nav[aria-label="Chat history"]').first();
  await expect(desktopRail).toBeVisible();

  // Sanity: the rail is exactly 260px wide on desktop.
  const railBox = await desktopRail.boundingBox();
  expect(railBox?.width).toBeGreaterThanOrEqual(258);
  expect(railBox?.width).toBeLessThanOrEqual(262);

  // Send one message so we get a labeled row in the rail.
  await seedHistory(page);
  const sidFirst = await getStoredSessionId(page);
  expect(sidFirst).not.toBeNull();

  // New-chat button at the top of the rail mints a fresh session.
  const newChat = desktopRail.getByRole('button', { name: /start a new chat/i });
  await expect(newChat).toBeVisible();
  await newChat.click();
  await expect
    .poll(() => getStoredSessionId(page), {
      timeout: 5000,
      message: 'expected stored session id to change after rail New chat',
    })
    .not.toBe(sidFirst);
  const sidSecond = await getStoredSessionId(page);

  // The prior session is now a history row in the rail (labelled by its
  // first user message). Click it to switch back.
  const priorRow = desktopRail.getByRole('button', { name: 'vintage wool sweater', exact: true });
  await expect(priorRow).toBeVisible({ timeout: 5000 });
  await priorRow.click();

  // The cookie flip + reducer switch_session re-keys to the prior id.
  await expect
    .poll(() => getStoredSessionId(page), {
      timeout: 5000,
      message: 'expected switch_session to flip the stored id back to the prior session',
    })
    .toBe(sidFirst);

  // The prior user message reappears via the hydrate effect. Scope to the
  // user bubble (white-text inside the ink-900 pill) so we don't collide
  // with the rail row, the assistant reply, or any product-card titles
  // that happen to contain the same phrase.
  await expect(
    page.locator('main').getByText('vintage wool sweater', { exact: true }),
  ).toBeVisible({ timeout: 5000 });

  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, 'rail-desktop.png'),
    fullPage: false,
  });
  // Sanity: stored ids should differ; if they don't, the test rig is
  // mid-collapse and we'd otherwise pass a false positive.
  expect(sidSecond).not.toBe(sidFirst);
});

test('tablet (800): icon strip visible, expands on click', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');

  // The tablet strip is a <nav aria-label="Chat history">. Two such navs
  // exist in the DOM; only the icon strip is visible at this width.
  const visibleRail = page.locator('nav[aria-label="Chat history"]:visible');
  await expect(visibleRail).toHaveCount(1);
  // Sanity: strip is 56px wide on tablet.
  const stripBox = await visibleRail.boundingBox();
  expect(stripBox?.width).toBeGreaterThanOrEqual(54);
  expect(stripBox?.width).toBeLessThanOrEqual(58);

  // Seed a labeled history row first so we have something to click in the
  // overlay later.
  await seedHistory(page);
  const sidFirst = await getStoredSessionId(page);

  // The strip's top button mints a fresh session.
  const newChatIcon = visibleRail.getByRole('button', { name: /start a new chat/i });
  await expect(newChatIcon).toBeVisible();
  await newChatIcon.click();
  await expect
    .poll(() => getStoredSessionId(page), { timeout: 5000 })
    .not.toBe(sidFirst);

  // Expand the overlay via the MessageSquare toggle. After expand, the
  // overlay dialog renders with role="dialog".
  const toggle = visibleRail.getByRole('button', { name: /open chat history/i });
  await toggle.click();
  const overlay = page.getByRole('dialog', { name: 'Chat history' });
  await expect(overlay).toBeVisible({ timeout: 2000 });

  // The prior session is in the overlay as a labelled row. Click it.
  const priorRow = overlay.getByRole('button', { name: 'vintage wool sweater', exact: true });
  await expect(priorRow).toBeVisible({ timeout: 3000 });
  await priorRow.click();
  await expect
    .poll(() => getStoredSessionId(page), { timeout: 5000 })
    .toBe(sidFirst);

  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, 'rail-tablet.png'),
    fullPage: false,
  });
});

test('phone (375): rail hidden, bottom-sheet opens from header icon', async ({ page }) => {
  test.setTimeout(120_000);
  // Pre-stage two sessions at desktop width so the cookie list has a labelled
  // prior row to switch to. Then resize to phone for the assertions. This is
  // the most realistic flow — the rail's New-chat is the only FE-driven path
  // to mint a session, and we want the bottom-sheet to be the only path to
  // *switch* (which is the contract for this viewport).
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await seedHistory(page);
  const sidFirst = await getStoredSessionId(page);
  expect(sidFirst).not.toBeNull();

  // Use the desktop rail's New-chat to mint a second session. This pins
  // the labelled "vintage wool sweater" entry into the rail's TODAY group.
  const desktopRail = page.locator('nav[aria-label="Chat history"]').first();
  await desktopRail.getByRole('button', { name: /start a new chat/i }).click();
  await expect
    .poll(() => getStoredSessionId(page), { timeout: 5000 })
    .not.toBe(sidFirst);
  const sidSecond = await getStoredSessionId(page);

  // Now shrink to phone. The rail is hidden; the header pill is the only
  // way into chat history.
  await page.setViewportSize({ width: 375, height: 720 });

  // No rail nav visible at this width — both desktop + tablet navs are
  // `hidden` via the breakpoint classes.
  const visibleRails = page.locator('nav[aria-label="Chat history"]:visible');
  await expect(visibleRails).toHaveCount(0);

  // The phone-only bottom-sheet trigger is the ChatHistoryMenu pill in
  // the header. Its aria-label matches /open chat history/i.
  const phoneTrigger = page.getByRole('button', { name: /open chat history/i });
  await expect(phoneTrigger).toBeVisible();

  await phoneTrigger.click();
  const sheet = page.getByRole('dialog', { name: /recent chats/i });
  await expect(sheet).toBeVisible({ timeout: 2000 });

  // The sheet shows the prior labelled session as a row. The button's
  // accessible name in the ChatHistoryMenu popover is "{label} {relativeTime}",
  // so the row name reads like "vintage wool sweater just now". Match the
  // start of the name to avoid colliding with the delete X (whose
  // aria-label is `Remove "vintage wool sweater" from history` — different
  // shape, so the regex below excludes it).
  const priorRow = sheet.getByRole('button', { name: /^vintage wool sweater /i });
  await expect(priorRow).toBeVisible({ timeout: 3000 });
  await priorRow.click();

  // Stored session id flips back to sidFirst.
  await expect
    .poll(() => getStoredSessionId(page), { timeout: 5000 })
    .toBe(sidFirst);

  await page.screenshot({
    path: resolve(SCREENSHOT_DIR, 'rail-phone.png'),
    fullPage: false,
  });
  // Sanity: ids differed
  expect(sidSecond).not.toBe(sidFirst);
});
