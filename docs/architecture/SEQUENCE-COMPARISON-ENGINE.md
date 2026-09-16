# Sequence Comparison Engine - Architecture Document

## Executive Summary

This document describes a comprehensive, future-proof architecture for comparing TKA sequences. The system draws from established algorithms in bioinformatics ([Needleman-Wunsch](https://en.wikipedia.org/wiki/Needleman%E2%80%93Wunsch_algorithm), [Smith-Waterman](https://en.wikipedia.org/wiki/Smith%E2%80%93Waterman_algorithm)), music information retrieval ([symbolic melodic similarity](https://dl.acm.org/doi/10.1162/COMJ_a_00359)), and dance notation ([Labanotation motion comparison](https://ieebrowse.ieee.org/document/8891607/)).

The architecture is designed to:
1. Handle exact equivalence detection (same sequence, different orientation/start)
2. Compute partial similarity scores with detailed breakdowns
3. Identify transform relationships between sequences
4. Support pattern matching and sub-sequence search
5. Scale efficiently for library-wide duplicate detection

---

## Domain Model: What Makes Two Motions "Equal"?

Before defining algorithms, we must precisely define what aspects of a motion are compared.

### Motion Identity Components

A single motion (`MotionData`) has these identity-relevant properties:

| Property | Comparison Role | Rotation-Invariant? |
|----------|----------------|---------------------|
| `motionType` | Core identity | Yes |
| `rotationDirection` | Core identity | Yes |
| `turns` | Core identity | Yes |
| `startLocation` | Location | No - changes with spatial rotation |
| `endLocation` | Location | No - changes with spatial rotation |
| `startOrientation` | Orientation | Yes (relative to location) |
| `endOrientation` | Orientation | Yes (relative to location) |
| `handPath` | Derived from motion | Yes |
| `skewSteps` | Skew identity | Yes |
| `skewDir` | Skew identity | Yes |

### Placement Abstraction Levels

Placements can be compared at different abstraction levels:

1. **Concrete** - Exact grid locations (n, ne, e, se, s, sw, w, nw)
2. **Relative** - Angular relationship between hands (alpha, beta, gamma, zeta, eta)
3. **Abstract** - Placement group only, ignoring specific variant (alpha vs alpha1-8)

For rotation-invariant comparison, we use **relative** placements (the angular relationship between hands).

### The Core Insight: Geometric Invariants

Two sequences are "the same pattern" if they share these geometric invariants:
- Same placement group transitions (alpha→beta, gamma→gamma, etc.)
- Same motion types per hand (pro, anti, static, dash, float)
- Same rotation directions relative to hand path
- Same turn counts
- Same orientation transitions (in→out, etc.)

The specific grid locations can differ if one sequence is a spatial rotation of another.

---

## Layer 1: Motion Comparison Primitives

These are the foundational building blocks for all higher-level comparison.

### 1.1 `IMotionSignatureGenerator`

Creates rotation-invariant signatures for individual motions.

```typescript
interface MotionSignature {
  // Core motion identity
  readonly motionType: MotionType;
  readonly rotationDirection: RotationDirection;
  readonly turns: number | "fl";

  // Orientation transition (rotation-invariant)
  readonly orientationTransition: OrientationTransition;

  // Location delta (rotation-invariant representation)
  readonly locationDelta: LocationDelta;

  // Skew information
  readonly skewSteps: number;
  readonly skewDir: SkewDirection | null;
}

interface OrientationTransition {
  readonly from: Orientation;
  readonly to: Orientation;
}

interface LocationDelta {
  // Number of 45° steps between start and end (0 = static, 2 = shift, 4 = dash)
  readonly steps: number;
  // Direction of movement relative to hand (cw/ccw/none)
  readonly direction: HandPath;
}

interface IMotionSignatureGenerator {
  /** Generate rotation-invariant signature for a single motion */
  generateSignature(motion: MotionData): MotionSignature;

  /** Compare two signatures for exact equality */
  signaturesMatch(a: MotionSignature, b: MotionSignature): boolean;

  /** Compute similarity score between two signatures (0.0 - 1.0) */
  computeSimilarity(a: MotionSignature, b: MotionSignature): number;
}
```

### 1.2 `IBeatSignatureGenerator`

Creates rotation-invariant signatures for complete beats (both hands).

```typescript
interface BeatSignature {
  // Placement group (not specific variant)
  readonly startPlacementGroup: GridPlacementGroup;
  readonly endPlacementGroup: GridPlacementGroup;

  // Motion signatures for each hand
  readonly blue: MotionSignature;
  readonly red: MotionSignature;

  // Angular relationship between hands at start and end
  readonly startHandAngle: number; // 0, 45, 90, 135, 180 degrees
  readonly endHandAngle: number;

  // Computed hash for quick inequality check
  readonly hash: string;
}

interface IBeatSignatureGenerator {
  /** Generate rotation-invariant signature for a beat */
  generateSignature(step: StepData): BeatSignature;

  /** Check if two beats are exactly equivalent */
  beatsMatch(a: BeatSignature, b: BeatSignature): boolean;

  /** Compute similarity score between beats (0.0 - 1.0) */
  computeSimilarity(a: BeatSignature, b: BeatSignature): BeatSimilarityResult;
}

interface BeatSimilarityResult {
  readonly score: number; // 0.0 - 1.0
  readonly breakdown: {
    readonly placementMatch: boolean;
    readonly blueMotionScore: number;
    readonly redMotionScore: number;
  };
}
```

### 1.3 `ISpatialTransformDetector`

Detects what spatial transform (if any) relates two beats/placements.

```typescript
type SpatialTransform = {
  // Number of 45° clockwise rotation steps (0-7)
  readonly rotationSteps: number;
  // Whether grid mode toggled (odd steps toggle diamond↔box)
  readonly gridModeToggled: boolean;
};

interface ISpatialTransformDetector {
  /** Find transform that maps beatA to beatB (null if no transform works) */
  findTransform(beatA: StepData, beatB: StepData): SpatialTransform | null;

  /** Apply a spatial transform to a beat */
  applyTransform(beat: StepData, transform: SpatialTransform): StepData;

  /** Get all 8 possible spatial transforms */
  getAllTransforms(): readonly SpatialTransform[];
}
```

---

## Layer 2: Sequence Comparison Engine

These services compose the primitives to compare complete sequences.

### 2.1 `ISequenceAligner`

Aligns two sequences to find the best correspondence between beats.

This uses principles from [dynamic programming alignment algorithms](https://en.wikipedia.org/wiki/Needleman%E2%80%93Wunsch_algorithm):
- **Global alignment** (Needleman-Wunsch style): Align entire sequences
- **Local alignment** (Smith-Waterman style): Find best matching sub-regions

```typescript
interface AlignmentResult {
  // Overall alignment score (0.0 - 1.0)
  readonly score: number;

  // Beat-by-beat alignment
  readonly alignment: readonly AlignedBeatPair[];

  // Summary statistics
  readonly matchedBeats: number;
  readonly mismatchedBeats: number;
  readonly gaps: number; // Beats with no correspondence
}

interface AlignedBeatPair {
  readonly indexA: number | null; // null = gap in sequence A
  readonly indexB: number | null; // null = gap in sequence B
  readonly similarity: number; // 0.0 - 1.0
  readonly transform: SpatialTransform | null; // transform that relates them
}

interface ISequenceAligner {
  /** Global alignment - align entire sequences */
  alignGlobal(seqA: SequenceData, seqB: SequenceData): AlignmentResult;

  /** Local alignment - find best matching regions */
  alignLocal(seqA: SequenceData, seqB: SequenceData): LocalAlignmentResult;

  /** Align with circular rotation consideration */
  alignCircular(seqA: SequenceData, seqB: SequenceData): CircularAlignmentResult;
}

interface LocalAlignmentResult extends AlignmentResult {
  readonly regionA: { start: number; end: number };
  readonly regionB: { start: number; end: number };
}

interface CircularAlignmentResult extends AlignmentResult {
  // Best circular offset (how many beats to rotate seqB)
  readonly circularOffset: number;
}
```

### 2.2 `ITransformRelationshipDetector`

Identifies the complete transform relationship between two sequences.

```typescript
type TransformType =
  | "identical"           // Exactly the same
  | "spatial-rotation"    // Rotated around grid
  | "circular-rotation"   // Different starting beat
  | "mirror"              // Mirror transformation
  | "flip"                // Vertical flip
  | "invert"              // Rotation direction inversion
  | "color-swap"          // Blue↔Red swap
  | "rewind"              // Played backwards
  | "combined";           // Multiple transforms

interface TransformRelationship {
  readonly isRelated: boolean;
  readonly transforms: readonly TransformType[];
  readonly details: TransformDetails;
}

interface TransformDetails {
  // Spatial rotation (0-7 steps)
  readonly spatialRotation: number | null;
  // Circular offset (0 to length-1)
  readonly circularOffset: number | null;
  // Boolean flags for other transforms
  readonly isMirrored: boolean;
  readonly isFlipped: boolean;
  readonly isInverted: boolean;
  readonly isColorSwapped: boolean;
  readonly isRewound: boolean;
}

interface ITransformRelationshipDetector {
  /** Find what transforms relate sequenceA to sequenceB */
  detectRelationship(
    seqA: SequenceData,
    seqB: SequenceData
  ): TransformRelationship;

  /** Check if seqB is a specific transform of seqA */
  isTransformOf(
    seqA: SequenceData,
    seqB: SequenceData,
    transform: TransformType
  ): boolean;
}
```

### 2.3 `ISequenceCanonicalizer`

Converts sequences to canonical form for efficient comparison and hashing.

Uses [Booth's algorithm](https://en.wikipedia.org/wiki/Lexicographically_minimal_string_rotation) concepts for lexicographically minimal rotation.

```typescript
interface CanonicalSequence {
  // The canonicalized sequence data
  readonly sequence: SequenceData;

  // Transforms applied to reach canonical form
  readonly spatialRotationApplied: number;
  readonly circularOffsetApplied: number;

  // Hash for quick comparison
  readonly canonicalHash: string;
}

interface ISequenceCanonicalizer {
  /** Convert sequence to canonical (normalized) form */
  canonicalize(sequence: SequenceData): CanonicalSequence;

  /** Generate canonical hash without full canonicalization */
  generateHash(sequence: SequenceData): string;

  /** Check if two sequences have same canonical form */
  haveSameCanonicalForm(seqA: SequenceData, seqB: SequenceData): boolean;
}
```

### 2.4 `ISimilarityCalculator`

Computes detailed similarity metrics between sequences.

```typescript
interface SimilarityReport {
  // Overall similarity (0.0 - 1.0)
  readonly overallScore: number;

  // Component scores
  readonly wordSimilarity: number;      // TKA letter word comparison
  readonly motionSimilarity: number;    // Motion pattern similarity
  readonly placementSimilarity: number;  // Placement transition similarity (field name not yet renamed in src/lib/shared/comparison/services/types.ts)
  readonly structuralSimilarity: number; // Length, circularity match

  // Detailed breakdown
  readonly beatByBeatScores: readonly number[];
  readonly commonSubsequences: readonly CommonSubsequence[];

  // Human-readable summary
  readonly summary: string;
}

interface CommonSubsequence {
  readonly startIndexA: number;
  readonly startIndexB: number;
  readonly length: number;
  readonly similarity: number;
}

interface ISimilarityCalculator {
  /** Compute comprehensive similarity report */
  computeSimilarity(seqA: SequenceData, seqB: SequenceData): SimilarityReport;

  /** Quick similarity check (less detailed, faster) */
  computeQuickScore(seqA: SequenceData, seqB: SequenceData): number;
}
```

---

## Layer 3: High-Level Services

These are the consumer-facing services that applications use.

### 3.1 `ISequenceEquivalenceDetector` (Already Defined)

Binary equivalence checking - fulfills the existing interface contract.

```typescript
// Uses existing interface from ISequenceEquivalenceDetector.ts
// Implementation composes Layer 2 services
```

### 3.2 `ISequenceSimilarityAnalyzer`

Detailed similarity analysis for UI presentation.

```typescript
interface SimilarityAnalysis {
  readonly report: SimilarityReport;
  readonly relationship: TransformRelationship;
  readonly recommendations: readonly string[];
}

interface ISequenceSimilarityAnalyzer {
  /** Full analysis of two sequences */
  analyze(seqA: SequenceData, seqB: SequenceData): SimilarityAnalysis;
}
```

### 3.3 `IDuplicateFinder`

Finds duplicates and near-duplicates in a collection.

```typescript
interface DuplicateGroup {
  readonly canonical: SequenceData;
  readonly duplicates: readonly {
    sequence: SequenceData;
    relationship: TransformRelationship;
  }[];
}

interface IDuplicateFinder {
  /** Find all duplicate groups in a collection */
  findDuplicates(
    sequences: readonly SequenceData[],
    options?: DuplicateFinderOptions
  ): readonly DuplicateGroup[];

  /** Find sequences similar to target */
  findSimilar(
    target: SequenceData,
    candidates: readonly SequenceData[],
    threshold: number
  ): readonly { sequence: SequenceData; similarity: SimilarityReport }[];
}

interface DuplicateFinderOptions {
  // Consider spatial rotations as duplicates?
  readonly includeSpatialRotations: boolean;
  // Consider circular rotations as duplicates?
  readonly includeCircularRotations: boolean;
  // Consider other transforms?
  readonly includeMirrors: boolean;
  readonly includeFlips: boolean;
  readonly includeInversions: boolean;
}
```

### 3.4 `IPatternMatcher`

Search for patterns within sequences.

```typescript
interface PatternMatch {
  readonly sequence: SequenceData;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly matchScore: number;
  readonly transform: SpatialTransform | null;
}

interface IPatternMatcher {
  /** Find sequences containing a pattern */
  findPattern(
    pattern: readonly StepData[],
    sequences: readonly SequenceData[]
  ): readonly PatternMatch[];

  /** Find common patterns across multiple sequences */
  findCommonPatterns(
    sequences: readonly SequenceData[],
    minLength: number
  ): readonly { pattern: readonly StepData[]; occurrences: number }[];
}
```

---

## Scoring System

### Motion Similarity Scoring

| Aspect | Weight | Scoring |
|--------|--------|---------|
| Motion type match | 0.4 | 1.0 if same, 0.0 if different |
| Rotation direction match | 0.2 | 1.0 if same, 0.5 if one is NO_ROTATION, 0.0 if opposite |
| Turns match | 0.2 | 1.0 - (abs(diff) / max(a, b)) |
| Orientation transition match | 0.1 | 1.0 if same, 0.0 if different |
| Location delta match | 0.1 | 1.0 if same, 0.0 if different |

### Beat Similarity Scoring

| Aspect | Weight | Scoring |
|--------|--------|---------|
| Blue motion similarity | 0.35 | Motion similarity score |
| Red motion similarity | 0.35 | Motion similarity score |
| Placement group match | 0.2 | 1.0 if same transition, 0.0 if different |
| Hand angle preservation | 0.1 | 1.0 if same, 0.5 if close, 0.0 if different |

### Sequence Similarity Scoring

| Aspect | Weight | Scoring |
|--------|--------|---------|
| Beat-by-beat alignment | 0.5 | Average beat similarity |
| Structural match | 0.2 | Same length, circularity, etc. |
| Word similarity | 0.2 | Levenshtein distance on TKA words |
| Common subsequences | 0.1 | Bonus for shared patterns |

---

## Performance Considerations

### Hashing Strategy

For library-wide duplicate detection, we use a multi-level hash:

1. **Quick reject hash**: `${length}-${isCircular}-${wordCanonical}`
   - Different hash = definitely not equivalent
   - Same hash = need deeper comparison

2. **Canonical signature hash**: Full rotation-invariant beat signatures
   - Used for indexing in duplicate finder
   - Generated once, stored with sequence

### Algorithmic Complexity

| Operation | Time | Space |
|-----------|------|-------|
| Single beat signature | O(1) | O(1) |
| Sequence signature | O(n) | O(n) |
| Equivalence check | O(n) best, O(8n) worst | O(n) |
| Similarity calculation | O(n) | O(n) |
| Global alignment | O(n*m) | O(n*m) |
| Duplicate finding (library) | O(k*n) with hash index | O(k*n) |

Where:
- n, m = sequence lengths
- k = number of sequences in library

---

## Implementation Order

### Phase 1: Core Primitives (This PR)
1. `MotionSignatureGenerator`
2. `BeatSignatureGenerator`
3. `SpatialTransformDetector`

### Phase 2: Comparison Engine
4. `SequenceCanonicalizer`
5. `SequenceAligner` (global alignment only)
6. `SimilarityCalculator`

### Phase 3: High-Level Services
7. `SequenceEquivalenceDetector` (fulfills existing interface)
8. `TransformRelationshipDetector`

### Phase 4: Advanced Features
9. `DuplicateFinder`
10. `SequenceSimilarityAnalyzer`
11. `PatternMatcher`
12. Local alignment support

---

## DI Container Integration

All services will be registered in `build-container.ts`:

```typescript
// Layer 1
motionSignatureGenerator: () => new MotionSignatureGenerator(),
beatSignatureGenerator: () => new BeatSignatureGenerator(motionSignatureGenerator),
spatialTransformDetector: () => new SpatialTransformDetector(),

// Layer 2 (depends on Layer 1)
sequenceCanonicalizer: () => new SequenceCanonicalizer(
  beatSignatureGenerator,
  wordCyclicEquivalenceDetector
),
sequenceAligner: () => new SequenceAligner(beatSignatureGenerator),
similarityCalculator: () => new SimilarityCalculator(sequenceAligner),
transformRelationshipDetector: () => new TransformRelationshipDetector(
  spatialTransformDetector,
  sequenceAligner
),

// Layer 3 (depends on Layer 2)
sequenceEquivalenceDetector: () => new SequenceEquivalenceDetector(
  sequenceCanonicalizer,
  transformRelationshipDetector
),
duplicateFinder: () => new DuplicateFinder(
  sequenceCanonicalizer,
  similarityCalculator
),
patternMatcher: () => new PatternMatcher(sequenceAligner),
```

---

## Testing Strategy

### Unit Tests (per service)
- Motion signature generation correctness
- Beat signature generation and comparison
- Spatial transform detection accuracy
- Canonical form generation determinism
- Alignment algorithm correctness

### Integration Tests
- End-to-end equivalence detection
- Duplicate finding in sample library
- Transform relationship detection

### Property-Based Tests
- Canonicalization is idempotent
- Equivalent sequences have same canonical hash
- Similarity is symmetric (score(A,B) == score(B,A))
- Transforms compose correctly

---

## Future Extensions

This architecture supports future additions:

1. **Machine learning integration**: Signature vectors can feed into ML models
2. **Fuzzy matching**: Adjustable thresholds for similarity
3. **Sub-sequence indexing**: Inverted index for pattern search
4. **Real-time comparison**: Streaming comparison during sequence building
5. **Cross-prop-type comparison**: Compare staff sequences to poi sequences

---

## References

- [Needleman-Wunsch Algorithm](https://en.wikipedia.org/wiki/Needleman%E2%80%93Wunsch_algorithm) - Global sequence alignment
- [Smith-Waterman Algorithm](https://en.wikipedia.org/wiki/Smith%E2%80%93Waterman_algorithm) - Local sequence alignment
- [Symbolic Melodic Similarity](https://dl.acm.org/doi/10.1162/COMJ_a_00359) - Music sequence comparison
- [Booth's Algorithm](https://en.wikipedia.org/wiki/Lexicographically_minimal_string_rotation) - Canonical rotation
- [Labanotation Motion Learning](https://ieebrowse.ieee.org/document/8891607/) - Dance movement comparison
