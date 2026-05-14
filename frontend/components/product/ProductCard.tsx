'use client';

import { useId, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, ExternalLink, Heart, Loader2, Store, Wand2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { clientLocale, formatMoney } from '@/lib/format';
import { originCountryDisplay } from '@/lib/country';
import type { Product } from '@/types/product';
import {
  DRAG_MIME,
  encodeDragPayload,
  useOptionalShortlist,
} from '@/hooks/useShortlist';
import { useConversationActions, useConversationState } from '@/hooks/useConversation';
import { ProductImage } from './ProductImage';
import { VariantPicker } from './VariantPicker';
import { ReasoningChips } from './ReasoningChips';
import { MerchantBlock } from './MerchantBlock';

interface Props {
  product: Product;
  index?: number;
}

export function ProductCard({ product, index = 0 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    product.variants?.[0]?.id ?? '',
  );
  // Per-card unique panel id so the merchant-tap and other expanders can
  // wire `aria-controls` without colliding when several cards share a page.
  // React 18's `useId` returns ids with `:` which are valid HTML but break
  // CSS selectors (and Playwright's `#...` locator). Strip the colons.
  const panelId = `product-panel-${useId().replace(/:/g, '')}`;
  // DESIGN.md §6 / §7 — prefers-reduced-motion collapses all motion to a 100ms
  // opacity-only crossfade. Wired at the ProductCard level per the Cycle 1 brief.
  const reduce = useReducedMotion();
  // Cycle 3 — DnD source + keyboard fallback L/M/S (DESIGN.md §7). Optional
  // because tests / story environments may mount cards without a
  // ShortlistProvider; the keyboard handler simply no-ops in that case.
  const shortlist = useOptionalShortlist();
  const { send } = useConversationActions();
  const { isSearching } = useConversationState();
  const [ariaMsg, setAriaMsg] = useState('');
  // Tracks "this card initiated the most recent Pair-with". Used to render a
  // brief pressed state on the Pair button so the user sees their click
  // landed — without it, the submitted user-message appears at the bottom of
  // the chat (potentially below the fold) and the click feels lost.
  const [pairing, setPairing] = useState(false);
  // Cycle 7 Move #3 — collapsed-row hero shape. Default 'square' so SSR and
  // pre-load both render the 96² floor; post-mount, ProductImage's `onAspect`
  // callback reports the source's intrinsic ratio and we promote portrait
  // sources (`h > w * 1.1`) to a `w-20 aspect-[4/5]` frame (80×100). Landscape
  // (`w > h * 1.5`) stays square so a wide editorial shot doesn't compress
  // into a portrait crop. The shape is persisted in component state so
  // re-renders (price/variant flips, expand/collapse) don't re-trigger.
  const [heroShape, setHeroShape] = useState<'square' | 'portrait'>('square');

  const selectedVariant = product.variants?.find((v) => v.id === selectedVariantId);
  const checkoutUrl = selectedVariant?.checkoutUrl || product.checkoutUrl;
  const price = selectedVariant?.price ?? product.price;
  const currency = selectedVariant?.currency ?? product.currency;
  // Variant-aware hero image. Shopify ships per-variant `media[]`; we prefer
  // the selected variant's first image so a Color/Pattern pill tap reflects
  // in the card hero. Falls back to the product-level image set when the
  // variant has none (legacy MCPs, single-image products).
  const heroImage = selectedVariant?.images?.[0] ?? product.images[0];
  const canBuy = !!checkoutUrl;
  // T4.K (Priya) — pull the browser's locale on client so INR / EUR / etc.
  // get correct grouping (lakh comma for en-IN, etc.). Falls back to en-US
  // under SSR via `clientLocale()` returning undefined.
  const locale = clientLocale();
  // T1.1 — track whether this product is already in the Love lane so the heart
  // reflects state. Hides duplicate-tap noise; tapping again moves the lane
  // back to `love` (idempotent server-side) and the heart fills regardless.
  const isLoved = shortlist?.shortlist.some(
    (i) => i.productId === product.id && i.lane === 'love',
  );

  // T7.4 (Priya) — currency + origin trust signals on the Buy surface.
  // The collapsed-row price gets a "(CCY)" badge for any non-USD currency so
  // an Indian user evaluating a US-priced product can't mistake the unit.
  // USD (the default) renders no badge to keep the dominant case clean.
  // Empty string currency falls back to USD silently (formatMoney already does
  // the same), so we treat "" as USD here too.
  const displayCurrency = (currency || 'USD').toUpperCase();
  const showCurrencyBadge = displayCurrency !== 'USD';
  // Origin country — resolves alpha-2 codes to display names; passes free-form
  // strings through verbatim. Empty when the merchant didn't publish it.
  const originDisplay = originCountryDisplay(product.merchantInfo?.originCountry);
  // Trust subtext below the button: "Prices in USD · Ships from US".
  // Suppressed entirely when both pieces are unknown (currency falls back to
  // USD silently — we still surface "Prices in USD" because the BE may have
  // sent "" or omitted the field, and showing the unit is the point).
  const trustParts: string[] = [];
  if (displayCurrency) trustParts.push(`Prices in ${displayCurrency}`);
  if (originDisplay) trustParts.push(`Ships from ${originDisplay}`);
  const trustLine = trustParts.join(' · ');
  // Native `title` tooltip on the Buy CTA — multi-line plain text. Lists
  // currency, origin, and (when published) the merchant's supported
  // destinations. We deliberately don't infer the user's country (ADR-0005 /
  // anti-goals: no IP-geo, no auth), so the line reads "Ships to: GB, US, …"
  // rather than filtering against an inferred locale.
  const shipsTo = product.merchantInfo?.shipsTo;
  const tooltipLines: string[] = [`Buy on ${product.merchant}`];
  if (displayCurrency) tooltipLines.push(`Prices in ${displayCurrency}`);
  if (originDisplay) tooltipLines.push(`Ships from ${originDisplay}`);
  if (shipsTo && shipsTo.length > 0) {
    tooltipLines.push(`Ships to: ${shipsTo.join(', ')}`);
  }
  const buyTooltip = tooltipLines.join('\n');

  function buy() {
    if (!checkoutUrl) return;
    window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
  }

  // T1.1 — tap-to-save heart. Touch-only at rest; fade-in on hover/focus for
  // fine-pointer users (the L/M/S keyboard fallback below still works there).
  // Second tap on a loved card REMOVES it (un-like). Earlier the handler
  // always called `addToLane('love')`, so the heart was a one-way switch.
  function saveLove(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation();
    if (!shortlist) return;
    if (isLoved) {
      void shortlist.remove(product.id);
      setAriaMsg('Removed from Love');
      return;
    }
    void shortlist.addToLane(product.id, 'love', product);
    setAriaMsg('Saved to Love');
  }

  // "Pair with…" — submits a natural-language ask so the agent's system prompt
  // routes through `recommend_outfit` (PRODUCT.md move #4). The product id is
  // kept in the message so the agent has an unambiguous anchor without a
  // round-trip lookup, but the user-visible text reads as a normal request.
  // The `pairing` flag drives a brief pressed state on the button so the click
  // registers visually even when the new user-bubble lands below the fold.
  async function pairWith(e: React.MouseEvent) {
    e.stopPropagation();
    if (isSearching) return;
    setPairing(true);
    try {
      await send(`What would go with the ${product.title}? [pair_anchor:${product.id}]`);
    } finally {
      setPairing(false);
    }
  }

  // Cycle 7 Move #7 (2026-05-14) — anchor-card entry choreography. The first
  // card in a ProductCardGroup (`index === 0`) is the lede; treat its arrival
  // as a focal moment rather than another item in a crossfaded list. Anchor
  // gets a 450ms easeOut entry with a sub-degree pre-rotate (-0.4°→0) and a
  // tiny scale settle (0.98→1) — "Pinterest card dealt onto the table".
  // Siblings (`index >= 1`) keep today's 300ms y:12→0 crossfade + 40ms
  // stagger capped at 5. Reduced motion collapses both paths to the same
  // 100ms opacity-only crossfade — the anchor does NOT get a different
  // reduced-motion treatment.
  // §2.8 carve-out: 450ms exceeds the `motion-default` 300ms but stays under
  // the `motion-never` 500ms cap. Justified in DESIGN.md §2.8 amendment as
  // a deliberate signal of focal-moment arrival, not a general loosening.
  const isAnchor = index === 0;
  const entryInitial = reduce
    ? { opacity: 0 }
    : isAnchor
      ? { opacity: 0, y: 24, rotate: -0.4, scale: 0.98 }
      : { opacity: 0, y: 12 };
  const entryAnimate = reduce
    ? { opacity: 1 }
    : isAnchor
      ? { opacity: 1, y: 0, rotate: 0, scale: 1 }
      : { opacity: 1, y: 0 };
  const entryTransition = reduce
    ? { duration: 0.1 }
    : isAnchor
      ? { duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }
      : { duration: 0.3, delay: Math.min(index, 5) * 0.04, ease: 'easeOut' as const };

  function onNativeDragStart(e: React.DragEvent<HTMLElement>) {
    e.dataTransfer.setData(
      DRAG_MIME,
      encodeDragPayload({ productId: product.id, snapshot: product }),
    );
    e.dataTransfer.effectAllowed = 'copy';
  }
  // Framer Motion overloads `onDragStart` for its own pointer-drag gesture
  // (signature `(event, info) => void`), which trips TS even though we never
  // enable `drag`. Forward the native handler through a spread so framer
  // doesn't see it on the typed prop bag — it still lands on the DOM node
  // because motion forwards unrecognised props.
  const dndProps = {
    draggable: true,
    onDragStart: onNativeDragStart,
  } as unknown as Record<string, unknown>;

  function onCardKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    const target = e.target as HTMLElement | null;
    const isCardSelf = target === e.currentTarget;
    if (!isCardSelf) return;
    // T1.15 — accept lowercase l/m/s in addition to uppercase. Case-insensitive
    // matching prevents the silent-no-op when caps-lock isn't held.
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === 'l' || key === 'm' || key === 's') {
      if (!shortlist) return;
      const lane = key === 'l' ? 'love' : key === 'm' ? 'maybe' : 'skip';
      e.preventDefault();
      void shortlist.addToLane(product.id, lane, product);
      setAriaMsg(
        `Saved to ${lane === 'love' ? 'Love' : lane === 'maybe' ? 'Maybe' : 'Skip'}`,
      );
    }
    // T1.14 — Enter/Space on the card toggles expand (the row containing the
    // expand chevron is a div now, no longer a button — see structural change
    // below).
    if (key === 'Enter' || e.key === ' ') {
      if (
        target instanceof HTMLElement &&
        target.tagName === 'BUTTON'
      ) {
        return;
      }
      e.preventDefault();
      setExpanded((x) => !x);
    }
  }

  return (
    <motion.article
      layout={!reduce}
      initial={entryInitial}
      animate={entryAnimate}
      transition={entryTransition}
      // Cycle 3 — drag source (native HTML5 DnD, no extra dep) + keyboard
      // fallback. `dndProps` are spread via a type-bypass because framer's
      // `onDragStart` is its own gesture (see comment above).
      {...dndProps}
      // T1.14 — card is a focusable role=button so Enter/Space toggles expand.
      // The previous structure had the whole collapsed row as a <button>, with
      // the Buy chip nested as `role="button"` — invalid HTML (button inside
      // button). The chevron-row is now a div with the article handling
      // keyboard activation.
      role="button"
      aria-expanded={expanded}
      tabIndex={0}
      onKeyDown={onCardKeyDown}
      // Cycle 7 Move #7 — marks the first card in a group so tests / styles
      // can target the lede deterministically (`index === 0`). Stable
      // string-typed for Playwright's `[data-anchor="true"]` selector.
      data-anchor={isAnchor ? 'true' : 'false'}
      className={cn(
        'group relative overflow-hidden rounded-2xl bg-white shadow-soft transition hover:shadow-lift',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-50',
      )}
    >
      {/* aria-live region for the L/M/S fallback (DESIGN.md §7). */}
      <span role="status" aria-live="polite" className="sr-only">
        {ariaMsg}
      </span>

      {/* T1.1 — heart-icon tap-to-save. Visible at rest on touch
          (`[@media(hover:none)]`); on fine pointers it now rests at
          `opacity-60` so the affordance survives keyboard tab-nav and
          slow-eye users (T4.C / Diane, Round 5). Hover / focus / saved
          state confirm at full opacity.
          T4.S — saved heart uses `ink-900` (filled) instead of `rose-500`;
          rose is reserved for danger per the Design Lead's note. The fill
          alone carries the "saved" signal — no colour required. */}
      <button
        type="button"
        onClick={saveLove}
        aria-label={isLoved ? 'Saved to Love' : 'Save to Love'}
        aria-pressed={isLoved}
        className={cn(
          'absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink-400 shadow-soft transition',
          'hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
          // Touch (no-hover) devices always see it at full opacity.
          '[@media(hover:none)]:opacity-100',
          // Fine-pointer / hover-capable devices: subtle resting state, full
          // opacity on hover/focus. T4.C — was opacity-0 (invisible to
          // tab-nav users) until Round 5.
          '[@media(hover:hover)]:opacity-60 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100',
          isLoved && 'text-ink-900 [@media(hover:hover)]:opacity-100',
        )}
      >
        <Heart
          className={cn('h-4 w-4', isLoved && 'fill-ink-900')}
          aria-hidden
        />
      </button>

      {/* Collapsed row — div (not button) so the inner Buy is a real
          sibling button (T1.14). Click on this region toggles expand. */}
      <div
        data-testid="card-body"
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full cursor-pointer items-stretch gap-3 p-3 text-left"
      >
        {/* Cycle 7 Move #3 — hero shape derives from the source's intrinsic
            aspect ratio. SSR + first paint render the 96² square; once
            ProductImage decodes the file and reports back via `onAspect`,
            portrait sources promote to `w-20 aspect-[4/5]` (80×100 —
            slightly narrower but visually taller than the 96² floor).
            Square + landscape sources keep the 96² square. The textual
            right-hand side keeps `flex-1` so reshaping the hero never
            crowds the title row. */}
        <div
          className={cn(
            'relative shrink-0 overflow-hidden rounded-xl bg-ink-100',
            heroShape === 'portrait'
              ? 'aspect-[4/5] w-20'
              : 'aspect-square h-24 w-24',
          )}
        >
          <ProductImage
            src={heroImage}
            alt={product.title}
            sizes="96px"
            onAspect={({ w, h }) => {
              // Portrait — `h > w * 1.1` per spec; threshold absorbs near-
              // square sources. Landscape (`w > h * 1.5`) or roughly-square
              // sources fall through to 'square' — the row's horizontal
              // rhythm only varies when the source is unambiguously tall.
              if (h > w * 1.1) setHeroShape('portrait');
              else setHeroShape('square');
            }}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-ink-900">{product.title}</h3>
              {/* Merchant tap — dedicated button with its own
                  aria-controls pointing at this card's expansion panel.
                  Previously the merchant was a passive <p> inside the
                  collapsed row; clicking still expanded the card via
                  bubbling, but the framer `layout` reflow on the grid
                  visually flowed adjacent cards so the wrong one looked
                  like it was opening. A real button with aria-controls
                  pins the interaction to this card and gives SR users
                  a proper expand affordance. */}
              <button
                type="button"
                data-testid="merchant-tap"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((x) => !x);
                }}
                className="mt-1 flex w-full min-w-0 items-center gap-1 text-left text-xs text-ink-400 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-900 focus-visible:ring-offset-1 focus-visible:ring-offset-white"
              >
                <Store className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{product.merchant}</span>
              </button>
            </div>
            <ChevronDown
              aria-hidden
              className={cn(
                'h-4 w-4 shrink-0 text-ink-400 transition-transform',
                expanded && 'rotate-180',
              )}
            />
          </div>
          {/* Reasoning chips — below title, above price (DESIGN.md §4
              ProductCard, §8 Cycle 2). Silently absent when no chips. */}
          {product.reasoningChips?.length ? (
            <div className="mt-2">
              <ReasoningChips chips={product.reasoningChips} />
            </div>
          ) : null}
          <div className="mt-auto flex min-w-0 items-end justify-between gap-2 pt-2">
            <p className="shrink-0 text-base font-semibold text-ink-900">
              {formatMoney(price, currency, locale)}
              {/* T7.4 (Priya) — currency badge on non-USD prices so the unit
                  is unambiguous. USD users see no badge (dominant case stays
                  clean); everyone else sees "(INR)" / "(GBP)" / etc. inline. */}
              {showCurrencyBadge ? (
                <span
                  className="ml-1 align-middle text-[11px] font-medium text-ink-400"
                  aria-label={`Currency ${displayCurrency}`}
                >
                  ({displayCurrency})
                </span>
              ) : null}
            </p>
            {/* T1.6 — "Buy now" → "Buy on {merchant}" everywhere. T1.14 —
                now a sibling <button>, no longer a nested role="button"
                inside an outer <button>. The button is constrained with
                `min-w-0` + `max-w-full` and the inner merchant span uses
                `truncate` so long merchant strings (e.g. "Commonwealthrunning")
                shrink instead of pushing past the card's right edge.
                T7.4 (Priya) — wrapped in a column so the trust subtext
                ("Prices in USD · Ships from US") can sit beneath the button
                without bleeding into the button's tap target. Native `title`
                tooltip exposes the full trust copy on hover (no JS, accessible
                via the existing browser affordance). */}
            <div className="flex min-w-0 max-w-full flex-col items-end">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (canBuy) buy();
                }}
                disabled={!canBuy}
                aria-label={canBuy ? `Buy on ${product.merchant}` : 'Unavailable'}
                title={canBuy ? buyTooltip : undefined}
                className={cn(
                  'inline-flex min-w-0 max-w-full items-center gap-1 rounded-full px-3 py-2 text-xs font-medium transition',
                  'focus:outline-none focus-visible:shadow-glow',
                  canBuy
                    ? 'bg-ink-900 text-white hover:bg-ink-600'
                    : 'cursor-not-allowed bg-ink-100 text-ink-400',
                )}
              >
                <span className="min-w-0 truncate">
                  Buy on <span className="font-semibold">{product.merchant}</span>
                </span>
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              </button>
              {trustLine ? (
                <p className="mt-1 text-right text-[11px] text-ink-400">
                  {trustLine}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="details"
            id={panelId}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0.1 } : { duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden border-t border-ink-100"
          >
            <div className="space-y-4 p-4">
              {product.images.length > 1 && (
                <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                  {product.images.slice(0, 6).map((src, i) => (
                    <div
                      key={src + i}
                      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-ink-100"
                    >
                      <ProductImage src={src} alt={`${product.title} ${i + 1}`} sizes="80px" />
                    </div>
                  ))}
                </div>
              )}

              {product.description && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink-600">
                  {product.description.length > 360
                    ? `${product.description.slice(0, 360).trim()}…`
                    : product.description}
                </p>
              )}

              {product.variants && product.variants.length > 1 && (
                <VariantPicker
                  variants={product.variants}
                  selectedId={selectedVariantId}
                  onSelect={setSelectedVariantId}
                />
              )}

              {/* Merchant transparency — sits before the Buy area per
                  PRODUCT.md move #5 / DESIGN.md §4. Silently absent when
                  the BE has no merchantInfo (graceful degrade per
                  acceptance #5). */}
              {product.merchantInfo ? (
                <MerchantBlock info={product.merchantInfo} />
              ) : null}

              <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ink-400">Total</p>
                  {/* T1.28 — `font-display` on the expanded Total price. One of
                      the four allowed serif homes per DESIGN.md §2.4 #1.
                      T7.4 (Priya) — currency badge on non-USD prices, same
                      treatment as the collapsed row so the unit stays
                      unambiguous when the card opens. */}
                  <p className="font-display text-lg leading-tight text-ink-900">
                    {formatMoney(price, currency, locale)}
                    {showCurrencyBadge ? (
                      <span
                        className="ml-1 align-middle font-sans text-[11px] font-medium text-ink-400"
                        aria-label={`Currency ${displayCurrency}`}
                      >
                        ({displayCurrency})
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {/* T1.8 — Pair-with affordance. Routes through the agent so
                      `recommend_outfit` fires (PRODUCT.md move #4). */}
                  <button
                    type="button"
                    onClick={pairWith}
                    disabled={pairing || isSearching}
                    aria-busy={pairing}
                    aria-label={`Pair with — what would go with ${product.title}?`}
                    className={cn(
                      'inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium transition',
                      'focus:outline-none focus-visible:shadow-glow',
                      // Cycle 7 Move #4b — pressed state uses accent-500
                      // (orange = commitment, §2.2). Was bg-ink-900 (black),
                      // which conflicted with the orange-is-commitment rule.
                      // Hover/idle styles unchanged; only the in-flight
                      // `pairing` press flips. Spinner stays text-white.
                      pairing
                        ? 'bg-accent-500 text-white shadow-lift'
                        : isSearching
                          ? 'bg-white text-ink-400 shadow-soft cursor-not-allowed'
                          : 'bg-white text-ink-900 shadow-soft hover:bg-ink-50',
                    )}
                  >
                    {pairing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5 text-ink-400" aria-hidden />
                    )}
                    {pairing ? 'Asking…' : 'Pair with…'}
                  </button>
                  {/* T1.6 — unified "Buy on {merchant}" wording.
                      T1.29 — focus-visible:shadow-glow on the primary CTA
                      (DESIGN.md §2.7 hard rule).
                      T7.4 (Priya) — wrapped in a column so the trust subtext
                      sits beneath the button; native `title` exposes the full
                      currency + origin + ships-to copy on hover. */}
                  <div className="flex flex-col items-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        buy();
                      }}
                      disabled={!canBuy}
                      aria-label={canBuy ? `Buy on ${product.merchant}` : 'Unavailable'}
                      title={canBuy ? buyTooltip : undefined}
                      className={cn(
                        'inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition',
                        'focus:outline-none focus-visible:shadow-glow',
                        canBuy
                          ? 'bg-accent-500 text-white hover:bg-accent-600'
                          : 'cursor-not-allowed bg-ink-100 text-ink-400',
                      )}
                    >
                      Buy on {product.merchant}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    {trustLine ? (
                      <p className="mt-1 text-right text-[11px] text-ink-400">
                        {trustLine}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
