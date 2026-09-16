# Strict Rotated LOOP Algorithm - Detailed Walkthrough

## Example: HALVED LOOP with Concrete Data

Let's walk through exactly what happens when we execute a HALVED LOOP with a simple 2-beat sequence.

### Input Sequence

```
Beat 0 (Start Position):
  Position: ALPHA1 (blue at SOUTH, red at NORTH)
  Motions: Both hands static (S→S, N→N)
  Letter: "START"

Beat 1:
  Start: ALPHA1 (S, N)
  End: ALPHA2 (SW, NE)
  Blue Motion: SOUTH → SOUTHWEST (clockwise rotation)
  Red Motion: NORTH → NORTHEAST (clockwise rotation)
  Letter: "A"
```

### Step-by-Step Execution

#### Step 1: Validation

```typescript
startPos = ALPHA1
endPos = ALPHA2  // from last beat
key = "ALPHA1,ALPHA2"

Check: Is "ALPHA1,ALPHA2" in HALVED_LOOPS set?
Result: ✅ YES - this is a valid halved LOOP pair
```

The validation passes because ALPHA1 and ALPHA2 are configured as a valid halved LOOP start/end pair in the position maps.

#### Step 2: Remove Start Position

```typescript
Before: [Beat 0 START, Beat 1 A]
After removing Beat 0: [Beat 1 A]
sequenceLength = 1
```

#### Step 3: Calculate Entries to Add

```typescript
sliceSize = HALVED
entriestoAdd = sequenceLength * 1 = 1 beat
finalIntendedLength = 1 (current) + 1 (to add) = 2 beats
```

After adding and re-inserting the start position, we'll have 3 beats total.

#### Step 4: Generate Beat 2

**4a. Get Previous Matching Beat**

```typescript
beatNumber = 2
finalLength = 2
Index mapping for HALVED:
  - halfLength = floor(2 / 2) = 1
  - For beat 2: map[2] = 2 - 1 = 1
  - Previous matching beat = Beat 1 (index 0 in array)
```

**4b. Calculate New End Position**

```typescript
Previous beat (Beat 1):
  - Blue end location: SOUTHWEST
  - Red end location: NORTHEAST

Previous matching beat (Beat 1):
  - Blue motion: SOUTH → SOUTHWEST
  - Red motion: NORTH → NORTHEAST

Determine hand rotation directions:
  - Blue: getHandRotationDirection(SOUTH, SOUTHWEST)
    - Key: "SOUTH,SOUTHWEST" → Not in cardinal CW list
    - Not a cardinal direction... checking diagonals
    - Actually, SOUTH to SOUTHWEST is not a standard rotation
    - Let me recalculate with proper example...
```

Wait, I need to use a more realistic beat. Let me redo this with proper cardinal movements:

### Corrected Example: HALVED LOOP

```
Beat 0 (Start Position):
  Position: ALPHA1 (S, N)
  Motions: S→S, N→N
  Letter: "START"

Beat 1:
  Start: ALPHA1 (S, N)
  End: ALPHA3 (W, E)
  Blue Motion: SOUTH → WEST (clockwise cardinal)
  Red Motion: NORTH → EAST (clockwise cardinal)
  Motion Type: PRO
  Turns: 1
  Letter: "A"
```

Now let's execute again:

#### Step 4 Corrected: Generate Beat 2

**4a. Get Matching Beat**

```typescript
beatNumber = 2
previousMatchingBeat = Beat 1
```

**4b. Calculate New End Position**

```typescript
Previous beat (Beat 1) end locations:
  - Blue: WEST
  - Red: EAST

Previous matching beat (Beat 1) motion pattern:
  - Blue: SOUTH → WEST (clockwise)
  - Red: NORTH → EAST (clockwise)

Determine rotation directions:
  - getHandRotationDirection(SOUTH, WEST) = CLOCKWISE ✓
  - getHandRotationDirection(NORTH, EAST) = CLOCKWISE ✓

Get location maps:
  - blueLocationMap = LOCATION_MAP_CLOCKWISE
  - redLocationMap = LOCATION_MAP_CLOCKWISE

Apply rotations to previous beat's end locations:
  - newBlueEndLoc = LOCATION_MAP_CLOCKWISE[WEST] = NORTH
  - newRedEndLoc = LOCATION_MAP_CLOCKWISE[EAST] = SOUTH

Derive position from locations:
  - gridPlacementDeriver.derivePositionFromLocations(NORTH, SOUTH)
  - Looking up (NORTH, SOUTH) in POSITIONS_MAP
  - Result: ALPHA5

So Beat 2 ends at ALPHA5!
```

**4c. Create Transformed Motions**

```typescript
For Blue Motion:
  - Start location: previous beat's blue end = WEST
  - End location: calculated above = NORTH
  - Motion type: PRO (same as matching beat)
  - Turns: 1 (same as matching beat)
  - Rotation direction: CLOCKWISE (same as matching beat)

For Red Motion:
  - Start location: previous beat's red end = EAST
  - End location: calculated above = SOUTH
  - Motion type: PRO (same as matching beat)
  - Turns: 1 (same as matching beat)
  - Rotation direction: CLOCKWISE (same as matching beat)
```

**4d. Create Beat 2**

```typescript
Beat 2:
  beatNumber: 2
  startPlacement: ALPHA3 (from Beat 1's end)
  endPlacement: ALPHA5 (calculated)
  letter: "A" (copied from matching beat)
  motions: {
    blue: { WEST → NORTH, PRO, CW, turns: 1 }
    red: { EAST → SOUTH, PRO, CW, turns: 1 }
  }
```

**4e. Update Orientations**

```typescript
// Update start orientations from previous beat
Beat 2.blue.startOrientation = Beat 1.blue.endOrientation
Beat 2.red.startOrientation = Beat 1.red.endOrientation

// Calculate end orientations
Beat 2.blue.endOrientation = orientationCalculator.calculateEndOrientation(...)
Beat 2.red.endOrientation = orientationCalculator.calculateEndOrientation(...)
```

#### Step 5: Re-insert Start Position

```typescript
Before: [Beat 1, Beat 2]
After: [Beat 0 START, Beat 1, Beat 2]
```

### Final Result

```
Beat 0: ALPHA1 → ALPHA1 (START)
  Blue: S → S
  Red: N → N

Beat 1: ALPHA1 → ALPHA3
  Blue: S → W (clockwise)
  Red: N → E (clockwise)

Beat 2: ALPHA3 → ALPHA5
  Blue: W → N (clockwise, continuing rotation)
  Red: E → S (clockwise, continuing rotation)
```

### Verification: Is it Circular?

```
First beat start: ALPHA1
Last beat end: ALPHA5

Is ALPHA5 opposite to ALPHA1? Let's check:
  ALPHA1 = (SOUTH, NORTH)
  ALPHA5 = (NORTH, SOUTH)

YES! ✅ They are opposites (180° rotation)
```

Wait, but that's only halfway around. For a true circle, we need the last beat to end at ALPHA1, not ALPHA5.

Let me recalculate what the actual validation expects...

### Understanding the Validation

Looking at the validation code:

```typescript
const key = `${startPos},${endPos}`;
if (!HALVED_LOOPS.has(key)) {
  throw new Error(...);
}
```

So for a HALVED LOOP, the sequence must:

1. Start at position X
2. End at position Y
3. The pair (X, Y) must be in the HALVED_LOOPS validation set

What this means:

- The **input sequence** (before LOOP execution) must end at the correct position
- The HALVED_LOOPS set contains pairs where Y is positioned such that when you double the sequence, you return to X

So if the input sequence is:

```
Beat 0: ALPHA1 → ALPHA1
Beat 1: ALPHA1 → ALPHA3
```

The pair "ALPHA1,ALPHA3" must be in HALVED_LOOPS. But ALPHA3 is only 90° from ALPHA1, not 180°.

For a HALVED LOOP, the input must end at the 180° position, so:

```
Beat 0: ALPHA1 → ALPHA1
Beat 1: ALPHA1 → ALPHA5 (180° opposite)
```

Then when we double it, Beat 2 will rotate another 180° back to ALPHA1.

### Corrected Example: Proper HALVED LOOP

```
INPUT:
Beat 0: ALPHA1 (S,N) → ALPHA1 (S,N) [START]
Beat 1: ALPHA1 (S,N) → ALPHA5 (N,S) [Moves 180°]
  Blue: S → N
  Red: N → S

EXECUTION:
Generate Beat 2 by rotating Beat 1's locations:
  Blue start: N (Beat 1's end)
  Red start: S (Beat 1's end)

  Beat 1 pattern was: S→N (dash/opposite), N→S (dash/opposite)
  Rotation type: DASH (opposite directions)

  Apply DASH map to Beat 1's end locations:
  Blue end: LOCATION_MAP_DASH[N] = S
  Red end: LOCATION_MAP_DASH[S] = N

  New position: (S, N) = ALPHA1 ✓

Beat 2: ALPHA5 (N,S) → ALPHA1 (S,N)
  Blue: N → S
  Red: S → N

RESULT:
Beat 0: ALPHA1 → ALPHA1 (start)
Beat 1: ALPHA1 → ALPHA5 (first half of circle)
Beat 2: ALPHA5 → ALPHA1 (second half, returns to start) ✓

Circular? YES! Last beat ends at ALPHA1, same as first beat starts!
```

## QUARTERED LOOP Example

For a QUARTERED LOOP with 90° rotations:

```
INPUT:
Beat 0: ALPHA1 (S,N) → ALPHA1 (S,N) [START]
Beat 1: ALPHA1 (S,N) → ALPHA3 (W,E) [Moves 90° CW]
  Blue: S → W (clockwise)
  Red: N → E (clockwise)

EXECUTION:
Generates 3 more beats (quadrupling):

Beat 2: Rotate Beat 1
  Previous end: (W, E)
  Rotation: CW
  Blue: W → N
  Red: E → S
  Position: (N, S) = ALPHA5
  Result: ALPHA3 → ALPHA5

Beat 3: Rotate Beat 1 again
  Previous end: (N, S)
  Rotation: CW
  Blue: N → E
  Red: S → W
  Position: (E, W) = ALPHA7
  Result: ALPHA5 → ALPHA7

Beat 4: Rotate Beat 1 once more
  Previous end: (E, W)
  Rotation: CW
  Blue: E → S
  Red: W → N
  Position: (S, N) = ALPHA1 ✓
  Result: ALPHA7 → ALPHA1

FINAL SEQUENCE:
Beat 0: ALPHA1 → ALPHA1 (start)
Beat 1: ALPHA1 → ALPHA3 (90° CW)
Beat 2: ALPHA3 → ALPHA5 (180° from start)
Beat 3: ALPHA5 → ALPHA7 (270° CW)
Beat 4: ALPHA7 → ALPHA1 (360° - back to start!) ✓

Circular? YES! ✓
```

## Summary

The algorithm works by:

1. **Taking a partial sequence** that ends at a specific position (180° or 90° from start)
2. **Identifying the rotation pattern** of each hand (CW, CCW, DASH, or STATIC)
3. **Applying that rotation repeatedly** to generate new beats
4. **Each new beat rotates the locations** by the same amount in the same direction
5. **The sequence completes a circle** and returns to the starting position

The key insight is that if you rotate a motion by X degrees repeatedly, after 360°/X rotations you return to the start. For HALVED (180°), you need 2 rotations. For QUARTERED (90°), you need 4 rotations.

The implementation correctly:

- ✅ Validates the input sequence can complete the rotation
- ✅ Determines the rotation direction for each hand
- ✅ Applies the rotation maps correctly
- ✅ Preserves motion attributes (type, turns, etc.)
- ✅ Creates a sequence that returns to the starting position
