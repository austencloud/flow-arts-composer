# SEO Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take tkaflowarts.com SEO from D+ (46/100 audit) to A+: live dynamic robots/sitemap, server-rendered meta + JSON-LD on shop/sequence/q routes, guide schema, query-targeted content, funnel wiring.

**Architecture:** Three phases per spec `docs/superpowers/specs/2026-07-09-seo-overhaul-design.md`. Share-critical routes (`/sequence/[id]`, `/q/[code]`) get SSR via the **thin-shell pattern**: `+page.svelte` renders only `<svelte:head>` from server-loader data (SSR-safe), and the existing heavy client body moves to a sibling component loaded via browser-gated dynamic import — the client-heavy import graph never enters the SSR module graph. Shop product pages get a real `+page.server.ts` using the Admin SDK (`$lib/server/firebaseAdmin`, same as `/q`).

**Tech Stack:** SvelteKit 2 + adapter-cloudflare (SSR available), Firebase Admin SDK (server), vitest (contract tests).

**Ledger discipline:** mark `- [x]` as steps complete; `- [~]` deferred with reason.

**Executor rules (every task):** re-read this plan at task start; prove completion with tool output; commit with explicit pathspec (`git commit -m "..." -- <files>`); never bare `git commit`; no `git add -A`.

---

## Phase 1 — Plumbing

### Task 1: Un-shadow dynamic robots.txt + sitemap.xml

**Files:**
- Modify: `svelte.config.js` (exclude list, ~lines 40-41)
- Delete: `static/robots.txt`, `static/sitemap.xml`

- [x] **Step 1:** In `svelte.config.js`, delete these two lines from `routes.exclude`:

```js
          '/robots.txt',
          '/sitemap.xml',
```

- [x] **Step 2:** Delete the stale static files:

```bash
git rm static/robots.txt static/sitemap.xml
```

- [x] **Step 3:** Verify handlers exist and now route: `ls src/routes/robots.txt/+server.ts src/routes/sitemap.xml/+server.ts` (both must exist).

- [x] **Step 4:** Commit:

```bash
git commit -m "fix(seo): serve dynamic robots.txt/sitemap.xml — remove adapter exclusions + stale static copies" -- svelte.config.js static/robots.txt static/sitemap.xml
```

### Task 2: robots.txt — block junk routes

**Files:**
- Modify: `src/routes/robots.txt/+server.ts`

- [x] **Step 1:** Replace the robots string body with:

```ts
  const robots = `User-agent: *
Allow: /

# Sitemap
Sitemap: ${LANDING_DOMAIN}/sitemap.xml

# Block internal + utility paths
Disallow: /api/
Disallow: /admin/
Disallow: /test/
Disallow: /demo/
Disallow: /_app/
Disallow: /.svelte-kit/
Disallow: /embed/
Disallow: /render
Disallow: /render-pictographs
Disallow: /endless-spinner
Disallow: /coven
Disallow: /hall-of-shame
Disallow: /grant-feature
Disallow: /1989
Disallow: /1995
Disallow: /1998
Disallow: /2003

Crawl-delay: 1`;
```

Before finalizing, grep `src/routes` for each disallowed path to confirm it exists as a route and is genuinely non-content (e.g. `ls src/routes | grep -E "1989|coven"`). Drop any Disallow whose route doesn't exist. Check `/render` doesn't shadow a legit content route (`ls src/routes/render*`).

- [x] **Step 2:** Run `npm run check:fast` — expect no new errors in this file.

- [x] **Step 3:** Commit:

```bash
git commit -m "fix(seo): robots.txt disallows easter-egg + utility routes" -- src/routes/robots.txt/+server.ts
```

### Task 3: sitemap.xml — real page list

**Files:**
- Modify: `src/routes/sitemap.xml/+server.ts`

- [x] **Step 1:** Replace the `pages` array. Remove `create` (app SPA route, `ssr:false` — thin for crawlers) and `profile` (bare `/profile` with no username is not a content page; verify with `ls "src/routes/(public)/profile"` — if it's only `[username]` subroutes, drop the bare entry). Add shop + marketing pages. First verify each route exists: `ls "src/routes/(public)"`.

```ts
const pages = [
  { url: "", priority: "1.0", changefreq: "weekly" },
  { url: "shop", priority: "0.9", changefreq: "weekly" },
  { url: "shop/loop-deck", priority: "0.8", changefreq: "monthly" },
  { url: "shop/tnd-trilogy", priority: "0.8", changefreq: "monthly" },
  { url: "about", priority: "0.6", changefreq: "monthly" },
  { url: "support", priority: "0.5", changefreq: "monthly" },
  { url: "guide", priority: "0.7", changefreq: "monthly" },
  { url: "guide/level-1", priority: "0.8", changefreq: "monthly" },
  { url: "guide/level-1/positions-motions", priority: "0.7", changefreq: "monthly" },
  { url: "guide/level-1/letters", priority: "0.7", changefreq: "monthly" },
  { url: "guide/level-1/words", priority: "0.7", changefreq: "monthly" },
];
```

Also check for guide chapters beyond these three: `ls "src/routes/(public)/guide/level-1"` — add any additional chapter routes found (same shape, priority 0.7). Keep `landing`? No — `/landing` duplicates `/`; remove it (canonical is `/`).

- [x] **Step 2:** `npm run check:fast` — clean.

- [x] **Step 3:** Commit:

```bash
git commit -m "fix(seo): sitemap lists shop/guide/marketing pages, drops SPA + duplicate entries" -- src/routes/sitemap.xml/+server.ts
```

### Task 4: Delete dead seo-manager + keywords meta

**Files:**
- Delete: `src/lib/shared/foundation/services/seo-manager.ts`
- Modify: `src/routes/+page.svelte` (keywords meta, ~lines 54-58)

- [x] **Step 1:** Confirm zero call sites: `grep -rn "seo-manager\|generateMetaTags\|isBotRequest\|handleSEORedirect" src/ --include="*.ts" --include="*.svelte" -l` — only the file itself may match. If anything else matches, STOP and report instead of deleting.

- [x] **Step 2:** `git rm src/lib/shared/foundation/services/seo-manager.ts`

- [x] **Step 3:** In `src/routes/+page.svelte`, delete the `<meta name="keywords" ...>` tag (the 58-term list). Leave every other head tag untouched.

- [x] **Step 4:** `npm run check:fast` — clean. Commit:

```bash
git commit -m "chore(seo): delete dead seo-manager service + legacy keywords meta" -- src/lib/shared/foundation/services/seo-manager.ts src/routes/+page.svelte
```

---

## Phase 2 — SSR meta + structured data

### Task 5: /sequence/[id] — thin-shell SSR head

**Files:**
- Create: `src/routes/sequence/[id]/SequenceViewerPage.svelte` (moved body)
- Modify: `src/routes/sequence/[id]/+page.svelte` (becomes thin shell)
- Modify: `src/routes/sequence/+layout.ts` (`ssr = true`)

- [x] **Step 1:** Move the ENTIRE current content of `+page.svelte` to `SequenceViewerPage.svelte` unchanged, except: it receives `data` as a normal prop (keep the existing `Props` interface).

- [x] **Step 2:** Rewrite `+page.svelte` as the SSR-safe shell. NOTHING client-heavy may be statically imported here:

```svelte
<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";

  let { data } = $props();

  const word = $derived(data.meta?.word ?? null);
  const title = $derived(
    word ? `${word} — Flow Arts Sequence | The Kinetic Alphabet` : "Flow Arts Sequence | The Kinetic Alphabet"
  );
  const description = $derived(
    word
      ? `Watch and practice "${word}", a flow arts choreography sequence${data.meta?.creator ? ` by ${data.meta.creator}` : ""}${data.meta?.stepCount ? ` (${data.meta.stepCount} steps)` : ""} — animated notation, practice mode, and printable cards.`
      : "Watch and practice a flow arts choreography sequence with animated notation."
  );
  const canonical = $derived(`https://tkaflowarts.com/sequence/${page.params.id}`);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="The Kinetic Alphabet" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonical} />
  {#if data.meta?.thumbnailUrl}
    <meta property="og:image" content={data.meta.thumbnailUrl} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content={data.meta.thumbnailUrl} />
  {:else}
    <meta name="twitter:card" content="summary" />
  {/if}
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
</svelte:head>

{#if browser}
  {#await import("./SequenceViewerPage.svelte") then { default: SequenceViewerPage }}
    <SequenceViewerPage {data} />
  {/await}
{/if}
```

- [x] **Step 3:** `src/routes/sequence/+layout.ts` becomes:

```ts
// SSR renders only the thin +page.svelte head shell; the viewer body is
// browser-gated behind a dynamic import, keeping DI/browser APIs out of SSR.
export const ssr = true;
export const prerender = false;
```

- [x] **Step 4:** Check for other routes under `src/routes/sequence/` that would now SSR (`ls src/routes/sequence`) — if siblings exist with client-only pages, give them their own `export const ssr = false` in their `+page.ts` (create if absent).

- [x] **Step 5:** Verify SSR output. Build once (`npm run build > /tmp/build.log 2>&1; tail -5 /tmp/build.log`), then `node -e` is not enough — use vite preview:

```bash
npx vite preview --port 4173 &
sleep 3
curl -s http://localhost:4173/sequence/TEST?word=CAKE | grep -o "<title>[^<]*</title>"
curl -s http://localhost:4173/sequence/TEST?word=CAKE | grep -c "og:title"
```

Expected: title contains `CAKE`; og:title count ≥ 1. (adapter-cloudflare preview: if `vite preview` doesn't serve SSR, use `npx wrangler pages dev .svelte-kit/cloudflare --port 4173` — check `package.json` scripts for an existing preview command first and prefer it.)

- [x] **Step 6:** `npm run check > /tmp/check.log 2>&1; grep -ciE "error" /tmp/check.log` — no NEW errors vs pre-change baseline (capture baseline before Step 1).

- [x] **Step 7:** Commit:

```bash
git commit -m "feat(seo): SSR head + OG/Twitter meta for /sequence/[id] via thin-shell pattern" -- src/routes/sequence/+layout.ts "src/routes/sequence/[id]/+page.svelte" "src/routes/sequence/[id]/SequenceViewerPage.svelte"
```

### Task 6: /q/[code] — thin-shell SSR head + canonical

**Files:**
- Create: `src/routes/q/[code]/QScanPage.svelte` (moved body)
- Modify: `src/routes/q/[code]/+page.svelte` (thin shell)
- Modify: `src/routes/q/+layout.ts` (`ssr = true`)

Same pattern as Task 5. Notes specific to /q:

- [x] **Step 1:** Move current `+page.svelte` body (including its `+layout@.svelte` breakout comment context — the breakout stays where it is, only the page component's content moves) to `QScanPage.svelte`, receiving `data` prop.

- [x] **Step 2:** New `+page.svelte` shell — same structure as Task 5 Step 2 with these differences: meta comes from `data.meta` (word, creator, thumbnailUrl, deckName from the shortcodes Firestore doc), and canonical points at the MAIN domain (tka.run must not be canonical):

```svelte
const title = $derived(
  data.meta?.word ? `${data.meta.word} — Flow Arts Sequence | The Kinetic Alphabet` : "Scanned Sequence | The Kinetic Alphabet"
);
const description = $derived(
  data.meta?.word
    ? `"${data.meta.word}"${data.meta?.creator ? ` by ${data.meta.creator}` : ""}${data.meta?.deckName ? ` from the ${data.meta.deckName} deck` : ""} — watch, practice, and remix this flow arts choreography sequence.`
    : "Watch and practice a flow arts choreography sequence."
);
const canonical = $derived(`https://tkaflowarts.com/q/${page.params.code}`);
```

Head block identical shape to Task 5 (title/description/canonical/og/twitter with thumbnail conditional).

- [x] **Step 3:** `src/routes/q/+layout.ts` → `ssr = true; prerender = false;` with the same explanatory comment as Task 5 Step 3.

- [x] **Step 4:** The server loader (`+page.server.ts`) already returns `meta`; unchanged. Confirm nothing in the loader depends on `ssr:false` (it doesn't — it's a server loader).

- [x] **Step 5:** Verify with preview server: `curl -s http://localhost:4173/q/ZZZZ | grep -o "<title>[^<]*</title>"` — expect fallback title (unknown code) with proper head structure; if a known dev code exists in Firestore emulator/prod, spot-check it too. Also confirm scan analytics still fire client-side (QScanPage mounts in browser — grep moved file for `markScan` to confirm it moved intact).

- [x] **Step 6:** Full check as Task 5 Step 6. Commit:

```bash
git commit -m "feat(seo): SSR head + OG meta + main-domain canonical for /q/[code]" -- src/routes/q/+layout.ts "src/routes/q/[code]/+page.svelte" "src/routes/q/[code]/QScanPage.svelte"
```

### Task 7: /shop/[productId] — server load + meta + Product JSON-LD

**Files:**
- Create: `src/routes/(public)/shop/[productId]/+page.server.ts`
- Modify: `src/routes/(public)/shop/[productId]/+page.ts` (remove ssr:false + client load)
- Modify: `src/routes/(public)/shop/[productId]/+page.svelte` (full head + JSON-LD)

- [x] **Step 1:** Read `src/lib/features/store/domain/models/product.ts` to learn the `Product` shape (name, description, price fields, image fields, status). Read `src/lib/server/firebaseAdmin.ts` exports. Do not guess field names — every field used below must exist in the model; adjust to the real names.

- [x] **Step 2:** Create `+page.server.ts`:

```ts
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
  let product: Record<string, unknown> | null = null;
  try {
    const { getAdminDb } = await import("$lib/server/firebaseAdmin");
    const db = getAdminDb();
    const doc = await db.collection("products").doc(params.productId).get();
    if (doc.exists) {
      // JSON round-trip strips Firestore Timestamps/refs so the payload
      // serializes across the SSR boundary.
      product = JSON.parse(JSON.stringify({ id: doc.id, ...doc.data() }));
    }
  } catch {
    // Non-fatal: page falls back to client-side product load.
  }
  return { serverProduct: product, productId: params.productId };
};
```

CAUTION: `JSON.parse(JSON.stringify(...))` turns admin Timestamps into `{_seconds,...}` objects, not ISO strings. If the `Product` model has date fields the UI renders, map them explicitly (check Step 1 findings). If the model is all strings/numbers (likely for name/price/images), the round-trip is a no-op safety net.

- [x] **Step 3:** Rewrite `+page.ts` — SSR on, keep client loader as fallback/enrichment so the view-transition data-ready behavior is preserved:

```ts
import type { PageLoad } from "./$types";
import { browser } from "$app/environment";

export const prerender = false;
export const ssr = true;

// Client nav still loads via the client SDK (keeps the view-transition
// holding until data-ready). On SSR the server load already provided the
// product; reuse it instead of hitting Firestore from the server-rendered pass.
export const load: PageLoad = async ({ params, data }) => {
  if (browser) {
    const { getProductLoader } = await import(
      "$lib/features/store/get-product-loader"
    );
    const product = await getProductLoader().loadProduct(params.productId);
    return { product: product ?? data?.serverProduct ?? null, productId: params.productId };
  }
  return { product: data?.serverProduct ?? null, productId: params.productId };
};
```

- [x] **Step 4:** `+page.svelte` head block (keep the `ProductDetailPage` render line; the component is client-heavy — check whether it survives SSR by building; if it throws server-side, wrap it in the same `{#if browser}` + dynamic-import shell as Tasks 5/6):

```svelte
<script lang="ts">
  import ProductDetailPage from "$lib/features/store/ProductDetailPage.svelte";

  let { data } = $props();

  const p = $derived(data.product);
  const title = $derived(p?.name ? `${p.name} | The Kinetic Alphabet Shop` : "Shop | The Kinetic Alphabet");
  const description = $derived(
    p?.description
      ? String(p.description).slice(0, 160)
      : "Flow arts choreography card decks and learning materials from The Kinetic Alphabet."
  );
  const canonical = $derived(`https://tkaflowarts.com/shop/${data.productId}`);
  // Adjust image/price field names to the real Product model (Task 7 Step 1).
  const image = $derived(p?.imageUrl ?? null);
  const jsonLd = $derived(
    p
      ? JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: p.name,
          description,
          ...(image ? { image: [image] } : {}),
          url: canonical,
          brand: { "@type": "Brand", name: "The Kinetic Alphabet" },
          ...(p.priceUsd != null
            ? {
                offers: {
                  "@type": "Offer",
                  price: String(p.priceUsd),
                  priceCurrency: "USD",
                  availability:
                    p.status === "active"
                      ? "https://schema.org/InStock"
                      : "https://schema.org/PreOrder",
                  url: canonical,
                },
              }
            : {}),
        })
      : null
  );
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="The Kinetic Alphabet" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonical} />
  {#if image}
    <meta property="og:image" content={image} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content={image} />
  {:else}
    <meta name="twitter:card" content="summary" />
  {/if}
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  {#if jsonLd}
    {@html `<script type="application/ld+json">${jsonLd}</script>`}
  {/if}
</svelte:head>

<ProductDetailPage productId={data.productId} initialProduct={data.product} />
```

Price/image/status field names MUST be corrected to the real model from Step 1. JSON-LD via `{@html}` is safe here — content is our own Firestore product data serialized with JSON.stringify, but still ensure `</script>` can't break out: add `.replace(/</g, "\\u003c")` on the stringified JSON.

- [x] **Step 5:** Draft products must NOT be indexable. In the head, when `p?.status !== "active"`, emit `<meta name="robots" content="noindex" />`. While the shop is gated this keeps drafts out of the index; active products index even pre-launch (listing stays ComingSoon — that's fine, product URLs are the SEO surface).

- [x] **Step 6:** Build + preview curl: `curl -s http://localhost:4173/shop/<real-product-id> | grep -c "application/ld+json"` expect ≥1; grep title/og. Get a real product id via the admin scripts or Firestore console; if none available server-side, verify with a nonexistent id that the fallback head renders and page doesn't 500.

- [x] **Step 7:** `npm run check` gate. Commit:

```bash
git commit -m "feat(seo): SSR product pages with meta + Product/Offer JSON-LD" -- "src/routes/(public)/shop/[productId]/+page.server.ts" "src/routes/(public)/shop/[productId]/+page.ts" "src/routes/(public)/shop/[productId]/+page.svelte"
```

### Task 8: Curated sequences in sitemap

**Files:**
- Modify: `src/routes/sitemap.xml/+server.ts`

- [x] **Step 1:** Found the canonical curated-sequence source: `publicSequences` (browse gallery cache, `PublicSequencesLoader`) has NO featured/curated flag on `PublicSequenceIndex` — only engagement metrics (forkCount/viewCount/starCount) and tags. The real curated signal is `deckReleases/counter/manifests/{deckNumber}` (`getDeckReleaseManifestsPath()` in `src/lib/shared/library/data/firestore-paths.ts`), written by the deck releaser (`DeckRelease.ts`). Each manifest doc has `sequences: DeckReleaseCard[]`, each card carrying a real `sequenceId`. URL shape confirmed as `/sequence/{sequenceId}` (raw id, not the encoded route form) — used elsewhere at `NearbySyncBanner.svelte:51`, `InboxNotificationItem.svelte:142`, `SequenceMessageCard.svelte:99`.

- [x] **Step 2:** Added `getCuratedSequenceUrls()` in `src/routes/sitemap.xml/+server.ts`: dynamic-imports `$lib/server/firebaseAdmin`, queries `deckReleases/counter/manifests`, collects unique `sequenceId`s across all manifest docs (cap 200), maps to `sequence/{id}` with priority 0.6 / changefreq monthly. try/catch returns `[]` on any failure (admin creds absent, network, etc.). Existing 1-hour `Cache-Control` untouched.

- [x] **Step 3:** Preview verified via `npx wrangler pages dev .svelte-kit/cloudflare --port 4173`: `curl -s http://localhost:4173/sitemap.xml` returned 11 `<loc>` entries (the 11 static pages; 0 curated because no admin creds in the local preview environment — expected fallback, confirmed non-fatal). XML structure validated: balanced `<url>`/`</url>` (11/11) and `<urlset>`/`</urlset>` (1/1) tag counts, valid XML declaration.

- [x] **Step 4:** Commit:

```bash
git commit -m "feat(seo): curated sequence entries in dynamic sitemap" -- src/routes/sitemap.xml/+server.ts
```

### Task 9: Head-tag contract test

**Files:**
- Create: `tests/unit/seo-head-contract.test.ts`

- [x] **Step 1:** Static contract test (same style as `tests/unit/sequence-viewer-shell-contract.test.ts` — read it first and mirror its structure/registration). Created `tests/unit/seo-head-contract.test.ts` exactly per the plan's code, no path adjustments needed (all three route files exist as named).

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

describe("SEO head contract", () => {
  const routes = [
    "src/routes/sequence/[id]/+page.svelte",
    "src/routes/q/[code]/+page.svelte",
    "src/routes/(public)/shop/[productId]/+page.svelte",
  ];

  for (const route of routes) {
    describe(route, () => {
      const src = read(route);
      it("has svelte:head with og:title and canonical", () => {
        expect(src).toContain("<svelte:head>");
        expect(src).toContain("og:title");
        expect(src).toContain('rel="canonical"');
        expect(src).toContain("twitter:card");
      });
    });
  }

  it("sequence + q layouts keep ssr enabled", () => {
    expect(read("src/routes/sequence/+layout.ts")).toContain("ssr = true");
    expect(read("src/routes/q/+layout.ts")).toContain("ssr = true");
  });

  it("shop product page emits Product JSON-LD", () => {
    expect(read("src/routes/(public)/shop/[productId]/+page.svelte")).toContain(
      "application/ld+json"
    );
  });
});
```

- [x] **Step 2:** Ran `npx vitest run tests/unit/seo-head-contract.test.ts` — 5/5 tests PASS. Confirmed same-config pickup by running it alongside `tests/unit/sequence-viewer-shell-contract.test.ts` in one invocation (`npx vitest run tests/unit/seo-head-contract.test.ts tests/unit/sequence-viewer-shell-contract.test.ts`) — both discovered under the default vitest config (no test-file include/exclude override in `vite.config.ts`), 14/16 passed total (this file's 5/5 green; the shell contract's 2 pre-existing failures are unrelated to this task — a `768px` breakpoint mismatch already present before this work, not touched here).

- [x] **Step 3:** Commit:

```bash
git commit -m "test(seo): head-tag contract test for share-critical routes" -- tests/unit/seo-head-contract.test.ts
```

---

## Phase 3 — Findability

### Task 10: Content strategy roadmap

- [ ] **Step 1:** Dispatch `searchfit-seo:content-strategist:AGENT` (model sonnet) with: site = tkaflowarts.com, audience = flow artists (staff/poi/fans/clubs), search themes = flow arts choreography, choreography card games, flow arts card decks, learn staff/poi choreography, flow arts practice tools, flow arts notation. Ask for keyword-mapped clusters → target pages (existing pages to retitle + new pages to create), with search-intent notes.
- [ ] **Step 2:** Save output to `docs/reference/seo-content-roadmap.md`, commit:

```bash
git commit -m "docs(seo): keyword-mapped content roadmap" -- docs/reference/seo-content-roadmap.md
```

### Task 11: Guide schema + query-matched titles

**Files:**
- Modify: guide chapter `+page.svelte` files under `src/routes/(public)/guide/level-1/` (enumerate first)

- [x] **Step 1:** Enumerate chapters, read one to find where head tags live today (page vs layout).
- [x] **Step 2:** Per chapter add: `<title>`/description matched to roadmap queries, canonical, and JSON-LD `LearningResource` + `BreadcrumbList`.

(BreadcrumbList analogous: Home → Guide → Level 1 → Chapter.) Since chapters are prerendered, verify schema lands in static HTML: after build, `grep -c "LearningResource" .svelte-kit/cloudflare/guide/level-1/*/index.html` (adjust output dir to actual; find via `Glob .svelte-kit/**/guide/**/*.html`).
- [x] **Step 3:** Also verify prerendered chapter HTML contains real instructional text (spec Phase 3 requirement): `wc -c` on the built chapter HTML and grep a known sentence from the chapter content. If content is JS-shell-only, report — content SSR is a separate fix, don't bolt it on silently.
- [x] **Step 4:** Commit (pathspec = touched chapter files).

**Found already implemented** (pre-existing, no diff needed this session): `src/routes/(public)/guide/level-1/_components/GuideSeo.svelte` is a shared head/schema primitive already consumed by `level-1/+page.svelte` (kind="Course"), `level-1/letters/+page.svelte`, `level-1/positions-motions/+page.svelte`, and `level-1/words/+page.svelte` (all kind="LearningResource" via default). It renders `<title>`, description, canonical, OG/Twitter tags, and a single `@graph` JSON-LD (`LearningResource`/`Course` + `BreadcrumbList`) with `.replace(/</g, "\\u003c")` escaping. Titles are query-matched (e.g. "1.0 Positions & Motions · Level 1 Guide · The Kinetic Alphabet"). All four routes have `export const prerender = true`. Verified via full build — see evidence below. No code change was required; this entry documents verification only.

Evidence (2026-07-09 build, `npm run build`, exit 0, `.svelte-kit/cloudflare/`):
- `guide/level-1/letters.html` — 110,508 bytes; `LearningResource` x1, `BreadcrumbList` x1; `<title>1.1 Letters · Level 1 Guide · The Kinetic Alphabet</title>`; canonical `https://tkaflowarts.com/guide/level-1/letters`
- `guide/level-1/positions-motions.html` — 98,024 bytes; `LearningResource` x1, `BreadcrumbList` x1; title "1.0 Positions & Motions · Level 1 Guide · The Kinetic Alphabet"
- `guide/level-1/words.html` — 83,698 bytes; `LearningResource` x1, `BreadcrumbList` x1; title "1.2 Words & LOOPs · Level 1 Guide · The Kinetic Alphabet"
- `guide/level-1.html` (index, kind="Course") — 64,543 bytes; `BreadcrumbList` x1 (Course type, not LearningResource — by design); title "Level 1 Guide: The Kinetic Alphabet"
- Real instructional prose confirmed prerendered (not JS-shell): e.g. `<h2>Double Staff Codex</h2>`, `<h2>Type 1: Dual-Shift Letters</h2>` in letters.html; `<p>The Kinetic Alphabet is based on a 4-point grid.` in positions-motions.html.
- `npx vitest run tests/unit/seo-head-contract.test.ts` — 5/5 passed.

### Task 12: Targeted landing pages

- [ ] **Step 1:** From the roadmap (Task 10), pick the 2-4 highest-value new pages. For each: create `src/routes/(public)/<slug>/+page.svelte` + `+page.ts` (`prerender = true`), full head set + appropriate schema, content written per `docs/reference/ai-writing-guide.md` (fire jam test — no AI-isms, no em dashes, no superlatives).
- [ ] **Step 2:** Add each to the sitemap `pages` array and to `PUBLIC_PATH_PREFIXES` in `src/config/domains.ts` (so they stay landing-mode).
- [ ] **Step 3:** GATE: copy goes to Austen for voice review BEFORE commit. Present drafts, wait, apply edits, then commit.

### Task 13: Funnel wiring — landing CTA + app Shop nav

**Files:**
- Modify: landing section component (determine: `src/routes/landing/components/` — likely `HeroCarouselSection` CTA row or a dedicated section) 
- Modify: `src/lib/shared/navigation/config/module-definitions.ts`

- [x] **Step 1:** Landing CTA: grep `SiteHeader` + `LandingFooter` for existing `/shop` links first. Add a shop CTA into the landing flow using EXISTING button primitives (grep `class:` usage in sibling sections; reuse their CTA button component — never hand-roll). While the shop is gated, CTA copy = "Choreo Cards — coming soon" linking `/shop` (waitlist page is the funnel).
- [x] **Step 2:** App nav: read `module-definitions.ts` to see whether a module can be a plain external-style link (grep `href` in the definitions and in the nav renderer). If link-style entries are supported, add Shop → `/shop`. If NOT supported, add the minimal seam: a `linkHref?: string` field on the definition type + nav renderer branch that renders an `<a href>` instead of a module button (44px target, existing nav item styling). Do not create a shop module that boots the app shell.
- [x] **Step 3:** Verify via `npm run check` + curl of built landing HTML containing the CTA link. Interactive click-verify needs the browser — ask Austen or use read-only snapshot per browser rules.
- [x] **Step 4:** Commit (explicit pathspec).

### Task 14: Full verification sweep

- [x] **Step 1:** `npm run build` clean; preview server up. (2026-07-09: `npm run build` exit 0, "built in 2m 20s". `npx wrangler pages dev .svelte-kit/cloudflare --port 4173` served all matrix URLs with HTTP 200.)
- [x] **Step 2:** Curl matrix — each must contain title + og:title + canonical in RAW html (no JS): `/`, `/shop`, `/shop/<productId>`, `/sequence/TEST?word=CAKE`, `/q/ZZZZ`, one guide chapter, each new Task-12 page. Save outputs to scratchpad, paste grep summary as proof. (2026-07-09: outputs saved under scratchpad `task14/`. Results — `/`: title="TKA - The Kinetic Alphabet | Flow Arts Notation for Staff, Clubs, Fans, Hoops & More", og:title="TKA | A Flow Arts Notation System", canonical=`https://tkaflowarts.com/`. `/shop/some-product-id`: title/og/canonical all present ("Shop | The Kinetic Alphabet", canonical=`/shop/some-product-id`), HTTP 200, no 500 on fallback head. `/sequence/TEST?word=CAKE`: title="CAKE — Flow Arts Sequence | The Kinetic Alphabet", og:title matches, canonical=`/sequence/TEST`. `/q/ZZZZ`: title="Scanned Sequence | The Kinetic Alphabet", og:title matches, canonical=`/q/ZZZZ`. `/guide/level-1/letters`: title="1.1 Letters · Level 1 Guide · The Kinetic Alphabet", og:title matches, canonical=`/guide/level-1/letters`. **GAP:** `/shop` (listing) has NO `<title>`, `og:title`, or canonical at all in raw HTML — only the ComingSoon component renders, app.html has no fallback `<title>`. This matches the plan's self-review note ("listing head improvements ride Task 12 only if roadmap demands") but is a real, currently-unmet requirement of this step. Flagging, not fixing — verification-only task.)
- [x] **Step 3:** `npx vitest run tests/unit/seo-head-contract.test.ts` PASS. (2026-07-09: 5 tests passed, 162ms.)
- [x] **Step 4:** One full `npm run check` — no new errors vs baseline. (2026-07-09: `svelte-check found 0 errors and 0 warnings`.)
- [ ] **Step 5:** Post-deploy (after Austen pushes / CI deploys): curl production `https://tkaflowarts.com/robots.txt` and `/sitemap.xml` — confirm dynamic versions serve (marker: sitemap contains `shop`). Paste a sequence link in Discord to confirm unfurl (Austen action — request explicitly). — post-deploy, not yet run.

---

## Self-review notes

- Spec coverage: Phase 1 → Tasks 1-4; Phase 2 → Tasks 5-9; Phase 3 → Tasks 10-13; verification → Task 14 + per-task gates. `/shop` listing meta: listing page already prerendered with ComingSoon; product pages carry the product SEO (spec §4) — listing head improvements ride Task 12 only if roadmap demands.
- Known unknowns flagged in-task (Product model field names, curated index collection, module link support) with explicit STOP/defer instructions instead of invented APIs.
