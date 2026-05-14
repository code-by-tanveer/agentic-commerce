import { expect, test, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// menu-repro — reproduces and pins down two interaction bugs reported by the
// user after the Cycle 7 chat-history ship:
//   1. Clicking the "Chats" trigger in the header opens nothing visible.
//   2. The "New chat" button is flaky — sometimes works, sometimes nothing.
//
// We deliberately run in *headed* default (use `--headed` on the CLI) so a
// human (or future agent) can rerun the file by eye. The assertions are
// strict so headless CI still catches regressions.
// ---------------------------------------------------------------------------

async function waitForStreamingDone(page: Page, timeout = 20_000) {
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

test('reproduce: clicking Chats button shows the menu', async ({ page }) => {
  test.setTimeout(45_000);
  // Use a wide viewport — the trigger collapses below 380px.
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/');

  // The trigger uses aria-label matching /chat history/i.
  const trigger = page.getByRole('button', { name: /chat history/i });
  await expect(trigger).toBeVisible();

  await trigger.click();

  // The popover is portaled to <body> as role=dialog with aria-labelledby
  // pointing at the "Recent chats" title node.
  const dialog = page.getByRole('dialog', { name: /recent chats/i });
  await expect(dialog).toBeVisible({ timeout: 2000 });

  // Click outside should dismiss.
  await page.mouse.click(10, 10);
  await expect(dialog).toBeHidden({ timeout: 1500 });

  // Re-opening must still work (regression guard against the toggle-then-
  // outside-click race that the fix has to navigate).
  await trigger.click();
  await expect(dialog).toBeVisible({ timeout: 2000 });
});

test('reproduce: New chat click creates fresh session and resets canvas', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto('/');

  // Send one message so `hasHistory` becomes true and the New-chat button
  // mounts. We don't need the assistant to fully reply — just the user
  // bubble so the button appears.
  const input = page.getByRole('textbox', { name: 'Message' });
  await input.fill('hi');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: /start a new chat/i })).toBeVisible({
    timeout: 5000,
  });
  await waitForStreamingDone(page, 25_000);

  // Note: the BE-owned `agentic_sid` cookie is httpOnly so `document.cookie`
  // can't read it. The FE writes a mirror to `localStorage['agentic.sessionId']`
  // on every session-mint / session-activate response (see api.ts
  // writeStoredSessionId); we assert on that. The reducer also exposes the
  // session id via the `Provider` but we don't have access to React state from
  // the spec, so localStorage is the canonical, observable invariant.
  const sidBefore = await page.evaluate(() =>
    window.localStorage.getItem('agentic.sessionId'),
  );
  expect(sidBefore, 'expected a stored session id before New chat').not.toBeNull();

  const newChat = page.getByRole('button', { name: /start a new chat/i });
  await newChat.click();

  // Session id must change (the BE-owned cookie + the FE localStorage mirror
  // are both flipped by `createNewSession` → /api/session POST).
  await expect
    .poll(
      async () =>
        page.evaluate(() => window.localStorage.getItem('agentic.sessionId')),
      {
        timeout: 5000,
        message: 'expected stored session id to change after New chat',
      },
    )
    .not.toBe(sidBefore);

  // The canvas must reset to WELCOME-only. The user "hi" bubble is gone.
  // We assert against `hasHistory` flipping false: New chat button unmounts
  // when messages.length === 1.
  await expect(newChat).toBeHidden({ timeout: 3000 });

  // Sanity: the WELCOME copy is still visible.
  await expect(page.getByText(/Tell me what you're shopping for/i)).toBeVisible();
});

test('reproduce: New chat shows inflight feedback while POST /api/session is pending', async ({ page }) => {
  // Bug-repro regression guard for the "flaky" report: the click must
  // produce visible feedback (disabled + spinner) DURING the network
  // round-trip so the user doesn't double-tap and get into a weird state.
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1024, height: 800 });

  // Stall the POST /api/session response by 800ms so we can observe the
  // inflight UI without a flaky race.
  await page.route('**/api/session', async (route) => {
    if (route.request().method() === 'POST') {
      await new Promise((r) => setTimeout(r, 800));
    }
    await route.continue();
  });

  await page.goto('/');

  const input = page.getByRole('textbox', { name: 'Message' });
  await input.fill('hi');
  await input.press('Enter');
  const newChat = page.getByRole('button', { name: /start a new chat/i });
  await expect(newChat).toBeVisible({ timeout: 5000 });
  await waitForStreamingDone(page, 25_000);

  await newChat.click();
  // While the stalled POST is in flight, the button must be disabled with
  // aria-busy=true. This is the user-visible "your click landed" signal.
  await expect(newChat).toBeDisabled({ timeout: 500 });
  await expect(newChat).toHaveAttribute('aria-busy', 'true');

  // Once the POST resolves, the canvas resets — the New chat button unmounts
  // because hasHistory flips false on switch_session.
  await expect(newChat).toBeHidden({ timeout: 5000 });
});
