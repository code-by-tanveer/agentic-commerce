// Cycle 5 (Phase D) — composeSessionSummary.
//
// Deterministic, no LLM call. Reads the shortlist + saved outfits + the
// session's first user message, builds a SummaryBlob ready to be persisted
// into sessions.summary_blob and served back to the public /s/<id> page.
//
// Cycle 6 may swap the gist for a one-shot Groq call; the function shape
// stays the same so the route layer doesn't have to change.

import { listMessages } from '../db/repos/messages.js';
import {
  listShortlist,
  type ShortlistRow,
} from '../db/repos/shortlists.js';
import { listOutfits, type SavedOutfit } from '../db/repos/outfits.js';

export interface SummaryBlob {
  gist: string;
  createdAt: string;
  love: ShortlistRow[];
  maybe: ShortlistRow[];
  outfits: SavedOutfit[];
  merchantCount: number;
}

const GIST_MAX = 120;
const GIST_FALLBACK = 'A small collection of things worth a second look.';

// Pull the user's first message text (the seed of the session). Older
// schemas may have plain string blocks; normalize defensively.
function extractFirstUserText(messages: Awaited<ReturnType<typeof listMessages>>): string | null {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return null;
  const blocks = firstUser.blocks;
  if (typeof blocks === 'string') {
    return blocks.trim() || null;
  }
  if (Array.isArray(blocks)) {
    for (const b of blocks) {
      if (b && typeof b === 'object') {
        const rec = b as Record<string, unknown>;
        if (rec.type === 'text' && typeof rec.text === 'string') {
          const t = rec.text.trim();
          if (t) return t;
        }
      } else if (typeof b === 'string' && b.trim()) {
        return b.trim();
      }
    }
  }
  return null;
}

function clampGist(raw: string): string {
  // Collapse whitespace, then hard-cap. Add an ellipsis if we truncate.
  const flat = raw.replace(/\s+/g, ' ').trim();
  if (flat.length <= GIST_MAX) return flat;
  return flat.slice(0, GIST_MAX - 1).trimEnd() + '…';
}

function snapshotMerchant(snapshot: unknown): string | null {
  if (snapshot && typeof snapshot === 'object') {
    const m = (snapshot as Record<string, unknown>).merchant;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }
  return null;
}

function outfitMerchants(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  for (const it of items) {
    const m = snapshotMerchant(it);
    if (m) out.push(m);
  }
  return out;
}

export async function composeSessionSummary(
  sessionId: string,
): Promise<SummaryBlob> {
  const [shortlist, outfits, messages] = await Promise.all([
    listShortlist(sessionId),
    listOutfits(sessionId),
    listMessages(sessionId, 50),
  ]);

  // Skip lane is excluded from the public lookbook (PRODUCT.md move #7).
  const love = shortlist.filter((r) => r.lane === 'love');
  const maybe = shortlist.filter((r) => r.lane === 'maybe');

  const merchants = new Set<string>();
  for (const row of [...love, ...maybe]) {
    const m = snapshotMerchant(row.snapshot);
    if (m) merchants.add(m);
  }
  for (const o of outfits) {
    for (const m of outfitMerchants(o.items)) merchants.add(m);
  }

  const seed = extractFirstUserText(messages);
  const gist = seed ? clampGist(seed) : GIST_FALLBACK;

  return {
    gist,
    createdAt: new Date().toISOString(),
    love,
    maybe,
    outfits,
    merchantCount: merchants.size,
  };
}
