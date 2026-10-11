# Guide Grid Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Grid's teaching text is written once and appears in the Grid lesson, a new "labeled overview first" Guide web page, and a composed print handbook page. The Guide front door becomes a lesson-first welcome.

**Architecture:** A small shared topic record (`src/lib/shared/guide-topics/grid-topic.ts`) maps teaching-unit IDs to existing translation keys and holds the callout geometry for the labeled figure. The lesson, the web topic page and the handbook page all read text through `gridTopicText(unit)`. The lesson keeps its own state machine, prompts and announcements. GuidePageHost renders a registered topic page instead of FlowFrame for `the-grid` only. Other topics are untouched.

**Tech Stack:** SvelteKit, Svelte 5 runes, the project's JSON i18n (`messages/*.json`, `t()`), Vitest (jsdom unit config and the browser component config).

**Spec:** `docs/superpowers/specs/2026-10-10-guide-rethink-design.md`

---

## Rules that apply to every task

- **Use Austen's words only.** Teaching sentences come from existing `verified_level1_*` strings, which are his verbatim proof copy, or from his "Read Me First" letter. Splitting a paragraph into sentences is allowed; rewording is not. The only new strings are two button labels (Task 6). Anything else that needs new wording is listed under "Open for Austen" at the end; do not invent it.
- Work only in `E:/worktrees/tka-platform/guide-grid-pilot` on branch `codex/guide-grid-pilot`.
- Commit with explicit pathspecs: `git commit -m "..." -- <paths>`. Never use `git add -A`, `git add .` or a bare `git commit`.
- Never start, stop or restart port 5173.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Status | Responsibility |
|------|--------|----------------|
| `src/lib/shared/guide-topics/grid-topic.ts` | create | Grid unit → translation key map, `gridTopicText`, callout geometry |
| `src/lib/shared/guide-topics/grid-topic.test.ts` | create | Record integrity and verbatim-wording tests |
| `messages/*.json` | modify | Six new `guide_topic_grid_*` keys split from existing strings; two hub labels; three welcome keys; later, removal of unused keys |
| `src/lib/features/learn/components/interactive/grid-concept/GridStepHeader.svelte` | modify | Lesson step text comes from the record |
| `src/lib/features/learn/components/interactive/grid-concept/GridScrollView.svelte` | modify | Scroll view definitions come from the record |
| `src/routes/(public)/guide/level-1/_topics/GridHandsArt.svelte` | create | The two-hand ALPHA3 pictograph, mounted on the client inside a fixed box |
| `src/routes/(public)/guide/level-1/_topics/LabeledGridFigure.svelte` | create | Pictograph plus callout lines and labels from the record |
| `src/routes/(public)/guide/level-1/_topics/GridModesEquation.svelte` | create | Diamond + Box = 8-point grid figure |
| `src/routes/(public)/guide/level-1/_topics/GridTopicPage.svelte` | create | Web topic page, "labeled overview first" |
| `src/routes/(public)/guide/level-1/_topics/GridHandbookPage.svelte` | create | One Letter-size print handbook page |
| `src/routes/(public)/guide/level-1/_topics/topic-pages.ts` | create | slug → topic page component registry |
| `src/routes/(public)/guide/level-1/_topics/__test-stubs__/EmptyStub.svelte` | create | Stand-in for the pictograph in component tests |
| `src/routes/(public)/guide/level-1/_topics/grid-topic-shared-edit.svelte.test.ts` | create | Proof: one changed unit shows up in all three views |
| `src/routes/(public)/guide/level-1/_components/GuidePageHost.svelte` | modify | Render a registered topic page instead of hero + FlowFrame |
| `src/routes/(public)/guide/level-1/handbook/+page.ts` | create | Client-rendered handbook route |
| `src/routes/(public)/guide/level-1/handbook/+page@(public).svelte` | create | Handbook route page (noindex during the pilot) |
| `src/routes/(public)/guide/+page.svelte` | modify | Lesson-first welcome front door |
| `src/routes/(public)/guide/level-1/_components/GuideDocument.svelte` | modify | "Read Me First" paragraphs read from the same welcome keys |

---

### Task 0: Worktree setup

The worktree already exists: `E:/worktrees/tka-platform/guide-grid-pilot` on `codex/guide-grid-pilot`, based on local main `894660b7ee`.

- [ ] **Step 1: Link node_modules (a junction, never a pnpm install)**

```powershell
cmd /c mklink /J E:\worktrees\tka-platform\guide-grid-pilot\node_modules E:\tka-platform\node_modules
```

Expected: `Junction created for ...`

- [ ] **Step 2: Generate SvelteKit's tsconfig in the worktree**

```bash
cd /e/worktrees/tka-platform/guide-grid-pilot && pnpm exec svelte-kit sync
```

Expected: exits 0, and `.svelte-kit/tsconfig.json` exists.

- [ ] **Step 3: Confirm a clean tree**

```bash
git -C /e/worktrees/tka-platform/guide-grid-pilot status --short
```

Expected: only `docs/superpowers/plans/2026-10-10-guide-grid-pilot.md` (this plan) is untracked.

---

### Task 1: Split Austen's Grid paragraphs into per-sentence keys

The guide stores two Grid paragraphs as single strings with `<br>` breaks: `verified_level1_grid_overview` and `verified_level1_grid_points`. The lesson needs each definition on its own. Split them mechanically, in every locale that has them, without changing any words. Locales that lack the source keys (ja, zh, ar and possibly others) fall back to English through `t()`.

**Files:**
- Modify: `messages/*.json`
- Scratch (not committed): `C:/Users/Austen/AppData/Local/Temp/claude/E--tka-platform/c4226b80-e546-4d19-baea-11386906c87d/scratchpad/split-grid-keys.mjs`

- [ ] **Step 1: Write the split script in the scratchpad**

```js
// split-grid-keys.mjs <messagesDir>
// Splits Austen's Grid overview and point paragraphs into per-sentence keys,
// inserted directly after verified_level1_grid_points. Words are unchanged.
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const NO_SPACE = new Set(["zh", "ja"]);
const BR = /<br\s*\/?>/i;
const report = [];

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const locale = file.replace(/\.json$/, "");
  const full = path.join(dir, file);
  const raw = fs.readFileSync(full, "utf8");
  const msgs = JSON.parse(raw);
  const overview = msgs.verified_level1_grid_overview;
  const points = msgs.verified_level1_grid_points;
  if (!overview || !points) {
    report.push(`${locale}: no source keys, English fallback`);
    continue;
  }
  const join = NO_SPACE.has(locale) ? "" : " ";
  const o = overview
    .split(BR)
    .map((s) => s.trim())
    .filter(Boolean);
  const p = points
    .split(/(?:<br\s*\/?>\s*){2}/i)
    .map((para) =>
      para
        .split(BR)
        .map((s) => s.trim())
        .join(join)
        .trim()
    )
    .filter(Boolean);
  if (o.length !== 3 || p.length !== 3) {
    report.push(`${locale}: overview=${o.length} points=${p.length}, skipped`);
    continue;
  }
  const added = {
    guide_topic_grid_two_modes: o[0],
    guide_topic_grid_translates: o[1],
    guide_topic_grid_point_types_lead: o[2],
    guide_topic_grid_center_point: p[0],
    guide_topic_grid_hand_points: p[1],
    guide_topic_grid_outer_points: p[2],
  };
  const out = {};
  for (const [k, v] of Object.entries(msgs)) {
    if (k in added) continue;
    out[k] = v;
    if (k === "verified_level1_grid_points") Object.assign(out, added);
  }
  fs.writeFileSync(full, JSON.stringify(out, null, 2) + "\n");
  report.push(`${locale}: added 6`);
}
console.log(report.join("\n"));
```

- [ ] **Step 2: Run it**

```bash
node C:/Users/Austen/AppData/Local/Temp/claude/E--tka-platform/c4226b80-e546-4d19-baea-11386906c87d/scratchpad/split-grid-keys.mjs /e/worktrees/tka-platform/guide-grid-pilot/messages
```

Expected: `en: added 6` and one line per locale. Write down which locales were skipped for the final report.

- [ ] **Step 3: Check that the diff only adds lines**

```bash
cd /e/worktrees/tka-platform/guide-grid-pilot && git diff --numstat messages/
```

Expected: every row reads `6	0	messages/<locale>.json`. Any deletion means the file format did not round-trip. Stop, and restore that file only with `git restore -- messages/<locale>.json` (`git checkout --` is blocked here).

- [ ] **Step 4: Check the English values by eye**

```bash
node -e "const m=require('/e/worktrees/tka-platform/guide-grid-pilot/messages/en.json');for(const k of Object.keys(m).filter(k=>k.startsWith('guide_topic_grid_')))console.log(k,'=',m[k])"
```

Expected:

```
guide_topic_grid_two_modes = There are two 4-point grids: box mode and diamond mode.
guide_topic_grid_translates = <strong>This guide is written in diamond, but everything translates to box.</strong>
guide_topic_grid_point_types_lead = On this grid, there are three types of points:
guide_topic_grid_center_point = The <strong>center point</strong> is the hub that everything revolves around.
guide_topic_grid_hand_points = The four <strong>hand points</strong> are halfway between the center point and the outer points.
guide_topic_grid_outer_points = The <strong>outer points</strong> depict the outer edges of the grid.
```

- [ ] **Step 5: Commit**

```bash
cd /e/worktrees/tka-platform/guide-grid-pilot && git commit -m "i18n: split Austen's Grid paragraphs into per-sentence keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- messages/
```

---

### Task 2: The shared Grid topic record

**Files:**
- Create: `src/lib/shared/guide-topics/grid-topic.ts`
- Test: `src/lib/shared/guide-topics/grid-topic.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/shared/guide-topics/grid-topic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import {
  GRID_OVERVIEW_CALLOUTS,
  GRID_TOPIC_UNITS,
  calloutLabel,
  calloutLineStart,
  gridTopicText,
} from "./grid-topic";

const english = en as Record<string, string>;

describe("Grid topic record", () => {
  it("resolves every unit to an English message", () => {
    for (const [unit, key] of Object.entries(GRID_TOPIC_UNITS)) {
      expect(english[key], `${unit} -> ${key}`).toBeTruthy();
    }
  });

  it("carries Austen's verbatim point definitions", () => {
    expect(gridTopicText("centerPoint")).toBe(
      "The <strong>center point</strong> is the hub that everything revolves around."
    );
    expect(gridTopicText("handPoints")).toBe(
      "The four <strong>hand points</strong> are halfway between the center point and the outer points."
    );
    expect(gridTopicText("outerPoints")).toBe(
      "The <strong>outer points</strong> depict the outer edges of the grid."
    );
  });

  it("splits the guide's point paragraph without changing a word", () => {
    const paragraph = english.verified_level1_grid_points
      .replace(/<br\s*\/?>/g, " ")
      .replace(/\s+/g, " ");
    for (const unit of ["centerPoint", "handPoints", "outerPoints"] as const) {
      expect(paragraph).toContain(gridTopicText(unit));
    }
  });

  it("labels each callout with the sheet's own words", () => {
    expect(GRID_OVERVIEW_CALLOUTS.map(calloutLabel)).toEqual([
      "center point",
      "hand points",
      "outer points",
    ]);
  });

  it("starts each callout line just off its grid point, toward the label", () => {
    for (const callout of GRID_OVERVIEW_CALLOUTS) {
      const start = calloutLineStart(callout);
      expect(
        Math.hypot(start.x - callout.anchor.x, start.y - callout.anchor.y)
      ).toBeCloseTo(26, 5);
      expect(
        Math.hypot(callout.lineEnd.x - start.x, callout.lineEnd.y - start.y)
      ).toBeLessThan(
        Math.hypot(
          callout.lineEnd.x - callout.anchor.x,
          callout.lineEnd.y - callout.anchor.y
        )
      );
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /e/worktrees/tka-platform/guide-grid-pilot && pnpm exec vitest run --config tests/config/vitest.config.ts src/lib/shared/guide-topics/grid-topic.test.ts
```

Expected: FAIL with `Failed to resolve import "./grid-topic"`.

- [ ] **Step 3: Write the record**

`src/lib/shared/guide-topics/grid-topic.ts`:

```ts
/**
 * The Grid's shared teaching content. The lesson, the Guide web page and the
 * print handbook read their explanations from here, so one edit reaches all
 * three. Every sentence is Austen's verbatim proof copy (verified_level1_*),
 * split into sentences where a view needs them one at a time. Interaction,
 * pacing and lesson prompts stay with each view.
 * Spec: docs/superpowers/specs/2026-10-10-guide-rethink-design.md
 */
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";

export const GRID_TOPIC_UNITS = {
  title: "verified_level1_the_grid",
  intro: "verified_level1_grid_intro",
  twoModes: "guide_topic_grid_two_modes",
  translates: "guide_topic_grid_translates",
  pointTypesLead: "guide_topic_grid_point_types_lead",
  centerPoint: "guide_topic_grid_center_point",
  handPoints: "guide_topic_grid_hand_points",
  outerPoints: "guide_topic_grid_outer_points",
  combination: "verified_level1_grid_combination",
  closing: "verified_level1_grid_closing",
  handsCaption: "verified_level1_grid_hands_caption",
  diamond: "verified_level1_diamond",
  box: "verified_level1_box",
  eightPoint: "verified_level1_eight_point_grid",
  diamondAria: "verified_level1_diamond_aria",
  boxAria: "verified_level1_box_aria",
  eightPointAria: "verified_level1_eight_point_aria",
} as const satisfies Record<string, TranslationKey>;

export type GridTopicUnit = keyof typeof GRID_TOPIC_UNITS;

export function gridTopicText(unit: GridTopicUnit): string {
  return t(GRID_TOPIC_UNITS[unit]);
}

type Point = { x: number; y: number };

export type GridCallout = {
  id: "center" | "hand" | "outer";
  /** The definition this callout names. */
  unit: Extract<GridTopicUnit, "centerPoint" | "handPoints" | "outerPoints">;
  /** Label words, from the print sheet's own callout runs. */
  label: readonly TranslationKey[];
  /** Grid point in GridSvg's 950-unit space (grid-coordinates.ts). */
  anchor: Point;
  lineEnd: Point;
  labelAt: Point;
  align: "start" | "end";
};

// The figure's overlay spans x -225..1175 so labels sit beside the 950-unit
// grid. Anchors are free points that the ALPHA3 hands do not cover: the
// center, the north hand point and the west outer point.
export const GRID_OVERVIEW_CALLOUTS: readonly GridCallout[] = [
  {
    id: "center",
    unit: "centerPoint",
    label: ["verified_level1_center", "verified_level1_point"],
    anchor: { x: 475, y: 475 },
    lineEnd: { x: 960, y: 840 },
    labelAt: { x: 1150, y: 900 },
    align: "end",
  },
  {
    id: "hand",
    unit: "handPoints",
    label: ["verified_level1_hand", "verified_level1_points"],
    anchor: { x: 475, y: 331.9 },
    lineEnd: { x: 960, y: 150 },
    labelAt: { x: 1150, y: 120 },
    align: "end",
  },
  {
    id: "outer",
    unit: "outerPoints",
    label: ["verified_level1_outer", "verified_level1_points"],
    anchor: { x: 175, y: 475 },
    lineEnd: { x: -40, y: 840 },
    labelAt: { x: -200, y: 900 },
    align: "start",
  },
];

export function calloutLabel(callout: GridCallout): string {
  return callout.label.map((key) => t(key)).join(" ");
}

/** Start the line a little off the point so it never covers the dot. */
export function calloutLineStart(callout: GridCallout, gap = 26): Point {
  const dx = callout.lineEnd.x - callout.anchor.x;
  const dy = callout.lineEnd.y - callout.anchor.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: callout.anchor.x + (dx / length) * gap,
    y: callout.anchor.y + (dy / length) * gap,
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run the same command as Step 2. Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd /e/worktrees/tka-platform/guide-grid-pilot && git commit -m "feat(guide): shared Grid topic record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/guide-topics/grid-topic.ts src/lib/shared/guide-topics/grid-topic.test.ts
```

Git commits untracked files named in a pathspec only after `git add`, so run `git add -- <those two paths>` first.

---

### Task 3: The lesson reads its definitions from the record

The lesson keeps its step titles, its diamond and box direction prompts, its "We'll use this grid…" line and its screen-reader announcements. Only the explanation sentences that the guide also teaches switch over: the intro, the two-modes line, and the three point definitions.

**Files:**
- Create: `src/routes/(public)/guide/level-1/_topics/grid-topic-shared-edit.svelte.test.ts`
- Create: `src/routes/(public)/guide/level-1/_topics/__test-stubs__/EmptyStub.svelte`
- Modify: `src/lib/features/learn/components/interactive/grid-concept/GridStepHeader.svelte`
- Modify: `src/lib/features/learn/components/interactive/grid-concept/GridScrollView.svelte:17-75`

- [ ] **Step 1: Create the stub**

`src/routes/(public)/guide/level-1/_topics/__test-stubs__/EmptyStub.svelte`:

```svelte
<!-- Stands in for client-only pictograph art in component tests. -->
<div data-testid="art-stub"></div>
```

- [ ] **Step 2: Write the failing proof test (lesson case)**

`src/routes/(public)/guide/level-1/_topics/grid-topic-shared-edit.svelte.test.ts`:

```ts
/**
 * Proof for the guide rethink pilot: the Grid's explanations live in one
 * record. Replacing a unit's text there must change the lesson, the web topic
 * page and the print handbook page together.
 */
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/guide-topics/grid-topic.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("#lib/shared/guide-topics/grid-topic.js")>();
  return { ...actual, gridTopicText: (unit: string) => `PROBE:${unit}` };
});

import GridStepHeader from "#lib/features/learn/components/interactive/grid-concept/GridStepHeader.svelte";

const DEFINITIONS = ["centerPoint", "handPoints", "outerPoints"] as const;

describe("one shared edit reaches every Grid view", () => {
  it("the lesson shows each shared point definition at its step", async () => {
    for (const [phase, unit] of [
      ["center", "centerPoint"],
      ["hand", "handPoints"],
      ["outer", "outerPoints"],
    ] as const) {
      const screen = render(GridStepHeader, {
        step: 2,
        gridPhase: "split",
        pointTypePhase: phase,
      });
      await expect.element(screen.getByText(`PROBE:${unit}`)).toBeInTheDocument();
      screen.unmount();
    }
  });

  it("the lesson opens with the shared intro", async () => {
    const screen = render(GridStepHeader, {
      step: 0,
      gridPhase: "split",
      pointTypePhase: "center",
    });
    await expect.element(screen.getByText("PROBE:intro")).toBeInTheDocument();
  });
});

export { DEFINITIONS };
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd /e/worktrees/tka-platform/guide-grid-pilot && NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run --config tests/config/vitest.components.config.ts --browser.screenshotFailures=false "src/routes/(public)/guide/level-1/_topics/grid-topic-shared-edit.svelte.test.ts" > /tmp/grid-proof.log 2>&1; tail -30 /tmp/grid-proof.log
```

Expected: 2 failed. The lesson still renders `learn_ui_*` text, so `PROBE:` is never found.

- [ ] **Step 4: Switch GridStepHeader to the record**

In `GridStepHeader.svelte`, add the import after the `MessageMarkup` import:

```ts
  import { gridTopicText } from "#lib/shared/guide-topics/grid-topic.js";
```

Replace these four body lines:

```svelte
      <MessageMarkup text={t("learn_ui_grid_intro")} />
```
```svelte
        <MessageMarkup text={t("learn_ui_grid_two_modes_intro")} />
```
```svelte
      <MessageMarkup text={t("learn_ui_center_point_intro")} />
```
```svelte
      <MessageMarkup text={t("learn_ui_hand_points_intro")} />
```
```svelte
      <MessageMarkup text={t("learn_ui_outer_points_intro")} />
```

with, respectively:

```svelte
      <MessageMarkup text={gridTopicText("intro")} />
```
```svelte
        <MessageMarkup text={gridTopicText("twoModes")} />
```
```svelte
      <MessageMarkup text={gridTopicText("centerPoint")} />
```
```svelte
      <MessageMarkup text={gridTopicText("handPoints")} />
```
```svelte
      <MessageMarkup text={gridTopicText("outerPoints")} />
```

That is five replacements: one intro, one two-modes line, three definitions.

- [ ] **Step 5: Switch GridScrollView to the record**

In `GridScrollView.svelte`, add the same import to its `<script>`. Replace line 19's `t("learn_ui_grid_intro")` with `gridTopicText("intro")`. Then replace the whole `point-types-summary` block:

```svelte
    <div class="point-types-summary">
      <div class="point-type-row">
        <strong>{t("learn_ui_center_point")}</strong> – {t(
          "learn_ui_center_point_desc"
        )}
      </div>
      <div class="point-type-row">
        <strong>{t("learn_ui_four_hand_points")}</strong> – {t(
          "learn_ui_hand_points_desc"
        )}
      </div>
      <div class="point-type-row">
        <strong>{t("learn_ui_four_outer_points")}</strong> – {t(
          "learn_ui_outer_points_desc"
        )}
      </div>
    </div>
```

with:

```svelte
    <div class="point-types-summary">
      <div class="point-type-row">
        <MessageMarkup text={gridTopicText("centerPoint")} />
      </div>
      <div class="point-type-row">
        <MessageMarkup text={gridTopicText("handPoints")} />
      </div>
      <div class="point-type-row">
        <MessageMarkup text={gridTopicText("outerPoints")} />
      </div>
    </div>
```

The definitions already bold the point name, so the separate label and dash are dropped.

- [ ] **Step 6: Run the proof test and watch it pass**

Same command as Step 3. Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
cd /e/worktrees/tka-platform/guide-grid-pilot && git add -- "src/routes/(public)/guide/level-1/_topics/grid-topic-shared-edit.svelte.test.ts" "src/routes/(public)/guide/level-1/_topics/__test-stubs__/EmptyStub.svelte" && git commit -m "feat(learn): Grid lesson reads its definitions from the shared topic record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "src/routes/(public)/guide/level-1/_topics/grid-topic-shared-edit.svelte.test.ts" "src/routes/(public)/guide/level-1/_topics/__test-stubs__/EmptyStub.svelte" src/lib/features/learn/components/interactive/grid-concept/GridStepHeader.svelte src/lib/features/learn/components/interactive/grid-concept/GridScrollView.svelte
```

---

### Task 4: The Grid web topic page ("labeled overview first")

**Files:**
- Create: `src/routes/(public)/guide/level-1/_topics/GridHandsArt.svelte`
- Create: `src/routes/(public)/guide/level-1/_topics/LabeledGridFigure.svelte`
- Create: `src/routes/(public)/guide/level-1/_topics/GridModesEquation.svelte`
- Create: `src/routes/(public)/guide/level-1/_topics/GridTopicPage.svelte`
- Create: `src/routes/(public)/guide/level-1/_topics/topic-pages.ts`
- Modify: `src/routes/(public)/guide/level-1/_topics/grid-topic-shared-edit.svelte.test.ts`
- Modify: `src/routes/(public)/guide/level-1/_components/GuidePageHost.svelte`

- [ ] **Step 1: Add the failing web-page case to the proof test**

In `grid-topic-shared-edit.svelte.test.ts`, add this after the existing `vi.mock` call:

```ts
vi.mock("./GridHandsArt.svelte", async () => ({
  default: (await import("./__test-stubs__/EmptyStub.svelte")).default,
}));
```

Add this import after the GridStepHeader import:

```ts
import GridTopicPage from "./GridTopicPage.svelte";
```

Add this case inside the `describe`:

```ts
  it("the web topic page shows every shared definition and the intro", async () => {
    const screen = render(GridTopicPage, {
      darkMode: false,
      kicker: "Level 1 · Positions / Motions",
      lessonHref: "/learn/concepts/grid",
    });
    for (const unit of [...DEFINITIONS, "intro", "closing"]) {
      await expect.element(screen.getByText(`PROBE:${unit}`)).toBeInTheDocument();
    }
  });
```

Remove the trailing `export { DEFINITIONS };` line, which is no longer needed.

- [ ] **Step 2: Run it and watch it fail**

Same command as Task 3 Step 3. Expected: FAIL resolving `./GridTopicPage.svelte`.

- [ ] **Step 3: Create GridHandsArt.svelte**

```svelte
<!--
  The two hands on the diamond grid (ALPHA3: blue at west, red at east), the
  same canonical pictograph the print sheet uses. It prepares on the client,
  so it mounts after hydration inside a box its parent sizes; nothing shifts
  when it appears, and prerendering never touches the pictograph pipeline.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { THE_GRID_ALPHA3 } from "../_data/the-grid-pictograph";

  let {
    darkMode = false,
    printMode = false,
  }: { darkMode?: boolean; printMode?: boolean } = $props();

  let mounted = $state(false);
  onMount(() => (mounted = true));
</script>

<div class="hands-art">
  {#if mounted && THE_GRID_ALPHA3}
    <PictographContainer
      pictographData={THE_GRID_ALPHA3}
      gridMode={GridMode.DIAMOND}
      leftPropTypeOverride={PropType.HAND}
      rightPropTypeOverride={PropType.HAND}
      showGrid={true}
      showTKA={false}
      showPlacements={false}
      showReversals={false}
      showTnD={false}
      showElemental={false}
      showNonRadialPoints={false}
      showHandPoints={true}
      {darkMode}
      {printMode}
      disableTransitions={true}
    />
  {/if}
</div>

<style>
  .hands-art {
    width: 100%;
    height: 100%;
  }
</style>
```

- [ ] **Step 4: Create LabeledGridFigure.svelte**

```svelte
<!--
  The Grid's labeled overview: the two-hand pictograph with callout lines
  naming the center point, a hand point and an outer point. This restores
  the print sheet's annotations on the web. Label words and geometry come
  from the shared topic record.
-->
<script lang="ts">
  import GridHandsArt from "./GridHandsArt.svelte";
  import {
    GRID_OVERVIEW_CALLOUTS,
    calloutLabel,
    calloutLineStart,
    gridTopicText,
  } from "#lib/shared/guide-topics/grid-topic.js";

  let {
    darkMode = false,
    printMode = false,
  }: { darkMode?: boolean; printMode?: boolean } = $props();
</script>

<figure class="labeled-grid">
  <div class="stage">
    <div class="art"><GridHandsArt {darkMode} {printMode} /></div>
    <svg class="callouts" viewBox="-225 0 1400 950" aria-hidden="true">
      {#each GRID_OVERVIEW_CALLOUTS as callout (callout.id)}
        {@const start = calloutLineStart(callout)}
        <line
          x1={start.x}
          y1={start.y}
          x2={callout.lineEnd.x}
          y2={callout.lineEnd.y}
        />
        <text
          x={callout.labelAt.x}
          y={callout.labelAt.y}
          text-anchor={callout.align}>{calloutLabel(callout)}</text
        >
      {/each}
    </svg>
  </div>
  <figcaption>{gridTopicText("handsCaption")}</figcaption>
</figure>

<style>
  .labeled-grid {
    margin: 0;
    display: grid;
    gap: 0.6rem;
    color: var(--ink, #1a1a1a);
  }
  /* The overlay is 1400 units wide with the 950-unit grid inset by 225, so
     the art box takes 950/1400 of the width, offset by 225/1400. */
  .stage {
    position: relative;
    aspect-ratio: 1400 / 950;
  }
  .art {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 16.0714%;
    width: 67.8571%;
  }
  .callouts {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }
  .callouts line {
    stroke: currentColor;
    stroke-width: 3;
    opacity: 0.55;
  }
  .callouts text {
    fill: currentColor;
    font-size: 52px;
    font-weight: 600;
    font-family: inherit;
  }
  figcaption {
    font-size: 0.85rem;
    color: var(--ink-dim, #555);
    text-align: center;
  }
</style>
```

- [ ] **Step 5: Create GridModesEquation.svelte**

```svelte
<!--
  Diamond + Box = 8-point grid, drawn as an equation the way the print sheet
  does, instead of a toggle that hides two of the three states.
-->
<script lang="ts">
  import GridSvg from "#lib/shared/pictograph/grid/components/GridSvg.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import {
    gridTopicText,
    type GridTopicUnit,
  } from "#lib/shared/guide-topics/grid-topic.js";

  let { darkMode = false }: { darkMode?: boolean } = $props();

  const terms: {
    mode: "diamond" | "box" | "merged";
    label: GridTopicUnit;
    aria: GridTopicUnit;
  }[] = [
    { mode: "diamond", label: "diamond", aria: "diamondAria" },
    { mode: "box", label: "box", aria: "boxAria" },
    { mode: "merged", label: "eightPoint", aria: "eightPointAria" },
  ];
</script>

<div class="modes-equation">
  {#each terms as term, index (term.mode)}
    {#if index === 1}<span class="op" aria-hidden="true">+</span>{/if}
    {#if index === 2}<span class="op" aria-hidden="true">=</span>{/if}
    <figure class="term">
      <svg viewBox="0 0 950 950" role="img" aria-label={gridTopicText(term.aria)}>
        {#if term.mode === "merged"}
          <GridSvg gridMode={GridMode.DIAMOND} {darkMode} />
          <GridSvg gridMode={GridMode.BOX} {darkMode} />
        {:else}
          <GridSvg
            gridMode={term.mode === "box" ? GridMode.BOX : GridMode.DIAMOND}
            {darkMode}
          />
        {/if}
      </svg>
      <figcaption>{gridTopicText(term.label)}</figcaption>
    </figure>
  {/each}
</div>

<style>
  .modes-equation {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: clamp(0.4rem, 1.5vw, 1rem);
    max-width: 40rem;
  }
  .term {
    margin: 0;
    display: grid;
    gap: 0.35rem;
    justify-items: center;
  }
  .term svg {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
  }
  /* GridSvg fades in through its own visible state; show it at once here. */
  .term :global(.grid-svg),
  .term :global(svg *) {
    opacity: 1;
  }
  .op {
    font-size: clamp(1.2rem, 3vw, 1.8rem);
    color: var(--ink-dim, #555);
  }
  figcaption {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink, #1a1a1a);
  }
</style>
```

- [ ] **Step 6: Create GridTopicPage.svelte**

```svelte
<!--
  The Grid as a Guide web page, "labeled overview first" (approved
  2026-10-10). The answer sits on the first screen: one labeled figure
  with the three definitions beside it. Then the 8-point grid comparison
  and the closing line, then a link into the lesson. Every sentence comes
  from the shared topic record.
-->
<script lang="ts">
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import MessageMarkup from "#lib/shared/i18n/MessageMarkup.svelte";
  import { gridTopicText } from "#lib/shared/guide-topics/grid-topic.js";
  import LabeledGridFigure from "./LabeledGridFigure.svelte";
  import GridModesEquation from "./GridModesEquation.svelte";
  import type { TopicPageProps } from "./topic-pages";

  let { darkMode, kicker, lessonHref }: TopicPageProps = $props();

  const definitions = [
    { unit: "centerPoint", point: "center" },
    { unit: "handPoints", point: "hand" },
    { unit: "outerPoints", point: "outer" },
  ] as const;
</script>

<article class="grid-topic">
  <header class="topic-head">
    <p class="kicker">{kicker}</p>
    <h1>{gridTopicText("title")}</h1>
    <p class="lede">{gridTopicText("intro")}</p>
  </header>

  <section class="overview" aria-labelledby="grid-points-lead">
    <LabeledGridFigure {darkMode} />
    <div class="definitions">
      <p id="grid-points-lead" class="lead">
        {gridTopicText("pointTypesLead")}
      </p>
      <ul>
        {#each definitions as definition (definition.unit)}
          <li>
            <span class="swatch {definition.point}" aria-hidden="true"></span>
            <span><MessageMarkup text={gridTopicText(definition.unit)} /></span>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <section class="modes" aria-labelledby="grid-modes-heading">
    <h2 id="grid-modes-heading">{gridTopicText("eightPoint")}</h2>
    <p>
      <MessageMarkup text={gridTopicText("twoModes")} />
      <MessageMarkup text={gridTopicText("translates")} />
    </p>
    <p>{gridTopicText("combination")}</p>
    <GridModesEquation {darkMode} />
  </section>

  <aside class="remember">
    <p>{gridTopicText("closing")}</p>
  </aside>

  {#if lessonHref}
    <p class="lesson-link">
      <LinkChip href={lessonHref}
        ><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
        Learn this interactively</LinkChip
      >
    </p>
  {/if}
</article>

<style>
  .grid-topic {
    max-width: 76rem;
    margin: 0 auto;
    padding: 1.5rem clamp(1rem, 4cqw, 2.5rem) 2rem;
    display: grid;
    gap: clamp(1.75rem, 4cqw, 3rem);
    font-family: Inter, system-ui, sans-serif;
    color: var(--ink, #1a1a1a);
    text-align: left;
  }
  .topic-head {
    display: grid;
    gap: 0.5rem;
    max-width: 44rem;
  }
  .kicker {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-dim, #555);
  }
  h1 {
    margin: 0;
    font-size: clamp(2.4rem, 5cqw, 3.6rem);
    font-weight: 750;
    line-height: 1.02;
    letter-spacing: -0.03em;
  }
  .lede {
    margin: 0;
    font-size: clamp(1.05rem, 1.6cqw, 1.25rem);
    line-height: 1.55;
  }
  .overview {
    display: grid;
    gap: 1.5rem;
    align-items: center;
  }
  @container (min-width: 56rem) {
    .overview {
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
      gap: clamp(2rem, 4cqw, 4rem);
    }
  }
  .definitions {
    display: grid;
    gap: 1rem;
  }
  .lead {
    margin: 0;
    font-weight: 600;
  }
  .definitions ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 1rem;
  }
  .definitions li {
    display: grid;
    grid-template-columns: 1.4rem minmax(0, 1fr);
    gap: 0.75rem;
    align-items: start;
    font-size: clamp(1rem, 1.4cqw, 1.15rem);
    line-height: 1.5;
  }
  /* Swatches echo the grid's own dots: a small solid center, a smaller
     hand point and a large outer point. */
  .swatch {
    justify-self: center;
    margin-top: 0.45em;
    border-radius: 50%;
    background: currentColor;
  }
  .swatch.center {
    width: 0.6rem;
    height: 0.6rem;
  }
  .swatch.hand {
    width: 0.45rem;
    height: 0.45rem;
    opacity: 0.6;
  }
  .swatch.outer {
    width: 0.85rem;
    height: 0.85rem;
  }
  .modes {
    display: grid;
    gap: 0.75rem;
    max-width: 44rem;
  }
  h2 {
    margin: 0;
    font-size: clamp(1.4rem, 2.6cqw, 1.9rem);
    font-weight: 700;
  }
  .modes p {
    margin: 0;
    line-height: 1.55;
  }
  .remember {
    max-width: 44rem;
    padding: 1rem 1.25rem;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    background: color-mix(in srgb, currentColor 4%, transparent);
  }
  .remember p {
    margin: 0;
    font-weight: 600;
  }
  .lesson-link {
    margin: 0;
  }
</style>
```

- [ ] **Step 7: Create topic-pages.ts**

```ts
import type { Component } from "svelte";
import GridTopicPage from "./GridTopicPage.svelte";

/** Props every migrated Guide topic page receives from GuidePageHost. */
export type TopicPageProps = {
  darkMode: boolean;
  kicker: string;
  lessonHref: string | null;
};

/**
 * Guide topics that have moved to the shared-record page template. Any slug
 * not listed here keeps the FlowFrame or sheet rendering.
 */
export const TOPIC_PAGES: Readonly<Record<string, Component<TopicPageProps>>> = {
  "the-grid": GridTopicPage,
};
```

- [ ] **Step 8: Run the proof test and watch it pass**

Same command as Task 3 Step 3. Expected: 3 passed. If the run fails because `GridSvg` throws in the browser runner (DI or service setup), mock `./GridModesEquation.svelte` with the same stub: add a second `vi.mock` call mirroring the GridHandsArt one, using the path `./GridModesEquation.svelte`. The definitions still carry the proof.

- [ ] **Step 9: Render the topic page from GuidePageHost**

In `GuidePageHost.svelte`, make these edits.

Change the manifest import line to:

```ts
  import { GUIDE_BODY_PAGES, GROUP_TITLES } from "../_data/guide-manifest";
```

After the `import "../_styles/guide.css";` line, add:

```ts
  import { TOPIC_PAGES } from "../_topics/topic-pages";
```

After `const interactiveLesson = $derived(getConceptExperienceForGuideSlug(slug));`, add:

```ts
  const TopicPage = $derived(TOPIC_PAGES[slug] ?? null);
  const topicKicker = $derived(
    meta ? `Level 1 · ${GROUP_TITLES[meta.group]}` : "Level 1"
  );
```

In the markup, wrap the existing `<header class="topic-hero" ...>…</header>` and the following `{#if useFlow && content}…{/if}` block in a new branch. Leave their inner content exactly as it is:

```svelte
    {#if TopicPage}
      <TopicPage
        darkMode={isDark}
        kicker={topicKicker}
        lessonHref={interactiveLesson
          ? buildConceptPath(interactiveLesson.conceptId)
          : null}
      />
    {:else}
      <header class="topic-hero" class:sheet-topic={!canFlow}>
        <!-- unchanged -->
      </header>

      {#if useFlow && content}
        <!-- unchanged FlowFrame / sheet branches -->
      {/if}
    {/if}
```

The `<!-- unchanged -->` markers stand for the existing markup, moved in one level. Do not delete it. `<nav class="topic-nav">` stays after the new `{/if}`.

- [ ] **Step 10: Type-check the touched files**

```bash
cd /e/worktrees/tka-platform/guide-grid-pilot && npm run check:fast 2>&1 | tail -20
```

Expected: no errors in `_topics/*`, `GuidePageHost.svelte`, `grid-topic.ts`, `GridStepHeader.svelte` or `GridScrollView.svelte`. Errors in other files predate this branch and are not this task's concern; grep the output for the touched paths only.

- [ ] **Step 11: Commit**

```bash
cd /e/worktrees/tka-platform/guide-grid-pilot && git add -- "src/routes/(public)/guide/level-1/_topics/GridHandsArt.svelte" "src/routes/(public)/guide/level-1/_topics/LabeledGridFigure.svelte" "src/routes/(public)/guide/level-1/_topics/GridModesEquation.svelte" "src/routes/(public)/guide/level-1/_topics/GridTopicPage.svelte" "src/routes/(public)/guide/level-1/_topics/topic-pages.ts" && git commit -m "feat(guide): Grid topic page with labeled overview, from the shared record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "src/routes/(public)/guide/level-1/_topics/" "src/routes/(public)/guide/level-1/_components/GuidePageHost.svelte"
```

---

### Task 5: One composed print handbook page

The faithful book (`/guide/level-1/print`, `/book`) stays untouched. This adds a separate, unlinked, noindex route that prints one Letter page composed from the shared record. Austen judges it as the first handbook page.

**Files:**
- Create: `src/routes/(public)/guide/level-1/_topics/GridHandbookPage.svelte`
- Create: `src/routes/(public)/guide/level-1/handbook/+page.ts`
- Create: `src/routes/(public)/guide/level-1/handbook/+page@(public).svelte`
- Modify: `src/routes/(public)/guide/level-1/_topics/grid-topic-shared-edit.svelte.test.ts`

- [ ] **Step 1: Add the failing handbook case**

Add this import after the GridTopicPage import:

```ts
import GridHandbookPage from "./GridHandbookPage.svelte";
```

Add this case:

```ts
  it("the print handbook page shows every shared definition", async () => {
    const screen = render(GridHandbookPage, { pageNumber: 1 });
    for (const unit of [...DEFINITIONS, "intro", "closing"]) {
      await expect.element(screen.getByText(`PROBE:${unit}`)).toBeInTheDocument();
    }
  });
```

- [ ] **Step 2: Run it and watch it fail**

Same command as Task 3 Step 3. Expected: FAIL resolving `./GridHandbookPage.svelte`.

- [ ] **Step 3: Create GridHandbookPage.svelte**

```svelte
<!--
  The Grid as a print handbook page: one US Letter sheet composed from the
  shared topic record. Captions stay beside their figures and the comparison
  is shown whole, ink on white. Pagination is authored per page; this is
  page one of the new handbook (spec 2026-10-10-guide-rethink-design.md).
-->
<script lang="ts">
  import MessageMarkup from "#lib/shared/i18n/MessageMarkup.svelte";
  import { gridTopicText } from "#lib/shared/guide-topics/grid-topic.js";
  import LabeledGridFigure from "./LabeledGridFigure.svelte";
  import GridModesEquation from "./GridModesEquation.svelte";

  let { pageNumber }: { pageNumber: number } = $props();
</script>

<section class="handbook-page">
  <h1>{gridTopicText("title")}</h1>
  <p class="lede">{gridTopicText("intro")}</p>

  <div class="overview">
    <LabeledGridFigure darkMode={false} printMode={true} />
    <div class="definitions">
      <p class="lead">{gridTopicText("pointTypesLead")}</p>
      <p><MessageMarkup text={gridTopicText("centerPoint")} /></p>
      <p><MessageMarkup text={gridTopicText("handPoints")} /></p>
      <p><MessageMarkup text={gridTopicText("outerPoints")} /></p>
    </div>
  </div>

  <h2>{gridTopicText("eightPoint")}</h2>
  <p>
    <MessageMarkup text={gridTopicText("twoModes")} />
    <MessageMarkup text={gridTopicText("translates")} />
  </p>
  <p>{gridTopicText("combination")}</p>
  <GridModesEquation darkMode={false} />

  <p class="remember">{gridTopicText("closing")}</p>

  <footer>
    <span>Level 1 · Positions / Motions</span>
    <span>{pageNumber}</span>
  </footer>
</section>

<style>
  .handbook-page {
    --ink: #1d1d24;
    --ink-dim: #55545e;
    box-sizing: border-box;
    width: 8.5in;
    height: 11in;
    padding: 0.7in 0.75in 0.55in;
    background: #ffffff;
    color: var(--ink);
    font-family: Inter, system-ui, sans-serif;
    font-size: 11pt;
    line-height: 1.45;
    display: flex;
    flex-direction: column;
    gap: 0.14in;
    overflow: hidden;
  }
  h1 {
    margin: 0;
    font-size: 28pt;
    font-weight: 750;
    letter-spacing: -0.02em;
  }
  h2 {
    margin: 0.08in 0 0;
    font-size: 15pt;
  }
  p {
    margin: 0;
  }
  .lede {
    font-size: 12.5pt;
  }
  .overview {
    display: grid;
    grid-template-columns: 1.15fr 1fr;
    gap: 0.3in;
    align-items: center;
  }
  .definitions {
    display: grid;
    gap: 0.1in;
  }
  .lead {
    font-weight: 600;
  }
  .remember {
    padding: 0.1in 0.14in;
    border: 1px solid #cfccc2;
    border-radius: 6px;
    font-weight: 600;
  }
  footer {
    margin-top: auto;
    display: flex;
    justify-content: space-between;
    font-size: 8.5pt;
    color: var(--ink-dim);
  }
</style>
```

- [ ] **Step 4: Create the route**

`src/routes/(public)/guide/level-1/handbook/+page.ts`:

```ts
// The handbook pilot prints pictographs that prepare client-side, like the
// faithful /print document, so it renders at runtime and is not prerendered.
export const prerender = false;
```

`src/routes/(public)/guide/level-1/handbook/+page@(public).svelte`:

```svelte
<!--
  New Level 1 handbook (pilot). One page so far, The Grid, composed from the
  shared topic record. Unlinked and noindex until Austen approves it; the
  faithful first-edition book stays at /guide/level-1/print.
-->
<script lang="ts">
  import GridHandbookPage from "../_topics/GridHandbookPage.svelte";
</script>

<svelte:head>
  <title>Level 1 Handbook (pilot)</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="handbook">
  <GridHandbookPage pageNumber={1} />
</main>

<style>
  .handbook {
    min-height: 100vh;
    padding: 2rem 1rem;
    background: #e9e7e1;
    display: grid;
    justify-content: center;
    align-content: start;
    overflow-x: auto;
  }
  .handbook :global(.handbook-page) {
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.18);
  }
  @media print {
    @page {
      size: letter;
      margin: 0;
    }
    .handbook {
      padding: 0;
      background: none;
    }
    .handbook :global(.handbook-page) {
      box-shadow: none;
    }
  }
</style>
```

- [ ] **Step 5: Run the proof test and watch it pass**

Same command as Task 3 Step 3. Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
cd /e/worktrees/tka-platform/guide-grid-pilot && git add -- "src/routes/(public)/guide/level-1/_topics/GridHandbookPage.svelte" "src/routes/(public)/guide/level-1/handbook/" && git commit -m "feat(guide): first handbook page (The Grid) from the shared record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- "src/routes/(public)/guide/level-1/_topics/GridHandbookPage.svelte" "src/routes/(public)/guide/level-1/_topics/grid-topic-shared-edit.svelte.test.ts" "src/routes/(public)/guide/level-1/handbook/"
```

---

### Task 6: Lesson-first welcome at the Guide front door

**Files:**
- Modify: `messages/en.json` (five keys)
- Modify: `src/routes/(public)/guide/+page.svelte`
- Modify: `src/routes/(public)/guide/level-1/_components/GuideDocument.svelte:60-75`

- [ ] **Step 1: Add the English keys**

Insert these directly after `"guide_hub_interactive_lessons"` in `messages/en.json`. The three welcome strings are verbatim from `GuideDocument.svelte` TX.readme[0], [1] and [3]. The two button labels are the only new wording in this plan.

```json
  "guide_hub_start_lesson": "Start the first lesson",
  "guide_hub_read_guide": "Read the guide",
  "guide_welcome_greeting": "Greetings, flow arts aficionado!",
  "guide_welcome_what": "You've come across The Kinetic Alphabet, a notation system designed to help you craft and communicate your own unique choreography. This grid-based language is designed for music, using pictographs and letters that combine like puzzle pieces for each step. This system has propelled my sequence creation to new heights, and I hope it will do the same for you!",
  "guide_welcome_pictographs": "Pictographs form the core of The Kinetic Alphabet. The letters are a useful tool to categorize and communicate the pictographs, but they are secondary to the pictographs themselves. It's not necessary to memorize the letters immediately to benefit from this system.",
```

Other locales fall back to English until translated (see Open for Austen).

- [ ] **Step 2: Make the print book's "Read Me First" read the same keys**

In `GuideDocument.svelte`, add `import { t } from "#lib/shared/i18n/i18n.svelte.js";` to the script imports. In the `TX` state, replace the first, second and fourth `readme` entries:

```ts
    readme: [
      t("guide_welcome_greeting"),
      t("guide_welcome_what"),
      "The Kinetic Alphabet is a fusion of elements from VTG (Vulcan Tech Gospel), siteswap (Juggling Notation), and musical notation. Although it can be introduced to beginners, it's designed for intermediate learners, bridging the gap between improvisation and choreography. Originally built for double staves, it can be applied to any dual wielded static prop like clubs, fans, triads, buugeng, and more.",
      t("guide_welcome_pictographs"),
      "This is a work-in-progress and is continually growing. Whether you fully embrace this system, draw inspiration from certain parts, or follow a different path altogether, I hope the ideas presented here contribute to your creative growth.",
      "I can't wait to see the unique choreography you'll create!",
      "With love,<br /><span class=\"rm-sig\">Austen Cloud</span>",
    ],
```

- [ ] **Step 3: Rebuild the hub intro as the welcome**

In `src/routes/(public)/guide/+page.svelte`, change the manifest import line to:

```ts
  import { GROUP_TITLES, bodyPagesByGroup } from "./level-1/_data/guide-manifest";
  import { getAvailableConcepts } from "#lib/features/learn/domain/concept-experience-registry.js";
  import { buildConceptPath } from "#lib/features/learn/domain/concept-routes.js";
```

After the `localizedFirstTopicLabel` declaration, add:

```ts
  // Lesson first (approved 2026-10-10): the primary action opens the first
  // published lesson; reading the written guide is the second choice.
  const firstLesson = getAvailableConcepts()[0];
  const firstLessonHref = buildConceptPath(firstLesson?.id);
  const levelOnePath = bodyPagesByGroup().map((bucket) => ({
    title: GROUP_TITLES[bucket.group],
    href: `/guide/level-1/${bucket.entries[0]?.entry.id ?? ""}`,
  }));
```

Replace the whole `<header class="intro">…</header>` element with:

```svelte
      <header class="intro">
        <span class="kicker">{tDynamic("guide_hub_kicker")}</span>
        <h1>{tDynamic("guide_hub_title")}</h1>
        <div class="welcome">
          <p class="welcome-greeting">{tDynamic("guide_welcome_greeting")}</p>
          <p>{tDynamic("guide_welcome_what")}</p>
          <p>{tDynamic("guide_welcome_pictographs")}</p>
        </div>
        <ol class="level-path" aria-label={tDynamic("guide_hub_level1_title")}>
          {#each levelOnePath as stop, index (stop.href)}
            <li>
              <a href={stop.href}>
                <span class="path-number" aria-hidden="true">{index + 1}</span>
                <strong>{stop.title}</strong>
              </a>
            </li>
          {/each}
        </ol>
        <div class="intro-actions">
          <a class="primary-action" href={firstLessonHref}>
            {tDynamic("guide_hub_start_lesson")}
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </a>
          <a class="secondary-action" href={firstTopicHref}>
            {tDynamic("guide_hub_read_guide")}
          </a>
        </div>
      </header>
```

Replace the existing `.intro > p { … }` rule with these styles, keeping the other rules:

```css
  .welcome {
    max-width: 44rem;
    margin-top: 1.4rem;
    display: grid;
    gap: 0.9rem;
  }

  .welcome p {
    margin: 0;
    color: var(--guide-text-dim);
    font-size: clamp(1rem, 1.35vw, 1.18rem);
    line-height: 1.65;
    text-wrap: pretty;
  }

  .welcome .welcome-greeting {
    color: var(--guide-text);
    font-weight: 650;
  }

  .level-path {
    margin: 1.6rem 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .level-path a {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.55rem 0.95rem;
    border: 1px solid var(--guide-stroke);
    border-radius: 999px;
    background: var(--guide-card);
    color: var(--guide-text);
    text-decoration: none;
  }

  .level-path a:hover,
  .level-path a:focus-visible {
    border-color: var(--guide-accent);
  }

  .path-number {
    display: inline-grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: color-mix(in srgb, var(--guide-accent) 22%, transparent);
    font-size: 0.8rem;
    font-weight: 700;
  }
```

`guide_hub_intro` is no longer used. Task 7 removes it.

- [ ] **Step 4: Type-check**

Same command as Task 4 Step 10. Expected: no new errors in the two touched files.

- [ ] **Step 5: Commit**

```bash
cd /e/worktrees/tka-platform/guide-grid-pilot && git commit -m "feat(guide): lesson-first welcome from Read Me First at the Guide front door

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- messages/en.json "src/routes/(public)/guide/+page.svelte" "src/routes/(public)/guide/level-1/_components/GuideDocument.svelte"
```

---

### Task 7: Remove translation keys nothing uses anymore

**Files:**
- Modify: `messages/*.json`
- Scratch (not committed): `.../scratchpad/remove-keys.mjs`

- [ ] **Step 1: Confirm each candidate has no remaining users**

```bash
cd /e/worktrees/tka-platform/guide-grid-pilot && for k in learn_ui_grid_intro learn_ui_grid_two_modes_intro learn_ui_center_point_intro learn_ui_hand_points_intro learn_ui_outer_points_intro learn_ui_center_point_desc learn_ui_hand_points_desc learn_ui_outer_points_desc learn_ui_four_hand_points learn_ui_four_outer_points guide_hub_intro; do n=$(rg -l "\b$k\b" src scripts tests 2>/dev/null | wc -l); echo "$k $n"; done
```

Expected: each line ends in `0`. Remove only keys with `0`; keep any key that still has a user.

- [ ] **Step 2: Write the removal script**

```js
// remove-keys.mjs <messagesDir> <key> [key...]
import fs from "node:fs";
import path from "node:path";

const [dir, ...keys] = process.argv.slice(2);
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const full = path.join(dir, file);
  const msgs = JSON.parse(fs.readFileSync(full, "utf8"));
  let removed = 0;
  for (const key of keys) {
    if (key in msgs) {
      delete msgs[key];
      removed += 1;
    }
  }
  fs.writeFileSync(full, JSON.stringify(msgs, null, 2) + "\n");
  console.log(`${file}: removed ${removed}`);
}
```

- [ ] **Step 3: Run it with the keys confirmed in Step 1**

```bash
node C:/Users/Austen/AppData/Local/Temp/claude/E--tka-platform/c4226b80-e546-4d19-baea-11386906c87d/scratchpad/remove-keys.mjs /e/worktrees/tka-platform/guide-grid-pilot/messages <confirmed keys>
cd /e/worktrees/tka-platform/guide-grid-pilot && git diff --numstat messages/
```

Expected: only deletions (`0	N`).

- [ ] **Step 4: Re-run both test files**

```bash
cd /e/worktrees/tka-platform/guide-grid-pilot && pnpm exec vitest run --config tests/config/vitest.config.ts src/lib/shared/guide-topics/grid-topic.test.ts
```

Then run Task 3 Step 3's command. Expected: 5 passed and 4 passed.

- [ ] **Step 5: Commit**

```bash
cd /e/worktrees/tka-platform/guide-grid-pilot && git commit -m "i18n: drop Grid lesson and hub keys replaced by the shared record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- messages/
```

---

### Task 8: Browser verification on a task-owned server

**Files:** none committed. Temporary: an entry in `E:/tka-platform/.claude/launch.json`, removed afterwards.

- [ ] **Step 1: Resource gate**

```powershell
(Get-Counter '\Memory\Available MBytes').CounterSamples[0].CookedValue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'svelte-check|vite\\bin\\vite\.js' } | Select-Object ProcessId, CommandLine
```

Expected: at least 4096 MB free, and fewer than two agent-owned Vite servers. If not, report contention and stop.

- [ ] **Step 2: Copy the dev certificate and add a launch entry**

```bash
mkdir -p /e/worktrees/tka-platform/guide-grid-pilot/.cert && cp /e/tka-platform/.cert/dev-cert.pem /e/tka-platform/.cert/dev-key.pem /e/worktrees/tka-platform/guide-grid-pilot/.cert/
```

Add this to `configurations` in `E:/tka-platform/.claude/launch.json`:

```json
{ "name": "verify-guide-grid-pilot", "runtimeExecutable": "pnpm",
  "runtimeArgs": ["--dir", "E:/worktrees/tka-platform/guide-grid-pilot", "exec", "vite", "--port", "5191", "--host", "127.0.0.1"],
  "port": 5191 }
```

Then `preview_start {name: "verify-guide-grid-pilot"}`. The first load takes about a minute while dependencies are optimized.

- [ ] **Step 3: Check the routes against worktree content**

For `/guide/level-1/the-grid`, `/guide`, `/guide/level-1/handbook` and `/learn/concepts/grid`:

- `read_page`, and confirm the shared definitions appear ("hub that everything revolves around", "halfway between the center point and the outer points", "outer edges of the grid").
- `read_console_messages` with `onlyErrors`: none new.
- `/guide/level-1/the-grid` has exactly one `h1`, reading "The Grid", with no calligraphic hero. The figure shows three callout labels. The equation shows Diamond, Box and 8-point grid.
- `/guide` shows the greeting, two welcome paragraphs, the three-stop Level 1 path, "Start the first lesson" linking to `/learn/concepts/grid`, and "Read the guide" linking to `/guide/level-1/the-grid`.
- In the lesson, step through to the point-types step and confirm each definition matches.

- [ ] **Step 4: Server-rendered HTML carries the definitions (crawlable)**

```bash
curl -s http://127.0.0.1:5191/guide/level-1/the-grid | grep -o "hub that everything revolves around\|depict the outer edges of the grid" | sort -u
```

Expected: both phrases.

- [ ] **Step 5: First-viewport and layout-shift check**

At 1440×900 and 375×812 (`resize_window`), take a screenshot of `/guide/level-1/the-grid`. The labeled figure and at least the first definition must be visible without scrolling at 1440×900. At 375×812 the figure must be on the first screen. Measure CLS with `javascript_tool`:

```js
await new Promise((resolve) => {
  let cls = 0;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
  setTimeout(() => resolve(cls), 3000);
});
```

Expected: below 0.05.

- [ ] **Step 6: Seven-viewport matrix, dark mode, and print preview**

Run the project's seven viewports on `/guide/level-1/the-grid` and `/guide`: no horizontal scroll, labels readable, no overlap. Repeat once with `colorScheme: "dark"`. On `/guide/level-1/handbook`, check that the sheet is 816×1056 CSS px and the footer is not clipped.

- [ ] **Step 7: ui-bust review**

Run `/ui-bust` in Review mode on `/guide/level-1/the-grid` and `/guide`. Fix hard-gate findings (at most two correction rounds), commit each fix with a scoped pathspec, and list unresolved taste items for Austen.

- [ ] **Step 8: Hand off the preview**

Keep the 5191 server and its tab alive for Austen. Record the process ID, port, worktree and log in task context. Remove the launch.json entry only after the preview is superseded by integration.

---

### Task 9: Austen's approval, then integration

- [ ] **Step 1:** Send Austen the preview links: [The Grid](http://127.0.0.1:5191/guide/level-1/the-grid), [Guide front door](http://127.0.0.1:5191/guide), [Handbook page](http://127.0.0.1:5191/guide/level-1/handbook) and [Grid lesson](http://127.0.0.1:5191/learn/concepts/grid), plus the "Open for Austen" list below. The spec requires his in-browser approval before integration, so this pilot is the explicit exception to integrating without asking.
- [ ] **Step 2:** After he approves, from the primary checkout:

```bash
cd /e/tka-platform && npm run wt:finish -- codex/guide-grid-pilot --route /guide/level-1/the-grid
```

- [ ] **Step 3:** Verify `/guide/level-1/the-grid` and `/guide` on the primary server with `curl.exe -k -g "https://[::1]:5173/guide/level-1/the-grid"` and the in-app browser at [https://localhost:5173/guide/level-1/the-grid](https://localhost:5173/guide/level-1/the-grid). Then stop the 5191 preview and remove its launch entry.
- [ ] **Step 4:** Amend `docs/architecture/canonical-learning-experience.md` per the spec's retirement rules. That is a separate small docs commit, made only after approval.

---

## Open for Austen (needs his words, not ours)

1. The hub kicker still says "Written reference". It should probably change for a lesson-first welcome. What should it say?
2. The welcome uses Read Me First paragraphs 1, 2 and 4. Should it include more, or a sign-off?
3. Should the handbook page get a paper "try it" exercise? It needs his wording and answer.
4. Should the web page get a "Remember" summary beyond his closing line ("We'll use diamond mode to learn each concept.")?
5. Translations: the welcome and the two button labels show English in other languages until translated. So do the split Grid sentences in locales whose guide strings were never translated.
6. Lesson wording changed to his guide wording for the intro, the two-modes line and the three definitions, so they read slightly longer on the lesson stage. He should confirm this in the lesson.
