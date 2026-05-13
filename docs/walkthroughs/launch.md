# Manual launch walkthrough

Internal QA-style walkthrough. Written for someone who has never seen the app. Follow it top-to-bottom on a fresh clone; every step lists the expected on-screen state so you can spot regressions.

## 0. Prerequisites

- Node 20+, npm 10+.
- A Groq API key (`gsk_...`).
- A publicly reachable UCP agent profile URL (or a localhost one if you don't intend to hit live MCP).

## 1. Clone, install, env, dev

```bash
git clone <repo> && cd agentic_commerce
npm install
cp backend/.env.example backend/.env       # set GROQ_API_KEY + UCP_PROFILE_URL
cp frontend/.env.example frontend/.env     # leave BACKEND_URL=http://localhost:4000
npm run dev:backend     # terminal 1 → http://localhost:4000
npm run dev:frontend    # terminal 2 → http://localhost:3000
```

Open `http://localhost:3000` in a desktop browser. You should see an empty chat shell with a single input bar and the "About you" panel collapsed at the side.

## 2. Step-by-step

### Step 1 — first query

Type: `find me a minimalist desk lamp under $150` and press Enter.

Expected:
- The text streams character-by-character into a new assistant bubble.
- A dim inline `ToolStatus` line appears: "Searching catalog for 'minimalist desk lamp'…", then flips to "done".
- A product grid materializes below the text within the same assistant turn — not a separate message.
- Every card carries ≥2 reasoning chips (e.g. `under $150`, `−42% vs MSRP`).

### Step 2 — follow-up

Type: `show me cheaper`.

Expected:
- The agent retains context (does not ask "cheaper than what?"). A new tool-status flickers, a new product set lands in a fresh assistant turn at a lower price band.
- The first turn's grid stays visible above; the conversation reads as a stream of stacked product blocks.

### Step 3 — preferences

Type: `I wear size 8 and ship to the EU`.

Expected:
- A short streamed acknowledgement.
- The `PreferencesCard` ("About you" panel) flips open with two new inline-editable chips: `size: 8` and `ships_to: EU`. Each chip's `source` label reads `you` (not `inferred`).
- Ask another product query (e.g. `now something for the kitchen`). The next product set's cards carry a `size 8 match` chip where the data supports it; missing data shows no chip rather than a fake one.

### Step 4 — merchant transparency

Click (or tap) a product card to expand it.

Expected:
- A `MerchantBlock` slides into view showing seller name, returns-policy summary, shipping-days estimate, customer rating, and a carbon-shipping note where the merchant published one.
- Absent fields render the literal string "merchant didn't publish this" — never blank, never a fake number.

### Step 5 — view toggle

Click the `ViewToggle` in the canvas header (list ↔ collage).

Expected:
- The grid reflows into a Pinterest-style masonry. Cards re-flow their aspect ratios; the price renders as a serif overlay on hover.
- Reasoning chips remain present on every card.
- Refresh the page — the collage view persists for the session (read from `sessions.view_mode`).

### Step 6 — shortlist

Drag a product into the **Love** lane in the `Shortlist` drawer (right side on desktop, bottom sheet on mobile).

Expected:
- The Love count badge updates instantly.
- Alternative keyboard path: focus the card with Tab, press `L`. Same effect, with a focus ring throughout.
- Repeat into **Maybe** with a different product. Repeat into **Skip** with a third.

### Step 7 — outfit bundle

Focus any one product (click it once so the canvas treats it as the anchor) and type: `what would go with this?`.

Expected:
- An `OutfitBundle` card renders in a new assistant turn with 2–4 coordinated items plus a one-line `"why this with that"` rationale per item.
- A single "save outfit" action sits on the card. Pressing it stores the bundle and shows a toast.

### Step 8 — photo → style search

Click the paperclip in the input bar (or paste an image from the clipboard, or drag-drop a JPEG/PNG/WebP onto the chat canvas).

Expected:
- An `ImageDropzone` overlay confirms the drop and uploads to `/api/upload`.
- Within ~5s a `Moodboard` card renders the extracted attributes as editable chips (e.g. `boucle texture`, `sand palette`, `mid-century silhouette`) plus a short description.
- A search fires automatically with the suggested query; the resulting product grid lands in the same assistant turn.
- If vision returns low confidence the agent says so and asks a clarifying question — it does not guess silently.

### Step 9 — share

Click the `ShareButton` in the header (visible only once you have ≥1 shortlisted item).

Expected:
- The URL `https://<host>/s/<id>` copies to the clipboard and a toast confirms.
- Open the URL in an **incognito** window: the page renders fully without JavaScript (disable JS in DevTools to verify), with a hero serif headline, the shortlist sections, merchant names + totals, and a sentence-or-two recap.
- View page source: the `og:image`, `og:title`, and `og:description` tags are populated.

### Step 10 — mobile

Open the same `http://localhost:3000` from a phone on the same LAN (or use DevTools device emulation).

Expected:
- The Shortlist is a bottom sheet, not a side drawer; tapping the badge slides it up.
- The `PreferencesCard` collapses to a single summary line; tapping it expands inline.
- Tap targets on action buttons (share, lane handles, summary links) are ≥44px.
- Repeat steps 1–4 on mobile. Streaming, reasoning chips, merchant expand, and view toggle all behave identically.

## 3. What "pass" looks like

If every step rendered the expected state above, the build is launch-ready against the seven UX moves in PRODUCT.md §5. File any deviation as a defect in the current cycle doc under `## Defects` with a short repro.
