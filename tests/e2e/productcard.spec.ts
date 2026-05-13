import { expect, test, type Page, type Locator } from '@playwright/test';

// Product-card interaction QA gate. Four bugs the user hit live in 2026-05-13:
//   1. Buy button overflowed its card when the merchant name was long.
//   2. Tapping the merchant text expanded the wrong card / had no aria
//      controls linkage / visually appeared on a neighbour.
//   3. Heart icon could not un-toggle; `saveLove` always called `addToLane`.
//   4. Variant chips rendered but did not switch the active variant —
//      stemmed from products whose variants share no overlapping
//      option keys, so VariantPicker's `chooseValue` matcher missed.
//
// Each test reproduces with a real Shopify query ("running shoes" returns a
// catalogue with multi-merchant results and long brand names like
// "Commonwealthrunning"). The assertions target observable, non-flake-prone
// state (bounding-rect widths, aria-pressed, data-active attributes).

const QUERY = 'running shoes';

async function runSearch(page: Page) {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: 'Message' });
  await expect(input).toBeEnabled();
  await input.fill(QUERY);
  await input.press('Enter');
  // Wait for at least one product card to render. Cards are <article> with
  // role=button (collapsed) — `aria-expanded` is the most reliable hook.
  const cards = page.locator('article[aria-expanded]');
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  // Give the staggered entry animation time to settle before measuring boxes.
  await page.waitForTimeout(800);
  return cards;
}

test('Bug 1 — Buy-on-{merchant} button never overflows its parent card', async ({ page }) => {
  const cards = await runSearch(page);
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);

  // Walk every visible card and assert the inner Buy button fits inside the
  // card. We measure `boundingBox()` rather than CSS so the assertion catches
  // post-layout truth (CSS `truncate` only works if the parent flex chain
  // allows shrink — that's exactly the bug).
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const cardBox = await card.boundingBox();
    if (!cardBox) continue;
    const buy = card.getByRole('button', { name: /^Buy on / });
    if (!(await buy.count())) continue;
    const buyBox = await buy.first().boundingBox();
    if (!buyBox) continue;
    // 0.5px tolerance for sub-pixel rounding under Chromium DPR=1.
    expect(buyBox.x + buyBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 0.5);
    expect(buyBox.width).toBeLessThanOrEqual(cardBox.width);
  }
});

test('Bug 2 — clicking the merchant name expands ONLY its own card', async ({ page }) => {
  const cards = await runSearch(page);
  const count = await cards.count();
  expect(count).toBeGreaterThan(1);

  // Find a card whose collapsed merchant text is visible and click it.
  // The merchant element is the <span> immediately following the Store icon
  // in the title row. Easiest selector: the <p> with the Store icon and
  // truncate class, but role-based is more stable — instead find any
  // article and click its first non-image text near the title.
  const target = cards.nth(0);
  const neighbour = cards.nth(1);

  // The merchant text is the truncate span inside the title block.
  // Use a locator hooked to the explicit testid we add in the component.
  const merchantTap = target.locator('[data-testid="merchant-tap"]').first();
  await expect(merchantTap).toBeVisible();
  await merchantTap.click();

  // Only the targeted card should be expanded. Each article carries
  // aria-expanded; the neighbour must remain false.
  await expect(target).toHaveAttribute('aria-expanded', 'true');
  await expect(neighbour).toHaveAttribute('aria-expanded', 'false');

  // The merchant tap must link to its own expansion panel via aria-controls
  // (per-card unique id). The id resolves to a visible element inside THIS card.
  const controlsId = await merchantTap.getAttribute('aria-controls');
  expect(controlsId).toBeTruthy();
  await expect(target.locator(`#${controlsId}`)).toBeVisible();
});

test('Bug 3 — heart icon toggles love on, then off', async ({ page }) => {
  const cards = await runSearch(page);
  const card = cards.first();

  const heart = card.getByRole('button', { name: /Save to Love|Saved to Love/ });
  await expect(heart).toBeVisible();

  // Initial: not loved.
  await expect(heart).toHaveAttribute('aria-pressed', 'false');

  // Click to love.
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');

  // Click again to un-love. This is the bug — previously the heart stayed
  // pressed forever because the handler always called addToLane('love').
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
});

test('Bug 4 — clicking a variant chip switches the active variant', async ({ page }) => {
  const cards = await runSearch(page);

  // Expand cards looking for one with a switchable chip — i.e. at least one
  // inactive (enabled) chip whose label differs from the currently active
  // chip in the same picker. We pin both chips by their TEXT label so the
  // locator survives the post-click flip of `data-active` (a state-based
  // locator would silently re-resolve to a different chip).
  const count = Math.min(await cards.count(), 8);
  let activeLabel: string | null = null;
  let targetLabel: string | null = null;
  let pickedCard: Locator | null = null;
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    await card.locator('[data-testid="card-body"]').first().click();
    await expect(card).toHaveAttribute('aria-expanded', 'true');

    const allChips = card.locator('[data-testid="variant-chip"]');
    const total = await allChips.count();
    if (total < 2) {
      await card.locator('[data-testid="card-body"]').first().click();
      continue;
    }
    // Find an active label and a different inactive (enabled) label.
    for (let j = 0; j < total && !targetLabel; j++) {
      const chip = allChips.nth(j);
      const isActive = (await chip.getAttribute('data-active')) === 'true';
      const disabled = await chip.isDisabled();
      const label = ((await chip.textContent()) ?? '').trim();
      if (isActive && !activeLabel) activeLabel = label;
      else if (!isActive && !disabled && label && label !== activeLabel) targetLabel = label;
    }
    if (activeLabel && targetLabel) {
      pickedCard = card;
      break;
    }
    activeLabel = null;
    targetLabel = null;
    await card.locator('[data-testid="card-body"]').first().click();
  }
  test.skip(!pickedCard || !targetLabel, 'No card in this query returned switchable variants.');

  const card = pickedCard!;
  // Pin both chips by exact text label.
  const target = card.getByTestId('variant-chip').filter({ hasText: new RegExp(`^${escape(targetLabel!)}$`) }).first();
  await expect(target).toHaveAttribute('data-active', 'false');
  await target.click();
  await expect(target).toHaveAttribute('data-active', 'true');
});

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
