import { expect, test } from '@playwright/test';

// The post-mortem (2026-05-13) identified this as the highest-catch-ratio
// single test we could add. Six of the eight first-boot bugs would have
// been caught by this one spec:
//   - tsx not loading .env (server fails to start, webServer times out)
//   - empty-string URL Zod failure (same)
//   - model emitting Claude-style XML in content (assertion (b) fails)
//   - system prompt calling search_catalog on "hi" (turn loops on MCP error
//     instead of replying; assertion (a) times out)
//   - isStreaming stuck true after error (assertion (c) fails)
//   - no auto-scroll on streamed content (assertion (d) fails)
test('cold "hi" produces a clean streamed reply with no protocol leaks', async ({ page }) => {
  await page.goto('/');

  // The InputBar's textarea is labelled "Message" (sr-only label).
  const input = page.getByRole('textbox', { name: 'Message' });
  await expect(input).toBeVisible();
  await expect(input).toBeEnabled();

  await input.fill('hi');
  await input.press('Enter');

  // (a) A streamed assistant reply appears within 10s. We wait for the
  // "Send" button to flip back from its loading spinner — `isSearching`
  // resolves to `false` once the BE emits `done`, which is exactly the
  // state-machine invariant we want to assert.
  const send = page.getByRole('button', { name: 'Send' });
  await expect(send).toBeEnabled({ timeout: 10_000 });

  // (b) No raw protocol tokens leaked to the visible message. The model
  // must NOT have emitted Claude-style XML function calls into the
  // content stream. The sanitizer in backend/src/services/contentSanitizer.ts
  // is the second line of defense; this is the contract test.
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain('<function');
  expect(bodyText).not.toContain('jsonrpc');
  expect(bodyText).not.toContain('MCP 4');
  expect(bodyText).not.toContain('MCP 5');

  // (c) Input is re-enabled and another message can be sent. This was
  // the "Retry / second message felt stuck" bug — `isStreaming` not
  // resetting after error. We assert by interacting, not by inspection.
  await expect(input).toBeEnabled();
  await input.fill('thanks');
  await input.press('Enter');
  await expect(send).toBeEnabled({ timeout: 10_000 });

  // (d) Auto-scroll: after a turn streams in, the page is scrolled such
  // that the bottom of the document is close to the bottom of the
  // viewport (accounting for the sticky InputBar, which is captured by
  // the `--input-bar-height` CSS var the layout uses for padding).
  const distance = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollHeight - window.innerHeight - window.scrollY;
  });
  // Tolerance: within one InputBar height of the absolute bottom. The
  // bar is ~100–150px (textarea + trust disclosure + safe-area), so 200
  // is a generous ceiling that still proves the auto-scroll fired.
  expect(distance).toBeLessThan(200);
});

test('greeting guard: "hi" does not invoke search_catalog', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Message' });
  await input.fill('hi');
  await input.press('Enter');

  const send = page.getByRole('button', { name: 'Send' });
  await expect(send).toBeEnabled({ timeout: 10_000 });

  // The verb map in ToolStatus.tsx renders "Searching" for `search_catalog`.
  // If the system prompt regressed and started calling search for
  // greetings, that verb would appear in the message stream. We grep
  // negatively for it.
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain('Searching');
});
