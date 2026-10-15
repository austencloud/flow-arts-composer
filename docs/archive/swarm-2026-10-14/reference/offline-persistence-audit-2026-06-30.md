# Offline Persistence — AAA Audit (2026-06-30)

> Method: 4 scout agents mapped the stack, then a verification workflow probed 5 dimensions
> (render-offline, thumbnail-render-path, route-matrix, sw-robustness, ux-honesty), producing
> 30 findings. Each was adversarially re-verified (refute-by-default) by an independent agent.
> **29 survived, 1 refuted.** Severity: 5 BLOCKER · 10 HIGH · 11 MEDIUM · 1 LOW · 2 INFO.
> Every claim below is grounded in `file:line`.

## Headline verdict

**No — not truly offline-functional today.** The shell, your Firestore-cached sequences, and auth
load offline, but the pictograph art every screen is built from is **network-only**, and the
"Download for offline" button writes thumbnails under a key nothing ever reads. The app is
offline-capable for **navigation and data**, but **not for the rendering it exists to do.**

## Per-persona reality

| Persona | Offline reality |
|---|---|
| Returning user, cold-open on a plane (web PWA) | **Partial** — shell, JS/CSS, fonts, Firestore-cached sequence list load; any pictograph whose SVGs aren't still in the volatile HTTP cache renders **blank**. Usable for titles/metadata, not for seeing or composing pictographs. |
| Same user, native Android / Capacitor build | **Better render, worse robustness** — `static/images` ships in the app bundle (`webDir:'build'`) so pictographs actually draw offline; but the bundled `sw.js` is a stale `tka-v1` artifact lacking the immutable/3D caching the web `tka-v2` SW has. |
| Brand-new user who installs then immediately goes offline | **Worst case** — entry JS chunks were fetched before the SW took control (only in evictable HTTP cache, not Cache Storage) and `/images` was never warmed → cold reload can white-screen or render blank. Needs at least one full online session first. |
| Festival performer at an offline jam | **Conditional** — a sequence opened from their own warmed library/Create can work, but a cold `/sequence/[id]` open or a `/q/[code]` QR scan returns **503**. The "scan-to-play" the SW comment advertises as "offline festival use" does not work offline. |
| User who pressed "Download for offline" | **Misled** — downloads only thumbnails, under a raw-URL key the gallery renderer (hash-keyed) never reads (zero visible benefit), can LRU-evict the cache that *does* work, then disables itself labelled "Already downloaded" having cached no usable images. |

---

## What actually works offline

| Surface | Works offline? | Mechanism |
|---|---|---|
| App shell (`/app` HTML) | **Yes** | SW precache `APP_SHELL_URLS=['/app']` (`static/sw.js:8,12`) + SPA navigate fallback (`sw.js:91-107`) |
| In-app routes (`/create`, `/browse`, `/train`) | **Yes** (shell) | navigate fallback serves cached `/app`; client router takes over (`sw.js:91-106`) |
| App JS/CSS (immutable chunks) | **Yes, after 1st online visit** | `cacheFirst` on `/_app/immutable/` (`sw.js:76-79`); no precache → cold-install gap |
| Self-hosted fonts (Font Awesome) | **Yes** | `cacheFirst` `/fonts/*.woff2` + `/fonts/css/` (`sw.js:60-70`) |
| Firestore data (sequences, library, settings) | **Yes** | `persistentLocalCache` IndexedDB (`firebase.ts:362`) |
| Auth / local settings | **Yes** (local-first) | `indexedDBLocalPersistence` (`firebase.ts:209`) + offline role cache (`auth-state.svelte.ts:363`); settings localStorage + offline queue |
| 3D models / avatars (GLB / KTX2) | **Only after that scene viewed online** | `cacheFirstDedicated` `/models/*`, `/draco/` (`sw.js:51-58`); no precache; R2-hosted assets cross-origin → never cached |
| Browse gallery **list** | **Only if opened online once** | Dexie `galleryCache` (`gallery-offline-cache.ts`), written as a side effect of an online fetch |
| Browse gallery **thumbnails** | **Partial / unreliable** | firebasestorage SWR (`sw.js:43`) + hash-keyed IDB render cache; Tier-4 local re-render needs `/images` SVGs (fails) |
| Pictograph SVGs (props/arrows/grid/letters/numbers/glyphs) | **No (cold offline)** | network-only `/images/*` (`sw.js:109`); in-memory `Map` only; HTTP cache by accident |
| Playfair Display heading font | **No (degrades to system serif)** | Google Fonts CDN; SW skips cross-origin (`sw.js:42-47`); graceful |
| `/sequence/[id]` viewer (cold) | **No (503)** | `networkFirst`, excluded from SPA fallback (`sw.js:82-85`) |
| `/q/[code]` QR scan (cold) | **No (503, then resolution needs network)** | `networkFirst` `/q` (`sw.js:82`); all resolution paths require network |
| 3D animation pane | **Only after that scene + Three.js chunk loaded online** | lazy 3.8MB import + on-demand GLB |

---

## What breaks / what's theater (severity-ranked)

### BLOCKER

**1. Pictograph render assets (`/images/*` SVGs) are network-only — cold-offline pictographs render blank.**
- **Files:** `static/sw.js:109` (network-only fallthrough), `:42-47` (cross-origin skip except firebasestorage); loaders `prop-svg-loader.ts:106-108,212`, `arrow-svg-loader.ts:66,238`, `glyph-cache.ts:103,131-132,173,194`, `svg-preloader.ts:190-202`, `GridSvg.svelte:94,98-103`, `asset-fetch.ts:40-53` (plain `fetch`, no Cache API), `letter-image-getter.ts:36-51`.
- **Claim vs reality:** SW caches fonts, `/_app/immutable`, 3D models "for offline"; the shipped spec lists "Prop SVGs render offline on first sequence view (no blank pictographs)" as a success criterion. Reality: every prop/arrow/grid/letter/number/glyph fetch goes to `/images/*`, which no SW branch matches → network-only; the loaders' only cache is a volatile in-memory `Map` that dies on reload.
- **User impact:** On a fresh offline session (the exact festival/plane scenario), the shell boots but every pictograph is blank/broken once the HTTP cache evicts the SVGs — the core visual the whole app exists to show. (Native Capacitor exempt: `static/images` is in the app bundle.)

### HIGH

**2. "Download for offline" writes thumbnails under a key the gallery never reads — and the dead blobs can evict the cache that works.**
- **Files:** WRITE `offline-cache-orchestrator.ts:103` (`const url = sequence.thumbnails[0]`), `:113` (`set(url, blob)`); READ `thumbnail-render-orchestrator.ts:234` (`localCache.get(key.hash)`); key derivation `thumbnail-key-deriver.ts:309-318` (djb2 base36, never a URL); one store, 100MB cap, LRU-on-every-set `thumbnail-local-cache.ts:22-26,128`.
- **Claim vs reality:** Hint says "Downloads all gallery sequences and thumbnails so the browse gallery works without internet." Reality: the browse renderer reads by content hash; a URL string can never equal a base36 hash, so the blobs are never consulted. They share the same 100MB store as the real cache and prune oldest-first, so a download run writes fresh-timestamped dead weight that survives while genuine older entries get evicted.
- **User impact:** Accomplishes nothing visible, wastes bandwidth + up to 100MB IndexedDB, and can *reduce* offline thumbnail availability. One-line fix: write by `deriveKey(renderInput).hash`.

**3. Shipped offline-first spec promised Workbox prop-SVG precaching that does not exist.**
- **Files:** `docs/superpowers/specs/shipped/2026-03-17-offline-first-architecture-design.md:201-214,363-368`; `docs/OFFLINE-FIRST-ARCHITECTURE.md:15-18` ("Workbox … precaching ✅"); reality `static/sw.js:2-3` ("No Workbox. No precache manifest."); no VitePWA/Workbox in `vite.config.ts`.
- **Impact:** A capability marked **shipped** (offline pictograph rendering via a 48-SVG precache) was never implemented. Root documentation defect behind finding #1.

**4. `/sequence/[id]` returns 503 cold-offline — even for self-contained inline links engineered to need zero network.**
- **Files:** `static/sw.js:82-85` (`/sequence/` → `networkFirst`, before the navigate fallback at `:91-107`); `isPublicRoute` excludes it (`:93-97`); `networkFirst` 503 on miss (`:140-143`); unreached local decode `sequence/[id]/+page.svelte:296-319,347-360`.
- **Impact:** A shared/inline sequence link opened cold offline shows the browser 503, not the viewer — the local decoder never runs. Only re-visits of an already-cached `/sequence/ID` work.

**5. "Offline ready" badge fires on metadata sync alone, with zero downloaded images.**
- **Files:** `offline-cache-orchestrator.ts:52` (`isOfflineReady: galleryStats.count > 0`), `:51` (`propSvgsCached: true` hardcoded); metadata auto-written by `public-sequences-loader.ts:86-90,114-116` on any online fetch; badge + disabled button `StorageSection.svelte:75-79,111,117-121`.
- **Impact:** User boards a plane trusting "Offline ready," then sees word-glyph placeholders for everything not already viewed. Badge can read ready with `thumbnailsCached === 0`, and the readiness gate then disables the one button supposed to fix it.

**6. Cold first-install-then-offline white-screens: only `/app` is precached; entry JS chunks aren't.**
- **Files:** `static/sw.js:8,10-15` (install precaches only `/app`), `:76-79` (immutable via `cacheFirst`), `:112-121` (`cacheFirst` has no offline fallback — a miss rethrows the network error).
- **Impact:** Install → offline → reload with a cold/evicted HTTP cache: shell loads, scripts fail, app white-screens until a second *online* visit warms the immutable cache under SW control.

### MEDIUM

**7. `/q/[code]` QR scan is dead offline for any never-resolved code — the festival "scan-to-play" use case.**
- **Files:** `static/sw.js:82-85,140-143`; `short-code-manager.ts:492-524` (only `isInlineEncoded` is offline-capable; `resolveFromFirestore` getDoc `:531`, R2 fetch `:570` all need network); error UI `q/[code]/+page.svelte:471-474`.
- **Note:** This is the intended consequence of the deliberate `s~` dense-QR removal (working-as-designed for a cloud-backed PWA, not a regression) — but the SW comment and error copy ("the code may be broken, or the sequence was deleted") misattribute a pure connectivity failure. **Fix is docs + a `navigator.onLine` branch in the error UI**, not a precache.

**8. No `navigator.storage.persist()` / `estimate()` / eviction handling anywhere — all offline storage is best-effort/evictable.**
- **Files:** grep `navigator.storage` across `src`+`static` = zero matches; unbounded SW caches `static/sw.js:112-130` (no prune on `cacheFirst`/`cacheFirstDedicated`); only size cap anywhere is the 100MB Dexie thumbnail prune.
- **Impact:** Under storage pressure the browser can silently wipe Cache Storage + IDB. Recoverable (sequences live in Firestore; self-heals on one online visit), but the next offline launch 503s with no warning. (Mitigated: installed home-screen PWAs largely escape WebKit's 7-day eviction.)

**9. Browse gallery throws offline unless it was opened online at least once.**
- **Files:** `public-sequences-loader.ts:82-112` (`fetchWithOfflineFallback` throws "No network connection and no cached gallery data available" at `:111`); cache written only in the online branch.
- **Impact:** A first-ever offline visit hard-errors instead of showing an empty-but-functional gallery. Narrow window — any prior online app-mode boot seeds it.

**10. "Thumbnails cached: N (X MB)" counts a mixed store; the number doesn't mean "usable offline."**
- **Files:** `StorageSection.svelte:95-103`; `offline-cache-orchestrator.ts:42-50`; store mixes hash-keyed render entries (usable) with URL-keyed download entries (never read). The stat measures disk usage, presented as offline coverage.

**11. Gallery's Tier-4 local re-render needs `/images` SVGs; `propSvgsCached:true` is hardcoded.**
- **Files:** `offline-cache-orchestrator.ts:51`; local render fallback `thumbnail-render-orchestrator.ts:283-327`; offline placeholder `PropAwareThumbnail.svelte:535-561` (renders "!" + `TKAWordGlyph`). The "works without internet" implication fails because the local-render fallback must fetch the same network-only prop SVGs.

**12. Download button is permanently disabled and labelled "Already downloaded" once metadata syncs.**
- **Files:** `StorageSection.svelte:111,117-121`; `offline-cache-orchestrator.ts:52`; auto-sync `public-sequences-loader.ts:86-90`; background prefetch auto-runs on browse open `BrowseModule.svelte:331`. The user finds the button already disabled on their first Settings visit, having downloaded nothing, with no manual retry.

### LOW / INFO

**13. (LOW) 3D viewer / scenes fail offline for any GLB/KTX2 not loaded online first.** `static/sw.js:51-58` only stores after a successful fetch; scenes fetch on demand; Three.js is a lazy 3.8MB chunk. R2-hosted assets are cross-origin and never SW-cached. 2D animation still works → degrade, not crash.

**14. (LOW) DOM pictograph grid hard-errors offline with no fallback**, unlike the animation-canvas grid which has `svg-generator.ts:116-167 getFallbackGridSvg`. `GridSvg.svelte:94,98-103` sets `hasError` and renders nothing. Moot until #1 is fixed.

**15. (LOW) Hint claims the button downloads gallery *sequences*; it only fetches thumbnails.** `StorageSection.svelte:130` vs `offline-cache-orchestrator.ts:32-35`. Wrong mental model, no functional harm.

**16. (LOW) Lazily-loaded feature chunks break offline if never opened online.** `static/sw.js:76-79` caches `/_app/immutable` only on first visit; the `vite:preloadError` one-shot reload (`hooks.client.ts:148-156`) itself needs the network.

**17. (LOW) Capacitor native bundle ships a stale `tka-v1` SW.** `android/app/src/main/assets/public/sw.js`. But that path is a non-git-tracked build artifact (`webDir:'build'`); a real `npm run build` + `cap sync` regenerates it from `tka-v2`. Stale working-tree artifact, not a shipped divergence.

**18. (LOW) Bumping `CACHE_NAME` wipes the prior app-shell cache on activate.** `static/sw.js:17-28`. Transient; the bump is only received online (which re-warms the page); `scripts/release.js`'s intended per-deploy bump is a no-op (targets a non-existent constant), so `CACHE_NAME` rarely changes.

**19. (INFO) Playfair Display from Google Fonts CDN → system serif offline.** `app.html:705-710`; SW skips cross-origin (`sw.js:42-47`). Cosmetic; Font Awesome is self-hosted and fine.

**20. (INFO) R2-thumbnail-SWR-miss hypothesis refuted.** `static/sw.js:43` SWRs `firebasestorage.googleapis.com`, which is where thumbnails actually live (`cloud-thumbnail-cache.ts:244`); R2 hosts only 3D models + a JSON snapshot. The SWR rule targets the correct host.

> **Refuted (1/30):** an over-broad framing — "the Download button flips 'Offline ready' to true." Adversarial check showed the badge is driven by `galleryCache.count` from **browsing** (`gallery-offline-cache.ts:44`), not by the download button. The precise version of the issue survives as finding **#5**.

---

## The four-cache incoherence

The offline story is fractured across **four disjoint storage layers that don't know about each other**:

1. **SW Cache Storage** — `/app` shell, `/_app/immutable`, `/fonts`, `/models`+`/draco`, firebasestorage thumbnails (SWR). **Does not cache `/images/*`** — the render-critical SVGs. (`static/sw.js`)
2. **Dexie `ThumbnailLocalCache`** — one 100MB store holding **two disjoint keyspaces**: render thumbnails keyed by `deriveKey().hash` (the renderer reads these) and download blobs keyed by raw **URL** (never read). (`offline-cache-orchestrator.ts:113` vs `thumbnail-render-orchestrator.ts:234`)
3. **Firestore `persistentLocalCache`** — sequence data. Solid and independent. (`firebase.ts:362`)
4. **In-memory `Map`s in the SVG loaders** — props/arrows/grid/glyphs. **Die on every reload.**

In one sentence: **"Download for offline" writes into layer 2 under a key the renderer can't read, can evict the renderer's *real* layer-2 entries under the shared 100MB LRU, and reports success via a layer-3 metadata count — while the assets that actually decide whether a pictograph draws (`/images/*` SVGs) live in *none* of the durable layers.** The button, the badge, and the stat each describe a different cache, and none describes the cache that matters.

---

## Remediation roadmap (leverage-ranked)

| # | Fix | File(s) | Effort | Unlocks |
|---|---|---|---|---|
| 1 | **Add a `/images/` branch to the SW + precache the finite essential SVG set on install** — `props/pictograph/*.svg`, `grid/*`, arrow split set + `arrow-split-manifest.json`, `letters_trimmed/*`, `numbers/*`, `vtg_glyphs/*`. Highest leverage. | `static/sw.js` (new branch + build-generated precache manifest) | **M** | Cold-offline pictograph/glyph/grid rendering everywhere. Resolves the BLOCKER + the spec's "no blank pictographs". |
| 2 | **Fix the Download keyspace bug** — write by `deriveKey(renderInput).hash`, not raw URL. | `offline-cache-orchestrator.ts:103-113` | **S** | "Download for offline" actually populates the render cache; stops dead-weight writes + LRU eviction of the real cache. |
| 3 | **Make readiness honest** — gate `isOfflineReady` on real image coverage, drop hardcoded `propSvgsCached:true`, stop disabling the button on metadata-only sync. | `offline-cache-orchestrator.ts:49-52`, `StorageSection.svelte:75-79,111,117-121` | **S** | Truthful badge + stat; removes the disabled-button trap; manual retry. |
| 4 | **Route `/sequence` and `/q` through the cached SPA shell on a network miss**; branch the resolution error UI on `navigator.onLine`. | `static/sw.js:82-107`, `q/[code]/+page.svelte:471-474`, `sequence/[id]/+page.svelte` | **S–M** | Cold-offline open of inline-encoded links + cached codes; offline scans say "you're offline," not "this code is broken." |
| 5 | **Request durable storage + monitor quota** — `navigator.storage.persist()` on init, surface `estimate()`/eviction state in the Offline panel. | `hooks.client.ts` (init), `StorageSection.svelte` | **S** | Caches survive storage pressure; real eviction signal instead of a stale "ready." |
| 6 | **Precache entry JS/CSS chunks on SW install** (read built `/_app` manifest, `addAll`). | `static/sw.js` install + build step | **M** | App boots offline immediately after first install — closes the cold-install white-screen. |
| 7 | **Reuse the inline grid fallback on the DOM path** — call `getFallbackGridSvg` in `GridSvg` on fetch failure. | `GridSvg.svelte:94-103` ← `svg-generator.ts:116-167` | **S** | Grid reference frame always draws (partial; superseded by #1). |
| 8 | **Self-host Playfair Display** under `/fonts` so the existing `cacheFirst` rule covers it. | `app.html:705-710` | **S** | Correct heading typography offline. |
| 9 | **Update the offline docs to match the shipped SW** — remove the false Workbox claim, mark prop-SVG precache as not-yet-shipped. | `docs/OFFLINE-FIRST-ARCHITECTURE.md:15-18`, the 2026-03-17 spec | **S** | Accurate mental model; stops the next agent trusting a nonexistent precache. |
| 10 | **Verify the Capacitor pipeline ships `tka-v2`** — confirm `build` → `cap sync` regenerates `build/sw.js` from source. | build/release pipeline | **S** | Native/web SW parity (low priority — build artifact). |

**Genuinely solid, do not re-litigate:** the SW shell + immutable + font + 3D design (`static/sw.js`), Firestore `persistentLocalCache` (`firebase.ts:362`), local-first auth/settings. Items **#1 and #2 together** convert "offline-capable for navigation and data" into "offline-capable for the thing the app is for."
