# Composer One Sequence, Carried: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sequence playing in the `/composer` hero the page's one sequence: carried into Construct, Generate, the tunnel, 3D and Keep, named on every stop in notation glyphs, frozen once the visitor touches or leaves the hero, with the hero rebalanced and three hard gates (phone 3D poster, pause visible at rest, truth matrix) closed.

**Architecture:** A pure reducer in `composer-sequence-ownership.ts` owns a `{ sequence, source }` page state with last-write-wins. `ComposerExperience.svelte` feeds it from the hero act (which gains a `hold()`), Construct, Generate and the tunnel, and reads it for every lower stop. A new `ComposerWordRow.svelte` replaces the two existing word rows and is added to the tunnel and 3D stops. Shared components gain opt-in props only (`toolbar` snippet on `SequenceHeroDemo`, `cornerToggleAtRest` on `AnimatorCanvas` and `InlineAnimationPlayer`, an accessible name on `DifficultyBadge`), so their other hosts are unchanged.

**Tech Stack:** SvelteKit, Svelte 5 runes and snippets, Vitest (jsdom project, `tests/config/vitest.config.ts`), Prettier, the repository's `wt:finish` guarded integration.

**Spec:** `docs/superpowers/specs/2026-10-07-composer-one-sequence-carried-design.md`. Two corrections to it land in Task 11: the page's tunnel uses the `band` layout (not `square`), and the Keep stop's featured card is the landing's `ChoreoCardPreview` rendered as a static picture in the section intro, not a clickable gallery thumbnail.

**Worktree:** `E:/worktrees/tka-platform/composer-one-sequence`, branch `codex/composer-one-sequence`. Run every command from that directory. Never touch port 5173. Commit only the paths each task lists, with the pathspec form shown. Every commit message ends with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File structure

| Path                                                                                             | Responsibility                                                                                                  |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `src/routes/(public)/composer/_components/composer-sequence-ownership.ts`                        | Pure rules: page sequence reducer, caption by origin, Generate's adoption rule, Construct ownership (existing). |
| `src/routes/(public)/composer/_components/__tests__/composer-sequence-ownership.test.ts`         | New. Unit tests for the rules above.                                                                            |
| `src/lib/shared/landing/data/hero-act.svelte.ts`                                                 | Hero act gains `hold()` and `held`.                                                                             |
| `src/lib/shared/landing/data/__tests__/hero-act.test.ts`                                         | New hold tests appended.                                                                                        |
| `src/routes/(public)/composer/_components/ComposerExperience.svelte`                             | The page: page sequence state, hold triggers, word rows, Keep intro, hero toolbar, phone poster, alphabet fold. |
| `src/routes/(public)/composer/_components/ComposerWordRow.svelte`                                | New. One word row: prop chooser, `WordLabel`, optional hint and trailing content.                               |
| `src/routes/(public)/composer/_sections/ConstructSection.svelte`                                 | Uses `ComposerWordRow`.                                                                                         |
| `src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte`                           | Uses `ComposerWordRow`; adoption rule without the local flag; pause at rest.                                    |
| `src/routes/(public)/composer/_components/ComposerTunnelDemo.svelte`                             | Band layout gets the word row; prop chooser moves into it.                                                      |
| `src/routes/(public)/composer/_components/ComposerGalleryDemo.svelte`                            | Header becomes "Or start from the community."                                                                   |
| `src/routes/(public)/composer/_components/ProjectStory.svelte`                                   | Gains Guide and Common questions links.                                                                         |
| `src/lib/shared/landing/components/SequenceHeroDemo.svelte`                                      | Optional `toolbar` snippet; threads `cornerToggleAtRest`.                                                       |
| `src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte` | Threads `cornerToggleAtRest`.                                                                                   |
| `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte`                               | `cornerToggleAtRest` prop and CSS.                                                                              |
| `src/lib/shared/components/DifficultyBadge.svelte`                                               | Accessible name.                                                                                                |
| `src/routes/(public)/composer/presentation-guardrails.md`                                        | Story and stage rules updated.                                                                                  |
| `src/routes/(public)/composer/feature-truth-matrix.md`                                           | Tunnel, generator and accessibility rows corrected.                                                             |
| `docs/superpowers/specs/2026-10-07-composer-one-sequence-carried-design.md`                      | Two corrections (Task 11).                                                                                      |

---

### Task 1: Page sequence reducer and caption

**Files:**

- Modify: `src/routes/(public)/composer/_components/composer-sequence-ownership.ts`
- Create: `src/routes/(public)/composer/_components/__tests__/composer-sequence-ownership.test.ts`
- Modify: `tests/unit/composer-presentation-state.test.ts` (drop its four cases
  for the deleted carry helpers and the old adoption signature; keep the
  construct-ownership case)

> Executed 2026-10-07. The review follow-up commit also added three reducer
> tests (a new draw from the same source replaces the old one; the same
> sequence from a new source changes the source; the exact object given is
> carried) and made `featuredCaption` exhaustive with a `never` default.

- [ ] **Step 1: Write the failing tests**

Create `src/routes/(public)/composer/_components/__tests__/composer-sequence-ownership.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  carryPageSequence,
  featuredCaption,
  openingPageSequence,
  shouldAdoptCarriedSequence,
} from "../composer-sequence-ownership";

function seq(id: string): SequenceData {
  return { id, name: id, word: id, steps: [] } as unknown as SequenceData;
}

describe("page sequence", () => {
  it("opens on the baked opening with source opening", () => {
    const state = openingPageSequence(seq("opening"));
    expect(state.sequence.id).toBe("opening");
    expect(state.source).toBe("opening");
  });

  it("last write wins across every source", () => {
    let state = openingPageSequence(seq("opening"));
    state = carryPageSequence(state, "hero", seq("hero-1"));
    expect(state).toEqual({ sequence: seq("hero-1"), source: "hero" });
    state = carryPageSequence(state, "construct", seq("built"));
    expect(state).toEqual({ sequence: seq("built"), source: "construct" });
    state = carryPageSequence(state, "generate", seq("drawn"));
    expect(state).toEqual({ sequence: seq("drawn"), source: "generate" });
    state = carryPageSequence(state, "tunnel", seq("tunnel-draw"));
    expect(state).toEqual({ sequence: seq("tunnel-draw"), source: "tunnel" });
    state = carryPageSequence(state, "hero", seq("hero-2"));
    expect(state).toEqual({ sequence: seq("hero-2"), source: "hero" });
  });

  it("ignores a missing sequence", () => {
    const state = openingPageSequence(seq("opening"));
    expect(carryPageSequence(state, "generate", null)).toBe(state);
    expect(carryPageSequence(state, "generate", undefined)).toBe(state);
  });

  it("returns the same state for the same id from the same source", () => {
    const state = carryPageSequence(
      openingPageSequence(seq("opening")),
      "hero",
      seq("hero-1")
    );
    expect(carryPageSequence(state, "hero", seq("hero-1"))).toBe(state);
  });

  it("captions the featured card by origin", () => {
    expect(featuredCaption("opening")).toBe("The sequence playing above.");
    expect(featuredCaption("hero")).toBe("The sequence playing above.");
    expect(featuredCaption("construct")).toBe("The sequence you built.");
    expect(featuredCaption("generate")).toBe("The sequence you generated.");
    expect(featuredCaption("tunnel")).toBe("The sequence you generated.");
  });
});

describe("shouldAdoptCarriedSequence", () => {
  it("adopts a different sequence while in view", () => {
    expect(shouldAdoptCarriedSequence(seq("a"), seq("b"), true)).toBe(true);
    expect(shouldAdoptCarriedSequence(null, seq("b"), true)).toBe(true);
  });

  it("does not adopt its own sequence, out of view, or nothing", () => {
    expect(shouldAdoptCarriedSequence(seq("a"), seq("a"), true)).toBe(false);
    expect(shouldAdoptCarriedSequence(seq("a"), seq("b"), false)).toBe(false);
    expect(shouldAdoptCarriedSequence(seq("a"), null, true)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npx vitest run --config tests/config/vitest.config.ts "src/routes/(public)/composer/_components/__tests__/composer-sequence-ownership.test.ts"
```

Expected: FAIL, "carryPageSequence" is not exported (and the adoption test fails on the three-argument signature).

- [ ] **Step 3: Rewrite the ownership module**

Replace the whole of `src/routes/(public)/composer/_components/composer-sequence-ownership.ts` with:

```ts
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/** Where the page's one sequence came from. The hero's draws, a Construct
 * build, and a Generate or tunnel draw all write the same slot. */
export type PageSequenceSource =
  | "opening"
  | "hero"
  | "construct"
  | "generate"
  | "tunnel";

export interface PageSequence {
  sequence: SequenceData;
  source: PageSequenceSource;
}

/** The baked opening keeps the lower demonstrations usable before the hero
 * has drawn anything live. */
export function openingPageSequence(opening: SequenceData): PageSequence {
  return { sequence: opening, source: "opening" };
}

/** Last write wins. A missing sequence never replaces the current one, and
 * the same sequence from the same source returns the same state object so a
 * reactive effect that carries it does not loop. */
export function carryPageSequence(
  state: PageSequence,
  source: PageSequenceSource,
  next: SequenceData | null | undefined
): PageSequence {
  if (!next) return state;
  if (state.sequence.id === next.id && state.source === source) return state;
  return { sequence: next, source };
}

/** One honest line under the Keep stop's card. */
export function featuredCaption(source: PageSequenceSource): string {
  switch (source) {
    case "construct":
      return "The sequence you built.";
    case "generate":
    case "tunnel":
      return "The sequence you generated.";
    default:
      return "The sequence playing above.";
  }
}

/** The generator catches up to the page sequence when it is in view and the
 * page holds a different sequence. Its own draws set the page sequence, so
 * the next incoming id equals its current id and nothing churns. */
export function shouldAdoptCarriedSequence(
  current: SequenceData | null,
  incoming: SequenceData | null,
  inViewport: boolean
): incoming is SequenceData {
  return inViewport && incoming !== null && incoming.id !== current?.id;
}

/** The construct attract act is allowed to animate its own panel, but only a
 * real visitor interaction may carry that work into the rest of the page. */
export function isVisitorOwnedConstructSequence(
  visitorOwnsBuild: boolean,
  candidate: SequenceData | null
): candidate is SequenceData {
  return visitorOwnsBuild && candidate !== null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run the same command as Step 2. Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(public)/composer/_components/composer-sequence-ownership.ts" "src/routes/(public)/composer/_components/__tests__/composer-sequence-ownership.test.ts"
git commit -m "feat(composer): page sequence reducer with origin

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -- "src/routes/(public)/composer/_components/composer-sequence-ownership.ts" "src/routes/(public)/composer/_components/__tests__/composer-sequence-ownership.test.ts"
```

Note: `ComposerExperience.svelte` and `ComposerGenerateDemo.svelte` no longer type-check until Tasks 3 and 4. That is expected inside this branch.

---

### Task 2: Hero act hold

**Files:**

- Modify: `src/lib/shared/landing/data/hero-act.svelte.ts`
- Modify: `src/lib/shared/landing/data/__tests__/hero-act.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the first `describe("createHeroAct", () => { ... })` block in `src/lib/shared/landing/data/__tests__/hero-act.test.ts`, after the test named "commits the replacement sequence and prop together on a manual reroll":

```ts
it("hold() stops the loop-boundary handoff but leaves the dice press working", async () => {
  const act = createStaffFirstAct();
  act.start();
  await flushPrefetch(); // FAN pre-generation lands
  const heldId = act.sequence?.id;
  expect(act.held).toBe(false);

  act.hold();
  act.hold(); // idempotent
  expect(act.held).toBe(true);

  for (let i = 0; i < PASSES_PER_SEQUENCE + 2; i++) {
    expect(act.offerSequenceBoundary()).toBeNull();
  }
  expect(act.sequence?.id).toBe(heldId);
  expect(act.propType).toBe(PropType.STAFF);

  await act.advanceNow();
  expect(act.sequence?.id).not.toBe(heldId);
  expect(act.propType).toBe(PropType.FAN);
  expect(act.held).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest run --config tests/config/vitest.config.ts src/lib/shared/landing/data/__tests__/hero-act.test.ts -t "hold()"
```

Expected: FAIL, "act.hold is not a function".

- [ ] **Step 3: Add hold to the act**

In `src/lib/shared/landing/data/hero-act.svelte.ts`, directly after the line `let started = false;`, add:

```ts
// Once a visitor touches the hero or leaves it, the act stops advancing on
// its own so the word they saw stays the page's word. A dice press still
// advances. There is no release; a reload starts fresh.
let held = $state(false);

function hold(): void {
  held = true;
}
```

In `offerSequenceBoundary`, make the first lines read:

```ts
  function offerSequenceBoundary(): PreparedSequenceHandoff | null {
    passesSinceAdvance += 1;
    if (held) return null;
    if (passesSinceAdvance < PASSES_PER_SEQUENCE) return null;
    if (busy || !preparedNext) return null;
```

In the returned object, after `get rerolling() { return busy; },` add:

```ts
    get held() {
      return held;
    },
    hold,
```

- [ ] **Step 4: Run the hero act tests**

Run:

```bash
npx vitest run --config tests/config/vitest.config.ts src/lib/shared/landing/data/__tests__/hero-act.test.ts
```

Expected: PASS, every existing test plus the new one.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/landing/data/hero-act.svelte.ts src/lib/shared/landing/data/__tests__/hero-act.test.ts
git commit -m "feat(hero-act): hold() keeps the current sequence at loop boundaries

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -- src/lib/shared/landing/data/hero-act.svelte.ts src/lib/shared/landing/data/__tests__/hero-act.test.ts
```

---

### Task 3: Wire the page sequence and the hold into the page

**Files:**

- Modify: `src/routes/(public)/composer/_components/ComposerExperience.svelte`
- Modify: `tests/unit/landing-route-morph.test.ts` (its source assertions on
  the old latch become assertions on the page sequence and the hold)

> Executed 2026-10-07, then amended by the review follow-up: the page sequence
> is `$state.raw`, and the hold follows the hero stop leaving view instead of
> Construct's near-activation (the stage keeps the next stop inside the window
> so it loads early, which would have held the hero at load). The steps below
> are the amended version.
>
> Second follow-up, same day: the stage poses every stop when it takes over,
> before the IntersectionObserver's first entry, and the visibility helper's
> MutationObserver reported that pose as "not visible", which held the hero at
> load on desktop. `observeComposerStopVisibility` now ignores style changes
> until the first measurement (test: "ignores stage style changes until the
> viewport has been measured"), and the hold lives in
> `src/routes/(public)/composer/_components/hold-when-stop-leaves.ts`
> (`holdWhenStopLeaves(node, hold)`, four tests in
> `__tests__/hold-when-stop-leaves.test.ts`: no hold on a pre-measurement
> pose, one hold when the stop leaves the viewport, hold when the stage takes
> its pointer events, hold at once on a deep link). It releases its observers
> after the hold. The page's `holdWhenHeroLeaves` is now the one-line wrapper
> shown below.

- [ ] **Step 1: Replace the carry state**

In the `<script>` of `ComposerExperience.svelte`, change the import line

```ts
import { resolveComposerCarriedSequence } from "./composer-sequence-ownership";
```

to

```ts
import {
  carryPageSequence,
  featuredCaption,
  openingPageSequence,
  type PageSequenceSource,
} from "./composer-sequence-ownership";
```

and change the `svelte` import

```ts
import { flushSync, onMount } from "svelte";
```

to

```ts
import { flushSync, onMount, untrack } from "svelte";
```

Replace this whole block:

```ts
// A sequence the visitor composed or generated further down the page takes
// over the carry; until then the bands hold the hero's FIRST draw.
let visitorSequence = $state<SequenceData | null>(null);

// The lower demos hold one live hero draw. Rebuilding their readers on every
// hero loop is distracting, and a visitor's own sequence always takes over.
let latchedHeroSequence = $state<SequenceData | null>(null);
$effect(() => {
  const first = heroAct.sequence;
  if (first && first.id !== FALLBACK_DEMO.id && !latchedHeroSequence) {
    latchedHeroSequence = first;
  }
});
const carriedSequence = $derived(
  resolveComposerCarriedSequence(
    visitorSequence,
    latchedHeroSequence,
    FALLBACK_DEMO
  )
);
```

with:

```ts
// The page has one sequence. The hero's live draws write it until the
// visitor builds or generates one further down; after that, last write
// wins. The baked opening keeps the lower demonstrations usable before the
// hero has drawn anything live. Raw, not deep: every write replaces the
// whole object, and the tunnel compares the sequence it receives by
// reference, so a proxy would make it re-prepare the same sequence.
let pageSequence = $state.raw(openingPageSequence(FALLBACK_DEMO));

function carryFrom(source: PageSequenceSource) {
  return (next: SequenceData) => {
    pageSequence = carryPageSequence(pageSequence, source, next);
  };
}
const carryConstruct = carryFrom("construct");
const carryGenerate = carryFrom("generate");
const carryTunnel = carryFrom("tunnel");

// Every live hero draw becomes the page's sequence. Before the hold the
// reader is still at the hero and the lower demos are not mounted, so the
// auto-rolls cost nothing downstream; after it the hero only changes on
// Roll. The reducer returns the same object for an unchanged id, and the
// write is untracked, so this effect cannot feed itself.
$effect(() => {
  const drawn = heroAct.sequence;
  if (!drawn || drawn.id === FALLBACK_DEMO.id) return;
  untrack(() => {
    pageSequence = carryPageSequence(pageSequence, "hero", drawn);
  });
});

// The hero stops rolling on its own once the visitor touches it or leaves
// it, so the word they saw is the word the page carries.
function holdHero(): void {
  heroAct.hold();
}

// The stage keeps the next stop inside the window so it loads early, so
// "near Construct" would hold the hero at load. The hero is held instead
// once its stop is no longer the one being read; see holdWhenStopLeaves.
function holdWhenHeroLeaves(node: HTMLElement) {
  return holdWhenStopLeaves(node, holdHero);
}
```

(`import { holdWhenStopLeaves } from "./hold-when-stop-leaves";` sits next to
the `observeComposerStopVisibility` import, which the tunnel still uses.)

- [ ] **Step 2: Delete the old carry function and hold when the hero leaves**

Delete

```ts
function carryVisitorSequence(next: SequenceData): void {
  visitorSequence = next;
}
```

`activateConstruct` is unchanged: its near-activation fires while the reader
is still at the hero on the stage. Instead, add `use:holdWhenHeroLeaves` as
the last attribute of the hero section's opening tag
(`observeComposerStopVisibility` is already imported by the page):

```svelte
<section
  class="opening"
  aria-labelledby="composer-title"
  style:view-transition-name="launchpad-composer"
  use:holdWhenHeroLeaves
>
```

- [ ] **Step 3: Point every reader at the page sequence**

Run:

```bash
grep -n "carriedSequence\|carryVisitorSequence\|visitorSequence\|latchedHeroSequence" "src/routes/(public)/composer/_components/ComposerExperience.svelte"
```

Expected: seven hits, all inside demo `props` objects or the tunnel's `active` attribute (Construct's `onVisitorComposed`, Generate's `sequence` and `onGenerated`, the tunnel's `active`, `sequence` and `onGenerated`, and the portal viewer's `sequence`). Replace each:

- every `sequence: carriedSequence,` (three of them: Generate, tunnel, portal viewer) becomes `sequence: pageSequence.sequence,`
- `active={tunnelActive && tunnelVisible && !!carriedSequence}` becomes `active={tunnelActive && tunnelVisible}`
- Construct's `onVisitorComposed: carryVisitorSequence,` becomes `onVisitorComposed: carryConstruct,`
- Generate's `onGenerated: carryVisitorSequence,` becomes `onGenerated: carryGenerate,`
- the tunnel's `onGenerated: carryVisitorSequence,` becomes `onGenerated: carryTunnel,`

Re-run the grep. Expected: no hits.

In `tests/unit/landing-route-morph.test.ts`, replace the comment that starts
"// The tunnel and 3D bands open on the baked fixture, then latch the first"
and the six assertions after it (from `sequence={heroAct.sequence}` to
`not.toContain("{#key carriedSequence?.id}")`) with:

```ts
// The tunnel and 3D bands open on the baked fixture; every live hero
// draw becomes the page sequence, written untracked, and the hero is
// held once the reader leaves it, so a Threlte scene is never torn down
// under a reader.
expect(composer).toContain("sequence={heroAct.sequence}");
expect(composer).toContain("FALLBACK_DEMO");
expect(composer).toContain(
  "let pageSequence = $state.raw(openingPageSequence(FALLBACK_DEMO));"
);
expect(composer).toContain(
  'pageSequence = carryPageSequence(pageSequence, "hero", drawn);'
);
expect(composer).toContain("use:holdWhenHeroLeaves");
expect(composer).toContain("heroAct.hold();");
expect(composer).not.toContain("{#key pageSequence");
```

- [ ] **Step 4: Hold on the first touch of the player column**

Change the hero's player wrapper opening tag

```svelte
    <div class="opening-player">
```

to

```svelte
    <div
      class="opening-player"
      onpointerdowncapture={holdHero}
      onkeydowncapture={holdHero}
    >
```

- [ ] **Step 5: Tests and the type gate**

Run:

```bash
npx vitest run --config tests/config/vitest.config.ts tests/unit/landing-route-morph.test.ts tests/unit/composer-presentation-state.test.ts
npm run check:fast 2>&1 | tail -20
```

Expected: both test files pass; no errors in `ComposerExperience.svelte`. Errors in `ComposerGenerateDemo.svelte` about `shouldAdoptCarriedSequence` arguments are expected until Task 4.

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(public)/composer/_components/ComposerExperience.svelte" tests/unit/landing-route-morph.test.ts
git commit -m "feat(composer): one page sequence, held once the visitor touches the hero

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -- "src/routes/(public)/composer/_components/ComposerExperience.svelte" tests/unit/landing-route-morph.test.ts
```

---

### Task 4: Generate adopts without the local flag

**Files:**

- Modify: `src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte`

- [ ] **Step 1: Remove the flag**

Delete the line `let hasGeneratedLocally = $state(false);` and, inside `generate()`, the line `hasGeneratedLocally = true;`.

Replace

```ts
$effect(() => {
  if (
    shouldAdoptCarriedSequence(
      current,
      sequence,
      hasGeneratedLocally,
      inViewport
    )
  ) {
    current = sequence;
  }
});
```

with

```ts
// The page sequence changes when the hero rolls or Construct composes; the
// generator shows it when it is in view. Its own draws write the page
// sequence first, so they never read back as a change.
$effect(() => {
  if (shouldAdoptCarriedSequence(current, sequence, inViewport)) {
    current = sequence;
  }
});
```

- [ ] **Step 2: Type-check**

Run:

```bash
npm run check:fast 2>&1 | tail -20
```

Expected: no errors in the two composer components.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte"
git commit -m "fix(composer): generator adopts the page sequence by id alone

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -- "src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte"
```

---

### Task 5: One word row for Construct and Generate

**Files:**

- Create: `src/routes/(public)/composer/_components/ComposerWordRow.svelte`
- Modify: `src/routes/(public)/composer/_sections/ConstructSection.svelte`
- Modify: `src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte`

- [ ] **Step 1: Create the row**

Create `src/routes/(public)/composer/_components/ComposerWordRow.svelte`:

```svelte
<!--
  ComposerWordRow

  The one word row every /composer demonstration shows: the host's prop
  chooser at the start, the app's own WordLabel (TKA glyphs, letter
  highlighting during playback) on the center line, and an optional trailing
  control. The chooser sits outside the live region so changing props is not
  announced as a new word. The fixed height keeps the grid below from moving
  when a hint swaps for a word.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import WordLabel from "$lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte";

  let {
    word = "",
    activeStepNumber = null,
    live = "off",
    hint,
    propControl,
    trailing,
  }: {
    word?: string;
    /** 1-indexed beat during playback; highlights that letter. */
    activeStepNumber?: number | null;
    /** "polite" when a visitor action changes the word; "off" for an attract act. */
    live?: "polite" | "off";
    /** Shown in the word's place while there is no word yet. */
    hint?: Snippet;
    propControl?: Snippet;
    trailing?: Snippet;
  } = $props();

  const balanced = $derived(!!propControl || !!trailing);
</script>

<header class="word-row" class:balanced>
  <div class="row-prop">
    {#if propControl}{@render propControl()}{/if}
  </div>
  <!-- word-label-area: WordLabel measures its closest .word-label-area to
       scale a long word down instead of overflowing. -->
  <div class="row-word word-label-area" aria-live={live}>
    {#if word}
      <WordLabel {word} {activeStepNumber} />
    {:else if hint}
      {@render hint()}
    {:else}
      <span aria-hidden="true"></span>
    {/if}
  </div>
  <div class="row-trailing">
    {#if trailing}{@render trailing()}{/if}
  </div>
</header>

<style>
  /* WordLabel reads --text-color (its default is a light-theme navy). */
  .word-row {
    min-height: 3.25rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    color: var(--theme-text, #fff);
    --text-color: var(--theme-text, #fff);
  }

  /* With a chooser or a trailing control the row becomes three tracks, the
     outer two the same width, so the word stays on the center line. */
  .word-row.balanced {
    grid-template-columns: 3rem minmax(0, 1fr) 3rem;
    column-gap: 0.75rem;
  }

  .word-row:not(.balanced) .row-prop,
  .word-row:not(.balanced) .row-trailing {
    display: none;
  }

  .row-prop,
  .row-trailing {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .row-prop {
    justify-content: flex-start;
  }

  .row-trailing {
    justify-content: flex-end;
  }

  .row-word {
    width: 100%;
    min-width: 0;
    display: flex;
    justify-content: center;
    text-align: center;
  }

  .row-word :global(.word-label-container) {
    justify-content: center;
  }
</style>
```

- [ ] **Step 2: Use it in Construct**

In `src/routes/(public)/composer/_sections/ConstructSection.svelte`, replace the import

```ts
import WordLabel from "$lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte";
```

with

```ts
import ComposerWordRow from "../_components/ComposerWordRow.svelte";
```

Replace the whole `<header class="demo-status word-label-area" ...> ... </header>` block (from the comment `<!-- Canonical word display: ...` through `</header>`) with:

```svelte
<!-- The page's one word row (see ComposerWordRow). No step counter:
               the app doesn't count steps at you. -->
<ComposerWordRow
  word={rawWord}
  activeStepNumber={(phase === "play" || isContinuous) && playingStepNumber
    ? playingStepNumber
    : null}
  live={tookOver ? "polite" : "off"}
  {propControl}
>
  {#snippet hint()}
    <p class="hint">
      {#if phase === "pick-start" && act && !tookOver}
        Watch it build. Tap anything to take over.
      {:else if phase === "pick-start"}
        Pick a starting position to begin.
      {:else}
        Tap a pictograph to add it.
      {/if}
    </p>
  {/snippet}
</ComposerWordRow>
```

Delete these CSS rules from the same file (keep `.hint`): `.demo-status`, `.demo-status.with-prop`, `.status-prop`, `.status-content`, `.status-content :global(.word-label-container)`, and the comment block above `.demo-status` that begins `/* Word row: the canonical WordLabel`.

Run:

```bash
grep -rn "demo-status\|status-content\|status-prop" "src/routes/(public)/composer"
```

Expected: no hits.

- [ ] **Step 3: Use it in Generate**

In `src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte`, replace the import

```ts
import WordLabel from "$lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte";
```

with

```ts
import ComposerWordRow from "./ComposerWordRow.svelte";
```

Replace the block from the comment `<!-- The prop chooser sits outside the live region, so changing props is` through the closing `</header>` of `header.word-slot` with:

```svelte
<ComposerWordRow word={current?.word ?? ""} live="polite" {propControl} />
```

Delete the CSS rules `.word-slot`, `.word-slot.with-prop`, `.slot-prop` and `.slot-word`.

- [ ] **Step 4: Type-check and format**

Run:

```bash
npm run check:fast 2>&1 | tail -20 && ./node_modules/.bin/prettier --write "src/routes/(public)/composer/_components/ComposerWordRow.svelte" "src/routes/(public)/composer/_sections/ConstructSection.svelte" "src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte"
```

Expected: no type errors; Prettier rewrites nothing or only whitespace.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(public)/composer/_components/ComposerWordRow.svelte" "src/routes/(public)/composer/_sections/ConstructSection.svelte" "src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte"
git commit -m "refactor(composer): one ComposerWordRow for Construct and Generate

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -- "src/routes/(public)/composer/_components/ComposerWordRow.svelte" "src/routes/(public)/composer/_sections/ConstructSection.svelte" "src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte"
```

---

### Task 6: Word row on the tunnel and the 3D stop

**Files:**

- Modify: `src/routes/(public)/composer/_components/ComposerTunnelDemo.svelte`
- Modify: `src/routes/(public)/composer/_components/ComposerExperience.svelte`

> Executed 2026-10-07. Review follow-up the same day: the stage formulas
> below did not subtract the row's 3.25rem, so at 1440x900 the stop-room term
> won the tunnel size `min()` and the stop overflowed its room on the stage.
> `.stop` now sets `--word-row-h: 3.25rem`; `.band-frame --tunnel-stage-size`
> and `.viewer-stop .wide-frame` both subtract it, and `ComposerWordRow`
> reads the same token (`min-height: var(--word-row-h, 3.25rem)`). The tunnel
> placeholder gained a `.placeholder-word-row` of that height and dropped to
> two toolbar tiles, matching the band's two buttons. The same commit made
> the tunnel row `live="polite"`, had the generator hand `onGenerated` its
> raw draw instead of the `$state` proxy, and added the hold helper's fifth
> test, "releases both observers once it has held".

- [ ] **Step 1: Tunnel band gets the row**

In `ComposerTunnelDemo.svelte` add the import next to the `PanelButton` import:

```ts
import ComposerWordRow from "./ComposerWordRow.svelte";
```

In the band layout, change

```svelte
  <div class="tunnel-demo band">
    <div class="band-stage">
      {@render stage()}
```

to

```svelte
  <div class="tunnel-demo band">
    <div class="band-stage">
      <ComposerWordRow word={sequence.word ?? ""} {propControl} />
      {@render stage()}
```

In the band's `.stage-toolbar`, delete the line

```svelte
<div class="band-prop-control">{@render propControl?.()}</div>
```

There is no CSS rule for that class; the toolbar is a centered flex row and closes up on its own. Confirm:

```bash
grep -n "band-prop-control" "src/routes/(public)/composer/_components/ComposerTunnelDemo.svelte"
```

Expected after the edit: no hits.

- [ ] **Step 2: The 3D stop names its word**

In `ComposerExperience.svelte`, add the import next to `ProjectStory`:

```ts
import ComposerWordRow from "./ComposerWordRow.svelte";
```

In the viewer stop, change

```svelte
    <h2 id="viewer-title">See it in 3D</h2>

    <div class="viewer-output">
```

to

```svelte
    <h2 id="viewer-title">See it in 3D</h2>

    <!-- The performers carry their own props in 3D, so the row is the word alone. -->
    <ComposerWordRow word={pageSequence.sequence.word ?? ""} />

    <div class="viewer-output">
```

- [ ] **Step 3: Type-check and format**

```bash
npm run check:fast 2>&1 | tail -20 && ./node_modules/.bin/prettier --write "src/routes/(public)/composer/_components/ComposerTunnelDemo.svelte" "src/routes/(public)/composer/_components/ComposerExperience.svelte"
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(public)/composer/_components/ComposerTunnelDemo.svelte" "src/routes/(public)/composer/_components/ComposerExperience.svelte"
git commit -m "feat(composer): the tunnel and 3D stops name the page sequence

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -- "src/routes/(public)/composer/_components/ComposerTunnelDemo.svelte" "src/routes/(public)/composer/_components/ComposerExperience.svelte"
```

---

### Task 7: Keep shows the page sequence first

**Files:**

- Modify: `src/routes/(public)/composer/_components/ComposerExperience.svelte`
- Modify: `src/routes/(public)/composer/_components/ComposerGalleryDemo.svelte`

- [ ] **Step 1: The intro carries the card**

In `ComposerExperience.svelte` add the import:

```ts
import ChoreoCardPreview from "$lib/shared/landing/components/launchpad/ChoreoCardPreview.svelte";
```

Replace the `.keeping-intro` block

```svelte
<div class="keeping-intro">
  <h2 id="keeping-title">Keep the sequence you made.</h2>
  <div class="keeping-lede">
    <p>
      Guests keep three sequences on this device. A full account keeps a cloud
      library and collections. Choose a sequence below to watch it here.
    </p>
    <div class="keeping-actions">
      <a href="/browse" class="primary-action">Browse the Gallery</a>
    </div>
  </div>
</div>
```

with

```svelte
<div class="keeping-intro">
  <div class="keeping-lede">
    <h2 id="keeping-title">Keep this sequence.</h2>
    <p>
      Guests keep three sequences on this device. A full account keeps a cloud
      library and collections.
    </p>
    <div class="keeping-actions">
      <a href="/browse" class="primary-action">Browse the Gallery</a>
    </div>
  </div>
  <!-- The page sequence as the card the app would keep. Rendered from the
           sequence itself, so a hero draw or a fresh build needs no saved
           thumbnail. It mounts when the stop nears, like the gallery. The
           preview draws the app's canonical card (staff props), not the
           chosen prop; that is the card the app keeps. -->
  <figure class="keeping-card">
    <div class="keeping-card-art">
      {#if shelfActive}
        <ChoreoCardPreview sequence={pageSequence.sequence} />
      {/if}
    </div>
    <figcaption>{featuredCaption(pageSequence.source)}</figcaption>
  </figure>
</div>
```

Replace the CSS rule

```css
.keeping-lede > p {
  margin: 0;
}
```

with

```css
.keeping-lede > p {
  margin: 0;
}

.keeping-card {
  margin: 0;
  justify-self: end;
  width: min(100%, 18rem);
}

/* 5:7 is the card's own 960x1344 ratio; the preview's img already fills
     its box with object-fit: contain, so the box holds the layout while the
     render is in flight. */
.keeping-card-art {
  aspect-ratio: 5 / 7;
  border-radius: 0.9rem;
  overflow: hidden;
  background: var(--theme-card-bg, oklch(0.2 0.025 270 / 0.75));
  border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
}

.keeping-card figcaption {
  margin-top: 0.6rem;
  color: oklch(0.76 0.014 270);
  font-size: var(--font-size-min, 0.875rem);
  text-align: center;
}
```

Find the phone rule that already stacks the intro:

```css
.keeping-intro {
  grid-template-columns: 1fr;
  gap: 1.25rem;
}
```

and directly after it add:

```css
.keeping-card {
  justify-self: center;
}
```

- [ ] **Step 2: The gallery heads its tier honestly**

In `ComposerGalleryDemo.svelte` replace

```svelte
<div class="header-copy">
  <span class="eyebrow">Community sequences</span>
  <h3>{selected ? selected.name || selected.word : "Pick a sequence"}</h3>
</div>
```

with

```svelte
<div class="header-copy">
  <h3>
    {selected ? selected.name || selected.word : "Or start from the community."}
  </h3>
</div>
```

Delete the `.eyebrow` CSS rule. In the `h3` rule change `margin: 0.2rem 0 0;` to `margin: 0;`.

- [ ] **Step 3: Type-check and format**

```bash
npm run check:fast 2>&1 | tail -20 && ./node_modules/.bin/prettier --write "src/routes/(public)/composer/_components/ComposerExperience.svelte" "src/routes/(public)/composer/_components/ComposerGalleryDemo.svelte"
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(public)/composer/_components/ComposerExperience.svelte" "src/routes/(public)/composer/_components/ComposerGalleryDemo.svelte"
git commit -m "feat(composer): Keep shows the page sequence before the community cards

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -- "src/routes/(public)/composer/_components/ComposerExperience.svelte" "src/routes/(public)/composer/_components/ComposerGalleryDemo.svelte"
```

---

### Task 8: Hero toolbar, alphabet fold, story links

**Files:**

- Modify: `src/lib/shared/landing/components/SequenceHeroDemo.svelte`
- Modify: `src/routes/(public)/composer/_components/ComposerExperience.svelte`
- Modify: `src/routes/(public)/composer/_components/ProjectStory.svelte`

- [ ] **Step 1: The hero demo accepts a toolbar**

In `SequenceHeroDemo.svelte`, in the destructured props add `toolbar,` after `cornerToggle = false,`, and in the type block add after the `cornerToggle?: boolean;` entry:

```ts
    /** Replaces the built-in Roll row. A host that owns its own controls
        (Roll, prop chooser, theme) renders them here as one row; hosts that
        omit it keep the dice button exactly as before. */
    toolbar?: Snippet;
```

The file does not import `Snippet` yet. Add this line at the top of the `<script lang="ts">` imports:

```ts
import type { Snippet } from "svelte";
```

Replace

```svelte
  {#if onReroll}
    <div class="reroll-row">
```

with

```svelte
  {#if toolbar}
    <div class="toolbar-row">{@render toolbar()}</div>
  {:else if onReroll}
    <div class="reroll-row">
```

The rest of that block (the button, `</div>`, the `{#if errorMessage && sequence}` paragraph and the closing `{/if}`) is unchanged.

Directly after the `.reroll-row { ... }` CSS rule (the one with `margin-top: 1rem;`) add:

```css
.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  margin-top: 1rem;
}
```

The notation-strip variant tightens `.reroll-row`'s top margin in four places (the base rule and three viewport blocks). The toolbar must follow the same values so the hero still fits one screen, so widen each of those four selectors in one pass:

```bash
sed -i 's/\.with-notation-strip \.reroll-row {/.with-notation-strip .reroll-row,\n  .with-notation-strip .toolbar-row {/' src/lib/shared/landing/components/SequenceHeroDemo.svelte
grep -c "with-notation-strip .toolbar-row" src/lib/shared/landing/components/SequenceHeroDemo.svelte
```

Expected: `4`. Prettier (Step 5) fixes the indentation.

- [ ] **Step 2: The page renders one toolbar**

In `ComposerExperience.svelte` replace

```ts
// Same handler HomeHero uses: report the interaction, then roll now.
function handleReroll(): void {
  trackDemoInteraction("try_another");
  void heroAct.advanceNow();
}
```

with

```ts
// Same handler HomeHero uses: report the interaction, then roll now. The
// act's draws fall back to the baked demo rather than rejecting, so the
// failure copy is a safety net, not an expected state. Roll is a touch of
// the hero even when it arrives without a pointer (keyboard activation
// through a label, or a script), so it holds the hero itself.
let rerollFailed = $state(false);
function handleReroll(): void {
  trackDemoInteraction("try_another");
  holdHero();
  rerollFailed = false;
  heroAct.advanceNow().catch(() => {
    rerollFailed = true;
  });
}
```

> Execution note (2026-10-07): the `holdHero()` call inside `handleReroll`
> was added at dispatch. The player's capture handlers already hold on a real
> pointer or key press; this covers a programmatic `click()`, which fires no
> pointerdown.

Directly before `{#snippet pickerPreview()}` add:

```svelte
{#snippet heroToolbar()}
  <PanelButton
    onclick={handleReroll}
    disabled={heroAct.rerolling}
    ariaBusy={heroAct.rerolling}
  >
    <i
      class="fas {heroAct.rerolling
        ? 'fa-circle-notch fa-spin'
        : rerollFailed
          ? 'fa-rotate-right'
          : 'fa-dice'}"
      aria-hidden="true"
    ></i>
    <span
      >{heroAct.rerolling
        ? rerollFailed
          ? "Trying again..."
          : "Rolling..."
        : rerollFailed
          ? "Try again"
          : "Roll a new one"}</span
    >
  </PanelButton>
  {@render propControl()}
  <ComposerBackgroundCycle />
{/snippet}
```

Confirm `PanelButton` is imported in this file (it is used by `propControl`):

```bash
grep -n "import PanelButton" "src/routes/(public)/composer/_components/ComposerExperience.svelte"
```

Expected: one hit.

Replace the whole hero player block (it already carries the hold handlers from Task 3)

```svelte
<div
  class="opening-player"
  onpointerdowncapture={holdHero}
  onkeydowncapture={holdHero}
>
  <div class="player-main">
    <SequenceHeroDemo
      sequence={heroAct.sequence}
      element={heroAct.element}
      onReroll={handleReroll}
      rerolling={heroAct.rerolling}
      leftPropType={selectedProp}
      rightPropType={selectedProp}
      {...propAppearance}
      onSequenceBoundary={heroAct.offerSequenceBoundary}
      note="a real sequence playing in Composer"
      trailSettingsOverride={HERO_TRAIL_PRESET}
      tipEffectMap={HERO_TIP_EFFECT_MAP}
      showNotationStrip={true}
      showWordHeader={true}
      autoPlay={!reduceMotion.current}
      cornerToggle={true}
      loadPriority="immediate"
    />
    <div class="hero-props">
      {@render propControl()}
    </div>
  </div>
  <div class="player-theme"><ComposerBackgroundCycle /></div>
</div>
```

with

```svelte
<div
  class="opening-player"
  onpointerdowncapture={holdHero}
  onkeydowncapture={holdHero}
>
  <div class="player-main">
    <SequenceHeroDemo
      sequence={heroAct.sequence}
      element={heroAct.element}
      toolbar={heroToolbar}
      leftPropType={selectedProp}
      rightPropType={selectedProp}
      {...propAppearance}
      onSequenceBoundary={heroAct.offerSequenceBoundary}
      note="a real sequence playing in Composer"
      trailSettingsOverride={HERO_TRAIL_PRESET}
      tipEffectMap={HERO_TIP_EFFECT_MAP}
      showNotationStrip={true}
      showWordHeader={true}
      autoPlay={!reduceMotion.current}
      cornerToggle={true}
      loadPriority="immediate"
    />
  </div>
</div>
```

Delete the CSS rules `.player-theme` and `.hero-props`. Then:

```bash
grep -n "player-theme\|hero-props" "src/routes/(public)/composer/_components/ComposerExperience.svelte"
```

Expected: no hits (if a media query still names either class, delete that rule too).

- [ ] **Step 3: Fold the alphabet stop into the hero**

Replace the opening note

```svelte
<p class="opening-note">
  Free in your browser, no account needed. Guests keep three sequences on this
  device.
</p>
```

with

```svelte
<p class="opening-note">
  Free in your browser, no account needed. Guests keep three sequences on this
  device. The pictures under the player are letters of The Kinetic Alphabet; the
  sequence is the word they spell.
</p>
```

Delete the whole `<section class="notation-bridge" aria-labelledby="notation-title"> ... </section>` block, and delete the CSS rules `.notation-bridge`, both `.notation-bridge h2` rules, `.notation-bridge p` and `.notation-bridge .notation-links`. Then:

```bash
grep -rn "notation-bridge\|notation-title\|notation-links" src --include=*.svelte --include=*.ts --include=*.md | grep -v "feature-truth-matrix\|presentation-guardrails"
```

Expected: no hits.

- [ ] **Step 4: The story keeps each link once**

In `ProjectStory.svelte` replace

```svelte
<div class="creator-links">
  <PanelButton href="mailto:support@tkaflowarts.com">Email Austen</PanelButton>
  <PanelButton href="/history">Notation history</PanelButton>
</div>
```

with

```svelte
<div class="creator-links">
  <PanelButton href="/guide">Read the Guide</PanelButton>
  <PanelButton href="/history">Notation history</PanelButton>
  <PanelButton href="/faq">Common questions</PanelButton>
  <PanelButton href="mailto:support@tkaflowarts.com">Email Austen</PanelButton>
</div>
```

The `.creator-links` rule already has `display: flex; flex-wrap: wrap;`, so four buttons wrap on narrow screens without a CSS change.

- [ ] **Step 5: Type-check and format**

```bash
npm run check:fast 2>&1 | tail -20 && ./node_modules/.bin/prettier --write src/lib/shared/landing/components/SequenceHeroDemo.svelte "src/routes/(public)/composer/_components/ComposerExperience.svelte" "src/routes/(public)/composer/_components/ProjectStory.svelte"
```

Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/landing/components/SequenceHeroDemo.svelte "src/routes/(public)/composer/_components/ComposerExperience.svelte" "src/routes/(public)/composer/_components/ProjectStory.svelte"
git commit -m "feat(composer): one hero toolbar, alphabet stop folded into the hero

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -- src/lib/shared/landing/components/SequenceHeroDemo.svelte "src/routes/(public)/composer/_components/ComposerExperience.svelte" "src/routes/(public)/composer/_components/ProjectStory.svelte"
```

---

### Task 9: Pause visible at rest, level badge named

**Files:**

- Modify: `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte`
- Modify: `src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte`
- Modify: `src/lib/shared/landing/components/SequenceHeroDemo.svelte`
- Modify: `src/routes/(public)/composer/_components/ComposerExperience.svelte`
- Modify: `src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte`
- Modify: `src/lib/shared/components/DifficultyBadge.svelte`

- [ ] **Step 1: The canvas can keep its corner toggle visible**

In `AnimatorCanvas.svelte`, in the destructured props after `cornerToggle = false,` add `cornerToggleAtRest = false,`. In the props type after the `cornerToggle?: boolean;` entry add:

```ts
    /** Keeps the corner toggle visible and interactive while playing, not
     *  only on hover or when paused. Marketing demonstrations opt in so the
     *  pause control passes the 44 px visible-at-rest rule on every pointer. */
    cornerToggleAtRest?: boolean;
```

In the container attributes, after `data-corner-toggle={cornerToggle || undefined}` add:

```svelte
data-corner-toggle-at-rest={(cornerToggle && cornerToggleAtRest) || undefined}
```

In the CSS, the `.corner-toggle { ... }` rule (it ends with `-webkit-tap-highlight-color: transparent;`) is followed by a comment that begins `/* Persistent PAUSED indicator`. Insert this between them. Its specificity (one class and one attribute above `.corner-toggle`) beats the hidden-at-rest rule and the reduced-motion `transform: none`, which is harmless on an identity transform:

```css
/* Opted-in hosts show the toggle at rest on every pointer type. */
.animation-container[data-corner-toggle-at-rest] .corner-toggle {
  opacity: 1;
  transform: scale(1) translateY(0);
  pointer-events: auto;
}
```

- [ ] **Step 2: The player threads it through**

In `InlineAnimationPlayer.svelte`, after `cornerToggle = false,` in the destructured props add `cornerToggleAtRest = false,`; after the `cornerToggle?: boolean;` type entry add:

```ts
    /** Forwarded to AnimatorCanvas: keep the corner toggle visible while playing. */
    cornerToggleAtRest?: boolean;
```

Where the canvas receives `{cornerToggle}` (the line reading exactly `        {cornerToggle}`), add on the next line:

```svelte
{cornerToggleAtRest}
```

- [ ] **Step 3: The hero demo threads it through**

In `SequenceHeroDemo.svelte`, after `cornerToggle = false,` in the destructured props add `cornerToggleAtRest = false,`; after the `cornerToggle?: boolean;` type entry add:

```ts
    /** Forwarded to the inline player: the pause control stays visible at rest. */
    cornerToggleAtRest?: boolean;
```

In the `LazyMount` `props={{ ... }}` object, after `cornerToggle,` add `cornerToggleAtRest,`.

- [ ] **Step 4: The page opts in**

In `ComposerExperience.svelte`, on the hero `<SequenceHeroDemo` inside `.player-main` (not the `pickerPreview` one), after `cornerToggle={true}` add:

```svelte
cornerToggleAtRest={true}
```

In `ComposerGenerateDemo.svelte`, in the inline player's `props={{ ... }}` after `cornerToggle: true,` add:

```ts
            cornerToggleAtRest: true,
```

- [ ] **Step 5: The level badge gets a name**

In `src/lib/shared/components/DifficultyBadge.svelte` replace

```svelte
<span
  class="difficulty-badge {extraClass}"
  style="
```

with

```svelte
<span
  class="difficulty-badge {extraClass}"
  role="img"
  aria-label="Difficulty level {level}"
  title="Difficulty level {level}"
  style="
```

- [ ] **Step 6: Type-check, format, and run the nearest tests**

```bash
npm run check:fast 2>&1 | tail -20 && ./node_modules/.bin/prettier --write src/lib/shared/animation-engine/components/AnimatorCanvas.svelte src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte src/lib/shared/landing/components/SequenceHeroDemo.svelte "src/routes/(public)/composer/_components/ComposerExperience.svelte" "src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte" src/lib/shared/components/DifficultyBadge.svelte && npx vitest run --config tests/config/vitest.config.ts src/lib/shared/landing/data/__tests__/hero-act.test.ts "src/routes/(public)/composer"
```

Expected: no type errors; the hero act tests, the ownership tests and `construct-attract-act.test.ts` pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/animation-engine/components/AnimatorCanvas.svelte src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte src/lib/shared/landing/components/SequenceHeroDemo.svelte "src/routes/(public)/composer/_components/ComposerExperience.svelte" "src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte" src/lib/shared/components/DifficultyBadge.svelte
git commit -m "feat(player): opt-in pause visible at rest; difficulty badge named

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -- src/lib/shared/animation-engine/components/AnimatorCanvas.svelte src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte src/lib/shared/landing/components/SequenceHeroDemo.svelte "src/routes/(public)/composer/_components/ComposerExperience.svelte" "src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte" src/lib/shared/components/DifficultyBadge.svelte
```

---

### Task 10: Phone 3D poster

**Files:**

- Modify: `src/routes/(public)/composer/_components/ComposerExperience.svelte`

- [ ] **Step 1: Replace the bare note with a poster and caption**

Replace

```svelte
<p class="small-screen-3d-note">
  The 3D viewer needs WebGL2 and a screen at least 600px in both directions.
</p>
```

with

```svelte
<!-- Small screens cannot run the viewer, so they get the poster the
         portal card shows, plus the reason. -->
<figure class="small-screen-3d-poster">
  <img
    src={PORTAL_STILL}
    alt="A still from the 3D viewer."
    width="2400"
    height="1090"
    loading="lazy"
    decoding="async"
  />
  <figcaption class="small-screen-3d-note">
    The 3D viewer needs WebGL2 and a screen at least 600px in both directions.
  </figcaption>
</figure>
```

- [ ] **Step 2: Style it**

Replace the CSS rule

```css
.small-screen-3d-note {
  display: none;
  margin: 1.4rem 0 0;
  color: oklch(0.74 0.018 270);
  font-size: var(--font-size-min, 0.875rem);
  line-height: 1.55;
}
```

with

```css
.small-screen-3d-poster {
  display: none;
  margin: 0;
}

.small-screen-3d-poster img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 1rem;
  border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
}

.small-screen-3d-note {
  margin: 1rem 0 0;
  color: oklch(0.74 0.018 270);
  font-size: var(--font-size-min, 0.875rem);
  line-height: 1.55;
}
```

In the media block

```css
@media (max-width: 37.4375rem), (max-height: 37.4375rem) {
  .viewer-output {
    display: none;
  }

  .small-screen-3d-note {
    display: block;
  }
}
```

replace `.small-screen-3d-note { display: block; }` with `.small-screen-3d-poster { display: block; }`.

- [ ] **Step 3: Type-check and format**

```bash
npm run check:fast 2>&1 | tail -20 && ./node_modules/.bin/prettier --write "src/routes/(public)/composer/_components/ComposerExperience.svelte"
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(public)/composer/_components/ComposerExperience.svelte"
git commit -m "fix(composer): phones see the 3D poster, not only the note

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -- "src/routes/(public)/composer/_components/ComposerExperience.svelte"
```

---

### Task 11: Guardrails, truth matrix, spec corrections

**Files:**

- Modify: `src/routes/(public)/composer/presentation-guardrails.md`
- Modify: `src/routes/(public)/composer/feature-truth-matrix.md`
- Modify: `docs/superpowers/specs/2026-10-07-composer-one-sequence-carried-design.md`

- [ ] **Step 1: Guardrails**

In `presentation-guardrails.md`, replace

```markdown
3. Carry that same sequence into the views that genuinely change how it is seen.
```

with

```markdown
3. Carry that same sequence into the views that genuinely change how it is
   seen. The page has one sequence: the hero's draw until the visitor builds
   or generates one, then the last of those. Every demonstration names it in
   the same word row (prop chooser, then the word in notation glyphs), and
   Keep offers that sequence first (2026-10-07).
```

Replace

```markdown
- Only the reader moves it. A demonstration that moves focus by itself never
  starts a glide.
```

with

```markdown
- Only the reader moves it. A demonstration that moves focus by itself never
  starts a glide.
- The hero rolls a new word on its own only until the reader touches its
  player column or leaves the hero stop. After that it changes only on Roll,
  so the word the reader saw is the word the page carries (2026-10-07).
```

Replace

```markdown
- The prop chooser lives inside each demonstration, beside the sequence's
  word. There is no page-level Build and Generate switch.
```

with

```markdown
- The prop chooser lives inside each demonstration, beside the sequence's
  word, in the shared word row. There is no page-level Build and Generate
  switch. The hero's controls (Roll, prop chooser, Theme) are one row under
  its player.
- The Kinetic Alphabet has no stop of its own. One sentence in the hero names
  it, and the Guide and Common questions links sit in the closing section
  with Notation history, each once. Austen chose this on 2026-10-07 over
  keeping the stop with a live pictograph or moving it after Keep.
```

- [ ] **Step 2: Truth matrix**

In `feature-truth-matrix.md`, in the "Generate a sequence from choices" row, replace the phrase `proves repeated draws from one prepared recipe, not selectable inputs.` with `proves repeated draws from fixed inputs the page does not display, not selectable inputs.`

Replace the Tunnel view row's conditions cell text

```
Working as a live Composer demonstration and in the full app. Ring, Mirrored, and Canon arrangements at 2, 4, or 8 performers are shown and verified on the page. Per-performer timing beyond a one-step canon is not shown.
```

with

```
Working as a live Composer demonstration and in the full app. The page offers the seven showcase presets (Duo, Radial, Mandala, Pinwheel, Spiral, Inverted, Cross) at 2 to 8 performers, with Arrows and Props layer toggles and a New tunnel draw. Per-performer timing beyond the Spiral preset's one-step stagger is not shown.
```

and its evidence cell text

```
`ComposerTunnelDemo.svelte` mounts the real tunnel renderer in its band layout; its Arrangement control writes the shipped `TunnelConfig` mirror and staggerSteps values. The Create module also has a routed Tunnel tab.
```

with

```
`ComposerTunnelDemo.svelte` mounts the real tunnel renderer in its band layout and `TunnelPresetBrowser` in showcase mode; the presets are `TUNNEL_PRESETS` in `tunnel-config.ts` and write the shipped `TunnelConfig` fold, mirror, invert and staggerSteps values. The Create module also has a routed Tunnel tab.
```

(Verified against the code: `TUNNEL_PRESETS` holds Duo, Radial, Mandala, Pinwheel, Spiral with `staggerSteps: 1`, Inverted and Cross; the demo's performer control offers 2, 4 and 8.)

In the "Prepared generator draw" proof row replace `from the same disclosed recipe.` with `from the same fixed inputs, which the page does not display.`

In the "Accessible moving demonstrations" proof row replace `Primary motion has 48px keyboard controls and starts paused under reduced motion;` with `Primary motion has 48px keyboard pause controls that stay visible at rest and starts paused under reduced motion;`.

- [ ] **Step 3: Spec corrections**

In the spec, replace

```markdown
- Tunnel (the page uses the square layout): a row above the square stage with
  the page word and the prop chooser. The band layout is unchanged.
```

with

```markdown
- Tunnel (the page uses the band layout): a row above the square stage inside
  the band's stage column, with the page word and the prop chooser, which
  leaves the stage toolbar. The square layout is unchanged.
```

Replace this whole passage:

```markdown
`ComposerGalleryDemo.svelte` gains `featured?: PageSequence | null` and
renders two tiers inside its existing frame while no sequence is open:

1. One `ChoreoCardThumbnail` of `featured.sequence` with a one-line origin
   caption chosen by `featured.source`: "The sequence playing above." for
   opening and hero, "The sequence you built." for construct, "The sequence
   you generated." for generate and tunnel.
2. An h3 "Or start from the community." (replacing the "Community sequences"
   eyebrow and the "Pick a sequence" h3) with the existing prop select, above
   the four community cards.

Tapping the featured card opens the same inline viewer the community cards
open, through the existing `open(sequence)` path. While a sequence is open the
frame shows the viewer, its name, and the Back control exactly as today, and
both tiers are hidden with it. `LazyMount` spreads `props`, so passing a fresh
`{ featured }` object on each change is enough.
```

with:

```markdown
The intro's second column holds the featured card: the landing's own
`ChoreoCardPreview` renders the page sequence as a card straight from its
steps (a hero draw or a fresh build has no saved thumbnail, and the gallery's
`ChoreoCardThumbnail` goes through the cloud thumbnail cache, which an
ephemeral sequence must not touch). It is a picture, not a button. Under it a
one-line caption names the origin from the page sequence's source: "The
sequence playing above." for opening and hero, "The sequence you built." for
construct, "The sequence you generated." for generate and tunnel. It mounts
when the Keep stop nears, with the gallery.

`ComposerGalleryDemo.svelte` keeps its frame, viewer and Back control; its
header reads "Or start from the community." while no sequence is open.
```

Replace

```markdown
- the Construct stop activating, through the existing `activateConstruct`
  action, which fires on the stage and on the plain page alike. The page has
  no view of the stage's index and does not need one.
```

with

```markdown
- the hero stop leaving view, through an action on the hero section built on
  `observeComposerStopVisibility`: scrolled past on the plain page, or no
  longer the stage's current stop. Construct's near-activation cannot be the
  trigger: the stage keeps the next stop inside the window so it loads early,
  which would hold the hero at load. A deep link or a restored scroll arrives
  already past the hero and holds it at once.
```

Replace

```markdown
caller keeps today's hover reveal. The tunnel's square-layout pause and the
3D demo's pause are already 48 px and visible.
```

with

```markdown
caller keeps today's hover reveal. The tunnel band toolbar's pause and the
3D demo's pause are already 48 px and visible.
```

- [ ] **Step 4: Format and commit**

```bash
./node_modules/.bin/prettier --write "src/routes/(public)/composer/presentation-guardrails.md" "src/routes/(public)/composer/feature-truth-matrix.md" docs/superpowers/specs/2026-10-07-composer-one-sequence-carried-design.md
git add "src/routes/(public)/composer/presentation-guardrails.md" "src/routes/(public)/composer/feature-truth-matrix.md" docs/superpowers/specs/2026-10-07-composer-one-sequence-carried-design.md
git commit -m "docs(composer): guardrails and truth matrix follow the carried sequence

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -- "src/routes/(public)/composer/presentation-guardrails.md" "src/routes/(public)/composer/feature-truth-matrix.md" docs/superpowers/specs/2026-10-07-composer-one-sequence-carried-design.md
```

---

### Task 12: Browser verification and integration

**Files:** none modified unless a check fails.

> Execution notes (2026-10-07). A whole-branch review before this task found
> no Critical issue and four to fix first; commit `eca4dd0d16` fixed them
> with the cheap hygiene items from the same review: the Keep card loads
> through `LazyMount` like the gallery (its static import had put the card
> renderer and its QR modules in the page's first chunk); on the stage the
> Keep stop no longer overflows its room (`--composer-gallery-height` moved
> up to `.keeping` with a 14rem card allowance that the plain-page fallback
> adds back, and `.keeping-card` gives way to the room with an 8rem floor);
> the hero sentence names the alphabet without pointing at the notation
> strip, which the hero hides on some window sizes; the Theme button lost the
> 16px top margin from its old row; a parked tunnel's word row is `live="off"`;
> the difficulty badge label uses `t("create_difficulty_level")`; and the
> guardrails describe the word rows as built (the hero uses its player's word
> header, the 3D row has no chooser, Keep shows a card). Left as designed: the
> Roll handler's failure copy (a safety net the act never triggers), the Keep
> caption wording, and the badge's visible-label hosts.
>
> Step 2 was not run: three other tasks' Vite servers were already up, over
> the two-server cap in `resource-budget.md`, so no worktree preview was
> started. Steps 3 to 5 ran on the primary server after Step 7 instead, with
> Step 8; the results are in the task report.
>
> Live check (2026-10-07) on the primary server at 1440x900 in the agent Chrome:
> steps 3 to 11 passed (auto-roll alive, a real Roll click holds, every stop
> shows the hero word, Generate and Construct replace it with the right Keep
> caption, the pause buttons are 48 and 54px at opacity 1, no console errors,
> hold on leaving, deep link held). The desktop app's built-in browser pane
> throttles requestAnimationFrame to a few frames a second and reports the page
> hidden, so the hero never reaches a loop boundary there; timing checks need a
> real Chrome. Follow-up branch `codex/composer-live-fixes`, from measurements
> at 1440x800, 1280x720, 1024x768, 820x1180 and 375x667: the hero toolbar
> wrapped in every stage window (the row is 350px at 1440x900 and 265px at
> 1280x720), so the row is a size container, the Theme chip shortens to its icon
> under 27rem and Roll keeps only its die under 18.5rem; the Keep card's room
> allowance names the two-line caption (3.25rem; the stop was 20px over at
> 1440x800); and the making frames' 34rem floor gives way to the room on the
> stage (a 720px window leaves 479px, and nothing inside overflows at that
> height). Left as designed: a stop taller than its room pans before the glide
> (the tunnel's controls column is 595px, the gallery keeps its 360px floor),
> and the stage's 700px height gate.

- [ ] **Step 1: Resource gate**

```powershell
(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'svelte-check|vite\\bin\\vite\.js' } | Select-Object ProcessId, CommandLine
```

Expected: at least 4096 MB available, no `svelte-check` running, fewer than two agent-owned Vite servers. If the cap is reached, wait or report contention; never touch port 5173.

- [ ] **Step 2: Start the worktree preview**

From `E:/worktrees/tka-platform/composer-one-sequence`, in the background:

```bash
npx vite --port 5190 --strictPort > ../composer-one-sequence-vite.log 2> ../composer-one-sequence-vite.err.log
```

If 5190 is taken, use the next free port and record it. The dev HTTPS cert lives in the primary checkout's gitignored `.cert/` folder, so this worktree serves plain HTTP. Confirm with:

```bash
curl.exe -s -o /dev/null -w "%{http_code}\n" http://localhost:5190/composer
```

Expected: `200`. Every URL below is `http://localhost:5190/...`.

- [ ] **Step 3: Stage checks at 1440x900**

In the agent browser at 1440x900 open `/composer` and verify, reading the accessibility tree rather than screenshots where possible:

1. Headings: one h1, six h2 ("Construct a sequence", "Generate a sequence", "Put it in a tunnel", "See it in 3D", "Keep this sequence.", "Austen Cloud") and the gallery h3 "Or start from the community."; no "The Kinetic Alphabet" heading. The rail has one fewer stop than before.
2. The hero toolbar is one row: Roll a new one, the prop button, Theme. Nothing else under the player.
3. Touch nothing. Note the hero word and wait 40 s: it changes at least once (the auto-roll is alive at load, so nothing held the hero on its own).
4. Click Roll with a real pointer click (the computer tool at the button's coordinates; `element.click()` fires no pointerdown and would not hold) and note the hero word. Wait 40 s. The word is unchanged (hold on touch).
5. Press Next through Construct, Generate, tunnel and 3D. Each stop's word row shows the hero word (read the WordLabel text in each stop). Keep's card caption reads "The sequence playing above."
6. In Generate click Generate once and note the new word. Next to the tunnel, 3D and Keep: all show the new word; Keep's caption reads "The sequence you generated."
7. Back to the hero, click Roll. Next to Generate: it shows the hero's new word.
8. Hero and Generate players: the corner pause button has computed `opacity` 1 and `pointer-events` auto while playing, and a bounding box of at least 44x44.
9. The console has no errors.
10. Hold on leaving: reload, touch nothing, press Next to Construct within 10 s, wait 40 s, press Previous. The hero word is the one you left with.
11. Deep link: open `/composer#tunnel-title` in a fresh tab and wait 30 s. The tunnel's word row never changes; press Previous back to the hero and it shows that same word.

- [ ] **Step 4: Construct carry**

Reload at 1440x900, Next to Construct, click a start position and two pictographs (the `construct-attract-act.test.ts` ownership rule means only a visitor click carries). Next to Generate, tunnel, 3D and Keep: all show the built word, and Keep's caption reads "The sequence you built."

- [ ] **Step 5: Phone and tablet**

At 375x667: the 3D stop shows the poster image with the note under it, and no "Enter 3D" button; the hero toolbar wraps with no horizontal scroll (`document.documentElement.scrollWidth <= 375`); Keep shows the card above the community frame; headings as in Step 3. At 820x1180: the same checks and no clipping of the Keep intro.

- [ ] **Step 6: Unit tests and the type gate**

```bash
npx vitest run --config tests/config/vitest.config.ts src/lib/shared/landing/data/__tests__/hero-act.test.ts "src/routes/(public)/composer" tests/unit/landing-route-morph.test.ts tests/unit/composer-presentation-state.test.ts && npm run check:fast 2>&1 | tail -5
```

Expected: all pass, no type errors.

- [ ] **Step 7: Stop the preview, bring the branch current, integrate**

Stop the Vite process started in Step 2. Then from the worktree:

```bash
git merge --no-edit main
```

Expected: a fast-forward or a clean merge. On a conflict, resolve inside the task's own files only and commit with a pathspec.

Then from `E:/tka-platform` (never from inside the worktree):

```powershell
Set-Location E:/tka-platform
npm run wt:finish -- codex/composer-one-sequence --route /composer
```

Expected: every gate passes, the branch merges to local `main`, the worktree is removed. If a gate fails, stop with the branch and worktree intact and report the exact failure.

- [ ] **Step 8: Live check on the primary server**

Open `https://localhost:5173/composer` in the agent browser and repeat Step 3 items 1, 2, 4 and 8. Hand Austen that link. Nothing is pushed.
