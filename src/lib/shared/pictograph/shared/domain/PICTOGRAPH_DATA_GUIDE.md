# Pictograph & Sequence Data Construction Guide

> **FOR AI ASSISTANTS**: If you're reading this because you searched for how to create
> pictograph data, motion data, beat data, or sequence data - READ THIS FIRST.
> Do NOT attempt to hand-craft this data without using the existing infrastructure.

## The Golden Rule

**NEVER manually construct MotionData, BeatData, or SequenceData by hand.**

The pictograph system has complex interdependencies:

- Orientations must be calculated based on motion type, turns, and rotation direction
- Each beat's startOrientation must match the previous beat's endOrientation
- Arrow locations depend on motion type, turns, and positions
- Placement data (arrow and prop) must be calculated by services

## How to Get Valid Sequence Data

### Option 1: Load from Database (Recommended)

```typescript
import { resolve, loadFeatureModule } from "#lib/shared/inversify/di";
import { TYPES } from "#lib/shared/inversify/types";
import type { IBrowseLoader } from "#lib/features/browse/sequences/display/services/contracts/IBrowseLoader";

// Load the browse module first
await loadFeatureModule("browse");

// Get the loader service
const browseLoader = resolve<IBrowseLoader>(TYPES.IBrowseLoader);

// IMPORTANT: Must call this first to populate the cache
await browseLoader.loadSequenceMetadata();

// Then load a specific sequence by word (e.g., "A", "B", "HELLO")
const sequence = await browseLoader.loadFullSequenceData("B");
```

### Option 2: Modify Existing Sequence with Turn Patterns

If you need a variant (e.g., B with 1 turn instead of 0 turns):

```typescript
import { TurnPatternService } from "#lib/features/create/shared/services/implementations/TurnPatternService";
import type { TurnPattern } from "#lib/features/create/shared/domain/models/TurnPatternData";
import { Timestamp } from "firebase/firestore";

const turnPatternService = new TurnPatternService();

// Create a pattern (e.g., 1 turn on both colors for all beats)
const pattern: TurnPattern = {
  id: "my-pattern",
  name: "1,1 Pattern",
  userId: "system",
  createdAt: Timestamp.now(),
  beatCount: baseSequence.beats.length,
  entries: baseSequence.beats.map((_, i) => ({
    beatIndex: i,
    blue: 1, // 1 turn for blue
    red: 1, // 1 turn for red
  })),
};

// Apply the pattern - this handles ALL the complexity:
// - Recalculates endOrientations
// - Propagates orientations through the sequence
// - Handles edge cases (float conversion, rotation context)
const result = turnPatternService.applyPattern(pattern, baseSequence);

if (result.success && result.sequence) {
  // Use result.sequence - it's valid!
}
```

### Option 3: Use Generation Services for Circular Sequences

For creating new circular sequences:

```typescript
// Use LOOP executors for Linked Orbital Offset Patterns
import { StrictInvertedLOOPExecutor } from "#lib/features/create/generate/circular/services/implementations/StrictInvertedLOOPExecutor";
```

## What Makes Motion Data Valid

A valid MotionData requires these fields to be **consistent**:

| Field              | Description                    | Calculation                             |
| ------------------ | ------------------------------ | --------------------------------------- |
| motionType         | PRO, ANTI, FLOAT, DASH, STATIC | User choice                             |
| rotationDirection  | CW, CCW, NO_ROTATION           | User choice (must match motion type)    |
| startLocation      | N, S, E, W, NE, NW, SE, SW     | User choice                             |
| endLocation        | N, S, E, W, NE, NW, SE, SW     | Depends on motion type & rotation       |
| turns              | 0, 0.5, 1, 1.5, 2, ... or "fl" | User choice                             |
| startOrientation   | IN, OUT, CLOCK, COUNTER        | From previous beat's end                |
| **endOrientation** | IN, OUT, CLOCK, COUNTER        | **CALCULATED by OrientationCalculator** |
| arrowLocation      | N, S, E, W, NE, NW, SE, SW     | **CALCULATED based on motion**          |
| gridMode           | DIAMOND, BOX                   | From sequence settings                  |

### Orientation Calculation Rules

For **ANTI** motions:

- Even turns (0, 2, 4...): endOrientation **switches** (IN→OUT, OUT→IN)
- Odd turns (1, 3, 5...): endOrientation **stays same** as start

For **PRO** motions:

- Even turns (0, 2, 4...): endOrientation **stays same** as start
- Odd turns (1, 3, 5...): endOrientation **switches**

This is why you can't just set `endOrientation: Orientation.IN` - it must be calculated!

## Common Mistakes to Avoid

### Mistake 1: Setting rotationDirection to NO_ROTATION for turns > 0

```typescript
// WRONG - NO_ROTATION with turns doesn't make sense
createMotionData({
  motionType: MotionType.ANTI,
  turns: 1,
  rotationDirection: RotationDirection.NO_ROTATION, // BUG!
});

// CORRECT - use CW or CCW
createMotionData({
  motionType: MotionType.ANTI,
  turns: 1,
  rotationDirection: RotationDirection.CCW,
});
```

### Mistake 2: Not propagating orientations

```typescript
// WRONG - beat 2's startOrientation doesn't match beat 1's endOrientation
const beats = [
  { motions: { blue: { startOrientation: IN, endOrientation: OUT } } },
  { motions: { blue: { startOrientation: IN /* wrong! */ } } },
];

// CORRECT - use TurnPatternService which handles propagation
```

### Mistake 3: Hand-coding sequences instead of using infrastructure

If you need sequence data for tests, previews, or examples:

1. Load a real sequence from the database
2. Modify it using TurnPatternService if needed
3. NEVER try to construct BeatData/MotionData manually

## File Locations

- **MotionData model**: `src/lib/shared/pictograph/shared/domain/models/MotionData.ts`
- **BeatData model**: `src/lib/features/create/shared/domain/models/BeatData.ts`
- **SequenceData model**: `src/lib/shared/foundation/domain/models/SequenceData.ts`
- **TurnPatternService**: `src/lib/features/create/shared/services/implementations/TurnPatternService.ts`
- **OrientationCalculator**: `src/lib/shared/pictograph/prop/services/implementations/OrientationCalculator.ts`
- **BrowseLoader**: `src/lib/features/browse/sequences/display/services/implementations/BrowseLoader.ts`

## Example: Creating a B(1,1) Sequence for Animation Preview

This is the correct way to get a B sequence with 1 turn on each beat:

```typescript
// 1. Load base sequence
await loadFeatureModule("browse");
const browseLoader = resolve<IBrowseLoader>(TYPES.IBrowseLoader);
await browseLoader.loadSequenceMetadata();
const baseB = await browseLoader.loadFullSequenceData("B");

// 2. Create turn pattern
const pattern: TurnPattern = {
  id: "b-1-1",
  name: "B(1,1)",
  userId: "system",
  createdAt: Timestamp.now(),
  beatCount: 4,
  entries: [
    { beatIndex: 0, blue: 1, red: 1 },
    { beatIndex: 1, blue: 1, red: 1 },
    { beatIndex: 2, blue: 1, red: 1 },
    { beatIndex: 3, blue: 1, red: 1 },
  ],
};

// 3. Apply pattern
const turnPatternService = new TurnPatternService();
const result = turnPatternService.applyPattern(pattern, baseB);

// 4. Use the valid sequence
const bWithOneTurn = result.sequence;
```

## Summary

1. **Load** sequences from the database using BrowseLoader
2. **Modify** sequences using TurnPatternService
3. **Generate** circular sequences using LOOP executors
4. **NEVER** hand-craft MotionData, BeatData, or SequenceData

The infrastructure exists to handle the complexity. Use it.
