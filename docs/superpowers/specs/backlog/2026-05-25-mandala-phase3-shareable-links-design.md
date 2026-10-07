---
status: backlog
value: 2
effort: M
remaining: Verify guest/Scribe access policy, then implement and test mandala shareable-link creation and loading if still absent.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# Shareable Mandala Links — Phase 3 Design Spec

**Date:** 2026-05-25
**Phase:** 3 of the mandala roadmap (Phase 1 = viewer pane complete; Phase 2 = Firebase persistence)
**Status:** Design spec, not yet implemented
**Audit:** `docs/superpowers/specs/audits/phase3-web-research-audit.md` — APPROVE WITH REQUIRED CHANGES applied in this revision.

---

## Overview

Phase 1 shipped the mandala viewer pane in the sequence viewer. Users can customize 10 parameters — color mode, palette preset, custom colors, speed, rotation, depth, path shape, line weight, and playback paused state — and watch their sequence breathe as a mandala. Phase 2 persists those mandalas to Firebase per-user (`users/{uid}/mandala-collection`).

Phase 3 makes the mandala shareable. Anyone with the link opens the same breathing mandala with the same settings, no login required. The mechanism reuses the existing tka.run short code infrastructure (`shortcodes` Firestore collection, `ShortCodeManager`, `/q/[code]` landing page) rather than inventing a parallel system.

---

## Design Decisions

### 1. Firestore Schema — Mandala Short Code Record

The existing `shortcodes` collection stores sequence-only records. Mandala records need to coexist in the same collection, since the resolution route is the same `/q/[code]` entry point. The discriminator is a `type` field on the document.

**Existing sequence record shape (inferred from `ShortCodeManager`):**
```ts
{
  sequence: string,         // encoded word / fallback ID
  sequenceId?: string,
  ownerId?: string,
  encoderHash?: string,
  encoded?: string,         // "s~..." inline blob
  sequenceData?: object,    // embedded steps for deckless sequences
  createdAt: string,
  createdBy: string,
  scanCount: number,
  // ...analytics fields
}
```

**New mandala record shape:**
```ts
{
  type: "mandala",           // discriminator — absent on legacy sequence records
  sequenceId?: string,       // Firestore sequence ID if owned + saved
  ownerId?: string,          // sequence owner UID (if private sequence)
  encoded?: string,          // "s~..." inline blob — full sequence steps, no Firebase dependency
  sequenceData?: object,     // embedded steps fallback (for unsaved/guest sequences)
  mandala: {                 // all Phase 1 viewer settings
    colorMode: "solid" | "flow",
    preset: "aurora" | "neon" | "ember" | "twilight" | "ice" | "solar" | "custom",
    customBlue?: string,     // hex only when preset === "custom"; validated: /^#[0-9a-fA-F]{6}$/
    customRed?: string,      // hex only when preset === "custom"; validated: /^#[0-9a-fA-F]{6}$/
    speed: number,           // valid values: 0.5 | 1 | 1.5 | 2 | 3 (enforced at read/write, not as TS union)
    rotation: number,        // 0-360, 15-degree increments (slider step)
    depth: number,           // 0-100
    pathShape: "arc" | "linear" | "concave" | "motion-aware",
    lineWeight: number,      // valid values: 1 | 2.5 | 4
    paused: boolean,
  },
  createdAt: string,         // ISO 8601
  createdBy: string,         // uid or "system"
  scanCount: number,
  // analytics fields same as sequence records
}
```

The `encoded` blob carries the full sequence steps (same as the sequence short code path). This makes the mandala link self-contained: the resolver can hydrate the sequence without any secondary Firestore lookup, surviving Firebase outages and private-sequence access issues.

The `mandala` sub-object is never present on legacy records, so a simple `data.type === "mandala"` check (or equivalently `!!data.mandala`) is an unambiguous discriminator.

**Type field note:** `speed` and `lineWeight` are stored as `number` (not literal union types). The valid discrete values are enforced at write time (Firestore rules range check) and at read time (the `MandalaLandingPane` falls back to a safe default if an out-of-range value is encountered). Using a union in the TypeScript interface is misleading because it cannot be enforced at runtime; `number` with documented valid values is correct.

**Dedup strategy:** Mandala records are not content-addressed the way sequence records are. Two shares of the same sequence with different viewer settings produce different short codes. This is correct — the settings are part of the identity. No `encoderHash`-based dedup for mandala records.

### 2. Firestore Security Rules — Mandala Record Validation

The current `shortcodes/{code}` create rule (`firestore.rules` lines 885-897) validates that `encoded` or `sequenceData.steps` is present. It must be extended to validate mandala records.

**Additional validation needed in the `allow create` rule:**

```
// If type is present, it must be "mandala" (no arbitrary type injection)
&& (
  !request.resource.data.keys().hasAny(['type'])
  || request.resource.data.type == "mandala"
)
// If type is "mandala", the mandala sub-object must be present and valid
&& (
  request.resource.data.get('type', null) != "mandala"
  || (
    request.resource.data.keys().hasAny(['mandala'])
    && request.resource.data.mandala.keys().hasOnly([
        'colorMode', 'preset', 'customBlue', 'customRed',
        'speed', 'rotation', 'depth', 'pathShape', 'lineWeight', 'paused'
      ])
    && request.resource.data.mandala.colorMode in ['solid', 'flow']
    && request.resource.data.mandala.preset in [
        'aurora', 'neon', 'ember', 'twilight', 'ice', 'solar', 'custom'
      ]
    && request.resource.data.mandala.speed in [0.5, 1, 1.5, 2, 3]
    && request.resource.data.mandala.rotation >= 0
    && request.resource.data.mandala.rotation <= 360
    && request.resource.data.mandala.depth >= 0
    && request.resource.data.mandala.depth <= 100
    && request.resource.data.mandala.pathShape in [
        'arc', 'linear', 'concave', 'motion-aware'
      ]
    && request.resource.data.mandala.lineWeight in [1, 2.5, 4]
    && request.resource.data.mandala.paused is bool
    // Hex color validation: only present when preset == "custom"; bounded to 7 chars
    && (
      !request.resource.data.mandala.keys().hasAny(['customBlue'])
      || (
        request.resource.data.mandala.customBlue is string
        && request.resource.data.mandala.customBlue.size() == 7
        && request.resource.data.mandala.customBlue.matches('#[0-9a-fA-F]{6}')
      )
    )
    && (
      !request.resource.data.mandala.keys().hasAny(['customRed'])
      || (
        request.resource.data.mandala.customRed is string
        && request.resource.data.mandala.customRed.size() == 7
        && request.resource.data.mandala.customRed.matches('#[0-9a-fA-F]{6}')
      )
    )
  )
)
```

**Hex color sanitization at read time:** Even with Firestore rules, the client must sanitize `customBlue` and `customRed` before passing to CSS (`style:background` or `--css-var`). Before applying, validate against `/^#[0-9a-fA-F]{6}$/` and fall back to a safe default (e.g. the preset's default blue/red) if the pattern doesn't match. This is a defense-in-depth measure against rules that could be bypassed via admin SDK or future rule gaps.

### 3. Receiving End — Detection and Hydration

The `/q/[code]/+page.svelte` and its server load function handle resolution. Detection happens in two places:

**Server side (`+page.server.ts`):**

The current server load (`src/routes/q/[code]/+page.server.ts`) reads the Firestore doc for OG meta tags but only extracts `word`/`sequenceName`, `ownerDisplayName`, `thumbnailUrl`, `deckId`, and `deckName`. It does **not** currently read `type` or `mandala`. Both the return type and the `Props` interface in `+page.svelte` must be extended.

**`+page.server.ts` changes required:**

1. Read `data?.type` and `data?.mandala` from the Firestore doc.
2. Return `isMandala` and `mandalaSettings` in the load return object.
3. For mandala records, populate OG meta with a mandala-specific title/description and the static preset thumbnail URL.

```ts
// +page.server.ts — additions to the existing load function
if (data?.type === "mandala") {
  const preset = data.mandala?.preset ?? "aurora";
  return {
    geo,
    meta: {
      word: data.word || data.sequenceName || null,
      creator: data.ownerDisplayName || null,
      thumbnailUrl: `/images/mandala-previews/${preset}.png`,
      deckId: null,
      deckName: null,
    },
    isMandala: true,
    mandalaSettings: data.mandala ?? null,
    ogTitle: `${data.word || "Sequence"} Mandala — TKA`,
    ogDescription: `A breathing mandala generated from the ${data.word || "sequence"} sequence. Open in TKA to explore.`,
  };
}
// existing return for sequence records stays unchanged
return { geo, meta };
```

**`+page.svelte` Props interface changes required:**

The current `Props` interface (lines 45-56) must be extended to accept the new server-returned fields:

```ts
interface Props {
  data: {
    geo: { country: string | null; city: string | null };
    meta: {
      word: string | null;
      creator: string | null;
      thumbnailUrl: string | null;
      deckId: string | null;
      deckName: string | null;
    };
    // New for mandala records:
    isMandala?: boolean;
    mandalaSettings?: MandalaViewerSettings | null;
    ogTitle?: string;
    ogDescription?: string;
  };
}
```

The `<svelte:head>` block (lines 331-347) also needs a conditional branch: when `data.isMandala` is true, use `data.ogTitle` and `data.ogDescription` instead of the sequence-default copy.

**Client side (`+page.svelte`):**

After the server signals `isMandala: true`, the client-side resolution path diverges. The key constraint is: **do not change `resolveShortCode`'s return type** — it has 4+ callers that expect `SequenceData | null`.

Instead, add a new method on `ShortCodeManager`:

```ts
/**
 * Resolves a short code and returns the raw Firestore record alongside
 * the hydrated SequenceData. Used by the /q/[code] landing page to detect
 * mandala records without breaking the existing resolveShortCode contract.
 *
 * All existing callers of resolveShortCode are unaffected.
 */
async resolveShortCodeFull(code: string): Promise<ShortCodeResolution>
```

Where `ShortCodeResolution` is:
```ts
type ShortCodeResolution =
  | { kind: "sequence"; data: SequenceData }
  | { kind: "mandala"; data: SequenceData; settings: MandalaViewerSettings }
  | { kind: "not-found" }
  | { kind: "error"; message: string };
```

The `/q/[code]/+page.svelte` `onMount` calls `resolveShortCodeFull` (not `resolveShortCode`) and switches on `resolution.kind`:
- `"sequence"` → existing `AnimationPlayer` flow, unchanged
- `"mandala"` → mounts `MandalaLandingPane` with `resolution.settings` pre-applied, skips `AnimationPlayer`
- `"not-found"` → existing error state ("Sequence not found")
- `"error"` → error state with message

`resolveShortCodeFull` implementation shares the Firebase/snapshot fetch logic with `resolveShortCode` (extract a shared `resolveRawRecord(code): Promise<ShortCodeData | null>` helper to avoid duplication) and adds the discriminator check after hydration.

**MandalaViewerSettings type (new shared type):**
```ts
export interface MandalaViewerSettings {
  colorMode: MandalaColorMode;
  preset: MandalaPresetId;
  customBlue?: string;
  customRed?: string;
  speed: number;
  rotation: number;
  depth: number;
  pathShape: MandalaPathShape;
  lineWeight: number;
  paused: boolean;
}
```

This type lives in `src/lib/shared/sequence-viewer/domain/mandala-short-code-types.ts` (new file, see implementation plan). `MandalaColorMode`, `MandalaPresetId`, and `MandalaPathShape` are re-exported from or co-located with the existing types in `MandalaViewerControls.svelte`.

### 4. Share UI — Button, Web Share API, and Clipboard Fallback

The share button lives in `MandalaViewerControls.svelte`, alongside the existing Download button. It sits at the bottom of the controls rail, above or next to Download.

**Button states:**
1. Default: "Share" with a link icon
2. Loading: spinner while the Firestore write is in flight (background only — see flow below)
3. Success: "Copied!" (desktop) or system share sheet dismissed (mobile), auto-resets after 2 seconds. Also shows "Show QR" button — see section 11b.
4. Error: "Failed" with a retry affordance

**Interaction flow — progressive enhancement (Web Share API first):**

The codebase already uses the Web Share API + clipboard fallback pattern in multiple locations:
- `SequenceViewerOrchestrator.svelte` line 854 — URL sharing via `navigator.share`
- `ChoreoCardExport.svelte` line 147 — file sharing with clipboard fallback
- `VideoRecordPanel.svelte` line 204 — video file sharing

**⚠️ Transient-activation hazard:** `navigator.share` requires a transient user activation — it must be called in direct response to the user gesture, not after an async chain. The naive implementation (create Firestore short code → then call `navigator.share`) risks losing the activation window on slow connections. The fix is to generate the short code string synchronously before any async work, call `navigator.share` immediately, then write to Firestore in the background.

The `ShortCodeManager` transaction loop already generates the code string before the Firestore write. Extract `generateShortCode(): string` as a pure synchronous helper (deterministic base36 from `crypto.getRandomValues`) so the URL is available before any awaits.

**Corrected implementation:**

```ts
function handleShareClick(word: string) {
  // 1. Generate the short code synchronously — no async, gesture window stays open
  const code = ShortCodeManager.generateShortCode(); // pure sync, no I/O
  const url = `https://tka.run/${code}`;

  // 2. Fire navigator.share immediately (still within the gesture activation window)
  const sharePromise = (typeof navigator !== "undefined" && navigator.share)
    ? navigator.share({
        title: `${word} Mandala — TKA`,
        text: `A breathing mandala from the ${word} sequence`,
        url,
      }).catch((e) => {
        if (e instanceof Error && e.name === "AbortError") return; // user cancelled
        // Fall through to clipboard below
        return navigator.clipboard.writeText(url);
      })
    : navigator.clipboard.writeText(url);

  // 3. Write to Firestore in the background — share already fired
  createMandalaShortCodeWithCode(code, sequence, settings)
    .catch((err) => {
      // The code was already shared. Log the error and show a toast;
      // the URL resolves correctly once the document lands on retry.
      console.error("Mandala short code write failed:", err);
      showErrorToast("Share link created but save failed — try sharing again if the link doesn't open.");
    });

  return sharePromise;
}
```

`createMandalaShortCodeWithCode(code, sequence, settings)` is a variant of `createMandalaShortCode` that accepts a pre-generated code rather than generating one internally. The Firestore transaction write uses that code as the document ID and skips the collision-detection loop (the code was already generated randomly; the write simply fails if the code was already taken, which is statistically negligible for 6-char base36).

This is NOT a `Sharer.ts` call — `Sharer.ts` is image-oriented (renders a preview, wraps it in a File). URL sharing is a direct `navigator.share` call, consistent with the `SequenceViewerOrchestrator` pattern at line 854.

**`MandalaPane` owns the short code creation logic** because it has access to the current `sequence` and all viewer settings. The entitlement check also lives in `MandalaPane` — see section 6 for the architecture decision.

**New `ShortCodeManager` methods:**
```ts
// Pure synchronous — generates a random base36 code without any I/O.
// Used to obtain the URL before calling navigator.share.
static generateShortCode(): string;

// Accepts a pre-generated code. Used by the share flow after generateShortCode().
async createMandalaShortCodeWithCode(
  code: string,
  sequence: SequenceData,
  settings: MandalaViewerSettings
): Promise<CreateShortCodeResult>;

// Convenience wrapper: generates code internally. Used by non-share creation paths.
async createMandalaShortCode(
  sequence: SequenceData,
  settings: MandalaViewerSettings
): Promise<CreateShortCodeResult>;
```

Both creation methods build the mandala record shape described in section 1, encode the sequence steps into the `encoded` blob (same `encodeSequenceForQR` call), and write to Firestore. No `encoderHash` dedup — mandala codes are settings-specific.

### 5. Error States for Failed Mandala Link Resolution

The `MandalaLandingPane.svelte` (new component, see implementation plan) must handle all error conditions explicitly. The existing `/q/[code]/+page.svelte` handles sequence-not-found (line 284-286) but the mandala landing path adds new failure modes:

| Failure mode | Cause | UI |
|---|---|---|
| Short code document deleted | Admin cleanup, abuse removal | "This mandala link is no longer available. [Browse sequences →]" |
| `encoded` blob corrupted / decode failure | Data corruption, encoder version mismatch | "This mandala could not be loaded. [Browse sequences →]" |
| `mandala` sub-object missing (snapshot served legacy record) | Snapshot captured before Cloud Function update | Falls back to sequence view via `resolveShortCode` |
| Hex color validation failure | Malformed colors in record | Falls back to preset default colors, renders without error |
| `settings` field out of range | Invalid speed/lineWeight/rotation | Clamps to nearest valid value, renders without error |

All hard-error states show a clear message with a link to `/browse` — never a blank page.

**Acceptance criterion addition:** When a mandala short code cannot be resolved (deleted, corrupted, or decode failure), the landing page shows a clear error state with a link to browse. Not a blank page.

### 6. Sequence Visibility — Public vs. Private

When a user shares a mandala link, recipients will not necessarily have access to the underlying sequence in Firestore. The link must be self-contained.

**Strategy:** Always embed the `encoded` blob (the `"s~..."` inline-encoded full sequence) in the mandala short code record. The resolver uses Strategy 0 (decode from embedded blob) which requires no secondary Firestore lookups and no authentication. This is the same path the existing system uses for deck sequences without owners (`shouldEmbed = !sequence.ownerId`).

For mandala records: `shouldEmbed = true`, always. The sequence is embedded regardless of whether `sequence.ownerId` is set. The Firestore resolver then never needs `users/{uid}/sequences/{id}` access.

**Implication for private sequences:** A user with a private sequence can generate a mandala link, and anyone with the link can see the mandala view. This is intentional — the mandala is a visual artifact of the sequence, not the sequence itself. Recipients see the breathing visualization; they do not get the step-by-step notation or the ability to fork the sequence unless they have separate access.

### 7. Guest vs. Scribe Access Gate

The mandala pane is visible to all authenticated users (Free tier). The share button is a Scribe-tier feature, consistent with the "play with everything, pay to take it home" premium philosophy.

**Gate placement:** The entitlement check lives in `MandalaPane.svelte`. This is the correct location because:
- `MandalaPane` is the component that calls `MandalaShortCodeCreator` — keeping the check co-located avoids a scenario where a rogue parent bypasses the gate
- `MandalaPane` already has access to auth state via the existing pattern in the viewer (no new dependency injection needed)
- `MandalaViewerControls` stays presentation-only — it receives an `onShare?: () => void` callback and an `canShare: boolean` prop from `MandalaPane`; it renders the upsell affordance when `canShare` is false

**Flow:**
1. `MandalaViewerControls` emits `onShare()` when the Share button is tapped.
2. `MandalaPane` receives the callback, checks the subscription tier.
3. If Scribe: calls `MandalaShortCodeCreator`, then `handleShare(url, word)`.
4. If not Scribe: emits `onShareBlocked`, which the viewer handles by showing the upgrade drawer.

`MandalaPane` does NOT need a `canShare: boolean` prop from its parent — it self-contains the tier check. `MandalaViewerControls` receives `canShare: boolean` from `MandalaPane` as a derived value so it can render the lock icon / upsell hint without importing auth state itself.

**Opening a mandala link** (the `/q/[code]` landing) requires no authentication, consistent with all other short code landing pages.

### 8. Snapshot Cloud Function Update — In Scope for Phase 3

The `snapshotShortCodes` Cloud Function (`firebase-functions/src/snapshotShortCodes.ts`) currently emits only `{ _id, encoded }` — it strips all other fields (lines 49-54). This means:
- Mandala codes served from the static snapshot would lack `type` and `mandala` fields
- `resolveShortCodeFull` would classify them as `"sequence"` instead of `"mandala"`
- Anyone accessing a mandala link during a Firestore outage would see a plain sequence, not a mandala

**The fix is 5 lines.** Update `SkinnyRecord` and `buildSkinnySnapshot()` to also emit `type` and `mandala` when present:

```ts
interface SkinnyRecord {
  _id: string;
  encoded: string;
  type?: string;           // Add: preserves mandala discriminator
  mandala?: unknown;       // Add: preserves viewer settings for offline mandala resolution
}

// In buildSkinnySnapshot(), change the push to:
records.push({
  _id: doc.id,
  encoded: data.encoded,
  ...(data.type ? { type: data.type } : {}),
  ...(data.mandala ? { mandala: data.mandala } : {}),
});
```

This is in scope for Phase 3. Deferring it creates a known regression where mandala links silently degrade during outages with no indication of the correct behavior.

### 9. Expiration Policy

No expiration. Short codes in this system are permanent by design — QR codes printed on physical cards would break if codes expired. Mandala short codes follow the same policy.

### 10. Open Graph Meta Tags

The `/q/[code]/+page.server.ts` server load enriches OG tags from the Firestore doc. Mandala records use mandala-specific tags (see section 3 for the server-side changes).

**OG title:** `"{sequenceWord} Mandala — TKA"` (e.g., "BOOK Mandala — TKA")
**OG description:** `"A breathing mandala generated from the {word} sequence. Open in TKA to explore."`
**OG image:** A static per-preset mandala thumbnail, not a per-link generated image.

**Static thumbnail strategy (base layer):** Generate one 1200×600 PNG per preset (6 presets + 1 generic fallback for "custom") showing a representative mandala at that color scheme. Store at `/images/mandala-previews/{preset}.png`. The server load maps `settings.preset` to the matching thumbnail URL.

**Dimensions: 1200×600 (2:1 ratio).** The older 1200×630 (1.91:1) Facebook spec causes 30px letterboxing on X/Discord/LinkedIn/Slack, which have standardized on 2:1 as of 2026. All 7 static thumbnails must be generated at 1200×600.

Use content-hashed filenames (`aurora-v1.png`, bumped on regeneration) to avoid stale social-preview cache. Social media platforms cache OG images aggressively; an unhashed filename means old images persist in caches after updates.

Ensure `<meta name="twitter:card" content="summary_large_image">` is included in the `<svelte:head>` block — without it, X defaults to `summary` (small square thumbnail) even when a valid OG image is present.

**Dynamic OG image generation (per-link, Phase 3 scope — see section 11):** Static thumbnails are the fallback for presets; per-link dynamic images are generated for each shared mandala. See section 11 for the implementation approach using `@ethercorps/sveltekit-og` v4.

### 11. Dynamic OG Image Generation (Phase 3 Scope)

Static per-preset thumbnails (section 10) cover the fallback case. Per-link dynamic OG images are pulled into Phase 3 scope because they directly multiply viral sharing: every shared link shows the actual sequence word and color palette in the Discord/X unfurl, rather than cycling through 7 generic preset images across all users.

**Implementation: `@ethercorps/sveltekit-og` v4**

`@ethercorps/sveltekit-og` v4 (mid-2025) is a SvelteKit-native library that renders HTML/CSS to SVG via Satori, rasterizes to PNG via resvg-wasm, and returns a `Response` with `Content-Type: image/png`. No headless browser, no external service, no cold-start latency beyond WASM init.

**Route:** `src/routes/og/mandala/+server.ts`

The `og:image` meta tag on the landing page points to `/og/mandala?word=BOOK&preset=aurora` (or with the full short code: `/og/mandala?code=ABC123`). The server reads `word` and `preset` from query params and renders a mandala-themed card.

**What the OG card shows:**
- Sequence word prominently (e.g., "BOOK") — the most differentiating element
- Preset color palette as a swatch or gradient background
- TKA branding (wordmark + "mandala" label)
- Optionally: a static mandala SVG frame at the palette colors (pre-rendered at build time per preset, embedded as an SVG data URI in the Satori template)

**Server route skeleton:**

```ts
// src/routes/og/mandala/+server.ts
import { ImageResponse } from "@ethercorps/sveltekit-og";
import type { RequestHandler } from "./$types";

const html = String.raw; // for JSX-free template literals

export const GET: RequestHandler = async ({ url }) => {
  const word = url.searchParams.get("word") ?? "Mandala";
  const preset = url.searchParams.get("preset") ?? "aurora";
  const palette = PRESET_PALETTES[preset] ?? PRESET_PALETTES.aurora;

  return new ImageResponse(
    html`<div style="display:flex;width:1200px;height:600px;background:${palette.bg};
                     align-items:center;justify-content:center;flex-direction:column;
                     font-family:sans-serif;">
      <div style="font-size:96px;font-weight:700;color:${palette.text};letter-spacing:-2px">
        ${word}
      </div>
      <div style="font-size:32px;color:${palette.muted};margin-top:16px">Mandala · TKA</div>
    </div>`,
    { width: 1200, height: 600 }
  );
};
```

`PRESET_PALETTES` is a plain object mapping preset IDs to background + text + muted colors, co-located in the route file. No imported Svelte components needed for the OG template — Satori consumes HTML strings.

**Integration with `+page.server.ts`:**

When `isMandala` is true, the OG image URL changes from the static preset thumbnail to the dynamic route:

```ts
// In the mandala branch of +page.server.ts:
const ogImageUrl = `/og/mandala?word=${encodeURIComponent(word)}&preset=${preset}`;
```

The static thumbnails in `/images/mandala-previews/` are retained as a no-JS fallback for crawlers that don't follow the dynamic route (rare but possible). The `og:image` tag points to the dynamic route; add a `<meta property="og:image:width" content="1200">` and `<meta property="og:image:height" content="600">` so crawlers don't need to fetch the image to know dimensions.

**Estimated effort:** ~1 day (library install + route + palette config + integration).

**Caching note:** The dynamic OG route should set `Cache-Control: public, max-age=86400` — once generated, the image doesn't change for a given word+preset combination.

### 11a. Firebase App Check (Phase 3 Scope)

Firestore security rules validate data shape but do not rate-limit writes. A malicious authenticated Scribe user could spam the `shortcodes` collection, driving up Firestore costs. Firebase App Check closes this gap.

**App Check with reCAPTCHA v3:**

App Check verifies that requests originate from the real app (not scripts, bots, or modified clients). It integrates with Firestore security rules via `request.app.verified` — when App Check is enforced, any request from a client that fails App Check attestation is rejected before the security rule is evaluated.

**Implementation steps:**

1. Enable App Check in the Firebase console (project settings → App Check).
2. Register the web app with the reCAPTCHA v3 provider (a reCAPTCHA v3 site key is all that's needed).
3. Initialize App Check in `src/lib/firebase/client.ts`:

```ts
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(PUBLIC_RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});
```

4. Add `PUBLIC_RECAPTCHA_SITE_KEY` to `.env` and the SvelteKit public env schema.
5. Enforce App Check on the Firestore database in the Firebase console (not "monitor" mode — "enforce" mode).
6. The existing Firestore security rules are unchanged — App Check enforcement is a separate layer that the Firebase SDK handles before rules are evaluated.

**Important:** App Check tokens are automatically attached to Firestore requests by the Firebase JS SDK after `initializeAppCheck` is called. No changes to `ShortCodeManager` or other Firestore callers are required.

**Debug token for local development:** Firebase App Check provides a debug token mechanism for `localhost` — set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` in dev mode to bypass attestation. This is already a documented Firebase pattern and must be gated behind `import.meta.env.DEV`.

**Estimated effort:** ~1 day (console config + SDK init + env var plumbing + testing).

### 11b. QR Code Display in Share Success State

TKA's user base is festival-first. In-person sharing (showing your phone to someone across a fire) is a primary use case. The share success state should offer a "Show QR" button that renders the short code URL as an inline QR code.

**Placement:** After the share button transitions to the Success state ("Copied!" or share sheet dismissed), a secondary "Show QR" button appears below it. Tapping it toggles an inline QR code block between the Share button and the Download button.

**Library: `qr-code-styling`** — most popular QR library in 2026 for styled codes; Canvas/SVG output; supports centered logos and palette-matched colors; ~15KB gzipped. No jQuery. Lazy-loaded — the bundle is imported only when the user taps "Show QR."

```ts
// Lazy import — only loaded if user taps "Show QR"
async function showQR(url: string, palette: MandalaPreset) {
  const { QRCodeStyling } = await import("qr-code-styling");
  const qr = new QRCodeStyling({
    width: 200, height: 200,
    data: url,
    dotsOptions: { color: palette.primaryColor, type: "rounded" },
    backgroundOptions: { color: "transparent" },
    qrOptions: { errorCorrectionLevel: "M" },
  });
  qr.append(qrContainerEl); // Svelte action or bind:this ref
}
```

The QR encodes the full `tka.run/${code}` URL. Because short codes are uppercase base36 (per `project_short_code_domain` memory), the URL qualifies for QR alphanumeric mode — faster scanning, denser matrix, works at greater distances.

**Dismissal:** tapping "Hide QR" or tapping outside the QR area collapses the QR block. The Share button returns to its default state on the next interaction.

**Estimated effort:** < 0.5 day.

### 11c. Web Manifest `handle_links`

Add `"handle_links": "preferred"` to the PWA web manifest. This is a single-line change that tells Chromium-based browsers to open `tka.run/q/ABC123` links in the installed PWA rather than a new browser tab on Android.

**Location:** `static/manifest.json` (or equivalent).

```json
{
  "handle_links": "preferred"
}
```

This does not affect Capacitor native deep links (correctly deferred to Phase 2). It improves the experience for users who have added TKA to their home screen as a PWA — shared links open directly in the app rather than switching to Chrome.

**Estimated effort:** < 5 minutes.

---

## Implementation Plan

### New files
- `src/lib/shared/sequence-viewer/domain/mandala-short-code-types.ts` — `MandalaViewerSettings` interface, `ShortCodeResolution` union, mandala Firestore record shape type
- `src/lib/shared/qr/services/implementations/MandalaShortCodeCreator.ts` — factory getter + `createMandalaShortCode` / `createMandalaShortCodeWithCode` wrappers
- `src/routes/q/[code]/MandalaLandingPane.svelte` — landing page variant that mounts `MandalaPane` with hydrated settings; handles the "mandala" resolution branch in `+page.svelte`; includes error states for all failure modes listed in section 5
- `src/routes/og/mandala/+server.ts` — dynamic OG image route (section 11); returns 1200×600 PNG per word+preset via `@ethercorps/sveltekit-og` v4
- `public/images/mandala-previews/*.png` — 7 static OG thumbnails (one per preset + generic) at **1200×600**; use content-hashed filenames; serve as fallback for crawlers

### Modified files
- `src/lib/shared/qr/services/implementations/ShortCodeManager.ts` — add `static generateShortCode()` pure sync helper; add `createMandalaShortCodeWithCode(code, sequence, settings)` and `createMandalaShortCode(sequence, settings)` methods; add `resolveShortCodeFull` method returning `ShortCodeResolution` union; extract shared `resolveRawRecord` helper. **Do NOT change `resolveShortCode` return type.**
- `src/lib/shared/qr/services/contracts/types.ts` — add `MandalaViewerSettings`, `MandalaShortCodeRecord`, `ShortCodeResolution` union type
- `src/routes/q/[code]/+page.server.ts` — read `data.type` and `data.mandala`; branch for mandala records; return `isMandala`, `mandalaSettings`, `ogTitle`, `ogDescription`; point `og:image` at `/og/mandala?word=...&preset=...` for mandala records
- `src/routes/q/[code]/+page.svelte` — extend `Props` interface (`isMandala?`, `mandalaSettings?`, `ogTitle?`, `ogDescription?`); call `resolveShortCodeFull` instead of `resolveShortCode`; branch on `resolution.kind`; update `<svelte:head>` for mandala OG tags including `twitter:card = summary_large_image`, `og:image:width = 1200`, `og:image:height = 600`
- `src/lib/shared/sequence-viewer/components/MandalaPane.svelte` — add entitlement gate; add `onShare` prop plumbing; use transient-activation-safe share flow (section 4); call `MandalaShortCodeCreator`; emit `onShareBlocked` for non-Scribe users
- `src/lib/shared/sequence-viewer/components/MandalaViewerControls.svelte` — add Share button with loading/success/error states; add "Show QR" button in success state (section 11b); add `onShare?: () => void` callback prop; add `canShare: boolean` prop for upsell affordance rendering
- `firestore.rules` — extend `allow create` for `shortcodes/{code}` to validate `type` whitelist and `mandala` sub-object shape (see section 2 for full rule fragment)
- `firebase-functions/src/snapshotShortCodes.ts` — extend `SkinnyRecord` and `buildSkinnySnapshot()` to emit `type` and `mandala` fields (see section 8)
- `src/lib/firebase/client.ts` — initialize Firebase App Check with reCAPTCHA v3 provider (section 11a); gated behind `import.meta.env.PROD` or debug token logic for local dev
- `static/manifest.json` — add `"handle_links": "preferred"` (section 11c; 1-line change)
- `src/config/domains.ts` — no change needed (URL stays under `/q/`)

### Environment variables added
- `PUBLIC_RECAPTCHA_SITE_KEY` — reCAPTCHA v3 site key for App Check (section 11a); must be added to `.env` and the SvelteKit public env schema

### Not needed
- New SvelteKit route for `/m/[code]`
- Changes to `encodeSequenceForQR` / `decodeSequenceFromQR` — sequence encoding is reused unchanged
- New `Sharer.ts` method — URL sharing uses `navigator.share` directly, consistent with `SequenceViewerOrchestrator` pattern

---

## Open Questions (for spec review, not blockers)

1. **Dedup for mandala codes**: Should a second Share click for the same sequence + identical settings reuse the existing code? Doing so requires a composite hash over `(encoderHash, JSON.stringify(settings))`. Given the low share frequency and the benefit of stable links (sharing the same state twice produces the same URL), this is worth implementing. The `inflightByKey` map in `ShortCodeManager` already handles same-tab dedup; a Firestore `where("encoderHash", "==", compositeHash)` query handles cross-session dedup.

2. **Mandala landing page controls**: Should the landing page (`/q/XXXX` for a mandala) expose the full controls rail, or a read-only view? Full controls make sense — the recipient can explore variations without creating their own account. The Share button on the landing page is hidden (you're already on the shared URL).

3. **Capacitor deep link routing**: `tka.run/{code}` redirects trigger the Capacitor App Link handler (see `docs/superpowers/specs/active/2026-04-24-native-mobile-integration-design.md` line 84). The native handler needs to detect mandala codes and route to the mandala view, not the default sequence player. Out of scope for Phase 3, but must be noted in the Capacitor Phase 2 spec.

---

## Acceptance Criteria

- Opening a mandala short code URL (`tka.run/XXXX`) shows the breathing mandala with the exact settings that were active when Share was tapped
- All 10 viewer settings are preserved: colorMode, preset, customBlue, customRed, speed, rotation, depth, pathShape, lineWeight, paused
- The sequence resolves from the embedded blob without any authenticated Firestore read
- Sharing a mandala from a private sequence does not expose the sequence notation to the recipient — only the mandala visualization
- Share button shows the Scribe upsell for non-Scribe users
- On mobile, tapping Share opens the native share sheet (Web Share API) **without async delay** — `navigator.share` is called synchronously from the click handler before any Firestore write; the short code is pre-generated client-side
- On desktop, Share copies the URL to clipboard and shows "Copied!" for 2 seconds
- If the background Firestore write fails, an error toast is shown; the shared URL resolves correctly once the document lands on retry
- OG title/description/image are populated for social previews; `twitter:card = summary_large_image` is set
- Shared mandala links show a **per-link dynamic OG image** (word + palette via `/og/mandala?word=...&preset=...`) rather than a generic preset thumbnail
- Static per-preset thumbnails at `/images/mandala-previews/` are generated at **1200×600** (2:1 ratio); no 1200×630 files are produced
- The existing `/q/[code]` sequence landing page is unaffected for all legacy codes (no `type` field = sequence behavior, unchanged)
- `resolveShortCode` return type is unchanged; all 4 existing callers continue to work without modification
- When a mandala short code cannot be resolved (deleted, corrupted, or decode failure), the landing page shows a clear error state with a link to browse — not a blank page
- Custom hex colors are validated against `/^#[0-9a-fA-F]{6}$/` before being applied to CSS; invalid values fall back to preset defaults
- Mandala codes are included in the daily R2 snapshot with `type` and `mandala` fields; offline fallback correctly identifies them as mandala records
- Firestore security rules reject `type` values other than `"mandala"`, `mandala` sub-objects with unknown keys, out-of-range numeric fields, and hex color strings that fail the pattern match
- Firebase App Check is initialized and enforced; bot-level abuse of short code creation is blocked at the attestation layer
- Share success state includes a "Show QR" button; tapping it renders an inline QR code for the short code URL using alphanumeric mode (fast-scan compatible with the existing tka.run short code system)
- `static/manifest.json` includes `"handle_links": "preferred"`; on Android, `tka.run/q/...` links open in the installed PWA rather than a browser tab
