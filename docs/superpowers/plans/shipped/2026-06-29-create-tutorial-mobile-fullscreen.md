# Create Tutorial Mobile Fullscreen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On screens ≤900px, the Create tutorial fills the viewport edge-to-edge so the embedded pictograph pickers get full width + height (bigger tiles, wider arrows).

**Architecture:** The wizard (`CreateTutorialWizard.svelte`) owns one `@media (max-width: 900px)` block. It strips each step card's chrome via `.create-tutorial-wizard :global(.tutorial-step)` — specificity (0,2,0), which beats each step's own `.tutorial-step` mobile rule (0,1,0), so no per-step CSS fights. Each step wraps its title+subtitle in a `.step-header` div (markup only); the wizard styles that as a column on desktop, a one-line row on mobile.

**Tech Stack:** Svelte 5, scoped CSS with `:global()`, container/viewport media queries, `dvh` units, `env(safe-area-inset-*)`.

**Spec:** `docs/superpowers/specs/active/2026-06-29-create-tutorial-mobile-fullscreen-design.md`

**Why no unit tests:** the change is viewport CSS + markup wrapping. Per the project testing philosophy (test what eyes can't catch; skip what's obvious when broken), the verification is a real test route rendered at mobile widths with screenshots — Tasks 6–7. No `*.test.ts` is warranted.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/shared/onboarding/components/create-tutorial/steps/PickStartPositionStep.svelte` | Step 1 markup | Wrap header in `.step-header` |
| `src/lib/shared/onboarding/components/create-tutorial/steps/AddStepTutorialStep.svelte` | Step 2 markup | Wrap header in `.step-header` |
| `src/lib/shared/onboarding/components/create-tutorial/steps/PlaySequenceStep.svelte` | Step 3 markup | Wrap header in `.step-header` |
| `src/lib/shared/onboarding/components/create-tutorial/steps/ReadyStep.svelte` | Step 4 markup | Wrap header in `.step-header` |
| `src/lib/shared/onboarding/components/create-tutorial/CreateTutorialWizard.svelte` | Single owner of the fullscreen treatment | Add `.step-header` desktop rule + `@media (max-width: 900px)` block |
| `src/routes/test/tutorial-fullscreen/+page.svelte` | Verification harness | Create — renders the real wizard |

All five `.step-header` wrappers must use the **exact same class name** `step-header` — the wizard styles it globally.

---

### Task 1: Wrap the header in `PickStartPositionStep`

**Files:**
- Modify: `src/lib/shared/onboarding/components/create-tutorial/steps/PickStartPositionStep.svelte`

- [ ] **Step 1: Wrap title + subtitle**

Replace:

```svelte
<div class="tutorial-step">
  <h1 class="title">Pick a starting position</h1>
  <p class="subtitle">Every sequence begins with a position. Tap one.</p>

  <div class="picker-container">
```

with:

```svelte
<div class="tutorial-step">
  <div class="step-header">
    <h1 class="title">Pick a starting position</h1>
    <p class="subtitle">Every sequence begins with a position. Tap one.</p>
  </div>

  <div class="picker-container">
```

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor(tutorial): wrap PickStart header in .step-header" -- src/lib/shared/onboarding/components/create-tutorial/steps/PickStartPositionStep.svelte
```

---

### Task 2: Wrap the header in `AddStepTutorialStep`

**Files:**
- Modify: `src/lib/shared/onboarding/components/create-tutorial/steps/AddStepTutorialStep.svelte`

- [ ] **Step 1: Wrap title + subtitle**

Replace:

```svelte
<div class="tutorial-step">
  <h1 class="title">Add beat {stepCount + 1} of {REQUIRED_BEATS}</h1>
  <p class="subtitle">
    {#if beatsRemaining > 1}
      Pick a move. {beatsRemaining} beats left.
    {:else}
      Last one. Pick your final beat.
    {/if}
  </p>

  <div class="picker-container">
```

with:

```svelte
<div class="tutorial-step">
  <div class="step-header">
    <h1 class="title">Add beat {stepCount + 1} of {REQUIRED_BEATS}</h1>
    <p class="subtitle">
      {#if beatsRemaining > 1}
        Pick a move. {beatsRemaining} beats left.
      {:else}
        Last one. Pick your final beat.
      {/if}
    </p>
  </div>

  <div class="picker-container">
```

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor(tutorial): wrap AddStep header in .step-header" -- src/lib/shared/onboarding/components/create-tutorial/steps/AddStepTutorialStep.svelte
```

---

### Task 3: Wrap the header in `PlaySequenceStep`

**Files:**
- Modify: `src/lib/shared/onboarding/components/create-tutorial/steps/PlaySequenceStep.svelte`

- [ ] **Step 1: Wrap title + subtitle**

Replace:

```svelte
<div class="tutorial-step">
  <h1 class="title">Your sequence</h1>
  <p class="subtitle">
    {#if showAnimation}
      Watch your sequence come to life.
    {:else}
      Here's what you built. Hit play to see it animated.
    {/if}
  </p>

  <div class="viewer-container">
```

with:

```svelte
<div class="tutorial-step">
  <div class="step-header">
    <h1 class="title">Your sequence</h1>
    <p class="subtitle">
      {#if showAnimation}
        Watch your sequence come to life.
      {:else}
        Here's what you built. Hit play to see it animated.
      {/if}
    </p>
  </div>

  <div class="viewer-container">
```

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor(tutorial): wrap PlaySequence header in .step-header" -- src/lib/shared/onboarding/components/create-tutorial/steps/PlaySequenceStep.svelte
```

---

### Task 4: Wrap the header in `ReadyStep`

**Files:**
- Modify: `src/lib/shared/onboarding/components/create-tutorial/steps/ReadyStep.svelte`

- [ ] **Step 1: Wrap title + subtitle**

Replace:

```svelte
<div class="tutorial-step">
  <h1 class="title">Your workspace</h1>
  <p class="subtitle">Here's where everything lives.</p>

  <!-- Desktop: side-by-side mockup + legend -->
```

with:

```svelte
<div class="tutorial-step">
  <div class="step-header">
    <h1 class="title">Your workspace</h1>
    <p class="subtitle">Here's where everything lives.</p>
  </div>

  <!-- Desktop: side-by-side mockup + legend -->
```

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor(tutorial): wrap Ready header in .step-header" -- src/lib/shared/onboarding/components/create-tutorial/steps/ReadyStep.svelte
```

---

### Task 5: Add the fullscreen treatment to the wizard

**Files:**
- Modify: `src/lib/shared/onboarding/components/create-tutorial/CreateTutorialWizard.svelte`

- [ ] **Step 1: Add the `.step-header` desktop default**

In the `<style>` block, immediately after the `.step-container` rule (ends at the line with `padding: 0 16px 90px;` then `}`), add:

```css
  /* Header wrapper — column on desktop, one compact line on mobile (see media query) */
  .create-tutorial-wizard :global(.step-header) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
  }
```

- [ ] **Step 2: Add the mobile fullscreen block**

At the END of the `<style>` block (just before the closing `</style>`), add:

```css
  /* ── Mobile / small-tablet: fullscreen edge-to-edge ── */
  @media (max-width: 900px) {
    /* Stop vertical centering so the card fills the viewport */
    .create-tutorial-wizard {
      align-items: stretch;
    }

    .step-container {
      padding: 0;
      max-width: none;
      align-items: stretch;
    }

    /* Strip card chrome for every step (0,2,0) > each step's own rule (0,1,0) */
    .create-tutorial-wizard :global(.tutorial-step) {
      max-width: none;
      width: 100%;
      border: none;
      border-radius: 0;
      min-height: 100dvh;
      box-sizing: border-box;
      padding-top: 56px; /* clear fixed Back/Skip buttons */
      padding-bottom: 88px; /* clear fixed step-dots */
      padding-left: max(8px, env(safe-area-inset-left));
      padding-right: max(8px, env(safe-area-inset-right));
    }

    /* Free the second axis so the device-aware fitter grows tiles both ways.
       (Ready's accordion is intentionally NOT filled — it stays content-sized.) */
    .create-tutorial-wizard :global(.picker-container),
    .create-tutorial-wizard :global(.viewer-container) {
      height: auto;
      flex: 1;
      min-height: 0;
    }

    /* One compact line: title · subtitle */
    .create-tutorial-wizard :global(.step-header) {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: center;
      gap: 4px 8px;
    }
    .create-tutorial-wizard :global(.step-header .title) {
      font-size: 1.05rem;
    }
    .create-tutorial-wizard :global(.step-header .subtitle) {
      font-size: 0.8rem;
    }
    .create-tutorial-wizard :global(.step-header .subtitle::before) {
      content: "·";
      margin-right: 6px;
      color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    }
  }
```

- [ ] **Step 3: Type-check the changed files**

Run: `npm run check:fast > /tmp/tut-check.log 2>&1; grep -iE "create-tutorial|onboarding" /tmp/tut-check.log`
Expected: no matches (the 5 tutorial files compile clean). Pre-existing errors in unrelated `src/routes/test/*` files are expected and unrelated.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(tutorial): fullscreen edge-to-edge on mobile (<=900px)" -- src/lib/shared/onboarding/components/create-tutorial/CreateTutorialWizard.svelte
```

---

### Task 6: Build the verification route

**Files:**
- Create: `src/routes/test/tutorial-fullscreen/+page.svelte`

- [ ] **Step 1: Create the route**

```svelte
<!--
  Test harness for the Create tutorial fullscreen-on-mobile change.
  Renders the REAL CreateTutorialWizard. Resize the viewport to <=900px
  (375 / 414) to see the edge-to-edge treatment. Walk pick-start -> add-beat
  to verify pictograph tiles grow.
-->
<script lang="ts">
  import CreateTutorialWizard from "$lib/shared/onboarding/components/create-tutorial/CreateTutorialWizard.svelte";
  import { createTutorialState } from "$lib/shared/onboarding/state/create-tutorial-state.svelte";

  // Always start fresh at the first step.
  createTutorialState.reset();

  function handleComplete() {
    createTutorialState.reset();
  }
  function handleSkip() {
    createTutorialState.reset();
  }
</script>

<CreateTutorialWizard onComplete={handleComplete} onSkip={handleSkip} />
```

- [ ] **Step 2: Confirm the dev server serves it**

Run: `curl -sk https://localhost:5173/test/tutorial-fullscreen -o /dev/null -w "%{http_code}\n"`
Expected: `200`

- [ ] **Step 3: Commit**

```bash
git commit -m "test(tutorial): route to verify mobile fullscreen" -- src/routes/test/tutorial-fullscreen/+page.svelte
```

---

### Task 7: Verify on mobile (evidence)

**Requires:** Chrome DevTools MCP. Interactive resize/navigate needs the user's explicit OK (per project browser rules). If not granted, fall back to handing the user the clickable link to open at mobile width on their device.

- [ ] **Step 1: Emulate 375px and capture pick-start**

With permission: `navigate_page` → `https://localhost:5173/test/tutorial-fullscreen`, `resize_page` to 375×812, `take_screenshot`.
Expected: card fills the screen edge-to-edge; no card border/radius; one-line header; no content hidden under the Back/Skip buttons or the bottom dots.

- [ ] **Step 2: Pick a start position, capture add-beat**

`click` a start-position pictograph → wizard auto-advances to add-beat. `take_screenshot`.
Expected: `OptionPicker` spans full width; pictograph tiles visibly larger than the carded baseline; arrows wider.

- [ ] **Step 3: Confirm desktop is unchanged**

`resize_page` to 1280×800, `take_screenshot`.
Expected: centered card with border/radius — identical to before (the ≤900px rules don't apply).

- [ ] **Step 4: Report evidence**

Post the before/after screenshots. State measured/observed tile-size change. If a screenshot can't be captured, give the user the clickable link and the exact things to check.

---

### Task 8 (optional cleanup): Remove dead per-step mobile rules

The wizard's (0,2,0) override now fully shadows each step's own `≤640`/`≤480`
`.tutorial-step` chrome rules and `.picker-container`/`.viewer-container` height
rules (`≤640 ⊂ ≤900`). They're inert. Removing them prevents future confusion.
Do this only after Task 7 confirms the new behavior, so the diff stays reviewable.

**Files:** the four step components.

- [ ] **Step 1: PickStart — delete the shadowed rules**

In `PickStartPositionStep.svelte`, delete the `.tutorial-step` and `.picker-container` overrides inside `@media (max-width: 640px)` and `@media (max-width: 480px)` (the picker-container height clamps and the card padding/title-size). Keep the `@media (prefers-reduced-motion: reduce)` block. If a media block becomes empty, delete the whole block.

- [ ] **Step 2: AddStep — same deletion** in `AddStepTutorialStep.svelte`.

- [ ] **Step 3: Play — same deletion** in `PlaySequenceStep.svelte` (the `@media (max-width: 480px)` `.tutorial-step`/`.title` rules; keep `.play-button`/`.continue-button` sizing if you want the smaller mobile buttons, OR drop — they still apply ≤480 and don't conflict with the wizard).

- [ ] **Step 4: Ready — same deletion** in `ReadyStep.svelte` (the `@media (max-width: 640px)`/`480px` `.tutorial-step` padding/`.title`/`.go-button` rules that the wizard now governs; keep the `.desktop-only`/`.mobile-only` swap and accordion rules — those are NOT shadowed and are load-bearing).

- [ ] **Step 5: Re-verify + commit**

Run: `curl -sk https://localhost:5173/test/tutorial-fullscreen -o /dev/null -w "%{http_code}\n"` → `200`, re-screenshot pick-start at 375px (unchanged from Task 7).

```bash
git commit -m "refactor(tutorial): drop per-step mobile rules now owned by wizard" -- src/lib/shared/onboarding/components/create-tutorial/steps/PickStartPositionStep.svelte src/lib/shared/onboarding/components/create-tutorial/steps/AddStepTutorialStep.svelte src/lib/shared/onboarding/components/create-tutorial/steps/PlaySequenceStep.svelte src/lib/shared/onboarding/components/create-tutorial/steps/ReadyStep.svelte
```

---

## Self-Review

**Spec coverage:**
- All 4 steps fullscreen ≤900px → Task 5 (wizard `:global(.tutorial-step)`). ✓
- One-line header → Tasks 1–4 (`.step-header` wrap) + Task 5 (row styling + `·`). ✓
- ≤900px breakpoint → Task 5. ✓
- Both axes freed → Task 5 (`flex: 1` on picker/viewer). ✓
- Dot/button clearance preserved → Task 5 (`padding-bottom: 88px`). ✓
- Ready accordion not height-filled → Task 5 (only picker/viewer targeted). ✓
- Verification via real-component test route → Tasks 6–7. ✓
- Shared-primitive refactor explicitly out of scope → not planned. ✓
- Per-step dead-rule cleanup → Task 8 (optional, gated after verification). ✓

**Placeholder scan:** none — every CSS/markup step shows exact code.

**Type/name consistency:** the wrapper class is `step-header` in all five files; the wizard selectors target `.step-header`, `.tutorial-step`, `.picker-container`, `.viewer-container`, `.step-header .title/.subtitle` — all of which exist in the step markup (`.title`/`.subtitle` confirmed present in all four steps; `.picker-container` in steps 1–2; `.viewer-container` in step 3).

**Known interaction:** ReadyStep's `.tutorial-step` has `max-height: calc(100vh - 120px); overflow-y: auto`. The wizard sets `min-height: 100dvh` (not max-height), so min > max → `min-height` wins; the Ready card is full-height and scrolls internally if the accordion overflows. Acceptable. If undesirable, Task 8 Step 4 can also drop that `max-height` on mobile.
