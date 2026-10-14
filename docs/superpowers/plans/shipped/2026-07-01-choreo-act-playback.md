# Choreo Act Playback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Play a choreo sheet as one concatenated "act" sequence in an inline docked animation player, beside the existing music player, BPM-matched.

**Architecture:** Pure `buildActSequence` concat → `actSequence` derived in state → `ActPlayer` dock composing `AnimationPlayer` + completed music service + `MusicPlayer.svelte`. Docks mutually exclusive with the picker.

**Tech:** Svelte 5 runes, Vitest (jsdom), existing animation/music primitives.

---

### Task 1: `buildActSequence` (pure, TDD)

**Files:**
- Create: `src/lib/features/write/services/sheet-act-sequence.ts`
- Test: `tests/unit/sheet-act-sequence.test.ts`

- [ ] Write failing tests: concat order + running `stepNumber` 1..N; rebuilt `word`; `startPosition` from row 0; `isCircular` from `loopStatus`; `null` on empty; length == sum of steps.
- [ ] Implement: concat steps, renumber, rebuild word, `createSequenceData`. No orientation/reversal recalc.
- [ ] Run tests green. Commit (`-- ` scoped).

### Task 2: Complete the music service

**Files:**
- Modify: `src/lib/features/write/services/music-player.ts`

- [ ] Add `onTimeUpdate` / `onLoadedMetadata` / `onEnded` listener setters + `load(url, filename)` (wires element, no autoplay). Emit from the currently-empty handlers. Keep `play(track)` working; add `filename` getter.
- [ ] Typecheck. Commit.

### Task 3: `ActPlayer.svelte` dock

**Files:**
- Create: `src/lib/features/write/components/sheet/ActPlayer.svelte`

- [ ] Props `{ sequence: SequenceData | null; onClose }`. Render `AnimationPlayer` (controlsLevel="full", tapToToggle) when sequence; empty state otherwise. File input → objectURL → `musicPlayer.load`; maintain reactive `MusicPlayerState` from service callbacks; render `MusicPlayer.svelte` wired to service transport. Dock chrome mirrors `.browse-dock`.
- [ ] Typecheck. Commit.

### Task 4: Wire into state + view

**Files:**
- Modify: `src/lib/features/write/state/choreo-sheet-state.svelte.ts` (add `actSequence` derived + getter)
- Modify: `src/lib/features/write/components/sheet/ChoreoSheetView.svelte` (Play-act toggle, dock, persist `playerOpen`, mutual-exclusive with picker)

- [ ] `actSequence = $derived.by(() => buildActSequence(normalizedRows, sheet.name))`; expose getter.
- [ ] Toolbar "Play act" button toggles the player dock; opening it closes the picker (and vice-versa). Persist `playerOpen` in the picker-prefs bag.
- [ ] Full `npm run check` 0/0 + all sheet unit tests green. Hand to Austen for visual verify.
