# Endless Spinner Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/endless-spinner` per `docs/superpowers/specs/2026-07-29-endless-spinner-rebuild-design.md` — retire Live mode, replace the mode-info trio with canonical LOOP chips, adopt the StepStrip playback pattern with a grid view toggle, center the transport, dock it on phones, and ship the route to production.

**Architecture:** Deletion + recomposition on existing primitives. The playback engine (`createEndlessPlayback`), page-scoped `AnimationScope`, ready/error states, and history all survive from `6277d794a2`. New composition reuses `PracticeLanePane`/`StepStrip`, `LoopChips` (+small extension), `Crossfade`, `SegmentedControl`.

**Tech Stack:** Svelte 5 runes, component-scoped CSS with theme tokens, Chrome DevTools MCP for the visual sweep.

**Standing constraints (every task):**
- Commit with explicit pathspec only: `git commit -m "..." -- <files>`. Never bare commit, never `git add -A`. Other sessions' dirty files (creators/profile, QFT, notation, tmp scripts) must never appear in your commits.
- Port 5173 is Austen's dev server — never start/stop/kill it. Verify with `curl -k https://localhost:5173/endless-spinner` or your own `vite --port 5174` (reap it when done; check `resource-budget.md` gates first).
- Inner loop uses `npx svelte-fast-check --files <changed files>` (alias `npm run check:fast`), NOT full `npm run check` (one full check max, at the very end, and only if no other svelte-check is running machine-wide).
- Focused tests: `npx vitest run tests/unit/animation-engine/ --reporter=basic`.
- Do not edit files outside the listed scope. Do not delegate further (no sub-subagents).
- End every commit message body with the repo's agent trailer:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (the commit commands below omit it for brevity — add it).

---

## Task 1: Retire Live mode

**Files:**
- Delete: `src/lib/features/landing/services/broadcast-repository.ts`
- Delete: `src/lib/features/landing/services/broadcast-sequence-converter.ts`
- Delete: `src/lib/features/landing/domain/models/broadcast-schemas.ts`
- Delete: `src/lib/shared/landing/domain/broadcast-models.ts`
- Delete: `src/lib/features/landing/components/LiveModeInfo.svelte`
- Modify: `src/lib/shared/landing/domain/types.ts` (delete the "From BroadcastRepository" section: the `broadcast-models` import and the `BroadcastStateCallback`/`BroadcastHistoryCallback` types — nothing else in the file)
- Modify: `src/lib/shared/animation-engine/domain/chaining-types.ts`
- Modify: `src/lib/shared/animation-engine/services/sequence-chaining-orchestrator.ts`
- Modify: `src/lib/shared/animation-engine/state/endless-playback-state.svelte.ts`
- Modify: `src/routes/endless-spinner/services/create-spinner-session.ts`
- Modify: `src/lib/features/landing/components/SpinnerModeToggle.svelte`
- Modify: `src/lib/features/landing/domain/models/spinner-models.ts`
- Modify: `src/routes/endless-spinner/+page.svelte` (live references only — full rebuild comes later)
- Test: `tests/unit/animation-engine/sequence-chaining-orchestrator.test.ts`, `tests/unit/animation-engine/endless-playback-state.test.ts`

- [ ] **Step 1: Trim the type layer.** In `chaining-types.ts`:
  - `export type SourceMode = "pick" | "library" | "infinite";` (drop `"live"`).
  - Delete `IBroadcastProvider`, `BroadcastSequenceConverter`, and any `BroadcastStateClient` imports/re-exports. Grep the file for `[Bb]roadcast` — zero hits when done.

  In `spinner-models.ts`: `export type SpinnerMode = "library" | "infinite";` and update the doc comment (two modes). Keep `GenerationSettings`, `GeneratedSequenceInfo`, `SpinnerMetrics` untouched.

- [ ] **Step 2: Trim the orchestrator.** In `sequence-chaining-orchestrator.ts`, remove: the `broadcastProvider` constructor param and field, `convertBroadcastSequence` option, every `"live"` branch (`startAutoMode`'s live arm, broadcast subscription setup/teardown, the server-time sync, `onBroadcastStateUpdated` emitter, the broadcast-conversion try/catch), and broadcast-related imports. `"pick"` handling stays. The class's public surface afterward: same methods, minus broadcast callbacks.

- [ ] **Step 3: Trim the playback state.** In `endless-playback-state.svelte.ts`, remove: `broadcastProvider` + `convertBroadcastSequence` from `EndlessPlaybackConfig`, `broadcastState` from `EndlessPlaybackState` + its getter, `_broadcastState` + the `onBroadcastStateUpdated` wiring, the `BroadcastStateClient` import, and the `|| _sourceMode === "live"` guards in the two `$effect`s (keep the `"pick"` guards). Keep the `$state.raw` comment and everything else.

- [ ] **Step 4: Trim the session + toggle + page.**
  - `create-spinner-session.ts`: delete the `BroadcastRepository`/`broadcastSequenceConverter` imports and their two config lines; `modes: ["infinite", "library"]`, `defaultMode: "infinite"`. Update the header comment (no live bridge).
  - `SpinnerModeToggle.svelte`: drop the live option from `options`, delete `indicatorColor` (pass `color="accent"` literally), update the header comment.
  - `+page.svelte` minimal edits: delete the `LiveModeInfo` import + its `{:else if spinnerMode === "live"}` branch, `broadcastState` derived, `liveSessionCount` state + its accumulation block in the swap `$effect`, `canSkip={spinnerMode !== "live"}` (pass nothing; Task 4 deletes the prop), and `liveBpm`/`liveSessionCount` props on `SpinnerStatsBar` (delete those two props from `SpinnerStatsBar.svelte` too, or suppress errors by passing `0` — the whole component dies in Task 3, so passing nothing and deleting the two props from its `Props` is the clean minimal edit).
  - Change the page default: `let spinnerMode = $state<SpinnerMode>("infinite");` — and move the Infinite metrics subscription out of `handleModeChange` into `onMount` (after `session` is created), since Infinite is now the boot mode:
    ```ts
    // in onMount, after createSpinnerSession:
    metricsUnsubscribe = session.metricsRepository.subscribe((m) => (globalMetrics = m));
    session.metricsRepository.getMetrics().then((m) => (globalMetrics = m));
    ```
    (`handleModeChange` keeps its release-on-leave / resubscribe-on-return logic unchanged.)

- [ ] **Step 5: Tests.** In both test files, delete live-mode cases (mock broadcast providers, live chaining guards, broadcast-conversion failure tests) and any `"live"` literals; update `createEndlessPlayback` fixture configs to the trimmed `EndlessPlaybackConfig`. Run:
  `npx vitest run tests/unit/animation-engine/ --reporter=basic` → expect all remaining tests PASS.

- [ ] **Step 6: Cross-consumer compile check.** `PlayWithItInner.svelte`, `src/routes/embed/spinner/+page.svelte`, `src/routes/(public)/composer/+page.svelte`, `EffectsLabPlaybackHost.svelte` all use `createEndlessPlayback` with `modes: ["library"]` and never pass broadcast fields — verify with:
  `npm run check:fast` (or `npx svelte-fast-check`) covering the modified + consumer files → expect zero errors. Also grep repo-wide for the five deleted file paths → zero imports remain.

- [ ] **Step 7: Commit.**
  ```bash
  git commit -m "refactor(endless-spinner): retire Live mode — the broadcast backend no longer exists" -- src/lib/shared/landing/domain/types.ts src/lib/features/landing/services/broadcast-repository.ts src/lib/features/landing/services/broadcast-sequence-converter.ts src/lib/features/landing/domain/models/broadcast-schemas.ts src/lib/shared/landing/domain/broadcast-models.ts src/lib/features/landing/components/LiveModeInfo.svelte src/lib/shared/animation-engine/domain/chaining-types.ts src/lib/shared/animation-engine/services/sequence-chaining-orchestrator.ts src/lib/shared/animation-engine/state/endless-playback-state.svelte.ts src/routes/endless-spinner/services/create-spinner-session.ts src/lib/features/landing/components/SpinnerModeToggle.svelte src/lib/features/landing/components/SpinnerStatsBar.svelte src/lib/features/landing/domain/models/spinner-models.ts src/routes/endless-spinner/+page.svelte tests/unit/animation-engine/sequence-chaining-orchestrator.test.ts tests/unit/animation-engine/endless-playback-state.test.ts
  ```

---

## Task 2: Extend LoopChips with the canonical period icon swap

**Files:**
- Modify: `src/lib/features/store/components/LoopChips.svelte`

`LoopChips` renders `fa-{info.icon}` unconditionally. Canon (per `LOOPIconStrip.svelte`) swaps Rotated's glyph to `fa-arrows-spin` when quartered, and quartered Inverted to `CheckerboardCircleIcon`. Extend the shared primitive — do not fork.

- [ ] **Step 1: Add the props + swap logic.**
  ```svelte
  <script lang="ts">
    import { LOOP_COMPONENT_MAP } from "$lib/shared/browse/domain/constants/loop-constants";
    import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
    import { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
    import CheckerboardCircleIcon from "$lib/shared/icons/CheckerboardCircleIcon.svelte";

    interface Props {
      /** LOOP component ids (enum string values, e.g. "mirrored"). */
      components: readonly string[];
      size?: "sm" | "md";
      /** Same semantics as LOOPIconStrip: quartered swaps Rotated to
       *  fa-arrows-spin / Inverted to the checkerboard glyph. Undefined keeps
       *  the halved-default icons, so existing callers render unchanged. */
      rotationPeriod?: Period;
      inversionPeriod?: Period;
    }
    let { components, size = "md", rotationPeriod, inversionPeriod }: Props = $props();

    const infos = $derived(
      components
        .map((c) => LOOP_COMPONENT_MAP.get(c as LOOPComponent))
        .filter((i): i is NonNullable<typeof i> => i != null)
    );

    const quarteredRotation = $derived(rotationPeriod === Period.QUARTERED);
    const quarteredInversion = $derived(inversionPeriod === Period.QUARTERED);
  </script>
  ```
  (Check `Period`'s import path/values against `LOOPIconStrip.svelte`'s import and mirror it exactly — it already imports the enum for the identical comparison.)

- [ ] **Step 2: Swap at render time.** Replace the icon line inside the `{#each}`:
  ```svelte
  {#if info.component === LOOPComponent.INVERTED && quarteredInversion}
    <CheckerboardCircleIcon size={12} />
  {:else}
    <i
      class="fas fa-{info.component === LOOPComponent.ROTATED && quarteredRotation
        ? 'arrows-spin'
        : info.icon}"
      aria-hidden="true"
    ></i>
  {/if}
  ```
  Match `CheckerboardCircleIcon`'s actual props to how `LOOPIconStrip.svelte` invokes it (read that call site; use the same prop names, sized to the chip's icon box) and give the swapped chips the same aria treatment LOOPIconStrip uses ("Rotated (quartered)") via a `title`/`aria-label` on the chip span.

- [ ] **Step 3: Verify no regression for existing callers.** `npm run check:fast` on `LoopChips.svelte` + its three consumers (`LoopDeckConfiguratorPage.svelte`, `ProductDetailPage.svelte`, `StorePage.svelte`) → zero errors. New props optional ⇒ existing render output unchanged.

- [ ] **Step 4: Commit.**
  ```bash
  git commit -m "feat(store): LoopChips learns the canonical quartered icon swap" -- src/lib/features/store/components/LoopChips.svelte
  ```

---

## Task 3: SpinnerNowPlaying replaces the mode-info trio and the stats bar

**Files:**
- Create: `src/routes/endless-spinner/components/SpinnerNowPlaying.svelte`
- Delete: `src/lib/features/landing/components/InfiniteModeInfo.svelte`
- Delete: `src/lib/features/landing/components/LibraryModeInfo.svelte`
- Delete: `src/lib/features/landing/components/SpinnerStatsBar.svelte`
- Modify: `src/routes/endless-spinner/+page.svelte`
- Modify: `messages/en.json`

Justification (never-hand-roll): grep found no existing "LOOP chips for the currently-playing sequence" component — `InfiniteModeInfo`/`LibraryModeInfo` were the non-canonical attempts and are deleted. `SpinnerNowPlaying` is composition-only over `LoopChips`.

- [ ] **Step 1: Create the component.**
  ```svelte
  <!--
    SpinnerNowPlaying.svelte

    The one line of identity above the stage: canonical LOOP chips for whatever
    is playing right now, same in both modes. The word itself lives on the
    canvas (TKA glyph font); step counts and stats intentionally do not exist —
    the notation shows them better than a number can.
  -->
  <script lang="ts">
    import LoopChips from "$lib/features/store/components/LoopChips.svelte";
    import { parseLoopComponents } from "$lib/shared/create/services/loop-type-utils";
    import { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
    import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
    import type { GeneratedSequenceInfo } from "$lib/features/landing/domain/models/spinner-models";

    let {
      sequence,
      generatedInfo = null,
    }: {
      sequence: SequenceData | null;
      /** Infinite mode's generation record; null in Library mode. */
      generatedInfo?: GeneratedSequenceInfo | null;
    } = $props();

    // The sequence's own metadata is the primary source (library sequences
    // carry components/loopType/period); the generator's settings are the
    // fallback for generated sequences whose snapshot lacks them.
    const components = $derived.by((): string[] => {
      if (sequence?.components?.length) return [...sequence.components];
      const loopType = sequence?.loopType ?? generatedInfo?.settings.loopType ?? null;
      return [...parseLoopComponents(loopType)];
    });

    const rotationPeriod = $derived.by((): Period | undefined => {
      if (sequence?.period === 4) return Period.QUARTERED;
      if (sequence?.period === 2) return Period.HALVED;
      return generatedInfo?.settings.period;
    });
  </script>

  {#if components.length > 0}
    <LoopChips {components} {rotationPeriod} />
  {/if}
  ```
  Check `Period`'s actual enum members (`HALVED`/`QUARTERED` — read `circular-models.ts`) and `GenerationSettings.period`'s type; if it's already the `Period` enum, pass it straight through as written. If a library sequence has no LOOP metadata, the row renders empty — reserved space, no fake chip (spec).

- [ ] **Step 2: Swap it into the page.** In `+page.svelte`:
  - Remove imports: `LibraryModeInfo`, `InfiniteModeInfo`, `SpinnerStatsBar`, `SpinnerStats` type. Add: `SpinnerNowPlaying` (from `./components/`).
  - Delete state: `stats`, `globalMetrics`, `sessionGeneratedCount`, `transitionCount` derived, the `stats = session.spinnerOrchestrator.getStats()` and `sessionGeneratedCount = ...` lines in the swap `$effect` (keep the `currentGeneratedInfo` assignment — SpinnerNowPlaying's fallback needs it). Delete the metrics `subscribe`/`getMetrics` calls added in Task 1 Step 4 and the `metricsUnsubscribe` field entirely — with the stats bar gone, nothing displays `globalMetrics`, and the generator's metric WRITES (its own repository calls) continue untouched.
  - `EndlessSpinnerDebugPanel` currently receives `{stats}` — pass `stats={session?.spinnerOrchestrator.getStats() ?? null}` computed in a `$derived.by` guarded by `playback?.sequenceSwapCount` (so the debug panel keeps its numbers without page-level stats state), or simplify the debug panel's prop to accept `spinnerOrchestrator` and call `getStats()` itself. Pick whichever keeps the debug panel compiling with the least code; the debug panel is dev-only.
  - Replace the mode-info Crossfade contents:
    ```svelte
    <div class="mode-info">
      <Crossfade key={`${spinnerMode}:${playback?.currentSequence?.id ?? ""}`} fill>
        <div class="mode-info-layer">
          <SpinnerNowPlaying
            sequence={playback?.currentSequence ?? null}
            generatedInfo={spinnerMode === "infinite" ? currentGeneratedInfo : null}
          />
        </div>
      </Crossfade>
    </div>
    ```
    Shrink the stage: `.mode-info { height: 3.5rem; }` at base, `2.25rem` in the short-horizontal tier, and delete the `7.25rem` ≤600px override (the chips row is one line everywhere). If `SequenceData` has no `id` field, key on `simplifyRepeatedWord(word)` + `sequenceSwapCount` instead — the key just needs to change when the playing sequence changes.
  - Remove `SpinnerStatsBar` from the transport bar; `.transport-bar` becomes a single centered row: `display: flex; justify-content: center;` (Task 4 rebuilds the controls' internal layout).
  - Update the meta description (it names Live): `content="Watch TKA LOOPs chain endlessly — generated on the spot or drawn from the library."`

- [ ] **Step 3: i18n bookkeeping.** In `messages/en.json`, the keys used only by deleted components become dead. Grep each of these repo-wide before removing; delete the ones with zero remaining references (expected: `landing_spinner_mode_live`, `landing_spinner_live_label`, all `landing_live_*`, `landing_infinite_*` display strings used only by InfiniteModeInfo, stats-bar strings like transitions/unique/in-session/ever-generated, `landing_spinner_generated_at` equivalents). Keep any key another surface still references.

- [ ] **Step 4: Verify.** `curl -k -s -o /dev/null -w "%{http_code}" https://localhost:5173/endless-spinner` → 200. `npm run check:fast` on changed files → zero errors. `npx vitest run tests/unit/animation-engine/ --reporter=basic` → PASS.

- [ ] **Step 5: Commit** (pathspec: created + deleted + modified files above).
  ```bash
  git commit -m "feat(endless-spinner): one now-playing row of canonical LOOP chips replaces mode infos and stats" -- src/routes/endless-spinner/components/SpinnerNowPlaying.svelte src/lib/features/landing/components/InfiniteModeInfo.svelte src/lib/features/landing/components/LibraryModeInfo.svelte src/lib/features/landing/components/SpinnerStatsBar.svelte src/routes/endless-spinner/+page.svelte src/routes/endless-spinner/components/EndlessSpinnerDebugPanel.svelte messages/en.json
  ```

---

## Task 4: Transport rework + history "Play again" + Debug copy

**Files:**
- Modify: `src/routes/endless-spinner/components/SpinnerControls.svelte`
- Modify: `src/routes/endless-spinner/components/SpinnerHistoryPanel.svelte`
- Modify: `src/routes/endless-spinner/components/EndlessSpinnerDebugPanel.svelte`
- Modify: `src/routes/endless-spinner/+page.svelte`
- Modify: `messages/en.json`

- [ ] **Step 1: Rebuild SpinnerControls.** New `Props`:
  ```ts
  interface Props {
    isPlaying: boolean;
    animationReady: boolean;
    viewMode: "strip" | "grid";
    showHistory: boolean;
    onToggleView: () => void;
    onTogglePause: () => void;
    onSkip: () => void;
    onToggleHistory: () => void;
  }
  ```
  Delete `onCopy`, `canSkip`, `showStepGrid`, `onToggleGrid`, and the whole copy-state block. Markup order and layout — play dead-center of the row, media-player grammar (skip immediately right of play), panel toggles on the left:
  ```svelte
  <div class="controls" role="group" aria-label={t("landing_spinner_playback_controls")}>
    <div class="zone left">
      <button type="button" class="control-btn secondary"
        onclick={onToggleView}
        aria-pressed={viewMode === "grid"}
        aria-label={viewMode === "grid"
          ? t("landing_spinner_view_strip")
          : t("landing_spinner_view_grid")}>
        {#if viewMode === "grid"}
          <!-- strip icon: three horizontal bars, middle emphasized -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="3" y="10" width="18" height="4" rx="1" />
            <rect x="6" y="3" width="12" height="3" rx="1" opacity="0.5" />
            <rect x="6" y="18" width="12" height="3" rx="1" opacity="0.5" />
          </svg>
        {:else}
          <!-- existing 4-squares grid icon (unchanged) -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        {/if}
      </button>
      <button type="button" class="control-btn secondary" class:active={showHistory}
        onclick={onToggleHistory} aria-pressed={showHistory}
        aria-label={showHistory ? t("landing_spinner_hide_history") : t("landing_spinner_show_history")}>
        <!-- existing clock svg unchanged -->
      </button>
    </div>
    <button type="button" class="control-btn primary" onclick={onTogglePause}
      disabled={!animationReady}
      aria-label={isPlaying ? t("landing_spinner_pause") : t("landing_spinner_play")}>
      <!-- existing play/pause svgs unchanged -->
    </button>
    <div class="zone right">
      <button type="button" class="control-btn secondary" onclick={onSkip}
        disabled={!animationReady} aria-label={t("landing_spinner_skip")}>
        <!-- existing skip svg unchanged -->
      </button>
    </div>
  </div>
  ```
  Layout CSS (replaces `.controls` flex): three-zone grid so PLAY is centered on the page regardless of zone widths:
  ```css
  .controls {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    column-gap: clamp(0.75rem, 1.5vw, 1.25rem);
    width: 100%;
  }
  .zone { display: flex; align-items: center; gap: 0.75rem; }
  .zone.left { justify-content: flex-end; }
  .zone.right { justify-content: flex-start; }
  ```
  Keep the existing button visual CSS (`.control-btn`, primary/secondary, active, focus states, the ≤380px and short-horizontal size tweaks) and drop the `.copied` block.

- [ ] **Step 2: History "Play again".** In `SpinnerHistoryPanel.svelte`: replace `onCopyEntry` with `onReplayEntry: (index: number) => void`; delete the copied-state script block; the row button becomes:
  ```svelte
  <button type="button" class="history-replay-btn" onclick={() => onReplayEntry(i)} disabled={i === 0}>
    {t("landing_spinner_play_again")}
  </button>
  ```
  (`i === 0` is the currently-playing entry — replaying it is a no-op, so disable it.) Rename the CSS class from `history-copy-btn`, drop `.copied`, keep the sizing (`min-width` can shrink to fit the single label — no two-state swap anymore, so the ghost-width reservation is obsolete). Update the file header comment (Copy → Play again).
  In `+page.svelte`: delete `copyHistoryEntry`, add
  ```ts
  function replayHistoryEntry(index: number) {
    const entry = playback?.history[index];
    if (entry) playback?.hotSwapSequence(entry.sequence);
  }
  ```
  and pass `onReplayEntry={replayHistoryEntry}`.

- [ ] **Step 3: Copy moves to the Debug panel.** In `EndlessSpinnerDebugPanel.svelte`, add a "Copy sequence data" button (reuse the panel's existing button styling) that calls a new `onCopy: () => Promise<boolean>` prop; wire `onCopy={handleCopy}` in the page (the existing `handleCopy` moves unchanged — it is no longer referenced by SpinnerControls). Also delete `playback.copyHistoryEntry` from `endless-playback-state.svelte.ts` **only if** a repo grep shows no other consumer; otherwise leave the API.

- [ ] **Step 4: i18n.** Add to `messages/en.json`: `"landing_spinner_play_again": "Play again"`, `"landing_spinner_view_grid": "Show notation grid"`, `"landing_spinner_view_strip": "Show step strip"`. Grep-check `landing_spinner_copy*` keys: still used by the debug panel — keep; delete any that end up referenced nowhere.

- [ ] **Step 5: Verify.** `npm run check:fast` on the five files → zero errors. On your own dev server or :5173 via curl, confirm the route still returns 200.

- [ ] **Step 6: Commit** with pathspec over the five files.
  ```bash
  git commit -m "feat(endless-spinner): centered transport, history replays instead of copying, copy lives with Debug" -- src/routes/endless-spinner/components/SpinnerControls.svelte src/routes/endless-spinner/components/SpinnerHistoryPanel.svelte src/routes/endless-spinner/components/EndlessSpinnerDebugPanel.svelte src/routes/endless-spinner/+page.svelte messages/en.json
  ```

---

## Task 5: Stage rebuild — strip view, grid view, per-tier composition

**Files:**
- Modify: `src/routes/endless-spinner/+page.svelte`

This is the visual heart. The CSS below is the starting composition; Task 7's screenshot loop is the authority that tunes it — expect to iterate.

- [ ] **Step 1: View state + strip wiring.** In the script:
  ```ts
  let viewMode = $state<"strip" | "grid">("strip");
  ```
  (replaces `showStepGrid`; update the SpinnerControls props accordingly). Imports: add `PracticeLanePane` from `$lib/shared/sequence-viewer/components/PracticeLanePane.svelte`; keep `StepGrid`.

- [ ] **Step 2: Stage markup.** Replace the `animation-area` block's grid half with a keyed pane (canvas half unchanged):
  ```svelte
  <div class="animation-area" class:strip-view={viewMode === "strip"} class:grid-view={viewMode === "grid"}>
    <div class="canvas-container"><!-- AnimatorCanvas / states, unchanged --></div>

    {#if playback?.animationState?.sequenceData}
      <div class="playback-pane">
        <Crossfade key={viewMode} fill>
          {#if viewMode === "strip"}
            <div class="strip-layer">
              <PracticeLanePane
                sequence={playback.animationState.sequenceData}
                currentStep={playback.animationState.currentStep}
                bpm={scope.settings.bpm}
                cellSize={88}
                onSeek={handleProgressBarSeek}
              />
            </div>
          {:else}
            <div class="grid-layer themed-scrollbar">
              <StepGrid
                steps={playback.animationState.sequenceData.steps}
                startPosition={playback.derivedStartPosition}
                selectedStepNumber={currentStepNumber}
              />
            </div>
          {/if}
        </Crossfade>
      </div>
    {/if}
  </div>
  ```
  The old `beat-grid-container` / `beat-grid-header` / `beat-grid-title` / `beat-grid-count` markup and CSS are deleted (the Notation header and step count are gone by design). `.strip-layer`/`.grid-layer` both `height: 100%; box-sizing: border-box;` — the grid layer additionally `overflow-y: auto; padding: clamp(0.5rem, 0.8vw, 0.875rem);`.
  Note: `PracticeLanePane` shifts `currentStep` by −1 internally and drops the start cell (its loop semantics match this page — the spinner never parks on a start pose).

- [ ] **Step 3: Per-tier CSS.** Replace the current `.animation-area` responsive blocks with the tiered composition (existing `display: contents` base + `order` trick stays for stacked layouts):
  ```css
  /* Base (stacked: phones + tablet portrait). The area dissolves so the
     transport can slot directly under the canvas (order set on children). */
  .animation-area { display: contents; }
  .canvas-container { order: 1; align-self: center; }
  .playback-pane   { order: 2; }
  .transport-bar   { order: 3; }
  .showcase > :global(.history-panel) { order: 4; }

  /* Stacked strip: a content-sized foot right under the canvas. */
  .playback-pane { width: 100%; min-width: 0; }
  .animation-area.strip-view + .transport-bar { /* nothing extra */ }
  .animation-area.strip-view .playback-pane,
  .strip-layer { height: auto; }
  .animation-area.grid-view .playback-pane { height: min(62dvh, 34rem); }

  /* Wide (≥1050px): side-by-side split filling the band. */
  @media (min-width: 1050px) {
    .animation-area {
      display: grid;
      align-items: stretch;
      gap: clamp(0.75rem, 1.4vw, 1.5rem);
      width: 100%;
      min-width: 0;
      flex: 1 1 auto;
      min-height: 24rem;
    }
    .canvas-container, .playback-pane, .transport-bar { order: 0; }
    .canvas-container { align-self: auto; width: 100%; height: 100%; aspect-ratio: auto; }
    .playback-pane { height: 100%; }
    /* Strip view: big canvas, narrow read-ahead column. */
    .animation-area.strip-view { grid-template-columns: minmax(0, 1.4fr) minmax(16rem, 0.6fr); }
    /* Grid view: canvas cedes room to the notation. */
    .animation-area.grid-view { grid-template-columns: minmax(25rem, 0.92fr) minmax(30rem, 1.08fr); }
  }

  /* Short-horizontal (≥700w, ≤600h): side-by-side is mandatory. */
  @media (min-width: 700px) and (max-height: 600px) {
    .animation-area {
      display: grid;
      align-items: stretch;
      width: 100%; min-width: 0;
      height: clamp(14rem, calc(100dvh - 11.75rem), 26rem);
      gap: 0.625rem;
    }
    .canvas-container, .playback-pane, .transport-bar { order: 0; }
    .canvas-container { align-self: auto; width: 100%; height: 100%; aspect-ratio: auto; }
    .playback-pane { height: 100%; }
    .animation-area.strip-view { grid-template-columns: minmax(0, 1.3fr) minmax(10rem, 0.7fr); }
    .animation-area.grid-view  { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); }
  }
  ```
  Keep: the root-ramp block, `--shell-w` content band, showcase panel, canvas visual styling, state messages, sr-only, home link, header CSS (mode-info height changed in Task 3). The short-horizontal header grid and ≤600px compact tiers stay.

- [ ] **Step 4: Phone tier — docked transport (modern mobile).** In the `@media (max-width: 600px)` block:
  ```css
  .transport-bar {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    z-index: 5;
    padding: 0.5rem max(0.75rem, env(safe-area-inset-left))
             calc(0.5rem + env(safe-area-inset-bottom)) max(0.75rem, env(safe-area-inset-right));
    background: color-mix(in srgb, #05050b 88%, transparent);
    backdrop-filter: blur(12px);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }
  .showcase { padding-bottom: 5.5rem; } /* clears the docked bar */
  .canvas-container { width: 100vw; margin-inline: calc(50% - 50vw); border-radius: 0; border-inline: none; } /* full-bleed */
  ```
  The history drawer must layer above the docked bar (`z-index` on `.history-panel` > 5) or render as the existing in-flow panel with bottom padding — check both in the sweep and keep whichever reads better. The debug toggle moves up (`bottom: 5.5rem`) so the docked bar doesn't cover it.

- [ ] **Step 5: Verify runtime.** With a dev server: load the route, confirm strip renders and advances with playback, view toggle swaps strip⇄grid without the canvas moving, seek-by-tap works on strip cells, skip/pause work in both views and both modes. `npm run check:fast` → zero errors. `npx vitest run tests/unit/animation-engine/ --reporter=basic` → PASS.

- [ ] **Step 6: Commit.**
  ```bash
  git commit -m "feat(endless-spinner): strip-first stage with grid view toggle, per-tier composition, docked phone transport" -- src/routes/endless-spinner/+page.svelte
  ```

---

## Task 6: Ship to production

**Files:**
- Modify: `src/config/feature-flags.ts`

- [ ] **Step 1:** Remove `"src/routes/endless-spinner/"` from `DEV_ONLY_ROUTE_PATTERNS` (line ~245).
- [ ] **Step 2:** Promote the `landing` feature entry (lines ~230-234). First read the file's tier definitions and pick the tier that means "included in production builds" (whatever `retro`/`loop-labeler` are NOT). If features not listed default to included, deleting the `landing` entry outright is the correct promotion — verify by reading `isFeatureEnabled()`'s default branch before choosing.
- [ ] **Step 3:** Confirm nothing else dev-only remains inside `src/lib/features/landing/` that shouldn't ship: after Tasks 1–3 the module contains the spinner orchestrator/generator/metrics/toggle + `PlayWithItInner` dependencies. Grep the module for imports of deleted files → zero.
- [ ] **Step 4:** Production build + worker size: `npm run build` (this is the pre-ship gate — allowed once). Expect success; then check the emitted worker: `ls -l .svelte-kit/cloudflare/_worker.js` (or the project's actual output path — find it from the previous build logs/wrangler config) and confirm < 25 MiB (`reference_cf_worker_size_limit`).
- [ ] **Step 5: Commit.**
  ```bash
  git commit -m "feat(endless-spinner): promote the spinner to production builds" -- src/config/feature-flags.ts
  ```

---

## Task 7: Visual verification sweep — every viewport, both views, both modes

**Owner: the main-loop agent (Fable), NOT a subagent — subagents cannot see the page.** This task is the authority over Task 5's CSS; iterate fix→reload→reshoot until every frame passes.

**Setup:** Launch own Chrome:
```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList `
  '--remote-debugging-port=9222','--user-data-dir=C:\Users\Austen\.claude\chrome-profile', `
  '--force-device-scale-factor=1','about:blank'
```
`new_page` → `https://localhost:5173/endless-spinner`. Gotchas from the last sweep: this Chrome profile runs 90% page zoom — after each `resize_page`, verify `window.innerWidth` via `evaluate_script` and compensate (resize to size/0.9) until innerWidth matches the target. Phone/tablet viewports below the ~555px OS window minimum need `emulate` (viewport string like `"375x667x2,mobile,touch"`). Screenshots always `format: "webp", quality: 70`.

**The matrix — 7 viewports × {strip, grid} × {infinite, library} (28 states; screenshot all, measure where flagged):**

| Viewport | Size | Tier-specific pass criteria (beyond the global list) |
|---|---|---|
| 4K @ 200% | 1920×1080 | Side-by-side; page fits with no scrollbar; no dead rail beyond band margins |
| 4K @ 150% | 2560×1440 | Root font ≈19.3px (measure); composition identical to 1920, scaled |
| 4K @ 100% | 3840×2160 | Root font = 24px; strip cells legible from afar (fillHeight active); canvas dominant; nothing frozen at 1080p proportions |
| Laptop | 1440×900 | Fits exactly (scrollHeight == innerHeight in strip view) |
| Tablet portrait | 820×1180 | Stacked: canvas → strip foot → transport all in first viewport; grid view scrolls INSIDE its pane |
| Z Fold landscape | 960×412 | Side-by-side; compact header row; no vertical crush below `14rem` floor |
| iPhone SE | 375×667 | Full-bleed canvas; docked bottom transport with safe-area; no horizontal overflow; history drawer above the bar |

**Global checks at every state (the read-the-frame list):**
1. No control absurdly wide; play button centered on the row; transport zones balanced.
2. LOOP chips render with canonical colors/icons; quartered shows `fa-arrows-spin`, never the word "Quartered".
3. No text word anywhere except the canvas glyph.
4. View toggle: canvas position pixel-identical before/after (measure `getBoundingClientRect` of `.canvas-container` via `evaluate_script`).
5. Mode toggle: same measurement; now-playing row swaps without moving the stage.
6. No orphan grid rows, no dead space pools, no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`).
7. "Product, not output" — if a frame reads as output, fix and reshoot.

- [ ] **Step 1:** Desktop tier sweep (1920, 2560, 3840, 1440×900) — measurement pass + screenshots, both views × both modes. Fix and iterate.
- [ ] **Step 2:** Tablet + fold + phone sweep (820×1180, 960×412, 375×667 via emulate) — both views × both modes. Fix and iterate.
- [ ] **Step 3:** Interaction spot-checks on one desktop + one phone viewport: history open/replay (playing sequence swaps), skip, pause, seek-by-tap on strip, debug copy.
- [ ] **Step 4:** Close every tab/page you opened; kill your own Chrome/vite if you spawned them (`resource-budget.md`).
- [ ] **Step 5:** Commit any CSS fixes from the sweep:
  ```bash
  git commit -m "fix(endless-spinner): composition fixes from the full-matrix visual sweep" -- src/routes/endless-spinner/+page.svelte src/routes/endless-spinner/components/SpinnerControls.svelte src/routes/endless-spinner/components/SpinnerNowPlaying.svelte
  ```
  (extend the pathspec to whichever spinner-owned files the sweep actually touched)

---

## Task 8: Final gates

- [ ] **Step 1:** `npx vitest run tests/unit/animation-engine/ --reporter=basic` → all PASS. Also run the sequence-viewer shell contract test if any shared file was touched: `npx vitest run tests/unit/sequence-viewer-shell-contract.test.ts`.
- [ ] **Step 2:** Grep gates over the full diff (`git diff main~N` or per-file): no `type="checkbox"`, no raw `\.word` in display templates without `simplifyRepeatedWord`, no `class="chip"` interactive buttons, no hex LOOP colors outside `LOOP_COMPONENT_MAP` consumers, no `broadcast|"live"` remnants in the spinner stack.
- [ ] **Step 3:** ONE full `npm run check` IF no other svelte-check is running machine-wide (PowerShell process gate from `resource-budget.md`); otherwise `check:fast` over every touched file and note the substitution. Pre-existing errors in other sessions' files are not yours to fix — record them, confirm none are in spinner-touched files.
- [ ] **Step 4:** i18n sanity: `node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); console.log('OK')"` → OK.
- [ ] **Step 5:** Update the audit-handoff doc status (`docs/superpowers/specs/2026-07-28-endless-spinner-4k-audit-handoff.md`: add a line that the rebuild spec/plan supersede its remaining open questions) and commit docs with pathspec.
- [ ] **Step 6:** Report: evidence per gate, screenshots summary, and the push status (local main is ahead of origin with other sessions' commits — pushing publishes them AND auto-deploys production; that remains Austen's call).
