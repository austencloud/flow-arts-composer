---
status: backlog
value: 3
effort: L
remaining: Recount beat terminology hits by semantic category in current source before continuing the rename; the prior hit count is stale.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# Beat → Step Nomenclature Correction (2026-07-16)

**Decision (Austen, 2026-07-16):** "step" is the canonical term for a pictograph
in a sequence. Docs, code, and UI drifted into calling these "beats". Replace
`beat` with `step` **only where it denotes a pictograph in a sequence — never
where it means a musical beat, a timing tick, a persisted wire key, or an
unrelated word** ("heartbeat", the verb "beat inheritance", VTG "minimal beat
shapes").

## Relationship to the 2026-04-20 rename effort

This is **not a fresh effort**. A full beat→step rename was specced and partly
shipped: `docs/superpowers/specs/shipped/2026-04-20-beat-to-step-rename-design.md`
(+ its plan under `docs/superpowers/plans/shipped/`, + the still-present
classifier `scripts/beat-rename-audit.mjs`). That spec is the authoritative
source for the **RENAME / KEEP / REVIEW** classification rules, the
**Preserved-Beat Catalog** (34 files/dirs of legitimately-musical `beat`), and
the **Ambiguity Catalog**. This document does not restate those rule tables — it
**reuses** them and records what has actually landed vs. what remains.

**What the 2026-04-20 effort already completed (verified 2026-07-16):**

- The core **type layer**: `BeatData` → `StepData` (`StepData` now has 1,436+
  references across 311 files; `BeatData` survives only in 4 doc mentions).
- The core **model field**: `beats` → `steps` on `SequenceData`
  (`src/lib/shared/foundation/domain/models/sequence-data.ts`), with a
  read-only back-compat shim `const steps = data.steps ?? data.beats ?? []`.
- Adopted field names `stepNumber` / `stepIndex` throughout the domain.

**What the 2026-04-20 effort explicitly deferred (Non-Goal §3):** *"User-facing
UI copy. Strings like 'Beat 1', 'Go to beat N' … stay untouched in this rename …
A follow-up UX copy pass (different spec) can update display labels."* **This
spec IS that follow-up copy pass.** Phase 1 below executes the UI-copy slice the
prior effort intentionally left alone, plus the in-flight guide-showcase surface.

## Scale (measured 2026-07-16)

| Surface | Files w/ `beat` | Raw occurrences |
|---|---|---|
| `src/` (case-insensitive) | 785 | ~6,316 |
| `src/` (`\bbeat\b` word) | 579 | ~3,095 |
| `docs/superpowers/specs/` | 246 | ~1,676 |
| `tests/` | 62 | — |

The step-sense residual is a **small, concentrated subset** of that raw count —
most raw hits are already-migrated identifiers (`.steps`, `stepNumber`),
legitimately-musical `beat`, comments/prose, or unrelated words.

## Classification taxonomy

Every usage cluster falls into one of five buckets.

### (a) Pictograph-step in USER-FACING TEXT — RENAME (Phase 1)

UI copy, aria-labels, tooltips, toasts, empty-states, option labels where a human
reads "beat" meaning a sequence step.

- **In `src/`:** ~60 clearly-unambiguous strings. Representative:
  - Create/authoring: `UndoButton` "Add/Update/Insert/Edit Beat"; `WordLabel`
    "Select your first beat!"; `TransformsGridMode` "First Beat" / "Pick new
    beat 1"; `SequenceActionsPanel` toast "Tap the beat … become Beat 1";
    `first-step-analyzer` "Beat N is now first…".
  - Count labels: `"{n} beats"` sequence-length labels in `BrowseToolbar`,
    `BrowseFilterBar`, `SourceControls`, `ProfileTabs`, `SequenceViewerPage` OG
    description, `endless-spinner`, `AuthModal` "up to 64 beats", etc.
  - Keyboard shortcut display names: `register-create-shortcuts.ts`,
    `register-3d-viewer-shortcuts.ts` ("Previous/Next/First/Last Beat") — the
    display strings only; the shortcut **`id`s stay** (bucket c).
  - Onboarding: `StepEditorTour` ("Beat Preview", "edit each beat individually"),
    `tab-intro-content` "one beat at a time".
  - Loop-labeler: `StepPairModePanel` / `DesignationsList` /
    `StepPairAnalysisDisplay` ("Beat N", "Beat-Pair Analysis").
  - Composer landing copy: "Construct sequences beat by beat".
- **In `messages/en.json` (repo ROOT, OUTSIDE `src/`):** ~30 i18n VALUE strings
  referenced by `src/` via `t('…')` — `viewer_beats_count`, `train_total_beats`,
  `connect_*_beat`, `poi_lab_beat_*`, `arena_label_beats`, `watch_card_beats`,
  etc. Renaming the VALUE is safe (the KEY stays). **Deferred to Phase 1b** — it
  is outside the directive's stated `src/` scope and is a single high-traffic
  file worth one careful pass.

### (b) Pictograph-step in CODE IDENTIFIERS — RENAME (Phase 2, identifier sweep)

Types, functions, props, variables, CSS classes, file names. The core type
(`BeatData`) is gone; what remains:

- **The `animation-engine` step-timing trio (highest blast radius)** — function
  names and local vars, exported and consumed cross-feature:
  - `src/lib/shared/animation-engine/services/step-calculator.ts` — the "Beat
    Calculation Service": `displayedBeatNumber` (~33 refs / 5 files, has its own
    test `displayed-beat-number.test.ts`), `calculateBeatState`,
    `calculateBeatStateDurationAware`, `mapTimePositionToBeat`, `getBeatByIndex`,
    `findBeatByNumber`.
  - `src/lib/shared/animation-engine/services/animation-playback-controller.ts` —
    `stepHalfBeatForward`/`stepFullBeatForward` (+Backward), `getTimePositionForBeat`,
    `msPerBeat`, `beatProgress`, `beatStart`/`beatEnd` (the 2026-04-20 spec's
    Wave 4 named-exception; `msPerBeat` here is genuine BPM math — REVIEW).
  - `src/lib/shared/animation-engine/services/sequence-animation-orchestrator.ts` —
    ~59 local `beat` refs.
- **CSS classes (skipped entirely by the type-rename waves)** — ~72 hits / 28
  files: `.beat-number` (emitted by `StepNumber.svelte`!), `.beat-cell`,
  `.beat-strip` / `.beat-grid` families, context-menu id `"vis-beat-numbers"`.
- **Cross-feature vars:** `beatIndex` (~39/7), `currentBeat`/`activeBeatIndex`
  (~52/11, MIXED — music-clock in `arrange` stays), `beatCount` (~18/3).
- **File names:** `spatial-lab/.../BeatTransport.svelte` → `StepTransport`,
  `loop-labeler/services/detection/compare-beat-pairs.ts`,
  `composer/_data/demo-beats.ts`, `displayed-beat-number.test.ts`.

### (c) Persisted / serialized schema keys — DO NOT rename now; compat strategy below

- **Boundary 1 — legacy file/PNG metadata (`beat` int index):** the legacy TKA
  sequence format keys each step object with `"beat": N`. Lives in
  **`static/gallery/*/*.meta.json`** (hundreds of shipped sidecars) and inside
  embedded PNG `tEXt` metadata of user-imported images. Read (only) by
  `foundation/domain/schemas.ts` (`PngStepSchema.beat`),
  `browse-metadata-extractor.ts`, `sequence-importer.ts`,
  `universal-metadata-extractor.ts`, `png-metadata-extractor.ts`. **The app's own
  exporters already write `stepNumber`/`step`/`steps`, never `beat`.**
- **Boundary 2 — Firestore legacy field `beats`:** superseded by `steps`; survives
  only as a **read fallback** (`data.steps ?? data.beats ?? []`) in
  `library-repository.ts`, `public-sequences-loader.ts`, `sequence-data.ts`,
  `sequence-repository.ts`. No writer emits `beats`.
- **Boundary 3 — static snapshot:** `static/data/snapshots/public-sequences.json`
  has **NO** `beat`/`beats` key (already on `steps`). SAFE.
- **Boundary 4 — localStorage keybinding ids:** custom bindings are persisted
  keyed by `shortcut.id`; ids `create.add-beat`, `create.delete-beat`,
  `3d-viewer.{prev,next,first,last}-beat` are persistence keys. Renaming orphans
  a user's saved binding.
- **Boundary 5 — QR / URL:** no `beat` wire key (positional/word encoding). SAFE
  to rename internal function names (`encodeBeat`) freely.
- **Boundary 6 — lab import:** `prop-tracking-lab` ground-truth accepts pasted
  `{ beats: [...] }` (and `{ steps: [...] }`) JSON — a dev import shape.
- **MCP output schema (`mcp-server/`):** `generate_sequence` returns each step
  as `{ beat: i, … }` (`mcp-server/src/tools/sequence-tools.ts:685`). This is the
  wire contract the future guide-pool build script consumes. (Sibling tool
  `get_sequence_data` already uses `stepNumber` — the surface is split.)
- **Domain glossary/curriculum content keys:** `packages/domain/src/data/glossary.ts`
  has an object key `"beat"`; `curriculum/knowledge-graph.ts` lists `"beat"` in a
  `terms[]` array. Content ids with downstream consumers.

### (d) Musical / timing — KEEP (never rename)

Structural note: in this app **one step is played as one musical beat (1:1)** and
speed is BPM-expressed (`speed = bpm / PLAYBACK_BASELINE_BPM`). So tempo
vocabulary is genuinely musical and stays:

- **Core audio:** `src/lib/shared/audio/metronome.ts` (entire `Metronome`),
  `compose/.../audio/bpm-analyzer.ts` (`beatInterval = 60/bpm`).
- **Tempo training:** `sequence-viewer/services/tempo-practice-orchestrator.ts` +
  state + getter (`currentBpm`, `targetBpm`, …).
- **Playback-speed constants:** `animation-engine/domain/constants/timing.ts`
  (`PLAYBACK_BASELINE_BPM`, `PLAYBACK_MIN/MAX_BPM`).
- **BPM UI:** `TempoControl.svelte`, `BpmChips.svelte`, `QuickBpmPresets.svelte`,
  `TempoPopover.svelte`, `BpmQuickPopover.svelte`.
- **Metronome consumers / count-in:** `playback-controller.svelte.ts`,
  `PracticeBar.svelte`, `PracticeCountInOverlay.svelte`, `practice-view-prefs`.
- **BPM-derived intervals:** `GridPreview.svelte`, `video-record` settings,
  `train/practice` `CanvasSection`/`CameraSection` (`beatDuration = 60/bpm*1000`),
  `timing-interpreter.ts` quantize, `broadcast-models.ts` `beatsPerMinute`,
  `arrange-playback-engine.ts` (`beatsPerMs`, `beatIncrement`).
- **VTG "minimal beat shapes":** `packages/vtg-domain` `MinimalBeatShape` /
  `MinimalBeatShapeId` / `VTG_SHAPES` — a distinct domain term, NOT the step
  sense. KEEP.
- **VTG / CAP "downbeat":** glossary + `caps-domain/mathematics.ts`. KEEP.
- **Not-a-beat false positives (exclude from any regex sweep):**
  `adaptive-heartbeat.ts`, `heartbeatInterval` in device-sync; the verb "rules
  that **beat** inheritance" (FlowFrame CSS comment); "a /learn/… deep link
  **beats** the saved scroll" (GuideReader).

### (e) Ambiguous — left for Austen (REVIEW)

Same symbol carries both meanings; needs a human call. Do not auto-rename:

- `sync/services/playback-position-calculator.ts` + `sync-types.ts` — MIXED in
  one file: `beatDurationMs`/`DEFAULT_BEAT_DURATION_MS`/`beatsElapsed` are
  tempo-mapping (KEEP-leaning) but `PositionResult.beat`/`beatProgress` are the
  integer step + fraction (step-sense).
- `animation-engine/timeline/services/step-grid-calculator.ts` — musical
  bar/measure/time-signature vocabulary (`beatsPerMeasure`, `beatInMeasure`,
  `subdivisionsPerBeat`) implemented directly on steps. Strongest ambiguous
  cluster.
- Effects "beat" trigger: `effects/domain/effects-config.ts` (`trigger:"beat"`),
  `defaults.ts`, `effect-control-manifest.ts`, `pulse-2d-renderer.ts` — a rhythm
  concept computed from `currentStep`/`beatInterval`. UI labels "Beat" /
  "Beat Interval" in `PulseCustomize.svelte`.
- Duration surfaces: `duration-lab` "Beats" control-label, `duration-templates`
  "Beats 3, 6, 9 held twice as long", `DurationResizeHandle` "{duration} beats" —
  which STEPS get longer *duration* (measured in musical beats). Genuinely dual.
- Video "beat map" feature: `sequence-viewer/components/step-mapping/*`
  ("Beat timeline", "Previous/Next beat"), `VideoPanel` ("Beat map saved"). The
  whole feature is named "beat map"; it aligns steps to video *timing* and is a
  Preserved-Beat Catalog zone. Decide whether the feature renames to "step map".
- Stage locomotion: `MarkProperties` "Beats to arrive" / "Decrease/Increase
  beats", `FormationOverlay` "{beats}b" — locomotion timing, likely musical.
- `compose/arrange` strings: `arrange-grid-state` "Sequence has N beats but
  composition requires M beats" — the step=beat identity confusion inside a
  KEEP-zoned musical module.
- `animation-shortcut-registrar.ts` "Half Beat Back/Forward" — transport scrub in
  half-beat units (timing).
- Learn teaching copy that *deliberately* ties a letter/step to a musical beat:
  `WordsIntroPage` "One letter = one beat of music", `AABBDemoPage` "Beat
  Breakdown", `Type456LettersPage` "still for a beat".
- `skel2tka` "detected beats" / "beat boundaries" — detected steps from video,
  but with a motion-detection nuance; also mostly lives in `en.json`.
- `prop-tracking-lab/services/beat-segmenter-3d.ts` — motion/pose beat
  segmentation, likely KEEP (not sequence steps).

## Phased execution plan

### Phase 1 — executed 2026-07-16 (this session)

The safe, high-visibility slice:

1. **Guide showcase surfaces (full rename incl. identifiers + file name — in-flight
   work, safe):**
   - `GuideBeatStrip.svelte` → `GuideStepStrip.svelte`; internal identifiers
     (`beats`→`steps` local, `beatCell`→`stepCell` snippet), CSS class
     `.guide-beat-strip`→`.guide-step-strip`, comments.
   - Importers updated: `FlowFrame.svelte`, `SequenceShowcase.svelte`
     (component import/usage + the `:global(.guide-step-strip)` selector).
   - `SequenceShowcase.svelte` + `guide-content-blocks.ts` prose beat→step.
2. **User-facing `src/` strings (bucket a, unambiguous only)** — the create
   module, count-labels, keyboard display names, onboarding tour, loop-labeler,
   composer copy, spatial-lab `BeatTransport` display text. Identifiers/CSS/file
   names NOT touched (that is Phase 2), except pure display strings inside them.
3. **Docs:** `2026-07-16-sequence-showcase-design.md` (full prose + GuideBeatStrip→
   GuideStepStrip), `2026-07-16-guide-example-pools-design.md` (prose + MCP-key
   bridge note), `2026-07-16-guide-example-pools-pilot-data.json` (`"beat":N` →
   `"step":N`, prose "beats"→"steps").

### Phase 1b — `messages/en.json` VALUE strings (next; outside `src/` scope today)

~30 i18n values (keys unchanged). One careful pass on the root file. Skip the
musical keys (`avatar_beat_offset`, `train_timed_bpm_value`, `train_mode_timed_short`
"Beat sync", `tab_desc_video_video_lab` "Beat mapping, BPM-synced…").

### Phase 2 — identifier sweep (`src/`)

Follow the 2026-04-20 spec's wave structure + `scripts/beat-rename-audit.mjs`
classifier. Priority order by blast radius:
1. `animation-engine` step-timing trio (rename functions + update the dedicated
   test; keep `msPerBeat` REVIEW).
2. CSS class family (`.beat-number`/`.beat-cell`/`.beat-strip`/`.beat-grid`) — a
   cross-cutting cluster the type waves skipped.
3. `spatial-lab/BeatTransport.svelte` → `StepTransport` + its identifiers/CSS.
4. Cross-feature vars `beatIndex`/`beatCount`; `currentBeat` per-file (music-clock
   in `arrange` stays).
5. Remaining file renames (`compare-beat-pairs.ts`, `demo-beats.ts`).
Each wave: `npm run check` clean before it closes; commit with explicit pathspec.

### Phase 3 — `mcp-server/` + `packages/` (BLOCKED: another agent is active there)

Read-only inventory only, this session. When unblocked:
- Rename the `generate_sequence` output key `beat` → `step` (or `stepNumber`, to
  unify with `get_sequence_data`) **coordinated with** the guide-pool build
  script (which, per the pools spec note, must map `beat`→`step` until then).
- `mcp-server/src/core/engine-generation-adapter.ts` `derivedBeatIndices` →
  `derivedStepIndices` (engine already uses the latter).
- `packages/` is almost entirely comment/docstring churn (the identifiers are
  already `step*`); `packages/tka-types/src/step.ts` doc "one beat of sequence
  content". KEEP `MinimalBeatShape*` and the musical `duration` doc.

### Phase 4 — persisted-schema compatibility (design + sign-off required)

Per boundary (see bucket c):
- **Boundary 1 (PNG/gallery `beat` key):** **freeze-read.** Rename only in-memory;
  keep the `beat` alias in `PngStepSchema` + the extractors **permanently** —
  shipped `.meta.json` sidecars and PNGs in the wild carry it. No writer change
  (exporters already emit `stepNumber`).
- **Boundary 2 (Firestore `beats`):** **freeze-read.** Keep the `?? data.beats`
  fallbacks; no writer emits it.
- **Boundary 4 (keybinding ids):** either freeze the ids, or ship a one-time
  localStorage `customBindings` id-remap migration (`*-beat` → `*-step`).
- **MCP output key + glossary/curriculum content keys:** rename with consumer
  coordination (Phase 3), never a silent flip.

**Recommended strategy overall: freeze the wire format, rename in-memory.** The
writers already emit the new names; only legacy readers keep `beat`/`beats`
aliases. This avoids any data migration and keeps old files/docs deserializable
forever.

## Risks

| Risk | Mitigation |
|---|---|
| Blind grep-replace destroys the audio/tempo subsystem | Bucket (d) KEEP list + the 2026-04-20 Preserved-Beat Catalog + `beat-rename-audit.mjs`. Never a bare `beat`→`step`. |
| Renaming a persisted key breaks user data | Bucket (c) frozen; Phase 4 freeze-read strategy; no key renamed in Phase 1. |
| An ambiguous string renamed the wrong way | Bucket (e) left for Austen; executors instructed to SKIP + report anything musical. |
| Guide-pool build script keyed on MCP `beat` breaks when server renames | Pools spec now documents the `beat`→`step` mapping bridge; Phase 3 coordinates. |
| Editing `mcp-server/`/`packages/` collides with the active agent there | Phase 3 is read-only this session; execution deferred until unblocked. |
| Line-drift in the string inventory | Executors match by string content + confirm context, not line number. |

## Verification plan

- One full `npm run check` after all Phase-1 edits — zero NEW errors vs.
  pre-existing errors in unrelated files (string-only edits should introduce
  none; the guide identifier rename is compiler-checked end-to-end).
- `node` parse of the pilot JSON proves it stays valid after key rename.
- Grep-proof: `GuideBeatStrip.svelte` gone, `GuideStepStrip` importers resolve,
  no user-facing `beat` strings remain in the guide surfaces (only the KEEP verb
  in FlowFrame/GuideReader and the out-of-scope `GuideSequencePlayer` identifiers).
- Later phases carry their own gates (2026-04-20 spec §Verification): tests +
  check + build + parity harness (engine) + MCP round-trip (Phase 3).

## Ledger

- [x] Inventory + classification (6 parallel sweeps: persisted keys, musical,
      identifiers, user-facing strings, mcp-server/packages, specs)
- [x] Spec written (this file)
- [x] Phase 1 — guide showcase surfaces (GuideBeatStrip→GuideStepStrip + importers
      + SequenceShowcase + guide-content-blocks)
- [x] Phase 1 — `2026-07-16-sequence-showcase-design.md` prose + component name
- [x] Phase 1 — `2026-07-16-guide-example-pools-design.md` prose + MCP-key bridge
- [x] Phase 1 — pilot-data JSON `beat`→`step` keys + prose (re-validated)
- [~] Phase 1 — user-facing `src/` strings (unambiguous bucket-a slice; ambiguous
      deferred to Austen per bucket e)
- [ ] Phase 1 — `npm run check` green (post-edit gate)
- [ ] Phase 1b — `messages/en.json` VALUE strings
- [ ] Phase 2 — identifier sweep (animation-engine trio → CSS → BeatTransport →
      cross-feature vars → file renames)
- [ ] Phase 3 — `mcp-server/` + `packages/` (blocked on active agent)
- [ ] Phase 4 — persisted-schema compat (freeze-read; keybinding-id migration)
- [ ] Austen: resolve bucket-(e) ambiguous cases

## Related

- `docs/superpowers/specs/shipped/2026-04-20-beat-to-step-rename-design.md` — the
  governing classification rules, Preserved-Beat Catalog, Ambiguity Catalog.
- `scripts/beat-rename-audit.mjs` — the existing classifier (reuse, don't
  re-derive).
- `docs/superpowers/specs/2026-07-16-sequence-showcase-design.md`,
  `2026-07-16-guide-example-pools-design.md` — the guide surfaces renamed here.
- `.claude/rules/tka-domain.md` (the "turns" reservation), `simplified-word-display.md`.
