# TrainModePanel Usage Guide

## Overview

`TrainModePanel.svelte` is the main orchestrator component for the Train module. It provides a complete training interface with:

- Camera preview with hand tracking
- Grid overlay showing detected and expected hand positions
- Real-time detection status indicators
- Performance tracking (score, combo, beats)
- Countdown timer
- Review screen

## Features

### Responsive Layout

- Desktop: Side-by-side camera view and info panel
- Mobile: Stacked layout with camera on top

### State Management

- Uses the existing train state management (`train-state.svelte.ts`)
- Automatically initializes state context for child components
- Follows Svelte 5 patterns with `$state`, `$props`, and `$effect` runes

### Detection Integration

- Integrates with `MediaPipeDetectionService` for hand tracking
- Real-time position detection and confidence tracking
- Automatic error handling and recovery

## Basic Usage

```svelte
<script lang="ts">
  import { TrainModePanel } from "#lib/modules/train";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/SequenceData";

  let currentSequence: SequenceData | null = null;

  function handleBack() {
    console.log("Navigating back...");
  }
</script>

<TrainModePanel sequence={currentSequence} onBack={handleBack} />
```

## Props

### `sequence?: SequenceData | null` (optional)

The sequence to train with. Can be passed as a prop or set later through state.

```svelte
<TrainModePanel sequence={mySequence} />
```

### `onBack?: () => void` (optional)

Callback function triggered when the back button is clicked.

```svelte
<TrainModePanel
  onBack={() => {
    // Navigate to sequence selection or main menu
    goto("/train/select");
  }}
/>
```

## Component Lifecycle

### 1. Setup Mode (Initial State)

- Camera initializes
- Hand detection service loads
- User can select a sequence (if not provided)
- Shows "Start Training" button when ready

### 2. Countdown Mode

- 3-2-1 countdown animation
- Triggered by "Start Training" button
- Automatically transitions to performing mode

### 3. Performing Mode

- Real-time hand tracking
- Position comparison with expected positions
- Score and combo tracking
- Beat progression
- Shows "Stop" button to exit early

### 4. Review Mode

- Performance results displayed
- Shows final score and stats
- "Train Again" button to return to setup

## State Flow

```
SETUP
  ↓ [User clicks "Start Training"]
COUNTDOWN (3... 2... 1... GO!)
  ↓ [Auto-transition after countdown]
PERFORMING (tracking, scoring, beat progression)
  ↓ [All beats completed OR user clicks "Stop"]
REVIEW (show results)
  ↓ [User clicks "Train Again"]
SETUP
```

## Example: Full Integration

```svelte
<script lang="ts">
  import { TrainModePanel } from "#lib/modules/train";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/SequenceData";
  import { goto } from "$app/navigation";

  // Could come from route params, store, or API
  let selectedSequence: SequenceData | null = $state(null);

  async function loadSequence(sequenceId: string) {
    // Load from database or API
    const response = await fetch(`/api/sequences/${sequenceId}`);
    selectedSequence = await response.json();
  }

  function handleBackToMenu() {
    goto("/train");
  }

  // Load sequence on mount if needed
  import { onMount } from "svelte";
  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sequenceId = urlParams.get("sequence");
    if (sequenceId) {
      loadSequence(sequenceId);
    }
  });
</script>

<div class="train-page">
  <TrainModePanel sequence={selectedSequence} onBack={handleBackToMenu} />
</div>

<style>
  .train-page {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
</style>
```

## Customization

### Camera Settings

The camera preview is mirrored by default. This can be changed in the `CameraPreview` component props if needed.

### Detection Service

Currently uses `MediaPipeDetectionService`. To use a different detection service:

1. Implement the `IPositionDetectionService` interface
2. Replace the service initialization in `initDetection()`

```typescript
async function initDetection() {
  try {
    // Replace with your custom service
    detectionService = new MyCustomDetectionService();
    await detectionService.initialize();
    isDetectionReady = true;
  } catch (error) {
    console.error("Failed to initialize detection:", error);
    state.setError("Failed to initialize detection...");
  }
}
```

### Styling

The component uses CSS custom properties for theming:

- `--background-primary`: Main background color (default: `#0f0f0f`)
- Colors for status indicators and UI elements can be customized in the `<style>` section

## Error Handling

The component handles several error scenarios:

1. **Camera initialization failure**: Shows error message with camera icon
2. **Detection service failure**: Shows error message, allows retry
3. **No sequence loaded**: Disables start button, prompts to select sequence

Errors are displayed in a dismissible error card in the info panel.

## Accessibility

- Semantic HTML structure
- Clear visual status indicators
- Large, readable text for countdown
- High contrast colors for important information
- Keyboard-accessible buttons

## Dependencies

### Internal Dependencies

- `CameraPreview.svelte`: Camera feed component
- `GridOverlay.svelte`: Position visualization overlay
- `MediaPipeDetectionService`: Hand detection implementation
- `train-state.svelte.ts`: State management

### External Dependencies

- Svelte 5
- MediaPipe (via MediaPipeDetectionService)

## File Structure

```
src/lib/modules/train/
├── components/
│   ├── TrainModePanel.svelte      (547 lines) ← Main component
│   ├── CameraPreview.svelte
│   ├── GridOverlay.svelte
│   └── index.ts
├── state/
│   ├── train-state.svelte.ts
│   ├── train-context.ts
│   └── index.ts
└── services/
    └── implementations/
        └── MediaPipeDetectionService.ts
```

## Performance Considerations

- Detection runs at camera frame rate (typically 30-60 FPS)
- State updates are debounced through Svelte's reactivity system
- Camera stream is properly cleaned up on component destroy
- Detection service is disposed when component unmounts

## Browser Compatibility

Requires:

- Modern browser with WebRTC support (camera access)
- WebGL support (for MediaPipe)
- ES2020+ JavaScript features

Tested on:

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Troubleshooting

### Camera not starting

1. Check browser permissions for camera access
2. Ensure HTTPS (cameras require secure context)
3. Check browser console for detailed error messages

### Hand tracking not working

1. Ensure good lighting
2. Keep hands visible in frame
3. Check that MediaPipe models loaded successfully
4. Review browser console for detection errors

### Performance issues

1. Close other applications using camera
2. Reduce browser tab count
3. Check CPU/GPU usage
4. Try lowering camera resolution (in CameraPreview settings)

## Related Components

- `CameraPreview.svelte`: Handles camera feed and video element
- `GridOverlay.svelte`: Visualizes detected and expected positions
- `SequencePickerModal.svelte`: For selecting sequences to train with

## Next Steps

To integrate TrainModePanel into your app:

1. Create a route: `/src/routes/train/+page.svelte`
2. Import and use TrainModePanel
3. Handle sequence selection and navigation
4. Customize styling to match your app theme
