---
status: backlog
value: 3
effort: L
remaining: Audit viewer orchestrator ownership and state transitions against the design before implementation.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# Viewer Orchestrator State Machine

## Problem

`SequenceViewerOrchestrator.svelte` tracks viewer state through independent flags: `editingPane`, `viewerMode`, `exportContext`, `playbackSource`, `practiceActive`, `fullscreen.isFullscreen`, `wasPlayingBeforeImageExport`, `renderMode`. These interact implicitly — e.g., `exitEditMode()` conditionally resumes playback based on a flag saved on entry. State transitions are inferred from flag combinations rather than defined explicitly, making the system fragile and hard to reason about.

## Symptoms

- `wasPlayingBeforeImageExport` is a hand-rolled state restore that breaks if any intermediate transition touches playback
- `editingPane` and `exportContext` and `viewerMode` are three partially-overlapping representations of "what's active"
- Adding a new sidebar mode requires understanding which flags to set/clear and in what order
- Race conditions between flag updates (e.g., playback source changing while export is in transition)

## Design

Replace implicit flag soup with an explicit discriminated union state machine.

### State Definition

```typescript
type ViewerActivity =
  | { kind: "split"; leftPane: ContentType; rightPane: ContentType }
  | { kind: "export-animation"; renderMode: "2d" | "3d"; wasPlaying: boolean }
  | { kind: "export-image"; wasPlaying: boolean }
  | { kind: "export-video-upload" }
  | { kind: "practice"; previousActivity: ViewerActivity }
  | { kind: "fullscreen"; previousActivity: ViewerActivity };
```

Each state carries exactly the context it needs. No ambient flags. `wasPlaying` lives on the state that needs it — not as a standalone variable that might go stale.

### Transitions

```typescript
type ViewerTransition =
  | { to: "split" }
  | { to: "export-animation"; renderMode: "2d" | "3d" }
  | { to: "export-image" }
  | { to: "export-video-upload" }
  | { to: "practice" }
  | { to: "fullscreen" }
  | { to: "exit-fullscreen" }
  | { to: "exit-practice" }
  | { to: "close" };

function transition(current: ViewerActivity, event: ViewerTransition): ViewerActivity {
  // Explicit mapping: given current state + event → new state
  // Invalid transitions throw or no-op with warning
}
```

### Derived Properties (replace flag reads)

```typescript
const isExporting = $derived(activity.kind.startsWith("export"));
const editingPane = $derived(
  activity.kind === "export-animation" ? "animation" :
  activity.kind === "export-image" ? "image" :
  activity.kind === "export-video-upload" ? "video-upload" :
  null
);
const renderMode = $derived(
  activity.kind === "export-animation" ? activity.renderMode : "2d"
);
```

Components read derived properties — never the raw state. The state machine is the single source of truth.

### Side Effects on Transition

Enter/exit hooks per state:

```typescript
function enterState(state: ViewerActivity): void {
  if (state.kind === "export-image") {
    // save playback state already captured in state.wasPlaying
    playback.pause();
  }
}

function exitState(state: ViewerActivity): void {
  if (state.kind === "export-image" && state.wasPlaying) {
    playback.resume();
  }
}
```

### File Location

New file: `src/lib/shared/sequence-viewer/state/viewer-activity-machine.svelte.ts`

The existing `viewer-state.svelte.ts` (which handles `viewerMode` persistence) gets absorbed into this — one state module, not two.

## Migration Strategy

1. Create the state machine module with the discriminated union
2. Wire it into the orchestrator as the single source of truth
3. Replace each flag read with a derived property
4. Remove: `wasPlayingBeforeImageExport`, `editingPane` as independent state, the dual `viewerMode`/`exportContext` tracking
5. Keep `exitEditMode()` as a transition dispatcher (calls `transition(current, { to: "split" })`)

## What Doesn't Change

- The sidebar rail UI and its click handlers
- The template structure (it reads derived properties that have the same shape as current flags)
- Playback, fullscreen, and practice subsystems — they just get triggered by state hooks instead of inline logic
- Keyboard shortcuts — they dispatch transitions instead of calling multiple functions

## Success Criteria

- Every valid viewer configuration is expressible as exactly one `ViewerActivity` variant
- No ambient boolean flags for "what mode am I in"
- Adding a new sidebar mode = adding one union variant + its transitions
- `wasPlaying` state restore works correctly even if user rapidly switches modes
