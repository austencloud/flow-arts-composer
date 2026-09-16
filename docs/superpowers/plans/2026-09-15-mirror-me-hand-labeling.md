# Mirror Me Hand Labeling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notation shown next to performance footage defaults to "mirror me" (mirrored and hand-swapped) with a footer legend saying which color is the viewer's right hand, switchable to "as performed", persisted per video.

**Architecture:** One optional `handLabeling` field on the collaborative video record (missing reads as `mirror-me`). One pure helper turns a sequence plus a labeling into the sequence the card should draw, memoized by object identity. ChoreoCard takes a `handLabeling` prop and draws the legend in its footer. Post Studio's existing notation-mirror toggle becomes the hand-labeling switch, driven by the selected performance. The viewer's performance pairing carries the labeling through the existing video playhead bridge.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, vitest (jsdom, `npm run test:ci -- <path>`), Firestore via `firebase/firestore`.

Spec: `docs/superpowers/specs/2026-09-15-mirror-me-hand-labeling-design.md`.

**Deviations from the spec, decided while planning (keep them):**
- Post Studio already has a post-wide "Mirror the notation" button in `PostStudioActionBar` with a documented reason for living there (a post-wide switch parked inside one layer's panel reads as that layer's property). The hand-labeling switch replaces that button's behavior instead of adding a second control in source settings.
- `SequenceData` has no `updatedAt`. The helper's cache is keyed by sequence object identity, the same way `PostStudio.svelte` already caches its mirror.
- The card footer in `CardFooter.svelte` is driven by booleans, not modes. The legend is a new optional line in that component.

**Working directory for every command:** `E:/worktrees/tka-platform/mirror-me`. Run tests with `npx vitest run --config tests/config/vitest.config.ts <file>`.

---

## File map

Create:
- `src/lib/shared/video-collaboration/domain/hand-labeling.ts` — type, default, resolver.
- `src/lib/shared/video-collaboration/domain/hand-labeling.test.ts`
- `src/lib/shared/sequence-viewer/services/hand-labeled-sequence.ts` — sequence for a labeling, cached.
- `src/lib/shared/sequence-viewer/services/hand-labeled-sequence.test.ts`
- `src/lib/shared/sequence-viewer/services/hand-legend.ts` — legend copy for the footer.
- `src/lib/shared/sequence-viewer/services/hand-legend.test.ts`

Modify:
- `src/lib/shared/video-collaboration/domain/collaborative-video.ts` — field on the record.
- `src/lib/shared/video-collaboration/services/collaborative-video-manager.ts` — codec read/write, `updateHandLabeling`.
- `src/lib/shared/video-collaboration/state/sequence-videos-store.svelte.ts` — `applyHandLabeling`.
- `tests/unit/video-collaboration/sequence-videos-store.test.ts` — cover `applyHandLabeling`.
- `src/lib/shared/sequence-viewer/components/CardFooter.svelte` — legend line.
- `src/lib/shared/sequence-viewer/components/ChoreoCard.svelte` — `handLabeling` prop.
- `src/lib/shared/sequence-viewer/context/video-playhead-context.ts` — labeling travels with the map.
- `src/lib/shared/sequence-viewer/state/viewer-playback-presentation-state.svelte.ts` — `activeHandLabeling`.
- `src/lib/shared/sequence-viewer/domain/viewer-orchestrator-context.ts`, `state/viewer-orchestrator-context-state.svelte.ts`, `components/SequenceViewerShell.svelte` — expose it.
- `src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte` — card draws the labeled sequence.
- `src/lib/shared/sequence-viewer/components/sequence-videos/state/performance-workspace-state.svelte.ts` — attach with labeling, `setHandLabeling`.
- `src/lib/shared/sequence-viewer/components/sequence-videos/PerformanceInspector.svelte` — segmented control.
- `src/lib/shared/share/components/post-studio/post-studio-performance-selection.ts` — selection carries labeling.
- `src/lib/shared/share/components/post-studio/PostStudio.svelte` — labeling replaces `notationMirrored`.
- `src/lib/shared/share/components/post-studio/PostStudioActionBar.svelte` — button semantics.
- `src/lib/shared/share/components/post-studio/PostStudioPreview.svelte`, `PostStudioMediaLayer.svelte`, `PostStudioChoreoLayer.svelte` — thread `handLabeling` to the card.

---

### Task 1: Hand labeling type and resolver

**Files:**
- Create: `src/lib/shared/video-collaboration/domain/hand-labeling.ts`
- Create: `src/lib/shared/video-collaboration/domain/hand-labeling.test.ts`
- Modify: `src/lib/shared/video-collaboration/domain/collaborative-video.ts:188-190`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shared/video-collaboration/domain/hand-labeling.test.ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_HAND_LABELING,
  isHandLabeling,
  resolveHandLabeling,
} from "./hand-labeling";

describe("hand labeling", () => {
  it("defaults to mirror me", () => {
    expect(DEFAULT_HAND_LABELING).toBe("mirror-me");
    expect(resolveHandLabeling(undefined)).toBe("mirror-me");
    expect(resolveHandLabeling({})).toBe("mirror-me");
    expect(resolveHandLabeling({ handLabeling: undefined })).toBe("mirror-me");
  });

  it("keeps an explicit choice", () => {
    expect(resolveHandLabeling({ handLabeling: "as-performed" })).toBe(
      "as-performed"
    );
    expect(resolveHandLabeling({ handLabeling: "mirror-me" })).toBe(
      "mirror-me"
    );
  });

  it("recognises only the two values", () => {
    expect(isHandLabeling("mirror-me")).toBe(true);
    expect(isHandLabeling("as-performed")).toBe(true);
    expect(isHandLabeling("mirrored")).toBe(false);
    expect(isHandLabeling(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/video-collaboration/domain/hand-labeling.test.ts`
Expected: FAIL, cannot resolve `./hand-labeling`.

- [ ] **Step 3: Write the module**

```ts
// src/lib/shared/video-collaboration/domain/hand-labeling.ts
/**
 * How notation beside performance footage labels hands.
 *
 * Notation is read from the performer's own frame. Footage is shot from the
 * audience, so the performer's right hand appears on the viewer's left.
 *
 * "mirror-me": the card is mirrored and hand-swapped, so the color drawn on
 * the viewer's right is the viewer's right hand. Copy what you see. This is
 * the default for everything posted.
 *
 * "as-performed": the card stays in performer view. The right-hand color is
 * the performer's right hand, on the viewer's left.
 */
export type HandLabeling = "mirror-me" | "as-performed";

export const HAND_LABELINGS: readonly HandLabeling[] = [
  "mirror-me",
  "as-performed",
];

export const DEFAULT_HAND_LABELING: HandLabeling = "mirror-me";

export function isHandLabeling(value: unknown): value is HandLabeling {
  return value === "mirror-me" || value === "as-performed";
}

/** A record with no stored choice gets the default. */
export function resolveHandLabeling(
  video: { readonly handLabeling?: HandLabeling } | undefined
): HandLabeling {
  return video?.handLabeling ?? DEFAULT_HAND_LABELING;
}
```

- [ ] **Step 4: Add the field to the record**

In `collaborative-video.ts`, add the import at the top and the field after `beatMap`:

```ts
import type { HandLabeling } from "./hand-labeling";
```

```ts
  // ---- Beat mapping ----
  readonly beatMap?: StepMap;

  // ---- Presentation ----
  /**
   * How the notation beside this footage labels hands. Missing reads as
   * "mirror-me" through `resolveHandLabeling`; never read this directly.
   */
  readonly handLabeling?: HandLabeling;
```

Also re-export the type from this module so existing importers of the domain have one place to reach it:

```ts
export type { HandLabeling } from "./hand-labeling";
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/video-collaboration/domain/hand-labeling.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/video-collaboration/domain/hand-labeling.ts src/lib/shared/video-collaboration/domain/hand-labeling.test.ts src/lib/shared/video-collaboration/domain/collaborative-video.ts
git commit -m "feat(video): hand labeling type on the performance record"
```

---

### Task 2: Codec and Firestore update

**Files:**
- Modify: `src/lib/shared/video-collaboration/services/collaborative-video-manager.ts` (docToVideo ~229-256, videoToDoc ~258-319, after `updateStepMap` ~466)

- [ ] **Step 1: Read a stored value**

In `docToVideo`, in the returned object, directly after `beatMap,` add:

```ts
    ...(isHandLabeling(docData.handLabeling)
      ? { handLabeling: docData.handLabeling }
      : {}),
```

Add the import near the other domain imports:

```ts
import { isHandLabeling, type HandLabeling } from "../domain/hand-labeling";
```

- [ ] **Step 2: Write a stored value**

In `videoToDoc`, directly after the `beatMap: ... : null,` entry add:

```ts
    handLabeling: video.handLabeling ?? null,
```

- [ ] **Step 3: Add the update function**

After `updateStepMap`, add. It mirrors `updateStepMap` exactly: same permission check, same creator repair, same toast on failure.

```ts
/**
 * Persist how the notation beside this footage labels hands. Same access rule
 * as the beat map: collaborators only.
 */
export async function updateHandLabeling(
  videoId: string,
  handLabeling: HandLabeling
): Promise<void> {
  try {
    const firestore = await getFirestoreInstance();
    const userId = getUserId();
    const video = await getVideo(videoId);

    if (!video) {
      throw new Error("Video not found");
    }

    if (!canEditVideo(video, userId)) {
      throw new Error("Only collaborators can change hand labeling");
    }

    const docRef = doc(firestore, VIDEOS_COLLECTION, videoId);
    await updateDoc(docRef, {
      ...missingCreatorRepair(video, userId),
      handLabeling,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(
      "❌ [CollaborativeVideoManager] Failed to update hand labeling:",
      error
    );
    toast.error("Failed to save hand labeling.");
    throw error;
  }
}
```

- [ ] **Step 4: Type check the file**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -E "collaborative-video-manager|hand-labeling"`
Expected: no lines (no errors in these files). The whole check takes about a minute; ignore unrelated files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/video-collaboration/services/collaborative-video-manager.ts
git commit -m "feat(video): read, write and update hand labeling in Firestore"
```

---

### Task 3: Store method

**Files:**
- Modify: `src/lib/shared/video-collaboration/state/sequence-videos-store.svelte.ts:31-44, 105-112`
- Modify: `tests/unit/video-collaboration/sequence-videos-store.test.ts`

- [ ] **Step 1: Write the failing test**

In the test file, extend the mock and add a test. The mock block at the top becomes:

```ts
const getVideosForSequence = vi.fn();
const updateHandLabeling = vi.fn();

vi.mock(
  "$lib/shared/video-collaboration/services/collaborative-video-manager",
  () => ({
    getVideosForSequence: (id: string) => getVideosForSequence(id),
    deleteVideo: vi.fn(),
    saveVideo: vi.fn(),
    updateStepMap: vi.fn(),
    updateHandLabeling: (id: string, labeling: string) =>
      updateHandLabeling(id, labeling),
  })
);
```

Add this test inside the existing `describe` (copy the shape of the existing video fixture in that file for `makeVideo`; if none exists, use the object below):

```ts
  it("applyHandLabeling persists and patches the held record", async () => {
    updateHandLabeling.mockResolvedValue(undefined);
    resetSequenceVideoStores();
    const store = getSequenceVideosStore("seq-a");
    store.add({
      id: "v1",
      videoUrl: "https://example.test/v1.mp4",
      storagePath: "videos/v1.mp4",
      duration: 10,
      fileSize: 1,
      mimeType: "video/mp4",
      sequenceId: "seq-a",
      associations: [],
      performers: [],
      creatorId: "u1",
      collaborators: [],
      pendingInvites: [],
      visibility: "private",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });

    await store.applyHandLabeling("v1", "as-performed");

    expect(updateHandLabeling).toHaveBeenCalledWith("v1", "as-performed");
    expect(store.videos[0]?.handLabeling).toBe("as-performed");
    expect(store.videos[0]?.updatedAt.getTime()).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/video-collaboration/sequence-videos-store.test.ts`
Expected: FAIL, `store.applyHandLabeling is not a function`.

- [ ] **Step 3: Implement**

In the interface, after `applyStepMap(...)`:

```ts
  applyHandLabeling(videoId: string, handLabeling: HandLabeling): Promise<void>;
```

Import at the top (next to the existing manager import):

```ts
import { updateHandLabeling } from "$lib/shared/video-collaboration/services/collaborative-video-manager";
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
```

(If the manager import is already a named-import list, add `updateHandLabeling` to it instead.)

In the store object, after `applyStepMap`:

```ts
    async applyHandLabeling(videoId, handLabeling) {
      await updateHandLabeling(videoId, handLabeling);
      videos = videos.map((held) =>
        held.id === videoId
          ? { ...held, handLabeling, updatedAt: new Date() }
          : held
      );
    },
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/video-collaboration/sequence-videos-store.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/video-collaboration/state/sequence-videos-store.svelte.ts tests/unit/video-collaboration/sequence-videos-store.test.ts
git commit -m "feat(video): applyHandLabeling on the sequence videos store"
```

---

### Task 4: Sequence for a labeling

**Files:**
- Create: `src/lib/shared/sequence-viewer/services/hand-labeled-sequence.ts`
- Create: `src/lib/shared/sequence-viewer/services/hand-labeled-sequence.test.ts`

The real mirror needs the motion dataset, so the helper takes its transforms as an injectable dependency with the real ones as the default. Tests inject fakes.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shared/sequence-viewer/services/hand-labeled-sequence.test.ts
import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  createHandLabeledSequenceResolver,
} from "./hand-labeled-sequence";

function makeSequence(id: string): SequenceData {
  return {
    id,
    name: id,
    word: "AB",
    steps: [],
    thumbnails: [],
  } as unknown as SequenceData;
}

describe("hand labeled sequence", () => {
  it("returns the input untouched for as-performed", async () => {
    const mirror = vi.fn();
    const swap = vi.fn();
    const resolve = createHandLabeledSequenceResolver({ mirror, swap });
    const source = makeSequence("s");
    expect(await resolve(source, "as-performed")).toBe(source);
    expect(mirror).not.toHaveBeenCalled();
    expect(swap).not.toHaveBeenCalled();
  });

  it("mirrors then swaps for mirror-me", async () => {
    const mirrored = makeSequence("mirrored");
    const swapped = makeSequence("swapped");
    const mirror = vi.fn(async () => mirrored);
    const swap = vi.fn(() => swapped);
    const resolve = createHandLabeledSequenceResolver({ mirror, swap });
    const source = makeSequence("s");
    expect(await resolve(source, "mirror-me")).toBe(swapped);
    expect(mirror).toHaveBeenCalledWith(source);
    expect(swap).toHaveBeenCalledWith(mirrored);
  });

  it("computes once per source object and again for a new object", async () => {
    const mirror = vi.fn(async (s: SequenceData) => makeSequence(`m:${s.id}`));
    const swap = vi.fn((s: SequenceData) => makeSequence(`w:${s.id}`));
    const resolve = createHandLabeledSequenceResolver({ mirror, swap });
    const a = makeSequence("a");
    const first = await resolve(a, "mirror-me");
    const second = await resolve(a, "mirror-me");
    expect(second).toBe(first);
    expect(mirror).toHaveBeenCalledTimes(1);

    const b = makeSequence("a"); // same id, different object
    await resolve(b, "mirror-me");
    expect(mirror).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer/services/hand-labeled-sequence.test.ts`
Expected: FAIL, cannot resolve `./hand-labeled-sequence`.

- [ ] **Step 3: Write the module**

```ts
// src/lib/shared/sequence-viewer/services/hand-labeled-sequence.ts
/**
 * The sequence a card should draw beside performance footage.
 *
 * Mirroring makes the geometry match the camera: E and W trade places and the
 * rotation arrows reverse, which is what an audience sees. The hand swap on
 * top changes no shape and no arrow. It only moves the colors, so the color on
 * the viewer's right is the viewer's right hand. Together they are "mirror me".
 *
 * The mirror derives letters asynchronously, so the result is memoized by the
 * source object. `SequenceData` carries no revision stamp; a changed sequence
 * is a new object, so identity is the right key. Same approach as the cache
 * PostStudio used for its mirror toggle before this module owned it.
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  mirrorSequence,
  swapHands,
} from "$lib/shared/create/services/sequence-transformer";
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";

export interface HandLabelingTransforms {
  mirror: (sequence: SequenceData) => Promise<SequenceData>;
  swap: (sequence: SequenceData) => SequenceData;
}

export type HandLabeledSequenceResolver = (
  sequence: SequenceData,
  labeling: HandLabeling
) => Promise<SequenceData>;

export function createHandLabeledSequenceResolver(
  transforms: HandLabelingTransforms
): HandLabeledSequenceResolver {
  const cache = new WeakMap<SequenceData, Promise<SequenceData>>();
  return (sequence, labeling) => {
    if (labeling === "as-performed") return Promise.resolve(sequence);
    let held = cache.get(sequence);
    if (!held) {
      held = transforms.mirror(sequence).then(transforms.swap);
      cache.set(sequence, held);
      // A failed mirror must not poison the cache for the next attempt.
      held.catch(() => cache.delete(sequence));
    }
    return held;
  };
}

/** The app-wide resolver, on the real transforms. */
export const sequenceForHandLabeling: HandLabeledSequenceResolver =
  createHandLabeledSequenceResolver({
    mirror: (sequence) => mirrorSequence(sequence),
    swap: swapHands,
  });
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer/services/hand-labeled-sequence.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/sequence-viewer/services/hand-labeled-sequence.ts src/lib/shared/sequence-viewer/services/hand-labeled-sequence.test.ts
git commit -m "feat(viewer): resolve the sequence a card draws for a hand labeling"
```

---

### Task 5: Legend copy

**Files:**
- Create: `src/lib/shared/sequence-viewer/services/hand-legend.ts`
- Create: `src/lib/shared/sequence-viewer/services/hand-legend.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shared/sequence-viewer/services/hand-legend.test.ts
import { describe, expect, it } from "vitest";
import { handLegendFor } from "./hand-legend";

describe("hand legend", () => {
  it("tells a mirror-me viewer the right-hand color is theirs", () => {
    expect(handLegendFor("mirror-me", "#ED1C24")).toEqual({
      lead: "Mirror me.",
      swatch: "#ED1C24",
      rest: "is your right hand.",
    });
  });

  it("tells an as-performed viewer where the performer's right hand is", () => {
    expect(handLegendFor("as-performed", "#DC2626")).toEqual({
      lead: "As performed.",
      swatch: "#DC2626",
      rest: "is my right hand, on your left.",
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer/services/hand-legend.test.ts`
Expected: FAIL, cannot resolve `./hand-legend`.

- [ ] **Step 3: Write the module**

```ts
// src/lib/shared/sequence-viewer/services/hand-legend.ts
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";

/** One footer line: `${lead} [swatch] ${rest}`. The swatch is drawn, not said. */
export interface HandLegend {
  lead: string;
  swatch: string;
  rest: string;
}

/**
 * The swatch is the right-hand prop color under both labelings. Under mirror
 * me the hand swap has already relabeled the motions, so that color is drawn on
 * the viewer's right. Under as performed it is the performer's right hand, on
 * the viewer's left. The line says what the viewer sees on the card.
 */
export function handLegendFor(
  labeling: HandLabeling,
  rightHandColor: string
): HandLegend {
  if (labeling === "mirror-me") {
    return {
      lead: "Mirror me.",
      swatch: rightHandColor,
      rest: "is your right hand.",
    };
  }
  return {
    lead: "As performed.",
    swatch: rightHandColor,
    rest: "is my right hand, on your left.",
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer/services/hand-legend.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/sequence-viewer/services/hand-legend.ts src/lib/shared/sequence-viewer/services/hand-legend.test.ts
git commit -m "feat(viewer): hand legend copy for the card footer"
```

---

### Task 6: Legend in the card footer

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/CardFooter.svelte`
- Modify: `src/lib/shared/sequence-viewer/components/ChoreoCard.svelte` (Props ~79-202, footer render ~1038-1048, `showFooter` ~344)

No unit test here (component tests run in the browser project); Task 11 verifies visually.

- [ ] **Step 1: Add the legend to CardFooter**

Replace the Props interface and destructure:

```ts
  import type { HandLegend } from "../services/hand-legend";

  interface Props {
    showFooter: boolean;
    showNotes: boolean;
    hasPathShapeMetadata: boolean;
    customNotesText: string;
    scaledFooterHeight: number;
    footerFontSize: number;
    footerMargin: number;
    activeDarkMode: boolean;
    /** Which color is the viewer's right hand. Only beside performance footage. */
    handLegend?: HandLegend | null;
  }

  const {
    showFooter,
    showNotes,
    hasPathShapeMetadata,
    customNotesText,
    scaledFooterHeight,
    footerFontSize,
    footerMargin,
    activeDarkMode,
    handLegend = null,
  }: Props = $props();
```

Inside the `.footer-section` div, before the `{#if showNotes}` block, add:

```svelte
    {#if handLegend}
      <span class="footer-hand-legend" data-hand-legend>
        {handLegend.lead}
        <span
          class="hand-swatch"
          style="background: {handLegend.swatch};"
          aria-hidden="true"
        ></span>
        {handLegend.rest}
      </span>
    {/if}
```

Add to the style block (match the footer's existing font handling; the swatch is a small rounded square sized off the line's font size):

```css
  .footer-hand-legend {
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    font-weight: 600;
    white-space: nowrap;
  }

  .hand-swatch {
    display: inline-block;
    width: 0.9em;
    height: 0.9em;
    border-radius: 0.2em;
    border: 1px solid rgba(0, 0, 0, 0.25);
  }

  .dark-mode .hand-swatch {
    border-color: rgba(255, 255, 255, 0.35);
  }
```

- [ ] **Step 2: Add the prop to ChoreoCard**

In the Props interface, after `customNotesText?: string;`:

```ts
    /**
     * Set only beside performance footage. Draws the "which color is your
     * right hand" line in the footer. The caller is responsible for passing
     * the matching (mirrored and swapped, or canonical) sequence.
     */
    handLabeling?: HandLabeling | null;
```

In the `$props()` destructure add `handLabeling = null,`.

Add imports:

```ts
  import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
  import { handLegendFor } from "../services/hand-legend";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
```

Near `const showFooter = $derived(displayState.showFooter);` replace with:

```ts
  const handLegend = $derived(
    handLabeling
      ? handLegendFor(
          handLabeling,
          primaryPropColors?.right ??
            getMotionColor(HandSide.RIGHT, activeDarkMode ? "dark" : "light")
        )
      : null
  );
  const showFooter = $derived(displayState.showFooter || handLegend !== null);
```

`primaryPropColors` is a `HandColorPair` (`{ left: string; right: string }`), and `activeDarkMode` is declared at line ~278, before `showFooter` at ~344, so the block above type-checks as written. `HandSide.RIGHT` is `"right"`.

In the `<CardFooter ... />` render add `{handLegend}`.

- [ ] **Step 3: Type check both files**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -E "CardFooter|ChoreoCard.svelte"`
Expected: no lines.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/sequence-viewer/components/CardFooter.svelte src/lib/shared/sequence-viewer/components/ChoreoCard.svelte
git commit -m "feat(card): hand legend line in the choreo card footer"
```

---

### Task 7: Labeling travels through the viewer's playhead bridge

**Files:**
- Modify: `src/lib/shared/sequence-viewer/context/video-playhead-context.ts`
- Modify: `src/lib/shared/sequence-viewer/state/viewer-playback-presentation-state.svelte.ts`
- Modify: `src/lib/shared/sequence-viewer/domain/viewer-orchestrator-context.ts:55-57`
- Modify: `src/lib/shared/sequence-viewer/state/viewer-orchestrator-context-state.svelte.ts:126-128`
- Modify: `src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte:378-383`
- Modify: `src/lib/shared/sequence-viewer/components/sequence-videos/state/performance-workspace-state.svelte.ts` (attach effect ~86-90)

- [ ] **Step 1: Bridge**

In `video-playhead-context.ts`:

```ts
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
```

Change the `attach` signature in `VideoPlayheadBridge`:

```ts
  /**
   * The performance on screen changed. `map` is null when it carries no
   * timing; `handLabeling` is null when no performance is on screen at all.
   */
  attach(map: StepMap | null, handLabeling: HandLabeling | null): void;
```

Add to `BridgeHost`:

```ts
  setActiveHandLabeling(labeling: HandLabeling | null): void;
```

Change the implementation:

```ts
    attach(next, handLabeling) {
      const usable = next && next.beatTimestamps.length > 0 ? next : null;
      map = usable;
      time = 0;
      host.setActiveStepMap(usable);
      host.setActiveHandLabeling(handLabeling);
      host.setPlaybackSource(usable ? "video" : "animation");
    },
```

- [ ] **Step 2: Presentation state**

In `viewer-playback-presentation-state.svelte.ts` add the import, the state, the setter, and expose both:

```ts
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
```

```ts
  let activeHandLabeling = $state<HandLabeling | null>(null);
```

```ts
  function setActiveHandLabeling(labeling: HandLabeling | null): void {
    activeHandLabeling = labeling;
  }
```

In the returned object add `get activeHandLabeling() { return activeHandLabeling; },` and `setActiveHandLabeling,`.

- [ ] **Step 3: Orchestrator context**

In `viewer-orchestrator-context.ts` add after `activeStepMap: StepMap | null;`:

```ts
  /** Null when no performance footage is on screen. */
  activeHandLabeling: HandLabeling | null;
```

and after `setActiveStepMap`:

```ts
  setActiveHandLabeling: (labeling: HandLabeling | null) => void;
```

with `import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";`.

In `viewer-orchestrator-context-state.svelte.ts` after `activeStepMap: inputs.presentation.activeStepMap,` add `activeHandLabeling: inputs.presentation.activeHandLabeling,` and after `setActiveStepMap: ...` add `setActiveHandLabeling: inputs.presentation.setActiveHandLabeling,`.

- [ ] **Step 4: Shell**

In `SequenceViewerShell.svelte` the bridge creation becomes:

```ts
  const videoPlayhead = createVideoPlayheadBridge({
    setPlaybackSource: (source) => ctx.setPlaybackSource(source),
    setActiveStepMap: (map) => ctx.setActiveStepMap(map),
    setActiveHandLabeling: (labeling) => ctx.setActiveHandLabeling(labeling),
    onVideoTimeUpdate: (seconds) => ctx.onVideoTimeUpdate(seconds),
  });
```

- [ ] **Step 5: Every other host**

The only other host is `src/routes/test/step-map-editor/+page.svelte:91`. Its host object becomes:

```ts
  const playhead = createVideoPlayheadBridge({
    setPlaybackSource: () => {},
    setActiveStepMap: (map) => (activeMap = map),
    setActiveHandLabeling: () => {},
    onVideoTimeUpdate: (seconds) => (videoTime = seconds),
  });
```

The only `attach` caller on this bridge is `performance-workspace-state.svelte.ts:90-95` (the other `.attach(` hits in the repo are unrelated swipe, probe, and rig objects). The effect becomes:

```ts
  $effect(() => {
    const map = activeMap;
    const labeling =
      inputs.getActive() && view === "browse" && selectedVideo
        ? resolveHandLabeling(selectedVideo)
        : null;
    dependencies.playhead?.attach(map ?? null, labeling);
    playerTime = 0;
    return () => dependencies.playhead?.attach(null, null);
  });
```

with `import { resolveHandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";`. `view`, `selectedVideo`, and `inputs.getActive` are already in scope in that file.

- [ ] **Step 6: Type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -E "video-playhead|presentation-state|orchestrator-context|SequenceViewerShell|performance-workspace|\.attach"`
Expected: no lines.

- [ ] **Step 7: Run existing tests touching these**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer tests/unit/video-collaboration`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/shared/sequence-viewer/context/video-playhead-context.ts src/lib/shared/sequence-viewer/state/viewer-playback-presentation-state.svelte.ts src/lib/shared/sequence-viewer/domain/viewer-orchestrator-context.ts src/lib/shared/sequence-viewer/state/viewer-orchestrator-context-state.svelte.ts src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte src/lib/shared/sequence-viewer/components/sequence-videos/state/performance-workspace-state.svelte.ts
git add -u src/routes/test
git commit -m "feat(viewer): carry the active performance's hand labeling through the playhead bridge"
```

---

### Task 8: The viewer's card draws the labeled sequence

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte:111-140`
- Modify: `src/lib/shared/sequence-viewer/components/viewer-split-pane-types.ts` (the `ViewerCompanionSurfaceProps` interface)
- Modify: `src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte:577, 663`

- [ ] **Step 1: Thread the labeling as a prop**

The split pane has no context access; it receives `sequence={ctx.effectiveSequence}` from the shell. Thread one prop the same way:

1. `viewer-split-pane-types.ts:145` `ViewerCompanionSurfaceProps` gains, after `sequence: SequenceData;`:
   ```ts
     /** Null unless performance footage is on screen. */
     activeHandLabeling?: HandLabeling | null;
   ```
   with `import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";`. Add the same optional prop to the split pane's own props interface in that file (find it with `grep -n "interface ViewerSplitPaneProps" src/lib/shared/sequence-viewer/components/viewer-split-pane-types.ts`; if the split pane declares its props inline in the `.svelte` file instead, add it there).
2. `SequenceViewerShell.svelte:1010`: after `sequence={ctx.effectiveSequence}` add `activeHandLabeling={ctx.activeHandLabeling}`.
3. `ViewerSplitPane.svelte`: destructure `activeHandLabeling = null` from props and add `{activeHandLabeling}` to both `<ViewerCompanionSurface` sites (lines ~577 and ~663), right after `{sequence}`.

- [ ] **Step 2: Resolve the card's sequence in the companion surface**

In the script:

```ts
  import { sequenceForHandLabeling } from "../services/hand-labeled-sequence";
  import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
```

Add `activeHandLabeling = null,` to the destructure.

```ts
  /**
   * Beside performance footage the card draws the sequence the viewer should
   * copy, not the stored one. Resolved asynchronously; until it lands the card
   * keeps its previous sequence so the swap never flashes a blank.
   */
  let labeledSequence = $state<SequenceData | null>(null);
  $effect(() => {
    const source = sequence;
    const labeling = activeHandLabeling;
    if (!labeling) {
      labeledSequence = null;
      return;
    }
    let cancelled = false;
    void sequenceForHandLabeling(source, labeling).then((resolved) => {
      if (!cancelled) labeledSequence = resolved;
    });
    return () => {
      cancelled = true;
    };
  });
  const cardSequence = $derived(labeledSequence ?? sequence);
```

Import `SequenceData` type if the file does not already.

In the `<ChoreoCard` render change `sequence={studioCard?.sequence ?? sequence}` to `sequence={studioCard?.sequence ?? cardSequence}` and add `handLabeling={studioCard ? null : activeHandLabeling}`.

- [ ] **Step 3: Type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -E "ViewerCompanionSurface|ViewerSplitPane|viewer-split-pane-types"`
Expected: no lines.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte src/lib/shared/sequence-viewer/components/viewer-split-pane-types.ts src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte
git commit -m "feat(viewer): card beside footage draws the hand-labeled sequence"
```

---

### Task 9: Performance inspector control

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/sequence-videos/state/performance-workspace-state.svelte.ts`
- Modify: `src/lib/shared/sequence-viewer/components/sequence-videos/PerformanceInspector.svelte:57-100`

- [ ] **Step 1: Workspace method**

In `performance-workspace-state.svelte.ts` add after `saveStepMap`:

```ts
  async function setHandLabeling(labeling: HandLabeling): Promise<void> {
    if (!selectedVideo) return;
    await store.applyHandLabeling(selectedVideo.id, labeling);
  }
```

with `import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";`, and add `setHandLabeling,` to the returned object. Because the store patches the held record, the attach effect from Task 7 re-runs on its own.

- [ ] **Step 2: Segmented control in the inspector**

In `PerformanceInspector.svelte` add imports:

```ts
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { resolveHandLabeling, type HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
```

Inside the `selected-details` section, after the `.selected-copy` div and before the `{#if workspace.selectedVideo.creatorId === authState.user?.uid}` block, add:

```svelte
      <div class="hand-labeling">
        <span class="eyebrow" id="hand-labeling-label">Read the card as</span>
        <SegmentedControl
          options={[
            { value: "mirror-me", label: "Mirror me" },
            { value: "as-performed", label: "As performed" },
          ]}
          value={resolveHandLabeling(workspace.selectedVideo)}
          onchange={(value: HandLabeling) => void workspace.setHandLabeling(value)}
          size="sm"
          ariaLabelledby="hand-labeling-label"
        />
      </div>
```

Style, next to `.selected-copy`:

```css
  .hand-labeling {
    display: grid;
    gap: 0.35rem;
    margin-top: 0.75rem;
  }
```

Only collaborators can persist, so the control lives inside the existing `{#if workspace.selectedVideo.creatorId === authState.user?.uid}` block, above the `.selected-actions` div. Put it there, not before the `#if`.

- [ ] **Step 3: Type check**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -E "PerformanceInspector|performance-workspace-state"`
Expected: no lines.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shared/sequence-viewer/components/sequence-videos/state/performance-workspace-state.svelte.ts src/lib/shared/sequence-viewer/components/sequence-videos/PerformanceInspector.svelte
git commit -m "feat(viewer): hand labeling switch in the performance inspector"
```

---

### Task 10: Post Studio

**Files:**
- Modify: `src/lib/shared/share/components/post-studio/post-studio-performance-selection.ts`
- Modify: `src/lib/shared/share/components/post-studio/PostStudio.svelte` (lines ~42, 146, 397-452, 590-598, 780-795, 810-821)
- Modify: `src/lib/shared/share/components/post-studio/PostStudioActionBar.svelte:33, 60, 210-232`
- Modify: `src/lib/shared/share/components/post-studio/PostStudioPreview.svelte:~157`, `PostStudioMediaLayer.svelte:~150`, `PostStudioChoreoLayer.svelte`
- Test: `tests/unit/media-composition/post-studio-performance-selection.test.ts` (exists; it already has a `video(overrides)` fixture and a `sequence` fixture). Add a new `describe` block to it.

- [ ] **Step 1: Failing test for the selection**

Add `createUnmappedPerformanceSelection` to the existing import from the selection module, then append to the file:

```ts
describe("post studio performance selection hand labeling", () => {
  it("a catalog video without a stored choice reads as mirror me", () => {
    const selection = createCatalogPerformanceSelection(
      video(),
      createPostStudioSequenceRef(sequence)
    );
    expect(selection.handLabeling).toBe("mirror-me");
    expect(selection.videoId).toBe("video-1");
  });

  it("a catalog video keeps its stored choice", () => {
    const selection = createCatalogPerformanceSelection(
      video({ handLabeling: "as-performed" }),
      createPostStudioSequenceRef(sequence)
    );
    expect(selection.handLabeling).toBe("as-performed");
  });

  it("a local upload starts as mirror me", () => {
    const selection = createUnmappedPerformanceSelection({
      id: "local",
      url: "blob:x",
      label: "Local",
    });
    expect(selection.handLabeling).toBe("mirror-me");
    expect(selection.videoId).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-studio-performance-selection.test.ts`
Expected: FAIL on `handLabeling` being undefined (existing tests still pass).

- [ ] **Step 3: Extend the selection**

In `post-studio-performance-selection.ts`:

```ts
import {
  resolveHandLabeling,
  DEFAULT_HAND_LABELING,
  type HandLabeling,
} from "$lib/shared/video-collaboration/domain/hand-labeling";
```

Add to `PostStudioPerformanceSelection`:

```ts
  /** The catalog record behind this selection, or null for a local file. */
  videoId: string | null;
  handLabeling: HandLabeling;
```

`createUnmappedPerformanceSelection` returns `{ ...input, videoId: null, handLabeling: DEFAULT_HAND_LABELING, sequenceTimeMap: null, ... }`. Give it an optional `videoId?: string` and `handLabeling?: HandLabeling` on its input so the catalog path can reuse it: `videoId: input.videoId ?? null, handLabeling: input.handLabeling ?? DEFAULT_HAND_LABELING`.

In `createCatalogPerformanceSelection`, `base` gains `videoId: video.id, handLabeling: resolveHandLabeling(video)`, and both returns already spread `base`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/media-composition/post-studio-performance-selection.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: PostStudio state**

In `PostStudio.svelte` replace the whole block from `let notationMirrored = $state(false);` through the end of the `if (psSeed?.notationMirrored) { ... }` block (lines ~412-452, keep the doc comment above and edit it) with:

```ts
  /**
   * The performer works in their own frame and the camera sees it reflected.
   * Beside footage the notation follows the performance's hand labeling:
   * "mirror me" (the default) mirrors the DATA and swaps hands so the color on
   * the viewer's right is their right hand; "as performed" leaves it alone.
   * Data, not pixels, because notation carries letters and glyphs.
   *
   * `sequenceForHandLabeling` owns the transform and its cache. With no
   * performance on the canvas there is no labeling and the notation is
   * canonical.
   */
  const handLabeling = $derived<HandLabeling | null>(
    performanceUrl ? (chosenPerformance?.handLabeling ?? DEFAULT_HAND_LABELING) : null
  );
  let labeledSequence = $state<SequenceData | null>(null);
  let handLabelingPending = $state(false);
  $effect(() => {
    const source = sequence;
    const labeling = handLabeling;
    if (!labeling) {
      labeledSequence = null;
      return;
    }
    let cancelled = false;
    handLabelingPending = true;
    sequenceForHandLabeling(source, labeling)
      .then((resolved) => {
        if (!cancelled) labeledSequence = resolved;
      })
      .catch((error) => {
        console.error("[PostStudio] Could not label the notation:", error);
      })
      .finally(() => {
        if (!cancelled) handLabelingPending = false;
      });
    return () => {
      cancelled = true;
    };
  });
  const displaySequence = $derived(labeledSequence ?? sequence);

  /**
   * Flip between mirror me and as performed. A catalog video remembers the
   * choice; a local file keeps it for this session only.
   */
  async function toggleHandLabeling(): Promise<void> {
    const current = chosenPerformance;
    if (!current) return;
    const next: HandLabeling =
      current.handLabeling === "mirror-me" ? "as-performed" : "mirror-me";
    performanceSelectionTouched = true;
    chosenPerformance = { ...current, handLabeling: next };
    if (current.videoId && videoLibrary) {
      try {
        await videoLibrary.applyHandLabeling(current.videoId, next);
      } catch {
        chosenPerformance = { ...current };
      }
    }
  }
```

Imports to add / change at the top of the script:

```ts
  import { sequenceForHandLabeling } from "$lib/shared/sequence-viewer/services/hand-labeled-sequence";
  import {
    DEFAULT_HAND_LABELING,
    type HandLabeling,
  } from "$lib/shared/video-collaboration/domain/hand-labeling";
```

Remove `import { mirrorSequence } from "$lib/shared/create/services/sequence-transformer";` if nothing else in the file uses it (`grep -n mirrorSequence` to confirm).

If `chosenPerformance` is null but `performanceUrl` comes from `sequence.performanceVideoUrl` (a linked URL with no catalog record yet), the labeling is the default and the toggle is a no-op; that is acceptable because the library effect fills `chosenPerformance` as soon as the store loads.

- [ ] **Step 6: URL slice and action bar props**

At ~line 596 replace `notationMirrored,` with `notationMirrored: handLabeling === "mirror-me",` (the slice records the state; seeding from it is no longer needed since mirror-me is the default, so the removed seed block is not replaced).

At ~lines 787-789 replace:

```svelte
    {notationMirrored}
    {notationMirrorPending}
    onToggleNotationMirror={toggleNotationMirror}
```

with:

```svelte
    {handLabeling}
    {handLabelingPending}
    onToggleHandLabeling={toggleHandLabeling}
```

- [ ] **Step 7: Action bar**

In `PostStudioActionBar.svelte` replace the three props (`notationMirrored?: boolean;`, `notationMirrorPending?: boolean;`, `onToggleNotationMirror?: () => void;` and their defaults) with:

```ts
    /** Null when no performance footage is on the canvas. */
    handLabeling?: HandLabeling | null;
    handLabelingPending?: boolean;
    onToggleHandLabeling?: () => void;
```

defaults `handLabeling = null, handLabelingPending = false,`, import `type HandLabeling` from `$lib/shared/video-collaboration/domain/hand-labeling`.

Replace the button block (keep the comment, update its last sentence to say the switch is the performance's hand labeling):

```svelte
  {#if onToggleHandLabeling && handLabeling}
    <button
      type="button"
      class="guide-toggle mirror-toggle"
      class:active={handLabeling === "mirror-me"}
      aria-pressed={handLabeling === "mirror-me"}
      disabled={handLabelingPending}
      aria-label={handLabeling === "mirror-me"
        ? "Mirror me: switch to as performed"
        : "As performed: switch to mirror me"}
      title={handLabeling === "mirror-me"
        ? "Mirror me. The right-hand color is the viewer's right hand."
        : "As performed. The right-hand color is the performer's right hand."}
      onclick={onToggleHandLabeling}
    >
      <i class="fa-solid fa-right-left" aria-hidden="true"></i>
    </button>
  {/if}
```

- [ ] **Step 8: Thread the labeling to the card layer**

Three components, one optional prop each, all typed `handLabeling?: HandLabeling | null` with default `null` and `import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";`:

1. `PostStudio.svelte` ~813: `<PostStudioPreview ... sequence={displaySequence} {handLabeling}`.
2. `PostStudioPreview.svelte`: add the prop to the `Props` interface (line ~17, after `cardRenderOptions`) and the destructure (~12); at line ~158 pass `{handLabeling}` right after `{cardRenderOptions}` into `<PostStudioMediaLayer`.
3. `PostStudioMediaLayer.svelte`: add the prop to `Props` (~24, after `sequence`) and the destructure (~38); at line ~150 render `<PostStudioChoreoLayer {sequence} {displayedBeatNumber} {cardRenderOptions} {handLabeling} />`.
4. `PostStudioChoreoLayer.svelte`: add `handLabeling = null,` to the destructure at ~11 and `handLabeling?: HandLabeling | null;` to the inline type at ~15; pass `{handLabeling}` to `<ChoreoCard` at ~66, after `{sequence}`.

`PostStudioSequenceAnimationLayer` needs nothing: it already receives `displaySequence` through the same `sequence` prop.

- [ ] **Step 9: Fix the ps-slice test if it asserts the seed**

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/sequence-viewer/services/viewer-url-slices/ps-slice.test.ts`
Expected: PASS unchanged (the slice's own capture logic is untouched). If a test in the repo asserts `psSeed.notationMirrored` drives the studio, update it to assert nothing about seeding.

- [ ] **Step 10: Type check and tests**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -E "post-studio|PostStudio"`
Expected: no lines.

Run: `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/share src/lib/shared/sequence-viewer tests/unit/video-collaboration tests/unit/media-composition`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/shared/share/components/post-studio tests/unit/media-composition/post-studio-performance-selection.test.ts
git commit -m "feat(post-studio): notation follows the performance's hand labeling"
```

---

### Task 11: Browser verification on the real routes

**Files:** none modified unless a bug turns up.

The clip `static/word-videos/OmLam-XJ.mp4` is gitignored. Copy it in:

```bash
mkdir -p static/word-videos && cp /e/tka-platform/static/word-videos/OmLam-XJ.mp4 static/word-videos/
```

Start the worktree dev server (a launch entry in `E:/cirque-aflame/.claude/launch.json` named `tka-mirror-me` running `pnpm -C E:/worktrees/tka-platform/mirror-me exec vite --port 5187 --host 127.0.0.1`, port 5187, url `http://127.0.0.1:5187`; remove the entry when done) and check:

- [ ] `/test/post-studio`: the card slot shows the mirrored, hand-swapped ΩΛ-XJ and the footer reads "Mirror me. [swatch] is your right hand." Screenshot.
- [ ] Click the action bar's right-left button: the card returns to the canonical sequence and the footer reads "As performed. [swatch] is my right hand, on your left." The button's pressed state is off. Screenshot.
- [ ] `/test/step-map-editor`: load the recorded take, save. The paired view's card shows the mirror-me card with the legend; the performance inspector shows the "Read the card as" control on Mirror me. Switch to As performed: card and legend change. Reload: the choice persists (the route seeds the store in memory, so persistence here is the in-memory record; the Firestore write is exercised by the manager, and the toast on failure is the expected outcome for a guest). Screenshot.
- [ ] Console: no errors from the studio or viewer other than the pre-existing Firestore guest errors.
- [ ] Export from Post Studio (Render) and confirm the exported frame's card matches the preview, or state plainly that export was not exercised.

- [ ] **Commit any fixes**, then run the repo gate the worktree finish requires:

```bash
npm run check
```

Expected: `svelte-check found 0 errors`.

---

### Task 12: Integrate

From `E:/tka-platform`:

```bash
git -C E:/worktrees/tka-platform/mirror-me merge --no-edit main
MSYS_NO_PATHCONV=1 npm run wt:finish -- codex/mirror-me-hand-labeling --route /test/post-studio
```

Expected: `✔ merged codex/mirror-me-hand-labeling into local main`, worktree removed, branch deleted. If a gate fails, stop with the worktree intact and report the exact blocker.
