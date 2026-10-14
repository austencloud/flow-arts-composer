# Profile Lobby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the profile's 505-tile Archive into a doorway that hands off to the drill-downs that already exist, so the profile arrives at content instead of burying it.

**Architecture:** A new `BandDoorway` component replaces a band's full grid with a count, a one-row sample of real `ArtifactTile`s, and one button. The Archive uses it unconditionally; Collections switches to it above a threshold. The button hands off to `GalleryDrill` (sequences) or `CollectionGalleryDetail` (everything else). `GalleryDrill` gains one new prop so it can open on a chosen section.

**Tech Stack:** Svelte 5 runes, SvelteKit, vitest (`npm run test`), existing browse engine + drill.

**Spec:** `docs/superpowers/specs/2026-07-27-profile-lobby-design.md`

**Branch policy:** Work on `main` in the primary checkout. Do NOT create a worktree
(`.claude/rules/worktree-workflow.md` overrides the superpowers default).

**Commit policy:** Every commit uses an explicit pathspec —
`git commit -m "..." -- <paths>`. The index is shared with other agent sessions and
a bare `git commit` sweeps in their work
(`.claude/rules/commit-only-your-own-changes.md`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/features/creators/components/profile/stage/BandDoorway.svelte` | CREATE. Renders count + sample row + one action. Knows nothing about routing. |
| `src/lib/features/creators/components/profile/stage/doorway-policy.ts` | CREATE. Pure decisions: does a band become a doorway, how many samples. Unit-tested. |
| `src/lib/features/creators/components/profile/stage/ProfileStage.svelte` | MODIFY. Route Archive (always) and Collections (above threshold) through `BandDoorway`; own the handoff callbacks. |
| `src/lib/features/browse/gallery-home/GalleryDrill.svelte` | MODIFY. Add `initialSection` prop. |
| `tests/unit/doorway-policy.test.ts` | CREATE. Covers the threshold boundary and sample count. |

`doorway-policy.ts` exists so the threshold logic is testable without mounting a
component. Everything visual stays in `BandDoorway.svelte`.

---

### Task 1: Establish which pool each profile case must hand off to

This is a **spike, not a code change.** The spec marks it the hard prerequisite:
the doorway's count must come from the same pool the handoff lands in, or the
doorway lies. Nothing after this task is safe to build until it is answered.

**Files:** none modified.

- [ ] **Step 1: Start your own dev server**

Port 5173 is Austen's — never use it, never kill it. Before spawning, check the
budget (`.claude/rules/resource-budget.md`):

```bash
powershell -Command "(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue"
```

If under 4096, stop and report contention instead of spawning. Otherwise:

```bash
npx vite --port 5174
```

- [ ] **Step 2: Load your OWN profile and record the Archive count**

Launch your own Chrome (never drive Austen's signed-in window):

```
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList `
  '--remote-debugging-port=9222','--user-data-dir=C:\Users\Austen\.claude\chrome-profile', `
  '--force-device-scale-factor=1','about:blank'
```

Navigate to `https://localhost:5174/creators/PBp3GSBO6igCKPwJyLZNmVEmamI3` and run:

```js
() => ({ archiveCount: document.querySelectorAll('.band')[2]
  ?.querySelector('.band-count')?.textContent })
```

Expected: `"505"`. Record the exact number.

- [ ] **Step 3: Record what the community pool holds for that same author**

Navigate to the Browse gallery, open the drill's Author section, and read the
count shown for Austen Cloud. `getCount` is passed into `GalleryDrill`
(`GalleryDrill.svelte:62`) and the author section renders at `:865`.

Record that number.

- [ ] **Step 4: Decide, and write the answer into the spec**

Compare Step 2 and Step 3.

- **If they match:** one handoff works for both cases. Use `source: "community"`
  everywhere. Record this and simplify Task 5 accordingly.
- **If they differ (expected):** your own profile must hand off with
  `source: "my-library"` and another creator's with `source: "community"`, and
  each doorway's count must be read from the pool it opens. This is what the
  spec predicts.

Also load another creator's profile from the Creators list and check whether its
Archive count is even populated — `ProfileStage.svelte:67` calls
`getUserSequences(userId)` for any user, and Firestore rules may return only
public sequences or reject the read entirely. Record which.

Append the findings to the spec under the resolved-prerequisite section.

- [ ] **Step 5: Commit the finding**

```bash
git add docs/superpowers/specs/2026-07-27-profile-lobby-design.md
git commit -m "docs: record measured pool counts for the lobby handoff" -- docs/superpowers/specs/2026-07-27-profile-lobby-design.md
```

- [ ] **Step 6: Kill the server you started**

A dev server you spawned is yours to reap before the turn ends.

---

### Task 2: Doorway policy (pure, tested)

**Files:**
- Create: `src/lib/features/creators/components/profile/stage/doorway-policy.ts`
- Test: `tests/unit/doorway-policy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  shouldUseDoorway,
  COLLECTIONS_DOORWAY_THRESHOLD,
  sampleCount,
} from "$lib/features/creators/components/profile/stage/doorway-policy";

describe("shouldUseDoorway", () => {
  it("always returns true for the archive, even when tiny", () => {
    expect(shouldUseDoorway("archive", 0)).toBe(true);
    expect(shouldUseDoorway("archive", 3)).toBe(true);
    expect(shouldUseDoorway("archive", 505)).toBe(true);
  });

  it("keeps collections inline at and below the threshold", () => {
    expect(shouldUseDoorway("collections", COLLECTIONS_DOORWAY_THRESHOLD)).toBe(false);
    expect(shouldUseDoorway("collections", COLLECTIONS_DOORWAY_THRESHOLD - 1)).toBe(false);
  });

  it("flips collections to a doorway strictly above the threshold", () => {
    expect(shouldUseDoorway("collections", COLLECTIONS_DOORWAY_THRESHOLD + 1)).toBe(true);
  });

  it("uses 60 as the collections threshold", () => {
    expect(COLLECTIONS_DOORWAY_THRESHOLD).toBe(60);
  });
});

describe("sampleCount", () => {
  it("never exceeds the column cap, so the sample stays one row", () => {
    expect(sampleCount(505, 8)).toBe(8);
    expect(sampleCount(505, 4)).toBe(4);
  });

  it("shows everything when there is less than a row", () => {
    expect(sampleCount(3, 8)).toBe(3);
  });

  it("returns zero for an empty band", () => {
    expect(sampleCount(0, 8)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run --config tests/config/vitest.config.ts tests/unit/doorway-policy.test.ts
```

Expected: FAIL — cannot resolve `doorway-policy`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * When a band stops being a wall and becomes a way in.
 *
 * Split out of the component so the boundary is testable without mounting
 * anything — the threshold is the kind of off-by-one that hides well in CSS.
 */

export type DoorwayBand = "archive" | "collections";

/**
 * Collections stays inline while it is browsable and flips to a doorway once it
 * is a scroll. 60 is a judgement, not a measurement: two full rows at the widest
 * tier (8 columns) is 16, and roughly four screens of scrolling at typical tile
 * sizes lands near 60. Austen's account sits at 46 today, so the band stays
 * inline for him now and converts as he saves more.
 */
export const COLLECTIONS_DOORWAY_THRESHOLD = 60;

/**
 * The archive is ALWAYS a doorway, including when it is small. A band that is a
 * grid at 40 items and a doorway at 400 teaches two different interactions for
 * the same thing, and the empty/small case is exactly when a consistent way in
 * matters most.
 */
export function shouldUseDoorway(band: DoorwayBand, count: number): boolean {
  if (band === "archive") return true;
  return count > COLLECTIONS_DOORWAY_THRESHOLD;
}

/**
 * How many tiles the doorway shows. Capped at the column count so the sample is
 * exactly one row at every breakpoint — it is a taste of the work, not a grid.
 */
export function sampleCount(total: number, columns: number): number {
  if (total <= 0 || columns <= 0) return 0;
  return Math.min(total, columns);
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
npx vitest run --config tests/config/vitest.config.ts tests/unit/doorway-policy.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/creators/components/profile/stage/doorway-policy.ts tests/unit/doorway-policy.test.ts
git commit -m "feat(profile-stage): doorway policy with a tested threshold" -- src/lib/features/creators/components/profile/stage/doorway-policy.ts tests/unit/doorway-policy.test.ts
```

---

### Task 3: The BandDoorway component

**Files:**
- Create: `src/lib/features/creators/components/profile/stage/BandDoorway.svelte`

No component test. Per `.claude/rules/component-test-discipline.md` these are
written on-fix or for high-traffic shared primitives, not for every new
component. The logic worth guarding is already in `doorway-policy.ts`.

- [ ] **Step 1: Write the component**

```svelte
<!--
  BandDoorway — a band that shows a taste of its contents and a way in.

  The alternative it replaces is a wall: every item rendered, which for the
  Archive is 505 tiles and roughly a dozen screens. A doorway is not a button on
  empty space — it still shows real work, through the same ArtifactTile the
  grids use, so the band keeps its character. It just stops being exhaustive.

  Routing lives entirely in the parent. This component knows a count, some
  items, and one callback.
-->
<script lang="ts">
  import ArtifactTile from "./ArtifactTile.svelte";
  import { sampleCount } from "./doorway-policy";
  import type { LiveSlots, Medium } from "./live-slots.svelte";

  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  /** Mirrors ArtifactTile's own prop types exactly. `unknown` here would fail
   *  to assign to the tile's `sequence: SequenceData | null`. */
  type SampleItem = {
    key: string;
    medium: Medium;
    title: string;
    sequence?: SequenceData | null;
    poster?: string | null;
    tunnel?: unknown | null;
    scene?: unknown | null;
    mandala?: {
      steps: unknown[];
      variant: "blue" | "red" | "both";
      bluePropType?: string;
      redPropType?: string;
      pathShape?: "arc" | "linear" | "concave" | "hybrid";
    } | null;
  };

  let {
    slots,
    items,
    total,
    columns,
    actionLabel,
    onenter,
  }: {
    slots: LiveSlots;
    /** Newest-first. Only the first row is rendered. */
    items: SampleItem[];
    /** The REAL total, which is what the doorway promises. It must come from
     *  the same pool `onenter` lands in, or the doorway lies about itself. */
    total: number;
    /** Column count for this tier, from the caller's capFor(). */
    columns: number;
    actionLabel: string;
    onenter: () => void;
  } = $props();

  const shown = $derived(items.slice(0, sampleCount(items.length, columns)));
</script>

<div class="doorway">
  {#if shown.length > 0}
    <div class="sample" style:--cols={shown.length}>
      {#each shown as item (item.key)}
        <ArtifactTile
          {slots}
          medium={item.medium}
          title={item.title}
          sequence={item.sequence ?? null}
          poster={item.poster ?? null}
          tunnel={item.tunnel ?? null}
          scene={item.scene ?? null}
          mandala={item.mandala ?? null}
          size="sm"
        />
      {/each}
    </div>
  {/if}

  <!-- A button, not a text link: this is a standalone action
       (clickables-look-like-buttons.md). -->
  <button class="enter" type="button" onclick={onenter}>
    <span class="enter-label">{actionLabel}</span>
    <span class="enter-count">{total.toLocaleString()}</span>
  </button>
</div>

<style>
  /* Every measure in `em` — the stage rides a container-query font ramp, and a
     `rem` here would freeze at 1080p while its neighbours grew
     (4k-native-layout.md). */
  .doorway {
    display: flex;
    flex-direction: column;
    gap: 0.85em;
  }

  /* Exactly the rendered count, so the sample is always one full row with no
     stranded track — never auto-fill (4k-native-layout.md). */
  .sample {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: clamp(0.75em, 1.2cqw, 1.25em);
    align-items: start;
  }

  .enter {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75em;
    align-self: center;
    min-height: 44px; /* touch-target floor: px on purpose, must not scale */
    padding: 0.6em 1.5em;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75em;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: 0.9375em;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--duration-normal) ease;
  }

  .enter:hover {
    background: var(--theme-card-hover-bg);
  }

  .enter-count {
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim);
    font-weight: 500;
  }

  @media (prefers-reduced-motion: reduce) {
    .enter {
      transition: none;
    }
  }
</style>
```

- [ ] **Step 2: Verify it compiles**

```bash
npx vite build --mode development
```

Expected: no error mentioning `BandDoorway`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/creators/components/profile/stage/BandDoorway.svelte
git commit -m "feat(profile-stage): BandDoorway shows a sample row and one way in" -- src/lib/features/creators/components/profile/stage/BandDoorway.svelte
```

---

### Task 4: Let GalleryDrill open on a chosen section

The drill's `section` is internal `$state` seeded by `restoreSection()` from
sessionStorage, and `Props` (`GalleryDrill.svelte:60-95`) has no way to set it.
This adds the missing prop. Nothing else in the drill changes.

**Files:**
- Modify: `src/lib/features/browse/gallery-home/GalleryDrill.svelte:93` (Props), `:105` (destructure), `:131-140` (`restoreSection`)

- [ ] **Step 1: Add the prop to the interface**

In the `Props` interface, directly after the `variant` prop:

```ts
    /** Open straight onto a sub-screen instead of the chooser. A caller that
     *  already knows HOW the user wants to browse — e.g. a profile handing off
     *  "all of this creator's work" — should not make them pick that again.
     *  Page variant only: the sheet is a transient drawer and always opens
     *  fresh. Takes precedence over the restored sessionStorage section. */
    initialSection?: Section;
```

Note `Section` is declared BELOW `Props` today. Move the `type Section` and
`SECTIONS` declarations ABOVE the `interface Props` block so the interface can
reference the type.

- [ ] **Step 2: Destructure it**

Add `initialSection,` to the `let { ... }: Props = $props();` block, after `variant`.

- [ ] **Step 3: Honour it in restoreSection**

Replace the body of `restoreSection()`:

```ts
  function restoreSection(): Section {
    // An explicit caller intent beats both the drawer rule and the stored
    // section — a handoff that lands on the chooser has failed at its one job.
    if (initialSection) return initialSection;
    if (variant !== "page") return "chooser";
    const stored = getDrillSection();
    return stored && (SECTIONS as readonly string[]).includes(stored)
      ? (stored as Section)
      : "chooser";
  }
```

- [ ] **Step 4: Verify no existing caller broke**

`initialSection` is optional and defaults to undefined, so all four existing
hosts keep their behaviour. Confirm they still compile:

```bash
npx vite build --mode development
```

Expected: no errors. The hosts are `BrowseModule.svelte:502`,
`AddSequencesSheet.svelte:158`, `SmartCollectionBuilderSheet.svelte:171`,
`GalleryFilterSheet.svelte:77`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/browse/gallery-home/GalleryDrill.svelte
git commit -m "feat(browse): GalleryDrill can open on a chosen section" -- src/lib/features/browse/gallery-home/GalleryDrill.svelte
```

---

### Task 5: Wire the Archive band to the doorway

**Files:**
- Modify: `src/lib/features/creators/components/profile/stage/ProfileStage.svelte`

- [ ] **Step 1: Import the new pieces**

Add to the import block:

```ts
  import BandDoorway from "./BandDoorway.svelte";
  import { shouldUseDoorway } from "./doorway-policy";
  import { goto } from "$app/navigation";
  import { buildCreatorPath } from "$lib/shared/navigation/services/creator-routes";
```

- [ ] **Step 2: Add the handoff**

After the `capFor` function:

```ts
  /**
   * Where "see all their sequences" goes.
   *
   * The doorway promises a number. Landing somewhere that holds a DIFFERENT
   * number is the defect this whole design turns on, so the source here must be
   * the one whose count is rendered above it.
   *
   * Own profile reads the private library (getUserSequences, above), so it must
   * open my-library. Another creator's profile can only show published work, so
   * it opens the community pool filtered to them.
   */
  const isOwnProfile = $derived(userId === authState.user?.uid);

  function enterArchive(): void {
    const url = new URL("/browse", window.location.origin);
    url.searchParams.set("source", isOwnProfile ? "my-library" : "community");
    if (!isOwnProfile) {
      url.searchParams.set("drill", "author");
      url.searchParams.set("author", userId);
    }
    void goto(`${url.pathname}${url.search}`);
  }
```

Requires `import { authState } from "$lib/shared/auth/state/auth-state.svelte";`.

**Two things to confirm against the code before this compiles as written:**

1. **The Browse route path.** `/browse` is the assumed path. Confirm it by
   reading how `creators-routing.svelte.ts` navigates — it uses
   `handleModuleChange` from
   `$lib/shared/navigation-coordinator/navigation-coordinator.svelte` plus
   `pushState`, not a bare `goto`. If Browse is a module panel rather than a
   route, use `handleModuleChange("browse")` and set the drill state the same
   way `openCreatorProfile` sets creator state, instead of a URL.
2. **Whether Browse reads `source` / `drill` / `author` from the URL.** Task 1
   Step 3 tells you whether anything in this path is URL-addressable. Per the
   spec's correction, nothing is today — so this almost certainly needs a small
   reader added on the Browse side, wired to `initialSection` (Task 4) and the
   engine's `source` setter. Add that as Task 5b rather than skipping it.

If Task 1 showed the two counts MATCH, delete the `isOwnProfile` branch and
always use `community` — simpler, and the plan is better for it.

- [ ] **Step 3: Replace the Archive grid with the doorway**

Replace the Archive `<section>` body's `{:else}` branch:

```svelte
      {#if loading}
        <PanelState type="loading" message="Loading your library..." />
      {:else if shouldUseDoorway("archive", sequences.length)}
        <BandDoorway
          {slots}
          total={sequences.length}
          columns={capFor("archive")}
          actionLabel="Browse all sequences"
          onenter={enterArchive}
          items={archive.slice(0, capFor("archive")).map((s) => ({
            key: s.id,
            medium: "sequence" as const,
            title: s.word || s.name || "Untitled",
            sequence: s,
          }))}
        />
      {/if}
```

- [ ] **Step 4: Drop the now-dead archiveCap**

`archiveCap` existed only to stop the wall being 505 tiles. The doorway removes
the wall, so remove the prop, its doc comment, and the `archive` derivation's
`.slice(0, archiveCap)` — replace with `sortedSequences` and let the doorway
take its own row.

- [ ] **Step 5: Verify it compiles and the page loads**

```bash
npx vite build --mode development
```

Then load the profile and confirm the Archive shows one row plus a button.

- [ ] **Step 6: Commit**

```bash
git add src/lib/features/creators/components/profile/stage/ProfileStage.svelte
git commit -m "feat(profile): the Archive becomes a doorway" -- src/lib/features/creators/components/profile/stage/ProfileStage.svelte
```

---

### Task 6: Collections threshold

**Files:**
- Modify: `src/lib/features/creators/components/profile/stage/ProfileStage.svelte`

- [ ] **Step 1: Add the handoff**

```ts
  /** Collections opens the medium the filter is currently showing, so the
   *  handoff continues the narrowing the user already did instead of
   *  resetting it. "All" opens whichever medium they have most of — the one
   *  they most likely wanted. */
  function dominantMedium(): Medium {
    const counts: Record<string, number> = {};
    for (const e of collectionEntries) counts[e.medium] = (counts[e.medium] ?? 0) + 1;
    let best: Medium = "mandala";
    let bestCount = -1;
    for (const [medium, n] of Object.entries(counts)) {
      if (n > bestCount) {
        best = medium as Medium;
        bestCount = n;
      }
    }
    return best;
  }

  function enterCollections(): void {
    const medium = collectionFilter === "all" ? dominantMedium() : collectionFilter;
    void goto(`/collections/${medium}`);
  }
```

**Confirm the target before writing this.** `/collections/{medium}` is assumed.
The real hosts are the three playground tabs wired in
`MyCollectionsPanel.svelte:32-34`, each mounting `CollectionGalleryDetail`. Read
that file and use whatever navigation those tabs actually use — if they are tabs
inside a panel rather than routes, this becomes a tab-selection call, not a
`goto`. Do not invent a route that does not exist.

- [ ] **Step 2: Branch the Collections band**

Wrap the existing grid:

```svelte
        {#if shouldUseDoorway("collections", visibleCollection.length)}
          <BandDoorway
            {slots}
            total={visibleCollection.length}
            columns={capFor("collection")}
            actionLabel="Browse all collections"
            onenter={enterCollections}
            items={visibleCollection.slice(0, capFor("collection")).map((e) => ({
              key: e.id,
              medium: e.medium,
              title: e.title,
              poster: e.poster,
              scene: e.scene,
              tunnel: e.tunnel,
              mandala: e.mandala,
            }))}
          />
        {:else}
          <!-- existing grid, unchanged -->
        {/if}
```

The filter chips stay ABOVE this branch — they are how you narrow before
entering, and they are what `enterCollections` reads.

- [ ] **Step 3: Verify both sides of the threshold**

Austen's account has 46, so the inline path renders today. To see the doorway
path without saving 15 collections, temporarily lower
`COLLECTIONS_DOORWAY_THRESHOLD` to 10, reload, confirm the doorway appears, then
**restore it to 60**. Do not commit the lowered value.

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/creators/components/profile/stage/ProfileStage.svelte
git commit -m "feat(profile): Collections converts to a doorway past its threshold" -- src/lib/features/creators/components/profile/stage/ProfileStage.svelte
```

---

### Task 7: Verification pass

The spec's criteria are measured, not eyeballed. This task produces the evidence.

**Files:** none modified unless a defect is found.

- [ ] **Step 1: Measure the page height before and after**

The wall is gone only if the number says so. On the profile:

```js
() => ({ scrollHeight: document.documentElement.scrollHeight,
         viewport: window.innerHeight })
```

Record it. Compare against the pre-change value (the wall was ~12 screens).

- [ ] **Step 2: Confirm the hero and Showcase are both above the fold at 1920x1080**

`resize_page(1920, 1080)`, then:

```js
() => {
  const hero = document.querySelector('.hero-section');
  const showcase = document.querySelector('.showcase-grid');
  const b = (e) => e ? Math.round(e.getBoundingClientRect().bottom) : null;
  return { heroBottom: b(hero), showcaseBottom: b(showcase), fold: window.innerHeight };
}
```

Expected: `showcaseBottom <= fold`. If not, report the number — do not claim
arrival is fixed.

- [ ] **Step 3: Take both handoffs in the browser**

Click "Browse all sequences". Confirm you land on the author's work and that the
result count matches the number the doorway displayed. Press Back and confirm
you return to the profile. Repeat for Collections.

A count mismatch here is the failure the spec is built around — report it rather
than adjusting the label to match.

- [ ] **Step 4: Screenshot the required viewports**

1920x1080, 2560x1440, 1440x900, 820x1180, 960x412, 375x667, plus 3840x2160 if
`resize_page` reaches it (it capped at 3000 in prior sessions — say so if it
does again). Use `format: "webp", quality: 70`.

Check each frame for: a stranded sample row, a button stretched across the band,
the doorway floating with nothing behind it, horizontal overflow at 375.

- [ ] **Step 5: Full typecheck**

One cold run, captured to a log so it can be re-filtered for free
(`.claude/rules/fast-iteration-loop.md`):

```bash
npm run check > /tmp/check.log 2>&1
grep -niE "error" /tmp/check.log
```

Expected: no errors in the files this plan touched.

- [ ] **Step 6: Run the unit suite**

```bash
npm run test:ci
```

Expected: PASS, including `doorway-policy.test.ts`.

- [ ] **Step 7: Update the ledger and commit**

Mark item 12 done in
`docs/superpowers/specs/active/2026-07-27-profile-stage-feedback-ledger.md` and
move the Archive-sea entry from Open to Settled.

```bash
git commit -m "docs: lobby shipped; ledger updated" -- docs/superpowers/specs/active/2026-07-27-profile-stage-feedback-ledger.md
```

---

## Known defects NOT in scope

Carried from the spec so they are not mistaken for regressions this plan caused:

1. `WordHeader` garbles long words (`Ω⊖SX⚹Ω⚹W` — dashes colliding with glyphs).
2. Black quads in the 3D scene preview.
3. Stored 3D-scene names are wrong in Firestore (`"FΨFΨFΨFΨ — 3D scene"`).
4. `ProfileShowcase.svelte` / `ProfileTabs.svelte` unreferenced but not deleted.
5. `.profile-layout` caps at `max-width: 1920px` (540px dead rail at 3000px).
