# Hand Motions Script Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline, in this worktree. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/guide/level-1/hand-motions` as the lesson's script (chart, map, six combinations, test yourself), with each section opening its own lesson stage by name.

**Architecture:** Lesson links gain a named `?stage=` flag handled next to `?from-start` in `PublicConceptCourse`. The three-motions flowchart moves out of the lesson's first stage into a shared figure in `src/lib/shared/guide-topics/`, which both the lesson stage and the Guide page render. The page composes that figure, the existing `MotionMapFigure` and `HandCombinationBoard`, and three `LinkChip`s into stage links.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Vitest (node config for `.ts`, browser config for `.svelte.test.ts`), the project's Chrome DevTools MCP for the visual pass.

**Spec:** `docs/superpowers/specs/2026-10-25-hand-motions-script-page-design.md`. Read it first.

**Rules that apply:** `.claude/rules/no-text-links.md` (every link is a `LinkChip`), `no-layout-shift.md` (no feature-local durations; use `DURATION` tokens), `commit-only-your-own-changes.md` (commit with explicit pathspecs), `4k-native-layout.md`, `visual-verification-mandatory.md`. Never run `npm run check` or a full build here; `npm run test:changed` and single Vitest files are the gates, plus the browser pass.

**Where you are:** this worktree, `D:/worktrees/tka-platform/hand-motions-script-page`, branch `codex/hand-motions-script-page`. `node_modules` is a junction into the primary checkout: never run `pnpm install` here, and never `rm -rf` the worktree. Commit here; do not merge, push, or touch `E:/tka-platform`.

**Running one test file:**

```bash
npx vitest run --config tests/config/vitest.config.ts <path/to/file.test.ts>
npx vitest run --config tests/config/vitest.components.config.ts <path/to/file.svelte.test.ts>
```

---

## File map

| Path                                                                                   | Change                                                                       |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/lib/features/learn/domain/concept-routes.ts`                                      | Add `buildConceptStagePath`, `conceptStageFromUrl`, `conceptHrefWithoutFlags` |
| `src/lib/features/learn/domain/concept-routes.test.ts`                                 | Tests for the three                                                          |
| `src/lib/features/learn/components/interactive/motions/hand-motions-stage.ts`          | Add `HAND_MOTIONS_STAGES` (names → steps, schema key, schema version)        |
| `src/lib/features/learn/domain/concept-experience-registry.ts`                         | `stages` on the definition; `conceptStageTarget()`                           |
| `src/lib/features/learn/domain/lesson-entry-flags.ts` (new)                            | `applyLessonEntryFlags(url, persistenceFor)`: pure, testable                 |
| `src/lib/features/learn/domain/lesson-entry-flags.test.ts` (new)                       | Tests with a fake persistence                                                |
| `src/lib/features/learn/components/PublicConceptCourse.svelte`                         | Call `applyLessonEntryFlags`; strip both flags after navigation              |
| `src/lib/features/learn/components/interactive/motions/MotionsConceptExperience.svelte` | Use the exported schema key                                                  |
| `src/lib/shared/guide-topics/HandMotionsChart.svelte` (new)                            | The flowchart figure, extracted                                              |
| `src/lib/features/learn/components/interactive/motions/HandMotionsIntroStage.svelte`   | Becomes the figure plus the live-board Start box                             |
| `messages/en.json`                                                                     | Two chip labels                                                              |
| `src/routes/(public)/guide/level-1/_topics/topic-pages.ts`                             | `lessonId` on `TopicPageProps`                                               |
| `src/routes/(public)/guide/level-1/_components/GuidePageHost.svelte`                   | Pass `lessonId`                                                              |
| `src/lib/features/learn/components/ConceptTopicReading.svelte`                         | Pass `lessonId={null}`; open Hand Motions inline                             |
| `src/routes/(public)/guide/level-1/_topics/HandMotionsTopicPage.svelte`                | The four sections and three chips                                            |
| `src/routes/(public)/guide/level-1/_topics/hand-motions-topic-page.svelte.test.ts` (new) | Server-visible words and the three stage links                               |

---

### Task 1: Named stage links in `concept-routes.ts`

**Files:**
- Modify: `src/lib/features/learn/domain/concept-routes.ts`
- Test: `src/lib/features/learn/domain/concept-routes.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `concept-routes.test.ts` (keep the existing imports; add the new names to the import line):

```ts
import {
  buildConceptStagePath,
  conceptHrefWithoutFlags,
  conceptRestartFromUrl,
  conceptStageFromUrl,
  enteredCourseFromOutside,
} from "./concept-routes";

describe("stage links", () => {
  it("builds a lesson link that names a stage", () => {
    expect(buildConceptStagePath("hand-motions-intro", "two-hands")).toBe(
      "/learn/concepts/hand-motions-intro?stage=two-hands"
    );
  });

  it("reads the stage off a lesson URL", () => {
    expect(
      conceptStageFromUrl(
        new URL(`${SITE}/learn/concepts/hand-motions-intro?stage=map`)
      )
    ).toEqual({ conceptId: "hand-motions-intro", stage: "map" });
  });

  it("is null without a stage, with an empty stage, or off a lesson", () => {
    expect(
      conceptStageFromUrl(new URL(`${SITE}/learn/concepts/hand-motions-intro`))
    ).toBeNull();
    expect(
      conceptStageFromUrl(
        new URL(`${SITE}/learn/concepts/hand-motions-intro?stage=`)
      )
    ).toBeNull();
    expect(
      conceptStageFromUrl(new URL(`${SITE}/guide/level-1/hand-motions?stage=map`))
    ).toBeNull();
  });

  it("strips both entry flags and keeps everything else", () => {
    expect(
      conceptHrefWithoutFlags(
        new URL(
          `${SITE}/learn/concepts/hand-motions-intro?from-start&stage=quiz&keep=1#top`
        )
      )
    ).toBe("/learn/concepts/hand-motions-intro?keep=1#top");
    expect(
      conceptHrefWithoutFlags(
        new URL(`${SITE}/learn/concepts/hand-motions-intro?keep=1`)
      )
    ).toBeNull();
  });

  it("a restart link still resets", () => {
    expect(
      conceptRestartFromUrl(
        new URL(`${SITE}/learn/concepts/grid?from-start&stage=map`)
      )?.conceptId
    ).toBe("grid");
  });
});
```

- [ ] **Step 2: Run the file and watch it fail**

```bash
npx vitest run --config tests/config/vitest.config.ts src/lib/features/learn/domain/concept-routes.test.ts
```

Expected: FAIL, `buildConceptStagePath is not a function` (or the import fails).

- [ ] **Step 3: Implement**

In `concept-routes.ts`, after `conceptRestartFromUrl`, add:

```ts
// A page can open a lesson on one of its stages by name (the Guide's
// "Try it yourself" beside the six combinations opens the two-hands stage).
// Names, not numbers, so a renumbered lesson never breaks a page link.
const CONCEPT_STAGE_PARAM = "stage";

export function buildConceptStagePath(conceptId: string, stage: string): string {
  return `${buildConceptPath(conceptId)}?${CONCEPT_STAGE_PARAM}=${encodeURIComponent(stage)}`;
}

/**
 * Reads a named stage off a lesson URL, or null when the URL is not a
 * lesson or names no stage.
 */
export function conceptStageFromUrl(
  url: URL
): { conceptId: string; stage: string } | null {
  const stage = url.searchParams.get(CONCEPT_STAGE_PARAM);
  if (!stage) return null;
  const conceptId = conceptIdFromPathname(url.pathname);
  if (!conceptId) return null;
  return { conceptId, stage };
}

/**
 * The same lesson URL without its entry flags (`from-start`, `stage`), so a
 * reload resumes as usual. Null when there is nothing to strip.
 */
export function conceptHrefWithoutFlags(url: URL): string | null {
  if (
    !url.searchParams.has(CONCEPT_START_PARAM) &&
    !url.searchParams.has(CONCEPT_STAGE_PARAM)
  ) {
    return null;
  }
  const params = new URLSearchParams(url.search);
  params.delete(CONCEPT_START_PARAM);
  params.delete(CONCEPT_STAGE_PARAM);
  const query = params.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}
```

- [ ] **Step 4: Run the file again**

Expected: all tests PASS (the pre-existing ones too).

- [ ] **Step 5: Commit**

```bash
git add -- src/lib/features/learn/domain/concept-routes.ts src/lib/features/learn/domain/concept-routes.test.ts
git commit -m "Learn: a lesson link can name the stage it opens on" -- src/lib/features/learn/domain/concept-routes.ts src/lib/features/learn/domain/concept-routes.test.ts
```

---

### Task 2: The lesson publishes its stage names

**Files:**
- Modify: `src/lib/features/learn/components/interactive/motions/hand-motions-stage.ts`
- Modify: `src/lib/features/learn/domain/concept-experience-registry.ts`
- Modify: `src/lib/features/learn/components/interactive/motions/MotionsConceptExperience.svelte` (the local `schemaKey`)
- Create: `src/lib/features/learn/domain/lesson-entry-flags.ts`
- Test: `src/lib/features/learn/domain/lesson-entry-flags.test.ts`

- [ ] **Step 1: Add the stage map to `hand-motions-stage.ts`**

Append:

```ts
/** The phase-data key the lesson writes its schema version under. */
export const HAND_MOTIONS_SCHEMA_KEY = "stageSchemaVersion";

/**
 * The stages a page can open the lesson on, by name. The Guide's Hand
 * Motions page links each of its sections to one of these.
 */
export const HAND_MOTIONS_STAGES = {
  steps: {
    motions: 1,
    map: 2,
    "two-hands": 3,
    quiz: 4,
  },
  schemaKey: HAND_MOTIONS_SCHEMA_KEY,
  schemaVersion: HAND_MOTIONS_STAGE_SCHEMA_VERSION,
} as const;
```

- [ ] **Step 2: Use the exported key in `MotionsConceptExperience.svelte`**

Find `const schemaKey = "stageSchemaVersion";` and replace it with:

```ts
const schemaKey = HAND_MOTIONS_SCHEMA_KEY;
```

and add `HAND_MOTIONS_SCHEMA_KEY` to the existing `import { ... } from "./hand-motions-stage";` list.

- [ ] **Step 3: Put `stages` on the registry definition**

In `concept-experience-registry.ts`, add the import at the top:

```ts
import { HAND_MOTIONS_STAGES } from "../components/interactive/motions/hand-motions-stage";
```

Add the type above `ConceptExperienceDefinition`:

```ts
/**
 * The stages a page can open a lesson on, by name. `steps` are the lesson's
 * 1-based saved steps; the schema key and version are written with the step
 * so the lesson reads the place as current.
 */
export interface ConceptStageMap {
  steps: Readonly<Record<string, number>>;
  schemaKey: string;
  schemaVersion: number;
}
```

Add to `ConceptExperienceDefinition`:

```ts
  /** Present when a page may open the lesson mid-way. */
  stages?: ConceptStageMap;
```

In the Hand Motions entry, after `reviewStatus: "built",` add:

```ts
    stages: HAND_MOTIONS_STAGES,
```

After `getConceptExperienceForGuideSlug`, add:

```ts
/**
 * Where a named stage lands in a lesson: the saved step to write, with the
 * schema that makes it current. Undefined for an unknown name or a lesson
 * that cannot be entered mid-way.
 */
export function conceptStageTarget(
  conceptId: string,
  stage: string
): { step: number; schemaKey: string; schemaVersion: number } | undefined {
  const stages = byConceptId.get(conceptId)?.stages;
  const step = stages?.steps[stage];
  if (!stages || step === undefined) return undefined;
  return { step, schemaKey: stages.schemaKey, schemaVersion: stages.schemaVersion };
}
```

- [ ] **Step 4: Write the failing test for the entry-flag handler**

Create `src/lib/features/learn/domain/lesson-entry-flags.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { applyLessonEntryFlags } from "./lesson-entry-flags";

const SITE = "https://tkaflowarts.com";

function fakePersistence() {
  return {
    reset: vi.fn(),
    saveStep: vi.fn(),
    savePhaseData: vi.fn(),
  };
}

describe("applyLessonEntryFlags", () => {
  it("opens a named stage: writes its step and schema, touches nothing else", () => {
    const persistence = fakePersistence();
    applyLessonEntryFlags(
      new URL(`${SITE}/learn/concepts/hand-motions-intro?stage=two-hands`),
      () => persistence
    );
    expect(persistence.reset).not.toHaveBeenCalled();
    expect(persistence.saveStep).toHaveBeenCalledWith(3);
    expect(persistence.savePhaseData).toHaveBeenCalledWith(
      "stageSchemaVersion",
      4
    );
  });

  it("resets first, then opens the stage, when both flags are present", () => {
    const persistence = fakePersistence();
    const order: string[] = [];
    persistence.reset.mockImplementation(() => order.push("reset"));
    persistence.saveStep.mockImplementation(() => order.push("step"));
    applyLessonEntryFlags(
      new URL(`${SITE}/learn/concepts/hand-motions-intro?from-start&stage=quiz`),
      () => persistence
    );
    expect(order).toEqual(["reset", "step"]);
    expect(persistence.saveStep).toHaveBeenCalledWith(4);
  });

  it("ignores an unknown stage name and a lesson without stages", () => {
    const persistence = fakePersistence();
    applyLessonEntryFlags(
      new URL(`${SITE}/learn/concepts/hand-motions-intro?stage=nope`),
      () => persistence
    );
    applyLessonEntryFlags(
      new URL(`${SITE}/learn/concepts/grid?stage=map`),
      () => persistence
    );
    expect(persistence.saveStep).not.toHaveBeenCalled();
    expect(persistence.savePhaseData).not.toHaveBeenCalled();
  });

  it("a plain restart still resets", () => {
    const persistence = fakePersistence();
    applyLessonEntryFlags(
      new URL(`${SITE}/learn/concepts/grid?from-start`),
      () => persistence
    );
    expect(persistence.reset).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 5: Run it and watch it fail**

```bash
npx vitest run --config tests/config/vitest.config.ts src/lib/features/learn/domain/lesson-entry-flags.test.ts
```

Expected: FAIL, cannot find module `./lesson-entry-flags`.

- [ ] **Step 6: Implement `lesson-entry-flags.ts`**

```ts
import { conceptStageTarget } from "./concept-experience-registry";
import { conceptRestartFromUrl, conceptStageFromUrl } from "./concept-routes";

/** The slice of a lesson's persistence that entry flags write. */
export interface LessonEntryPersistence {
  reset(): void;
  saveStep(step: number): void;
  savePhaseData(key: string, value: unknown): void;
}

/**
 * Applies a lesson link's entry flags before the lesson creates its state.
 * `from-start` clears the saved place; `stage=<name>` moves it to that stage,
 * writing the lesson's current schema so the place reads as current. Found
 * moves, pairs and answers are left as they were. Both together: reset,
 * then the stage. An unknown name is ignored.
 */
export function applyLessonEntryFlags(
  url: URL,
  persistenceFor: (conceptId: string) => LessonEntryPersistence
): void {
  const restart = conceptRestartFromUrl(url);
  if (restart) persistenceFor(restart.conceptId).reset();

  const entry = conceptStageFromUrl(url);
  if (!entry) return;
  const target = conceptStageTarget(entry.conceptId, entry.stage);
  if (!target) return;
  const persistence = persistenceFor(entry.conceptId);
  persistence.saveStep(target.step);
  persistence.savePhaseData(target.schemaKey, target.schemaVersion);
}
```

- [ ] **Step 7: Run both test files**

```bash
npx vitest run --config tests/config/vitest.config.ts src/lib/features/learn/domain/lesson-entry-flags.test.ts src/lib/features/learn/domain/concept-routes.test.ts
```

Expected: PASS. If the registry import drags in a Svelte component at module load and the node runner chokes, the registry's `load` thunks are lazy, so this should not happen; if it does, report it rather than mocking around it.

- [ ] **Step 8: Commit**

```bash
git add -- src/lib/features/learn/components/interactive/motions/hand-motions-stage.ts src/lib/features/learn/domain/concept-experience-registry.ts src/lib/features/learn/components/interactive/motions/MotionsConceptExperience.svelte src/lib/features/learn/domain/lesson-entry-flags.ts src/lib/features/learn/domain/lesson-entry-flags.test.ts
git commit -m "Learn: Hand Motions names its stages so a page can open one" -- src/lib/features/learn/components/interactive/motions/hand-motions-stage.ts src/lib/features/learn/domain/concept-experience-registry.ts src/lib/features/learn/components/interactive/motions/MotionsConceptExperience.svelte src/lib/features/learn/domain/lesson-entry-flags.ts src/lib/features/learn/domain/lesson-entry-flags.test.ts
```

---

### Task 3: The course applies the flags

**Files:**
- Modify: `src/lib/features/learn/components/PublicConceptCourse.svelte:24-36`

- [ ] **Step 1: Replace the restart block**

Today:

```ts
  const restart = browser
    ? conceptRestartFromUrl(new URL(window.location.href))
    : null;
  if (restart) getExperiencePersistence(restart.conceptId).reset();
  afterNavigate(() => {
    const pending = conceptRestartFromUrl(new URL(window.location.href));
    if (pending) writeUrl(pending.cleanHref);
  });
```

Becomes:

```ts
  // Entry flags on a lesson link ("from the start", a named stage) are
  // applied here, before the lesson below creates its state from the saved
  // place, then dropped from the address bar once the navigation settles, so
  // a reload resumes as usual.
  if (browser) {
    applyLessonEntryFlags(
      new URL(window.location.href),
      getExperiencePersistence
    );
  }
  afterNavigate(() => {
    const clean = conceptHrefWithoutFlags(new URL(window.location.href));
    if (clean) writeUrl(clean);
  });
```

Update the imports: drop `conceptRestartFromUrl` from the `concept-routes` import, add `conceptHrefWithoutFlags`, and add:

```ts
  import { applyLessonEntryFlags } from "../domain/lesson-entry-flags";
```

- [ ] **Step 2: Check the file compiles**

```bash
npx vitest run --config tests/config/vitest.components.config.ts src/lib/features/learn/components/PublicConceptCourse.svelte.test.ts
```

Expected: PASS (the existing test).

- [ ] **Step 3: Commit**

```bash
git commit -m "Learn: the course opens a lesson on the stage its link names" -- src/lib/features/learn/components/PublicConceptCourse.svelte
```

---

### Task 4: Extract the flowchart into a shared figure

**Files:**
- Create: `src/lib/shared/guide-topics/HandMotionsChart.svelte`
- Modify: `src/lib/features/learn/components/interactive/motions/HandMotionsIntroStage.svelte`

The chart's branches, pictures, cascade, hover/tap replay, static ring, book notes and reduced motion all move to the figure. The lesson stage keeps only what is the lesson's: the live-board Start box, the hand that follows it, and the wait for the board's flight.

- [ ] **Step 1: Create `HandMotionsChart.svelte`**

Copy `HandMotionsIntroStage.svelte` to `src/lib/shared/guide-topics/HandMotionsChart.svelte`, then make these changes:

Header comment:

```svelte
<!--
  The book's chart of the three hand motions: the blue hand's Start box
  branching to Shift, Dash and Static, each with its name, its caption and
  real pictures of the move from that start (both shifts, the dash, static).
  Once on screen and drawn, the branches play in a quick cascade from the
  top, each arrow first and then the hand along it; a pointer over one, or a
  tap, plays it again once it has finished. Static's ring settles in and
  stays. Under the chart sit the book's two lines on what the arrow and the
  hand show. Reduced motion shows the finished pictures.

  The lesson's first stage and the Guide's Hand Motions page both draw this
  figure. The Start box is a snippet: the lesson passes its live board with
  the hand riding on it; the page takes the default, a plain picture of the
  hand at rest. `darkMode` and `printMode` set the pictures' colors for a
  page with its own palette, as HandCombinationBoard does; left out, they
  follow the app theme. A host sizes the boxes with `--chart-box` when the
  lesson's viewport-height formula does not fit it.
  Spec: docs/superpowers/specs/2026-10-25-hand-motions-script-page-design.md
-->
```

Script: remove the imports of `LessonBoardSlot` and `getLiveLessonBoard`, and the `const liveBoard = getLiveLessonBoard();` line. Change the `#lib/shared/guide-topics/hand-motions-topic.js` import to `./hand-motions-topic.js`. Add props after the imports:

```ts
  import type { Snippet } from "svelte";

  interface Props {
    /** The Start box's contents; the default is the hand at rest. */
    start?: Snippet;
    darkMode?: boolean;
    printMode?: boolean;
  }

  let { start, darkMode = undefined, printMode = false }: Props = $props();
```

Markup: the Start box becomes

```svelte
    <div class="start" data-hand-grid="start" aria-hidden="true">
      {#if start}
        {@render start()}
      {:else}
        <PictographContainer
          pictographData={startPicture}
          gridMode={GridMode.DIAMOND}
          leftPropTypeOverride={PropType.HAND}
          rightPropTypeOverride={PropType.HAND}
          visibleHand={HandSide.LEFT}
          showTKA={false}
          showPlacements={false}
          showReversals={false}
          showTnD={false}
          showElemental={false}
          showNonRadialPoints={false}
          stepNumberOverride={false}
          {darkMode}
          {printMode}
        />
      {/if}
    </div>
```

Every branch `PictographContainer` gets `{darkMode}` and `{printMode}` added after `stepNumberOverride={false}`.

Rename the root class from `intro-stage` to `hand-motions-chart` (markup and the `.intro-stage` style rule). In `.flowchart`, make the box size overridable:

```css
    --box: var(
      --chart-box,
      clamp(
        4.5rem,
        min(calc((100 * var(--lesson-vh, 1svh) - 32rem) / 3), 21cqw),
        22rem
      )
    );
```

and in the narrow container query:

```css
      --box: var(--chart-box-narrow, clamp(3.5rem, calc(25cqw - 0.75rem), 7rem));
```

Delete the `.start-hand` rule (it moves to the lesson stage). Keep everything else, including `whenOnScreen`, `BOARD_LANDING_MS` and the `mountedAt` wait (on the page it is a short, harmless delay before the cascade).

- [ ] **Step 2: Reduce `HandMotionsIntroStage.svelte` to the lesson's part**

Replace the whole file with:

```svelte
<!--
  Hand Motions, stage 1: the book's chart of the three motions, before the
  learner touches the grid (Austen, 2026-10-12: "we should be introduced to
  the three concepts first"). The chart itself is the shared
  HandMotionsChart; this stage supplies its Start box: the session's live
  board, so arriving from Hand Placements the board the learner left flies
  into it with the blue hand riding along, and Next grows the Start picture
  into the motion map (Austen, 2026-10-15).
  Spec: docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md
-->
<script lang="ts">
  import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import HandMotionsChart from "#lib/shared/guide-topics/HandMotionsChart.svelte";
  import {
    MOTION_MAP_HOME,
    handMovePictographData,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import LessonBoardSlot from "../live-board/LessonBoardSlot.svelte";
  import { getLiveLessonBoard } from "../live-board/live-lesson-board.svelte";

  const start = MOTION_MAP_HOME;
  /** The Start box's hand at rest; the start deriver wants both hands. */
  const startPose = handMovePictographData(start, start)!;
  const startPicture: StepData = createStepData({
    ...startPose,
    id: `hand-motions-start-${start}`,
    stepNumber: 0,
  });
  const liveBoard = getLiveLessonBoard();
</script>

<HandMotionsChart>
  {#snippet start()}
    <LessonBoardSlot phase="diamond" look="pictograph" />
    <div class="start-hand" {@attach (node) => liveBoard?.follow(node)}>
      <PictographContainer
        pictographData={startPicture}
        gridMode={GridMode.DIAMOND}
        leftPropTypeOverride={PropType.HAND}
        rightPropTypeOverride={PropType.HAND}
        visibleHand={HandSide.LEFT}
        showGrid={false}
        transparentBackground
        showTKA={false}
        showPlacements={false}
        showReversals={false}
        showTnD={false}
        showElemental={false}
        showNonRadialPoints={false}
      />
    </div>
  {/snippet}
</HandMotionsChart>

<style>
  /* The blue hand over the live board's grid. */
  .start-hand {
    position: absolute;
    inset: 0;
  }
</style>
```

Check: `HandMotionsChart` still builds its own `startPose`/`startPicture` for the default Start box and for `motionStartData` on the branch pictures. Both files computing the same pose from the shared record is fine; do not export it from the figure.

- [ ] **Step 3: Confirm the lesson still plays**

Start a task-owned preview server from this worktree on a free port (never 5173; check `.claude/rules/resource-budget.md` first):

```powershell
(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue
```

Then, from this worktree, `pnpm exec vite --port 5276 --host localhost` in the background (log to a file in the scratchpad). Open `https://localhost:5276/learn/concepts/hand-motions-intro?from-start` in the dedicated agent browser (`pwsh -NoProfile -File scripts/launch-chrome-debug.ps1 -Url about:blank`, then the Chrome DevTools MCP). Confirm, with a screenshot and a console check:

- the chart draws: Start box with the grid and the blue hand, three branches, four pictures;
- the cascade plays once, hover replays a picture, static's ring settles;
- Next grows the Start box into the motion map (the `data-hand-grid="start"` morph);
- no console errors.

Also open `https://localhost:5276/learn/concepts/hand-motions-intro?stage=two-hands`: the lesson opens on the two-hands stage, the address bar loses `?stage=`, Previous walks back to the map. Then `?stage=quiz` opens the quiz. Then `?stage=nope` opens at the saved place.

- [ ] **Step 4: Commit**

```bash
git add -- src/lib/shared/guide-topics/HandMotionsChart.svelte src/lib/features/learn/components/interactive/motions/HandMotionsIntroStage.svelte
git commit -m "Hand Motions: the three-motions chart becomes a shared figure" -- src/lib/shared/guide-topics/HandMotionsChart.svelte src/lib/features/learn/components/interactive/motions/HandMotionsIntroStage.svelte
```

---

### Task 5: The page's chip words and the lesson id

**Files:**
- Modify: `messages/en.json` (next to `guide_topic_hand_motions_three`)
- Modify: `src/routes/(public)/guide/level-1/_topics/topic-pages.ts`
- Modify: `src/routes/(public)/guide/level-1/_components/GuidePageHost.svelte`
- Modify: `src/lib/features/learn/components/ConceptTopicReading.svelte`

- [ ] **Step 1: Add the two labels to `messages/en.json`**

Find `"guide_topic_hand_motions_three"` and add beside it:

```json
  "guide_topic_try_it_yourself": "Try it yourself",
  "guide_topic_test_yourself": "Test yourself",
```

English only; the other locales follow the translation program's next pass. `TranslationKey` is derived from `en.json`, so no generation step.

- [ ] **Step 2: `lessonId` on `TopicPageProps`**

In `topic-pages.ts`:

```ts
/** Props every migrated Guide topic page receives from GuidePageHost. */
export type TopicPageProps = {
  darkMode: boolean;
  kicker: string;
  /** The lesson's start, for a page with one link into the lesson. */
  lessonHref: string | null;
  /** The lesson's concept id, for a page that links its sections to stages. */
  lessonId: string | null;
};
```

- [ ] **Step 3: Pass it from `GuidePageHost.svelte`**

```svelte
      <TopicPage
        darkMode={isDark}
        kicker={topicKicker}
        lessonHref={interactiveLesson
          ? buildConceptStartPath(interactiveLesson.conceptId)
          : null}
        lessonId={interactiveLesson?.conceptId ?? null}
      />
```

- [ ] **Step 4: `ConceptTopicReading.svelte`: no chips inside the lesson, Hand Motions inline**

`loadPage` becomes:

```ts
  function loadPage(id: string) {
    switch (id) {
      case "grid":
        return import("../../../../routes/(public)/guide/level-1/_topics/GridTopicPage.svelte");
      case "hand-motions-intro":
        return import("../../../../routes/(public)/guide/level-1/_topics/HandMotionsTopicPage.svelte");
      default:
        return import("../../../../routes/(public)/guide/level-1/_topics/PlacementsTopicPage.svelte");
    }
  }
```

and the render gains `lessonId={null}`:

```svelte
        <TopicPage
          {darkMode}
          kicker={t("learn_ui_read_topic")}
          lessonHref={null}
          lessonId={null}
        />
```

Find where `ConceptDetailView.svelte` decides `hasInlineReading` (search `hasInlineReading`) and make sure `hand-motions-intro` counts; if it is a list of ids, add it there.

- [ ] **Step 5: Type-check the touched files quickly**

```bash
npx vitest run --config tests/config/vitest.components.config.ts "src/routes/(public)/guide/level-1/_topics/grid-topic-shared-edit.svelte.test.ts"
```

Expected: PASS (the Grid page takes the new prop without using it). Do not run `npm run check`.

- [ ] **Step 6: Commit**

```bash
git commit -m "Guide: topic pages learn their lesson's id; Hand Motions reads inline" -- messages/en.json "src/routes/(public)/guide/level-1/_topics/topic-pages.ts" "src/routes/(public)/guide/level-1/_components/GuidePageHost.svelte" src/lib/features/learn/components/ConceptTopicReading.svelte src/lib/features/learn/components/ConceptDetailView.svelte
```

(Drop `ConceptDetailView.svelte` from the pathspec if you did not change it.)

---

### Task 6: The page as the lesson's script

**Files:**
- Rewrite: `src/routes/(public)/guide/level-1/_topics/HandMotionsTopicPage.svelte`
- Create: `src/routes/(public)/guide/level-1/_topics/hand-motions-topic-page.svelte.test.ts`

- [ ] **Step 1: Write the failing page test**

Follow `grid-topic-shared-edit.svelte.test.ts` for the setup. Create `hand-motions-topic-page.svelte.test.ts`:

```ts
/**
 * The Hand Motions page is the lesson's script: every shared word is in the
 * markup, and each section links to its own lesson stage by name.
 */
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";

// The figures draw pictographs the test runner does not serve; the words and
// the links alone carry the proof.
vi.mock("#lib/shared/guide-topics/HandMotionsChart.svelte", async () => ({
  default: (await import("./__test-stubs__/EmptyStub.svelte")).default,
}));
vi.mock("#lib/shared/guide-topics/MotionMapFigure.svelte", async () => ({
  default: (await import("./__test-stubs__/EmptyStub.svelte")).default,
}));
vi.mock("#lib/shared/guide-topics/HandCombinationBoard.svelte", async () => ({
  default: (await import("./__test-stubs__/EmptyStub.svelte")).default,
}));

import HandMotionsTopicPage from "./HandMotionsTopicPage.svelte";

describe("Hand Motions topic page", () => {
  it("links each section to its own lesson stage", async () => {
    const screen = render(HandMotionsTopicPage, {
      darkMode: false,
      kicker: "Level 1",
      lessonHref: "/learn/concepts/hand-motions-intro?from-start",
      lessonId: "hand-motions-intro",
    });
    const links = screen.container.querySelectorAll<HTMLAnchorElement>("a[href*='stage=']");
    expect([...links].map((a) => a.getAttribute("href"))).toEqual([
      "/learn/concepts/hand-motions-intro?stage=map",
      "/learn/concepts/hand-motions-intro?stage=two-hands",
      "/learn/concepts/hand-motions-intro?stage=quiz",
    ]);
    await expect.element(screen.getByText("Test yourself")).toBeInTheDocument();
  });

  it("shows no stage links without a lesson (the reading sheet)", () => {
    const screen = render(HandMotionsTopicPage, {
      darkMode: true,
      kicker: "Read this topic",
      lessonHref: null,
      lessonId: null,
    });
    expect(screen.container.querySelectorAll("a[href*='stage=']").length).toBe(0);
  });

  it("carries the shared words: the three moves and the combinations lead", async () => {
    const screen = render(HandMotionsTopicPage, {
      darkMode: false,
      kicker: "Level 1",
      lessonHref: null,
      lessonId: "hand-motions-intro",
    });
    for (const word of ["Shift", "Dash", "Static", "Remain at the same point"]) {
      await expect.element(screen.getByText(word).first()).toBeInTheDocument();
    }
    await expect
      .element(screen.getByText("Using these, we can make six combinations, named below."))
      .toBeInTheDocument();
  });
});
```

If `localHref` is used for the chips (see Step 3), the test's expected hrefs stay as above because the default locale adds no prefix; if they come back prefixed, read `localHref` and adjust the expectation rather than the page.

- [ ] **Step 2: Run it and watch it fail**

```bash
npx vitest run --config tests/config/vitest.components.config.ts "src/routes/(public)/guide/level-1/_topics/hand-motions-topic-page.svelte.test.ts"
```

Expected: FAIL (no `stage=` links on the current page).

- [ ] **Step 3: Rewrite `HandMotionsTopicPage.svelte`**

```svelte
<!--
  Hand Motions as a Guide web page, told in the lesson's order (Austen,
  2026-10-25: the written page is the lesson's script). The book's chart of
  the three motions first, then the motion map playing its build once, then
  the six combinations, then a chip into the quiz. The map and the six each
  carry a chip into their own lesson stage, so a reader never jumps back to
  stage one. Words, moves and examples come from the shared Hand Motions
  record the lesson also reads.
  Spec: docs/superpowers/specs/2026-10-25-hand-motions-script-page-design.md
-->
<script lang="ts">
  import Sentences from "../../_components/Sentences.svelte";
  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import { buildConceptStagePath } from "#lib/features/learn/domain/concept-routes.js";
  import HandCombinationBoard from "#lib/shared/guide-topics/HandCombinationBoard.svelte";
  import HandMotionsChart from "#lib/shared/guide-topics/HandMotionsChart.svelte";
  import MotionMapFigure from "#lib/shared/guide-topics/MotionMapFigure.svelte";
  import { CombinationPlayback } from "#lib/shared/guide-topics/combination-playback.svelte.js";
  import {
    MOTION_MAP_MOVES,
    handMotionsTopicText,
    type HandMove,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import TopicHeader from "./TopicHeader.svelte";
  import type { TopicPageProps } from "./topic-pages";

  let { darkMode, kicker, lessonId }: TopicPageProps = $props();

  /** A section's chip into its own lesson stage; none inside the lesson. */
  const stageHref = (stage: "map" | "two-hands" | "quiz") =>
    lessonId ? buildConceptStagePath(lessonId, stage) : null;

  /** The move the map is showing; its name lights in the legend. */
  let lit = $state<HandMove | null>(null);

  /**
   * The six examples play once when the board comes into view, left to
   * right. Each then holds its finished picture, the book's view; a hover
   * or tap replays it.
   */
  const playback = new CombinationPlayback();
  let board: HTMLDivElement | undefined = $state();

  onMount(() => (board ? playback.playOnView(board) : undefined));
</script>

<article class="hand-motions-topic">
  <TopicHeader
    {kicker}
    title={handMotionsTopicText("title")}
    lede={t("guide_topic_hand_motions_three")}
  />

  <section class="motions" aria-label={handMotionsTopicText("title")}>
    <div class="figure chart" class:dark={darkMode}>
      <HandMotionsChart {darkMode} printMode={!darkMode} />
    </div>
  </section>

  <section class="map" aria-labelledby="hand-map-heading">
    <div class="figure map-figure" class:dark={darkMode}>
      <MotionMapFigure bind:lit />
    </div>
    <div class="map-words">
      <h2 id="hand-map-heading">{handMotionsTopicText("mapPrompt")}</h2>
      <ul class="legend">
        {#each MOTION_MAP_MOVES as move (move.id)}
          <li class:lit={lit === move.id}>
            <span class="name">{handMotionsTopicText(move.name)}</span>
            <span class="caption">{handMotionsTopicText(move.caption)}</span>
          </li>
        {/each}
      </ul>
      {#if stageHref("map")}
        <p class="stage-link">
          <LinkChip href={stageHref("map")!}
            ><i class="fa-solid fa-hand-pointer" aria-hidden="true"></i>
            {t("guide_topic_try_it_yourself")}</LinkChip
          >
        </p>
      {/if}
    </div>
  </section>

  <section class="combinations" aria-labelledby="hand-combinations-lead">
    <p id="hand-combinations-lead" class="lead">
      <Sentences text={handMotionsTopicText("combinationsLead")} />
    </p>
    <div class="board" class:dark={darkMode} bind:this={board}>
      <HandCombinationBoard
        showDescriptions
        {darkMode}
        printMode={!darkMode}
        cellProgress={playback.cellProgress}
        onCellPlay={playback.replay}
        label={handMotionsTopicText("combinationsLead")}
      />
    </div>
    {#if stageHref("two-hands")}
      <p class="stage-link">
        <LinkChip href={stageHref("two-hands")!}
          ><i class="fa-solid fa-hand-pointer" aria-hidden="true"></i>
          {t("guide_topic_try_it_yourself")}</LinkChip
        >
      </p>
    {/if}
  </section>

  {#if stageHref("quiz")}
    <p class="stage-link test">
      <LinkChip href={stageHref("quiz")!}
        ><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
        {t("guide_topic_test_yourself")}</LinkChip
      >
    </p>
  {/if}
</article>
```

Note on the map heading: the shared record's `mapPrompt` ("Pick a point to move the hand.") is the lesson's prompt. On the page it reads as the section's title for the stage the reader can try. If it reads wrong in the browser, use `handMotionsTopicLines("intro")[0]` instead and say so in the report; do not write a new sentence.

Styles. Keep the current file's `.hand-motions-topic`, the `:where` ink rule, `.lead`, `.combinations`, `.board` (with its `--theme-*` mapping) and `.board :global(.name)` rules as they are today. Replace `.moves-wrap`, `.moves`, `.move`, `.pic`, `.caption` and `.lesson-link` with:

```css
  /* The chart and the map read the app's theme variables for their words,
     lines and grid chrome; point them at this page's ink in both themes. */
  .figure {
    --theme-text: var(--ink, #1a1a1a);
    --theme-text-dim: color-mix(in srgb, var(--ink, #1a1a1a) 75%, transparent);
    --theme-stroke: color-mix(in srgb, var(--ink, #1a1a1a) 22%, transparent);
    --theme-card-bg: transparent;
    --theme-panel-bg: transparent;
    --theme-accent: #647ff1;
    container-type: inline-size;
  }
  .motions {
    width: 100%;
    max-width: 76rem;
    margin: 0 auto;
  }
  /* The page sizes the chart's boxes by width, not by the lesson's viewport
     height. */
  .chart {
    --chart-box: clamp(5rem, 15cqw, 13rem);
    --chart-box-narrow: clamp(3.5rem, calc(25cqw - 0.75rem), 7rem);
  }

  /* The map beside its words on a wide page, stacked on a narrow one. */
  .map {
    display: grid;
    gap: 1.5rem;
    justify-items: center;
    align-items: center;
    max-width: 76rem;
    margin: 0 auto;
    width: 100%;
  }
  .map-figure {
    width: min(100%, 24rem);
  }
  .map-words {
    display: grid;
    gap: 0.75rem;
    max-width: 30rem;
    text-align: center;
  }
  .hand-motions-topic .map-words h2 {
    margin: 0;
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.35rem, 3cqw, 2.1rem);
    font-weight: 700;
    line-height: 1.1;
    text-wrap: balance;
  }
  .legend {
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .legend li {
    display: grid;
    gap: 0.1rem;
    padding: 0.35rem 0.75rem;
    border-radius: 0.6rem;
    transition: background var(--transition-normal);
  }
  /* The map's demonstration lights the move it is showing; the whole row
     tints, not an edge (no-left-edge-accent-bar.md). */
  .legend li.lit {
    background: color-mix(in srgb, var(--prop-blue, #3b82f6) 14%, transparent);
  }
  .legend .name {
    font-family: var(--guide-display, "Cormorant Garamond", Georgia, serif);
    font-size: clamp(1.15rem, 2cqw, 1.4rem);
    font-weight: 700;
  }
  .legend .caption {
    font-size: clamp(0.85rem, 1.6cqw, 1rem);
    line-height: 1.4;
  }
  @container (min-width: 56rem) {
    .map {
      grid-template-columns: minmax(0, 24rem) minmax(0, 30rem);
    }
    .map-words {
      text-align: left;
      justify-items: start;
    }
  }

  /* LinkChip reads the app's theme variables; point them at this page's
     palette, as the host does for its own title-band chip. */
  .stage-link {
    margin: 0;
    justify-self: center;
    --theme-text: var(--ink, #1a1a1a);
    --theme-accent: #647ff1;
  }
  .stage-link.test {
    margin-top: 0.5rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .legend li {
      transition: none;
    }
  }
```

`.hand-motions-topic` is `display: grid`, so `.stage-link` centers with `justify-self`; inside `.map-words` (also a grid) it follows that grid's `justify-items`. Check the `:where(p, h2, li, span)` ink rule still covers the new elements.

- [ ] **Step 4: Run the page test**

Expected: PASS.

- [ ] **Step 5: Look at it in the browser**

With the worktree server from Task 4 still up, open `https://localhost:5276/guide/level-1/hand-motions`. Check, in both light and dark (toggle `data-theme` on `<html>` with the DevTools MCP's `evaluate_script`, or emulate `prefers-color-scheme`):

- the chart draws with the page's ink, its cascade plays once, hover replays;
- the map builds itself once and the legend row lights as each move plays; its grid chrome reads on the light page. If `PropPlacementGrid`'s grid asset only reads on a dark surface, give `.map-figure` the lesson's dark surface (`background: #10121c; border-radius: 1rem; padding: 1rem;`) instead of fighting the asset, and say so in the report;
- the board plays once on view as before;
- the three chips render as pills and each `href` is the stage link;
- click each chip: the lesson opens on the map, the two-hands stage, the quiz; the address bar loses `?stage=`; Back returns to the page.

Then the seven-viewport pass with per-page emulation (375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, 3840×2160) and one 200% zoom reflow check at 1440×900. Capture WebP screenshots at quality 70 into the scratchpad. No horizontal overflow, no clipped chart, the map beside its words from 56rem up, chips 44px tall.

Fix what you see; re-shoot only the affected frames.

- [ ] **Step 6: Run the related tests**

```bash
npm run test:changed
```

Expected: PASS, including `hand-motions-topic.test.ts` (the shared-edit proof) and the two `.svelte.test.ts` files that cover Hand Motions.

- [ ] **Step 7: Commit**

```bash
git add -- "src/routes/(public)/guide/level-1/_topics/HandMotionsTopicPage.svelte" "src/routes/(public)/guide/level-1/_topics/hand-motions-topic-page.svelte.test.ts"
git commit -m "Guide: the Hand Motions page tells the lesson in its order, each section opening its stage" -- "src/routes/(public)/guide/level-1/_topics/HandMotionsTopicPage.svelte" "src/routes/(public)/guide/level-1/_topics/hand-motions-topic-page.svelte.test.ts"
```

---

### Task 7: Report

- [ ] **Step 1: Stop the preview server you started** and close only the browser tab you opened.

- [ ] **Step 2: Report** with: the commits (one line each), what the browser pass showed at each tier (one line per tier, with screenshot paths), the map-on-light decision, whether `mapPrompt` read right as the map section's heading, anything you could not verify, and `git status --short` to prove nothing else moved. Do not merge, push, or edit the primary checkout.

---

## Self-review

- Spec coverage: page sections (Task 6), stage links (Tasks 1–3), chart extraction (Task 4), inline reading (Task 5), chip words (Task 5), tests (Tasks 1, 2, 6), browser pass (Tasks 4, 6). The ui-bust review and integration stay with the coordinator.
- Names: `buildConceptStagePath`, `conceptStageFromUrl`, `conceptHrefWithoutFlags`, `conceptStageTarget`, `applyLessonEntryFlags`, `HAND_MOTIONS_STAGES`, `HAND_MOTIONS_SCHEMA_KEY`, `lessonId`, `--chart-box`, `--chart-box-narrow` are used consistently above.
