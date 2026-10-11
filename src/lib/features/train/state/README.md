# Train Module State Management

This directory contains the reactive state management for the Train module using Svelte 5 runes.

## Architecture

The state follows the factory pattern with context-based dependency injection:

- **train-state.svelte.ts**: Core state factory using `$state` and `$derived` runes
- **train-context.ts**: Svelte context helpers for sharing state across components
- **index.ts**: Barrel export for clean imports

## State Structure

### Core State

- `mode`: Current training mode (setup, countdown, performing, review)
- `sequence`: Selected sequence for training
- `bpm`: Beats per minute for playback
- `visualizationMode`: Timeline or mirror display
- `detectionMethod`: Hand tracking, color markers, or hybrid

### Detection State

- `isDetectionActive`: Whether detection is running
- `isCameraReady`: Camera initialization status
- `currentFrame`: Latest detection frame data
- `detectionConfidence`: Average detection confidence (0-1)

### Performance State

- `currentBeatIndex`: Current beat being performed
- `currentCombo`: Current combo streak
- `currentScore`: Current accumulated score
- `performanceStartTime`: Timestamp when performance started

### Results State

- `lastPerformance`: Complete performance data for review

### Derived State

- `isPerforming`: Whether currently in performing mode
- `hasSequence`: Whether a sequence is loaded
- `canStartPerformance`: Whether ready to start (has sequence + camera ready + in setup mode)
- `totalBeats`: Total number of beats in sequence
- `progress`: Percentage progress through sequence
- `expectedPositions`: Expected hand positions for current beat

## Usage

### Initialize State (Root Component)

```svelte
<script lang="ts">
  import { initTrainState } from "#lib/modules/train/state";

  // Initialize with custom config
  const trainState = initTrainState({
    defaultBpm: 120,
    defaultVisualization: VisualizationMode.TIMELINE,
    defaultDetectionMethod: DetectionMethod.HAND_TRACKING,
  });
</script>
```

### Access State (Child Components)

```svelte
<script lang="ts">
  import { getTrainState } from "#lib/modules/train/state";
  import { TrainMode } from "#lib/modules/train/domain/enums/TrainEnums";

  const state = getTrainState();

  // Read reactive values
  $: currentMode = state.mode;
  $: canStart = state.canStartPerformance;
  $: progress = state.progress;

  // Call actions
  function handleStart() {
    state.startCountdown();
  }
</script>

<div>
  {#if state.mode === TrainMode.SETUP}
    <button disabled={!canStart} onclick={handleStart}> Start Training </button>
  {:else if state.mode === TrainMode.COUNTDOWN}
    <div class="countdown">{state.countdownValue}</div>
  {:else if state.mode === TrainMode.PERFORMING}
    <div class="performance">
      <div>Beat: {state.currentBeatIndex + 1} / {state.totalBeats}</div>
      <div>Score: {state.currentScore}</div>
      <div>Combo: {state.currentCombo}</div>
      <progress value={progress} max="100"></progress>
    </div>
  {:else if state.mode === TrainMode.REVIEW}
    <div class="results">
      {#if state.lastPerformance}
        <div>Grade: {state.lastPerformance.score.grade}</div>
        <div>Score: {state.lastPerformance.score.percentage}%</div>
        <div>Max Combo: {state.lastPerformance.score.maxCombo}</div>
      {/if}
      <button onclick={() => state.resetToSetup()}> Train Again </button>
    </div>
  {/if}
</div>
```

### Actions

#### Sequence Management

- `setSequence(sequence)`: Load a sequence for training
- `clearSequence()`: Clear the current sequence

#### Mode Control

- `setMode(mode)`: Set the current mode directly
- `startCountdown()`: Begin countdown sequence
- `startPerformance()`: Start performance tracking
- `endPerformance()`: End and transition to review
- `resetToSetup()`: Reset to setup mode

#### Settings

- `setBpm(bpm)`: Set playback BPM (30-200)
- `setVisualizationMode(mode)`: Set visualization mode
- `setDetectionMethod(method)`: Set detection method

#### Detection

- `setCameraReady(ready)`: Update camera status
- `setDetectionActive(active)`: Toggle detection on/off
- `updateDetectionFrame(frame)`: Update with latest detection data

#### Performance Tracking

- `advanceBeat()`: Move to next beat (or end if last)
- `recordHit(isCorrect, points)`: Record a hit/miss and update score/combo
- `updateCountdown(value)`: Update countdown value
- `setLastPerformance(perf)`: Store completed performance data

#### Error Handling

- `setError(message)`: Set error message

## State Flow

```
SETUP
  ↓ (startCountdown)
COUNTDOWN (3, 2, 1...)
  ↓ (updateCountdown → 0)
PERFORMING (tracking beats, score, combo)
  ↓ (advanceBeat → last beat)
REVIEW (show results)
  ↓ (resetToSetup)
SETUP
```

## Pattern Comparison

This implementation follows similar patterns to:

- `src/lib/features/compose/shared/state/compose-module-state.svelte.ts`
- `src/lib/modules/word-card/state/word-card-state.svelte.ts`

Key differences:

- Uses factory function returning an object with getters (like compose state)
- Includes configurable defaults (like compose state)
- Uses Svelte context for DI (like both examples)
- Focuses on performance/training specific state
