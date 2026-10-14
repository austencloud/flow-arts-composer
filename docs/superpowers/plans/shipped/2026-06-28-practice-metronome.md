# Practice Metronome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an audible, toggleable metronome to ramp (practice) mode — one click per beat, accented on the loop downbeat, speeding up with the ramp.

**Architecture:** Reuse the existing `Metronome` (Web Audio), promoted to a shared location and extended with a `resume()` + one-shot `tick()`. The viewer's `playback-controller` owns the instance and fires one `tick` per beat off the beat-boundary event that already drives the practice haptic, gated by a persisted on/off pref. A cockpit toggle in `PracticeBar` flips the pref.

**Tech Stack:** Svelte 5 (runes), TypeScript, Web Audio API, Vitest (`npm run check` for type/lint).

> **Verification note:** Web Audio output is not meaningfully unit-testable, and the gating/accent are audible the instant the ramp runs (per the spec's testing section). This plan verifies with `npm run check` plus a scripted/manual runtime check, not TDD-first for the audio path. The one pure unit (pref persistence) is verified by a reload, consistent with the existing `practice-view-prefs.svelte.ts` (which ships no test).

**Spec:** `docs/superpowers/specs/2026-06-28-practice-metronome-design.md`

---

### Task 1: Promote + extend `Metronome` to a shared location

**Files:**
- Move: `src/lib/features/create/record/services/metronome.ts` → `src/lib/shared/audio/metronome.ts`
- Modify: `src/lib/features/create/record/components/RecordPanel.svelte:11`

- [ ] **Step 1: Move the file with git (preserve history)**

```bash
mkdir -p src/lib/shared/audio
git mv src/lib/features/create/record/services/metronome.ts src/lib/shared/audio/metronome.ts
```

- [ ] **Step 2: Add `resume()` and `tick()` to the class**

In `src/lib/shared/audio/metronome.ts`, insert these two public methods immediately **after** the existing `start(...)` method's closing brace (it ends with `return true;\n  }` near line 121) and before `stop()`:

```ts
  /**
   * Lazily create and resume the AudioContext. Browsers only unlock audio
   * inside a user gesture, so callers invoke this from a click handler.
   */
  resume(): void {
    this.initializeAudioContext();
    if (this.audioContext?.state === "suspended") {
      void this.audioContext.resume();
    }
  }

  /**
   * Play a single click immediately. For callers that drive their own beat
   * timing (e.g. the viewer's ramp playback) rather than this class's internal
   * scheduler. No-ops when audio is unavailable. Accent = the higher/louder
   * click used for a measure's first beat.
   */
  tick(isAccent = false): void {
    if (!this.audioContext) return;
    this.createClick(this.audioContext.currentTime, isAccent);
  }
```

(Leave `start` / `stop` / `setEnabled` / `dispose` / `createClick` untouched — the record tab keeps using the scheduler path.)

- [ ] **Step 3: Update the record-tab import**

In `src/lib/features/create/record/components/RecordPanel.svelte`, change line 11:

```svelte
  import { Metronome } from "$lib/shared/audio/metronome";
```

(was `import { Metronome } from "../services/metronome";`)

- [ ] **Step 4: Verify nothing else referenced the old path**

Run: `grep -rn "record/services/metronome" src/` (Git Bash) or use Grep for `services/metronome`.
Expected: no remaining matches.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/audio/metronome.ts src/lib/features/create/record/components/RecordPanel.svelte
git commit -m "refactor(audio): promote Metronome to shared, add resume() + tick()" -- src/lib/shared/audio/metronome.ts src/lib/features/create/record/components/RecordPanel.svelte
```

---

### Task 2: Persist the on/off pref in `practice-view-prefs`

**Files:**
- Modify: `src/lib/shared/sequence-viewer/state/practice-view-prefs.svelte.ts`

- [ ] **Step 1: Extend `PersistedPrefs`**

Change the interface (currently lines 33-36):

```ts
interface PersistedPrefs {
  splitPreset: SplitPreset;
  readAheadDepth: number;
  metronomeEnabled: boolean;
}
```

- [ ] **Step 2: Default + parse it in `load()`**

Update the `load()` body (lines 38-52) so the fallback and the parsed return include the new field:

```ts
function load(): PersistedPrefs {
  const fallback: PersistedPrefs = { splitPreset: "lane-heavy", readAheadDepth: 2, metronomeEnabled: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedPrefs>;
    const depth = parsed.readAheadDepth;
    return {
      splitPreset: parsed.splitPreset ?? fallback.splitPreset,
      readAheadDepth: depth === 1 || depth === 2 || depth === 3 ? depth : fallback.readAheadDepth,
      metronomeEnabled: parsed.metronomeEnabled ?? fallback.metronomeEnabled,
    };
  } catch {
    return fallback;
  }
}
```

- [ ] **Step 3: Add reactive state, getter, setter, and persist it**

In `createPracticeViewPrefs()` (lines 55-76):

Add the state after `readAheadDepth` (line 58):

```ts
  let metronomeEnabled = $state<boolean>(initial.metronomeEnabled);
```

Update `persist()` to include it:

```ts
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ splitPreset, readAheadDepth, metronomeEnabled }));
    } catch {
      // ignore storage errors
    }
  }
```

Add the getter + setter to the returned object (alongside the existing ones):

```ts
    get metronomeEnabled() { return metronomeEnabled; },
    setMetronomeEnabled(v: boolean) { metronomeEnabled = v; persist(); },
```

- [ ] **Step 4: Typecheck**

Run: `npm run check:fast`
Expected: no new errors in `practice-view-prefs.svelte.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/sequence-viewer/state/practice-view-prefs.svelte.ts
git commit -m "feat(practice): persist metronome on/off pref (default off)" -- src/lib/shared/sequence-viewer/state/practice-view-prefs.svelte.ts
```

---

### Task 3: Own the metronome + fire the click in `playback-controller`

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/playback-controller.svelte.ts`

- [ ] **Step 1: Add imports**

After the existing imports (the block ending around line 20 with `createTempoPracticeState`), add:

```ts
import { Metronome } from "$lib/shared/audio/metronome";
import type { PracticeViewPrefs } from "$lib/shared/sequence-viewer/state/practice-view-prefs.svelte";
```

- [ ] **Step 2: Add the instance + prefs reference fields**

In the "External dependencies" block (after line 45 `let _isAnimationVisible...`), add:

```ts
  let _practiceViewPrefs: PracticeViewPrefs | null = null;
  let _metronome: Metronome | null = null;
```

- [ ] **Step 3: Fire the click on the beat boundary**

In the `currentStep` subscription branch (lines 57-67), extend the existing guard block so the metronome ticks beside the haptic. Replace:

```ts
          if (isPlayingLocal && newBeat !== lastStepNumber && newBeat >= 1 && (_isAnimationVisible?.() !== false)) {
            _hapticService?.trigger("selection");
          }
```

with:

```ts
          if (isPlayingLocal && newBeat !== lastStepNumber && newBeat >= 1 && (_isAnimationVisible?.() !== false)) {
            _hapticService?.trigger("selection");
            // Ramp-only audible beat. Accent the loop downbeat (beat 1 of each
            // loop) so the restart is audible. Driven by the visual beat event,
            // so it stays locked to playback through every ramp speed-up.
            if (practicePhase === "running" && _practiceViewPrefs?.metronomeEnabled) {
              _metronome?.tick(newBeat === 1);
            }
          }
```

- [ ] **Step 4: Add the lazy-build + toggle handlers**

Add these functions next to the other practice handlers (e.g. after `handlePracticeToggleHold`, around line 271):

```ts
  /** Lazily build + unlock the metronome. Must be called from a user gesture
   *  (Start, or the toggle) — browsers only unlock audio inside one. */
  function ensureMetronome() {
    if (!_metronome) _metronome = new Metronome();
    _metronome.resume();
  }

  /** Cockpit toggle: flip the persisted on/off pref. Turning on unlocks audio
   *  on this gesture. */
  function handleToggleMetronome() {
    const next = !(_practiceViewPrefs?.metronomeEnabled ?? false);
    _practiceViewPrefs?.setMetronomeEnabled(next);
    if (next) ensureMetronome();
    _hapticService?.trigger("selection");
  }
```

- [ ] **Step 5: Unlock audio on the Start gesture**

In `handlePracticeStart` (starts line 193), after `_hapticService?.trigger("selection");` (line 199), add:

```ts
    // Start is a user gesture; unlock audio now so the first beat clicks.
    if (_practiceViewPrefs?.metronomeEnabled) ensureMetronome();
```

- [ ] **Step 6: Dispose the instance**

In `dispose()` (line 333), after `stopPracticeIfActive();` (line 338), add:

```ts
    _metronome?.dispose();
    _metronome = null;
```

- [ ] **Step 7: Export the setter, getter, and handler**

In the returned object (lines 346-391):

Add the prefs injector beside the other `set*` injectors (after `setOnUrlParamChange`, line 365):

```ts
    setPracticeViewPrefs(p: PracticeViewPrefs) { _practiceViewPrefs = p; },
```

Add the getter beside `practiceState` (line 358):

```ts
    get metronomeEnabled() { return _practiceViewPrefs?.metronomeEnabled ?? false; },
```

Add the handler beside `handlePracticeToggleHold` (line 380):

```ts
    handleToggleMetronome,
```

- [ ] **Step 8: Typecheck**

Run: `npm run check:fast`
Expected: no new errors in `playback-controller.svelte.ts`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/shared/sequence-viewer/components/playback-controller.svelte.ts
git commit -m "feat(practice): metronome instance + per-beat click in playback controller" -- src/lib/shared/sequence-viewer/components/playback-controller.svelte.ts
```

---

### Task 4: Wire the controller to prefs + expose on `ctx` in the orchestrator

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte`

- [ ] **Step 1: Inject the prefs into the controller**

After `const practiceViewPrefs = createPracticeViewPrefs();` (line 301), add:

```ts
  playback.setPracticeViewPrefs(practiceViewPrefs);
```

- [ ] **Step 2: Add the two fields to the `ctx` type interface**

In the ctx/context interface, after `practiceViewPrefs: ...;` (line 63), add:

```ts
    metronomeEnabled: boolean;
    handleToggleMetronome: () => void;
```

- [ ] **Step 3: Populate them on the `ctx` object**

In the returned `ctx` object literal, after `practiceViewPrefs,` (line 1005), add:

```ts
    metronomeEnabled: playback.metronomeEnabled,
    handleToggleMetronome: playback.handleToggleMetronome,
```

- [ ] **Step 4: Typecheck**

Run: `npm run check:fast`
Expected: no new errors in `SequenceViewerOrchestrator.svelte`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte
git commit -m "feat(practice): expose metronome state + toggle on viewer context" -- src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte
```

---

### Task 5: Add the Sound toggle button to `PracticeBar`

**Files:**
- Modify: `src/lib/shared/sequence-viewer/components/PracticeBar.svelte`

- [ ] **Step 1: Add the two props**

In the `interface Props` block (lines 25-37), after `onToggleHold: () => void;` (line 33), add:

```ts
    /** Whether the metronome click is currently on. */
    metronomeOn: boolean;
    /** Toggle the metronome click on/off. */
    onToggleMetronome: () => void;
```

Then add them to the destructure (line 39):

```ts
  let { progress, bpm, isPlaying, onBpmChange, onStepLevel, onToggleHold, onPlayPause, onStop, metronomeOn, onToggleMetronome }: Props = $props();
```

- [ ] **Step 2: Add the button markup**

In the markup, insert the Sound button immediately **after** the Hold button's closing `</button>` (line 216) and **before** the `<span class="pb-divider">` (line 218):

```svelte
    <button
      class="pb-btn pb-sound"
      class:on={metronomeOn}
      type="button"
      onclick={onToggleMetronome}
      aria-label={metronomeOn ? "Mute metronome" : "Play metronome"}
      aria-pressed={metronomeOn}
    >
      <i class="fas {metronomeOn ? 'fa-volume-high' : 'fa-volume-xmark'}" aria-hidden="true"></i>
      <span>{metronomeOn ? "Sound" : "Muted"}</span>
    </button>
```

- [ ] **Step 3: Add the styles**

In the `<style>` block, after the `.pb-hold.held { ... }` rule (ends line 328), add a `.pb-sound` block mirroring the Hold control (same column layout, width, lit-up active state):

```css
  /* Sound — toggle that plays a beat click; lights up when active, mirrors Hold */
  .pb-sound {
    flex-direction: column;
    gap: 1px;
    width: 62px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.14));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .pb-sound i { font-size: 16px; }
  @media (hover: hover) and (pointer: fine) {
    .pb-sound:hover { background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12)); color: var(--theme-text, #fff); }
  }
  .pb-sound.on {
    background: color-mix(in srgb, var(--theme-accent, #38bdf8) 26%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent, #38bdf8) 55%, transparent);
    color: color-mix(in srgb, var(--theme-accent, #7dd3fc) 75%, white);
  }
```

- [ ] **Step 4: Typecheck**

Run: `npm run check:fast`
Expected: no new errors in `PracticeBar.svelte`. (Both render sites still need the new required props — Task 6 supplies them; if `check:fast` flags missing props here, that is expected until Task 6 lands. Run the full `npm run check` only after Task 6.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/sequence-viewer/components/PracticeBar.svelte
git commit -m "feat(practice): Sound toggle button in the practice cockpit" -- src/lib/shared/sequence-viewer/components/PracticeBar.svelte
```

---

### Task 6: Pass the props at both `PracticeBar` render sites

**Files:**
- Modify: `src/routes/sequence/[id]/+page.svelte:731-740`
- Modify: `src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte:746-755`

- [ ] **Step 1: Route viewer (`+page.svelte`)**

In the `<PracticeBar ... />` block (lines 731-740), add the two props after `onStop={ctx.handlePracticeStop}` (line 739):

```svelte
              metronomeOn={ctx.metronomeEnabled}
              onToggleMetronome={ctx.handleToggleMetronome}
```

- [ ] **Step 2: Drawer host (`SequenceViewerDrawerHost.svelte`)**

In the `<PracticeBar ... />` block (lines 746-755), add the same two props after `onStop={ctx.handlePracticeStop}` (line 754):

```svelte
                metronomeOn={ctx.metronomeEnabled}
                onToggleMetronome={ctx.handleToggleMetronome}
```

- [ ] **Step 3: Full typecheck (cross-file — props now satisfied)**

Run: `npm run check`
Expected: green. (This is the post-refactor full pass per the fast-iteration rule — scoped checks can miss cross-file prop errors.)

- [ ] **Step 4: Commit**

```bash
git add "src/routes/sequence/[id]/+page.svelte" src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte
git commit -m "feat(practice): wire metronome toggle into both viewer render sites" -- "src/routes/sequence/[id]/+page.svelte" src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte
```

---

### Task 7: Runtime verification

**Files:** none (verification only)

- [ ] **Step 1: Build to confirm no bundler/SSR breakage**

Run: `npm run build:fast`
Expected: build succeeds.

- [ ] **Step 2: Manual runtime check (dev server on :5173)**

Open a sequence in the viewer, enter practice mode, hit Start. Then confirm, in order:
1. Cockpit shows a **Sound / Muted** toggle next to **Hold**; it reads "Muted" on first ever use (default off).
2. Tap it → reads "Sound", lit. A click plays on each beat; the **loop downbeat is accented** (higher click) each time the loop restarts.
3. As the ramp speeds up, the **click rate rises** with the BPM, staying in sync with the pictograph landings.
4. **Pause** → clicks stop. **Play** → resume. Step by hand (header ‹ ›) → silent.
5. Tap the toggle off → clicks stop immediately, button reads "Muted".
6. **Reload the page**, re-enter practice → the last on/off state is restored (persisted).
7. Record tab (Create → Record) metronome still works — its toggle plays clicks during playback (regression check on the moved file).

Capture proof per the project verification protocol (screenshot or a console assertion of `localStorage['tka-practice-view']` showing `metronomeEnabled`), or hand off to the user with the exact steps above if a browser session isn't available.

- [ ] **Step 2 (alt): scripted check via Chrome DevTools MCP (if a browser session is authorized)**

Evaluate after toggling: `JSON.parse(localStorage.getItem('tka-practice-view')).metronomeEnabled` → expect `true` after enabling, `false` after disabling and a reload.

- [ ] **Step 3: Resolve the feedback item**

```bash
node scripts/fetch-feedback.js LrfbaCwqxOc3Lk4HY7Ku in-review "Ramp-mode metronome: per-beat click accented on the loop downbeat, Sound toggle in the practice cockpit, persisted off-by-default. Reused the existing Metronome (promoted to shared/audio)."
```

---

## Self-Review

**Spec coverage:**
- Beat click during running ramp → Task 3 Step 3. ✓
- Accent on loop downbeat (`newBeat === 1`) → Task 3 Step 3. ✓
- Toggle on/off → Task 5 (button) + Task 3 Step 4 (handler). ✓
- Persisted, default off → Task 2. ✓
- Synced through ramp speed-ups (event-driven, no scheduler) → Task 3 Step 3. ✓
- Reuse + promote `Metronome`, single import updated → Task 1. ✓
- Silent when paused / hand-stepping → Task 3 Step 3 guard on `isPlayingLocal` (existing). ✓
- Audio unlock on gesture → Task 1 `resume()`, Task 3 Steps 4-5. ✓
- Both render sites wired → Task 6. ✓
- Record tab untouched behaviorally → Task 1 leaves scheduler path intact; Task 7 Step 2.7 regression check. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `metronomeEnabled` (getter/pref/ctx) and `handleToggleMetronome` / `onToggleMetronome` / `setPracticeViewPrefs` / `tick` / `resume` are spelled identically across Tasks 1-6. PracticeBar prop `metronomeOn` maps from `ctx.metronomeEnabled` at both sites (Task 6). ✓
