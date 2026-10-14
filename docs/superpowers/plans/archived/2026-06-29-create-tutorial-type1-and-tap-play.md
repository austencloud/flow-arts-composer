# Create Tutorial Type-1 + Tap-to-Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Create tutorial, show only Type 1 dual-shift options as a plain grid on the add-beat step, and make the play step tap-to-play with minimal chrome (no green button, no scrubber) plus non-AI copy.

**Architecture:** Reuse the existing `OptionPicker.filterPredicate` to keep only Type 1 options (one section → single grid, no swipe arrows); add a `hideFilters` boolean to the shared picker to suppress the All/Continuous pill. Rework `PlaySequenceStep` to render `AnimatorCanvas` directly with `tapToToggle`/`progressLine`/`onPlaybackToggle`, initialized paused on mount, mirroring the proven `PlayWithItInner` minimal-chrome pattern.

**Tech Stack:** Svelte 5 runes, existing OptionPicker + AnimatorCanvas components.

**Spec:** `docs/superpowers/specs/active/2026-06-29-create-tutorial-type1-and-tap-play-design.md`

**Why no unit tests:** these are UI behavior + wiring changes (a CSS-gated pill, a prop-driven tap handler). Per the project testing philosophy (test silent logic; skip what's obvious when broken), verification is the existing `/test/tutorial-fullscreen` route + screenshots — Task 4.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/features/create/construct/option-picker/components/OptionPicker.svelte` | Picker orchestrator | Add `hideFilters` prop, thread to content |
| `src/lib/features/create/construct/option-picker/components/OptionPickerContent.svelte` | Picker layout | Accept `hideFilters`; gate the filter pill + unified-header filter |
| `src/lib/shared/onboarding/components/create-tutorial/steps/AddStepTutorialStep.svelte` | Tutorial add-beat | Pass Type-1 `filterPredicate` + `hideFilters` |
| `src/lib/shared/onboarding/components/create-tutorial/steps/PlaySequenceStep.svelte` | Tutorial play step | Tap-to-play minimal chrome; init on mount; drop ChoreoCard/green/stop; new copy |

---

### Task 1: Add `hideFilters` to the shared picker

**Files:**
- Modify: `src/lib/features/create/construct/option-picker/components/OptionPicker.svelte`
- Modify: `src/lib/features/create/construct/option-picker/components/OptionPickerContent.svelte`

- [ ] **Step 1: OptionPicker — add the prop to the interface**

Replace:

```svelte
    /** Optional predicate to further filter options (e.g., loop-only for tutorials) */
    filterPredicate?: (option: PictographData) => boolean;
  }
```

with:

```svelte
    /** Optional predicate to further filter options (e.g., loop-only for tutorials) */
    filterPredicate?: (option: PictographData) => boolean;
    /** Hide the All/Continuous filter UI (e.g. simplified tutorial grid) */
    hideFilters?: boolean;
  }
```

- [ ] **Step 2: OptionPicker — destructure with default**

Replace:

```svelte
    isUndoingOption = false,
    filterPredicate,
  }: Props = $props();
```

with:

```svelte
    isUndoingOption = false,
    filterPredicate,
    hideFilters = false,
  }: Props = $props();
```

- [ ] **Step 3: OptionPicker — pass it to OptionPickerContent**

In the `<OptionPickerContent ... />` invocation, add the `hideFilters` prop. Replace:

```svelte
  <OptionPickerContent
    options={preparedOptions}
    {organizerService}
    {sizerService}
    onSelect={handleSelect}
    isContinuousOnly={internalContinuousOnly}
    onToggleContinuous={handleToggleContinuous}
    {isSideBySideLayout}
    {currentSequence}
    onSlotClicked={handleSlotClicked}
```

with:

```svelte
  <OptionPickerContent
    options={preparedOptions}
    {organizerService}
    {sizerService}
    onSelect={handleSelect}
    isContinuousOnly={internalContinuousOnly}
    onToggleContinuous={handleToggleContinuous}
    {isSideBySideLayout}
    {hideFilters}
    {currentSequence}
    onSlotClicked={handleSlotClicked}
```

- [ ] **Step 4: OptionPickerContent — add the prop to the interface**

Replace:

```svelte
    // Filter props
    isContinuousOnly?: boolean;
    onToggleContinuous?: (value: boolean) => void;
    isSideBySideLayout?: () => boolean;
```

with:

```svelte
    // Filter props
    isContinuousOnly?: boolean;
    onToggleContinuous?: (value: boolean) => void;
    isSideBySideLayout?: () => boolean;
    /** Hide the All/Continuous filter UI (simplified tutorial grid) */
    hideFilters?: boolean;
```

- [ ] **Step 5: OptionPickerContent — destructure with default**

Replace:

```svelte
    isContinuousOnly = false,
    onToggleContinuous,
    isSideBySideLayout = () => false,
    currentSequence = [],
```

with:

```svelte
    isContinuousOnly = false,
    onToggleContinuous,
    isSideBySideLayout = () => false,
    hideFilters = false,
    currentSequence = [],
```

- [ ] **Step 6: OptionPickerContent — gate the unified-header filter**

Replace:

```svelte
          <OptionPickerHeader
            showFilter={shouldShowFilterToggle()}
            {isContinuousOnly}
```

with:

```svelte
          <OptionPickerHeader
            showFilter={shouldShowFilterToggle() && !hideFilters}
            {isContinuousOnly}
```

- [ ] **Step 7: OptionPickerContent — gate the standalone pill**

Replace:

```svelte
      {#if shouldShowFilterToggle() && !useUnifiedHeader}
```

with:

```svelte
      {#if shouldShowFilterToggle() && !hideFilters && !useUnifiedHeader}
```

- [ ] **Step 8: Type-check**

Run: `npm run check:fast > "$TEMP/t1.log" 2>&1; grep -iE "OptionPicker" "$TEMP/t1.log"`
Expected: no matches (clean). Pre-existing unrelated `test/*` errors are expected.

- [ ] **Step 9: Commit**

```bash
git commit -m "feat(option-picker): hideFilters prop to suppress All/Continuous UI" -- src/lib/features/create/construct/option-picker/components/OptionPicker.svelte src/lib/features/create/construct/option-picker/components/OptionPickerContent.svelte
```

---

### Task 2: Add-beat step shows only Type 1

**Files:**
- Modify: `src/lib/shared/onboarding/components/create-tutorial/steps/AddStepTutorialStep.svelte`

- [ ] **Step 1: Import the type classifier**

Replace:

```svelte
  import {
    createTutorialState,
    REQUIRED_BEATS,
  } from "../../../state/create-tutorial-state.svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
```

with:

```svelte
  import {
    createTutorialState,
    REQUIRED_BEATS,
  } from "../../../state/create-tutorial-state.svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import {
    getLetterType,
    type Letter,
  } from "$lib/shared/foundation/domain/models/letter";
  import { LetterType } from "$lib/shared/foundation/domain/models/letter-type";
```

- [ ] **Step 2: Add the Type-1 predicate**

After the `handleOptionSelected` function (just before `</script>`), add:

```svelte
  // Tutorial shows only Type 1 (dual-shift) options, presented as the whole set.
  function isType1(option: PictographData): boolean {
    return (
      !!option.letter &&
      getLetterType(option.letter as Letter) === LetterType.TYPE1
    );
  }
```

- [ ] **Step 3: Pass the predicate + hideFilters to the picker**

Replace:

```svelte
        <mod.default
          {currentSequence}
          {currentGridMode}
          onOptionSelected={handleOptionSelected}
        />
```

with:

```svelte
        <mod.default
          {currentSequence}
          {currentGridMode}
          onOptionSelected={handleOptionSelected}
          filterPredicate={isType1}
          hideFilters
        />
```

- [ ] **Step 4: Type-check**

Run: `npm run check:fast > "$TEMP/t2.log" 2>&1; grep -iE "AddStepTutorialStep" "$TEMP/t2.log"`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tutorial): add-beat shows only Type 1 options as a plain grid" -- src/lib/shared/onboarding/components/create-tutorial/steps/AddStepTutorialStep.svelte
```

---

### Task 3: Play step — tap-to-play minimal chrome + copy

**Files:**
- Modify: `src/lib/shared/onboarding/components/create-tutorial/steps/PlaySequenceStep.svelte`

- [ ] **Step 1: Drop ChoreoCard + unused settings imports**

Replace:

```svelte
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
```

with:

```svelte
  import AnimatorCanvas from "$lib/shared/animation-engine/components/AnimatorCanvas.svelte";
```

Then delete the now-unused settings import and `isDarkMode` derived. Replace:

```svelte
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
```

with:

```svelte
  import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
```

And replace:

```svelte
  const isDarkMode = $derived(getSettings().darkMode ?? false);

  // Haptic
```

with:

```svelte
  // Haptic
```

- [ ] **Step 2: Replace playback state + handlers**

Replace:

```svelte
  // Playback state
  let showAnimation = $state(false);
  let isPlaying = $state(false);
  let hasPlayed = $state(false);
  let currentStep = $state(0);
  let playbackController: AnimationPlaybackController | null = null;
  const animationState = createAnimationPanelState();
  let stateUnsubscribe: (() => void) | undefined;
```

with:

```svelte
  // Playback state
  let isPlaying = $state(false);
  let hasPlayed = $state(false);
  let currentStep = $state(0);
  let playbackController: AnimationPlaybackController | null = null;
  const animationState = createAnimationPanelState();
  let stateUnsubscribe: (() => void) | undefined;
```

Then replace the `handlePlay` and `handleStop` functions entirely:

```svelte
  function handlePlay() {
    hapticService?.trigger("selection");
    if (!tutorialSequence || !playbackController) return;
    showAnimation = true;
    hasPlayed = true;

    // Initialize and start playback
    animationState.setShouldLoop(true);
    const success = playbackController.initialize(
      tutorialSequence,
      animationState,
    );
    if (success) {
      animationState.setSequenceData(tutorialSequence);
      playbackController.togglePlayback();
    }
  }

  function handleStop() {
    hapticService?.trigger("selection");
    if (playbackController && isPlaying) {
      playbackController.stop();
    }
    showAnimation = false;
    isPlaying = false;
    currentStep = 0;
  }
```

with:

```svelte
  // Tap the canvas to toggle play/pause (minimal chrome — no buttons, no scrubber).
  function handleToggle() {
    hapticService?.trigger("selection");
    if (!playbackController) return;
    playbackController.togglePlayback();
    hasPlayed = true; // first tap unlocks Continue
  }
```

- [ ] **Step 3: Initialize playback paused on mount**

Replace:

```svelte
  onMount(() => {
    try {
      playbackController = getAnimationPlaybackController();
    } catch {
      console.warn("Animation playback controller not available");
    }

    // Subscribe to animation state changes
    stateUnsubscribe = animationState.subscribe(
      (key: AnimationStateKey, value: unknown) => {
        if (key === "isPlaying") {
          isPlaying = value as boolean;
        } else if (key === "currentStep") {
          currentStep = value as number;
        }
      },
    );
  });
```

with:

```svelte
  onMount(() => {
    try {
      playbackController = getAnimationPlaybackController();
    } catch {
      console.warn("Animation playback controller not available");
    }

    // Subscribe to animation state changes
    stateUnsubscribe = animationState.subscribe(
      (key: AnimationStateKey, value: unknown) => {
        if (key === "isPlaying") {
          isPlaying = value as boolean;
        } else if (key === "currentStep") {
          currentStep = value as number;
        }
      },
    );

    // Load the sequence paused so the first canvas tap plays it.
    if (playbackController && tutorialSequence) {
      animationState.setShouldLoop(true);
      playbackController.initialize(tutorialSequence, animationState);
      animationState.setSequenceData(tutorialSequence);
    }
  });
```

- [ ] **Step 4: Replace the template body**

Replace the whole markup block from `<div class="tutorial-step">` through its closing `</div>` (the template, lines ~154–209) with:

```svelte
<div class="tutorial-step">
  <div class="step-header">
    <h1 class="title">Your sequence</h1>
    <p class="subtitle">
      {#if isPlaying}
        Tap to pause.
      {:else}
        Tap to play your sequence.
      {/if}
    </p>
  </div>

  <div class="viewer-container">
    {#if tutorialSequence}
      <div class="animation-pane">
        <AnimatorCanvas
          sequenceData={animationState.sequenceData}
          currentStep={currentStep}
          isPlaying={isPlaying}
          blueProp={animationState.bluePropState}
          redProp={animationState.redPropState}
          gridMode={tutorialSequence.gridMode}
          letter={currentLetter}
          stepData={currentStepData}
          word={tutorialSequence.word}
          focused={true}
          tapToToggle={true}
          progressLine={true}
          onPlaybackToggle={handleToggle}
        />
      </div>
    {:else}
      <p class="loading">Building sequence...</p>
    {/if}
  </div>

  <div class="button-row">
    {#if hasPlayed}
      <button class="continue-button" onclick={onAdvance}>
        Continue <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </button>
    {/if}
  </div>
</div>
```

- [ ] **Step 5: Remove dead CSS (play/stop/card styles)**

Delete these now-unused style rules from the `<style>` block (svelte-check warns on unused selectors): `.card-pane,` from the `.card-pane, .animation-pane` selector (change it to just `.animation-pane`), and the entire `.play-button` (+ `:hover`/`:active`/` i`), `.stop-button` (+ `:hover`), and the `.play-button`/`.stop-button` entries inside both `@media (max-width: 480px)` and `@media (prefers-reduced-motion: reduce)` blocks. Keep `.continue-button` (+ its states), `.animation-pane`, `.viewer-container`, `.loading`, `.button-row`, `.tutorial-step`, `.title`, `.subtitle`.

Concretely, replace:

```css
  .card-pane,
  .animation-pane {
    width: 100%;
    height: 100%;
  }
```

with:

```css
  .animation-pane {
    width: 100%;
    height: 100%;
  }
```

Then delete the `.play-button { … }`, `.play-button:hover { … }`, `.play-button:active { … }`, `.play-button i { … }`, `.stop-button { … }`, `.stop-button:hover { … }` rule blocks. In `@media (max-width: 480px)`, delete the `.play-button { … }` block (keep `.tutorial-step`, `.title`, `.continue-button`). In `@media (prefers-reduced-motion: reduce)`, change `.tutorial-step, .play-button, .stop-button, .continue-button { transition: none; }` to `.tutorial-step, .continue-button { transition: none; }`, and change `.play-button:hover, .play-button:active, .continue-button:active { transform: none; }` to `.continue-button:active { transform: none; }`.

- [ ] **Step 6: Type-check (no unused-selector / unused-import warnings)**

Run: `npm run check:fast > "$TEMP/t3.log" 2>&1; grep -iE "PlaySequenceStep" "$TEMP/t3.log"`
Expected: no matches (no errors, no unused-CSS/import warnings for this file).

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(tutorial): play step tap-to-play minimal chrome + plain copy" -- src/lib/shared/onboarding/components/create-tutorial/steps/PlaySequenceStep.svelte
```

---

### Task 4: Verify on the test route

**Requires:** `/test/tutorial-fullscreen` (already exists). Interactive browser use needs the user's explicit OK; otherwise hand them the clickable link to check.

- [ ] **Step 1: Route still serves**

Run: `curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:5173/test/tutorial-fullscreen`
Expected: `200`

- [ ] **Step 2: Walk the flow at 375px (evidence)**

With permission, via DevTools MCP: navigate to the route, resize 375×812, pick a start position, then on add-beat confirm: a single grid, **no side arrows**, **no All/Continuous pill**. Screenshot.

- [ ] **Step 3: Complete all 4 picks — no stall**

Pick 4 beats. Confirm every pick presents Type-1 options (the grid is never empty). If any pick dead-ends with zero options, STOP and report — the spec's emptiness risk materialized and needs a fallback decision.

- [ ] **Step 4: Play step**

On the final-but-one play step: tap the canvas → it plays (icon flash), a thin progress line shows (no transport scrubber), no green/stop buttons. Tap again → pauses. Continue appears after the first tap. Subtitle reads "Tap to play your sequence." / "Tap to pause." Screenshot.

- [ ] **Step 5: Report evidence**

Post screenshots + the observed Type-1 option count. If unable to capture, give the user the clickable link and the exact checks.

---

## Self-Review

**Spec coverage:**
- A: Type-1 filter → Task 2; hideFilters prop → Task 1; single-grid/no-arrows is emergent (≤1 section) → verified Task 4 Step 2. ✓
- B: copy → Task 3 Step 4. ✓
- C: tap-to-play props + init-on-mount + drop buttons/ChoreoCard → Task 3 Steps 1–5. ✓
- Emptiness risk → Task 4 Step 3 (explicit stall check). ✓
- Count sanity → Task 4 Step 2. ✓

**Placeholder scan:** none — every step shows exact old/new code or an exact command.

**Type/name consistency:** `hideFilters` is the prop name in OptionPicker (Task 1 Steps 1–3) and OptionPickerContent (Steps 4–7) and the AddStep call (Task 2 Step 3). `isType1` defined Task 2 Step 2, used Step 3. `handleToggle` defined Task 3 Step 2, referenced in the template Step 4. `getLetterType`/`LetterType`/`Letter` imports match `option-organizer.ts:9–11`. `tapToToggle`/`progressLine`/`onPlaybackToggle` match `AnimatorCanvas.svelte:102/103/66`.

**Note on `$TEMP`:** in Git Bash use `"$TEMP/t1.log"`; the runner may instead capture via PowerShell `$env:TEMP`. Either is fine — the point is one cold check per task, then grep the log.
