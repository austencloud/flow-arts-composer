---
status: backlog
value: 2
effort: M
remaining: 'P1 shipped (admin/tutorials routes + _data/tutorial-scripts.ts). P2/P3 unbuilt: no tutorial-plans state module, no tutorialPlans Firestore rule, no editing/persistence/picker.'
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: in-progress
---

# Tutorial Planner — Admin Authoring Surface (Design)

**Triage evidence (2026-10-07):** The spec records Phase 1 landing. The remaining editable planner, persistence, and script coverage acceptance has not been verified in this review.

**Date:** 2026-07-16 · **Status:** Phase 1 implemented; remaining planner acceptance open. Approved direction (Austen picked: admin
guide route + editable planner) · **Prereq reading:**
`docs/tutorial-video-voiceover/HANDOFF.md`, `Voiceover-Scripts-Next.md`,
`Voiceover-Scripts-Advanced.md`

## What this is

An admin-only in-app surface where Austen plans his tutorial videos: each
script (12–38) rendered as readable sections — spoken text, `[CUE]` stage
directions, `[AUSTEN]` body-knowledge slots — with **real rendered pictographs**
planned inline per section (the exact letters/variations that will appear on
screen in the video). Editable: fill slots, swap pictograph picks, track
per-script status.

Replaces the static HTML page (`Voiceover-Scripts-12-38.html`) as the working
view; the markdown files remain the canonical script text until edits happen,
after which Firestore overrides win (same layering as guide overrides).

## Primitive discovery (never-hand-roll evidence)

Scouted 2026-07-16 (Explore agent, findings verified against source):

| Need | Reuse | Path |
|---|---|---|
| Render a pictograph | `PictographRenderer.svelte` (via `GuidePictograph.svelte` wrapper pattern) | `src/lib/shared/pictograph/shared/components/PictographRenderer.svelte` |
| Pictograph data by letter | `letterQueryHandler.getAllPictographVariations(GridMode.DIAMOND)` → filter by `picto.letter` | `src/lib/shared/pictograph/tka-glyph/services/letter-query-handler.ts` |
| Prose + pictograph section layout | Guide content-block system (`GuideSection`, `GuidePictographGrid`, `GuideBeatStrip`) | `src/routes/(public)/guide/level-1/_components/` |
| Admin route gate | `src/routes/admin/+layout.ts` (redirects unless `isAdmin()`) | existing |
| Admin server gate | `requireAdmin(event)` | `src/lib/server/auth/requireAdmin.ts` |
| Persistence + revisions + admin-gated writes | Mirror `guide-overrides.svelte.ts` exactly (Firestore doc + revisions subcollection + module-singleton `$state`) | `src/routes/(public)/guide/level-1/_data/guide-overrides.svelte.ts` |
| Status filter chips | `SegmentedControl` (single-select status filter) per `chip-primitives.md` | `src/lib/shared/3d/components/controls/SegmentedControl.svelte` |

Nothing new is hand-rolled except the planner-specific components (slot editor,
section list) that have no existing equivalent.

## Architecture

### Route

`src/routes/admin/tutorials/+page.svelte` (+ `[id]/+page.svelte` for a single
script). Lives under the existing `/admin` layout → gate is free. Not a new
module tab (Austen chose route over Lab tab).

### Canonical content (code layer)

`src/routes/admin/tutorials/_data/tutorial-scripts.ts` — the 27 scripts as
typed data, generated from the two markdown files by a build script (extend
`scratchpad` converter → `scripts/build-tutorial-content.mjs`, committed).

```ts
interface TutorialScript {
  id: string;            // "12-letter-g"
  number: number;        // 12
  title: string;         // "Letter G"
  part: string;          // "Part III — Together-Same"
  targetRuntime: string; // "~2:30"
  goal: string;
  blocks: ScriptBlock[];
}
type ScriptBlock =
  | { kind: "spoken"; text: string }
  | { kind: "cue"; text: string }
  | { kind: "slot"; id: string; prompt: string }         // [AUSTEN: ...]
  | { kind: "pictographs"; letters: PictographPick[] };  // planned visuals
type PictographPick = { letter: string; variationIndex: number; caption?: string };
```

Seed `pictographs` blocks with sensible defaults per script (the letters the
script teaches — script 12 → G, script 18 → U and V side by side, script 19 →
M and P, etc.). Austen swaps variations in-app.

### Override layer (Firestore)

`tutorialPlans/{scriptId}`:

```
{ slots: { [slotId]: string },          // filled body-knowledge answers
  pictographs: { [blockIndex]: PictographPick[] },  // swapped picks
  status: "draft" | "slots-filled" | "ready" | "recorded",
  notes?: string, updatedAt, updatedBy }
+ revisions/{autoId} (cap 20, same snapshot/revert/prune as guide-overrides)
```

State module `tutorial-plans.svelte.ts` mirrors `guide-overrides.svelte.ts`
function-for-function (load, saveOverride→savePlan, revert, reset, canEdit).
**Firestore rules:** admin-only read AND write (unlike guideOverrides' public
read — this is planning material).

### UI

- **Index page:** scripts 12–38 grouped by part; per-script row shows number,
  title, target runtime, slot progress (`3/7 filled`, `tabular-nums`), status.
  `SegmentedControl` to filter by status. Rows are buttons (per
  `clickables-look-like-buttons.md`).
- **Script page:** blocks in order. Spoken = serif prose. Cue = muted mono
  line. Slot = amber card: prompt + textarea, saves to the plan doc; filled
  slots collapse to the answer with the prompt as caption. Pictograph block =
  `GuidePictograph`-style render row with a variation stepper (prev/next
  through `letterQueryHandler` variations for that letter) + caption field.
  Reserve pictograph box sizes (`no-layout-shift.md`); no checkboxes — status
  is a button-group (`no-checkboxes.md`).
- Word display anywhere a sequence word appears goes through
  `simplifyRepeatedWord` (`simplified-word-display.md`).

## Phases

1. **P1 — read-only planner:** content generator + route + index + script
   pages rendering blocks with seeded pictographs. No Firestore.
2. **P2 — editing:** `tutorial-plans.svelte.ts`, slot editing, status,
   firestore.rules entry, revision snapshot/revert.
3. **P3 — pictograph picker:** variation stepper + captions persisted.

Each phase: `npm run check` green + a contract-style unit test for the
markdown→content generator (block parity with the .md files) + screenshot
verification of a script page before "done" (per `verification-protocol.md`).

## Non-goals (v1)

- Public visibility of any of this (admin-only read).
- Editing the spoken script text in-app — canonical text stays in the .md
  files; only slots/pictographs/status/notes are app-editable. (Editing prose
  in-app = P4 candidate, would need write-back or full override of text.)
- Videos 1–11 (already recorded/scripted; add later if wanted).

## Open items

- Whether the `.md` → content generator runs in CI or is run manually when
  scripts change (proposal: manual, with the parity unit test catching drift).
- Slot IDs: hash of prompt text vs positional index (proposal: positional
  `s{scriptNumber}-{n}` — stable enough since text edits happen in .md rarely).
