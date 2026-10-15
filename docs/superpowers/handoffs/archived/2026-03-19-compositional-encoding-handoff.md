> Archived 2026-10-14: Matching scope is recorded in `docs/superpowers/specs/shipped/2026-03-19-compositional-sequence-encoding-design.md`.

# Compositional Sequence Encoding — Implementation Handoff

## What You're Building

QR codes on choreo cards currently encode every beat of a sequence. A 16-beat rotated LOOP encodes all 16 beats (~200 chars compressed). But that sequence is really just 4 beats + "rotate 90 degrees three more times." The program already knows how to do that rotation — it has executors that produce the full sequence deterministically from a seed.

You're adding a "recipe" encoding: instead of `s~z:{16 beats}`, produce `s~r:sr:{hash}:{4 beats}`. The decoder reconstructs the full sequence using the existing `StrictRotatedLOOPExecutor`. Round-trip verification at encode time ensures the recipe is correct. Hash verification at decode time catches corruption.

## Files to Read First

Read these IN ORDER before writing any code:

1. **Spec**: `docs/superpowers/specs/2026-03-19-compositional-sequence-encoding-design.md`
2. **Plan**: `docs/superpowers/plans/2026-03-19-compositional-sequence-encoding.md`
3. **SequenceEncoder** (the file you'll modify): `src/lib/shared/navigation/services/implementations/SequenceEncoder.ts` — focus on `encodeForQR()`, `decodeFromQR()`, `encode()`, `decode()`, `encodeWithCompression()`, `decodeWithCompression()`, `compressString()`, `decompressString()`
4. **ISequenceEncoder interface**: `src/lib/shared/navigation/services/contracts/ISequenceEncoder.ts`
5. **LOOPDetector**: `src/lib/features/create/generate/circular/services/implementations/LOOPDetector.ts` — focus on `detectLOOPType()` return value (`LOOPDetectionResult` with `loopType`, `sliceSize`, `confidence`)
6. **StrictRotatedLOOPExecutor**: `src/lib/features/create/generate/circular/services/implementations/StrictRotatedLOOPExecutor.ts` — focus on `executeLOOP(steps, sliceSize)` method AND the singleton export at the bottom of the file
7. **ShortCodeManager**: `src/lib/shared/qr/services/implementations/ShortCodeManager.ts` — callers of `encodeForQR` and `decodeFromQR` that must be updated for async
8. **Existing encoder tests**: `tests/unit/services/SequenceEncoder.test.ts` — test patterns and helpers

## Critical Audit Fixes (Apply These, Don't Follow the Plan Blindly)

The plan was audited and has 7 issues. Apply these corrections:

### 1. Use singleton executor exports, NOT constructors

The plan says `new mod.StrictRotatedLOOPExecutor()`. This is WRONG — the constructors require DI dependencies (`IOrientationCalculator`, `IGridPositionDeriver`).

Each executor file exports a pre-wired singleton at the bottom. Use those:

```typescript
// WRONG:
const mod = await import("...StrictRotatedLOOPExecutor");
return new mod.StrictRotatedLOOPExecutor();

// RIGHT:
const mod = await import("...StrictRotatedLOOPExecutor");
return mod.strictRotatedLOOPExecutor; // lowercase singleton
```

Check each executor file for its singleton export name before using it.

### 2. Fix LOOP_TYPE_TAGS keys

The `LOOPType` enum values are `"rotated"`, `"mirrored"`, `"strict_rewound"`, etc. The plan has `rewound: "rw"` but the enum value is `"strict_rewound"`. Fix:

```typescript
// WRONG:
rewound: "rw",

// RIGHT:
strict_rewound: "rw",
```

Check ALL keys against the actual `LOOPType` enum values in `circular-models.ts`.

### 3. Fix SliceSize import path

`SliceSize` is NOT re-exported from `generate-models.ts`. Import from the canonical source:

```typescript
// WRONG:
import { SliceSize } from "$lib/features/create/generate/shared/domain/models/generate-models";

// RIGHT:
import { SliceSize } from "$lib/features/create/generate/circular/domain/models/circular-models";
```

### 4. Handle the sync→async cascade fully

Changing `encodeForQR()` and `decodeFromQR()` to async breaks callers. The plan mentions some but not all:

- `ShortCodeManager.createOfflineCode()` — currently sync, must become async. Its return type changes to `Promise<CreateShortCodeResult>`. Update the `IShortCodeManager` interface too.
- `ShortCodeManager.resolveShortCode()` — already async, just add `await`
- `SequenceEncoder.estimateOfflineQRSize()` — calls `encodeForQR` synchronously. Must become async. Update the interface.
- Run `npm run check` after the change and fix EVERY type error. Don't assume the plan caught them all.

### 5. Extract shared code — don't duplicate

The plan puts identical `getExecutor()` and `computeHash()` methods in both CompositionalEncoder and CompositionalDecoder. Extract them:

Create `src/lib/shared/qr/services/implementations/compositional-utils.ts`:
```typescript
export async function getLoopExecutor(tag: string) { ... }
export async function computeRecipeHash(data: string): Promise<string> { ... }
```

Both encoder and decoder import from this shared file.

### 6. Hash input: always use uncompressed flat encoding

The hash must be computed on `this.encode(sequence)` (uncompressed), not `this.encodeWithCompression(sequence)` (may be compressed). Both encoder and decoder must agree. The decoder calls `this.flatEncoder.encode(reconstructed)` which is uncompressed — this is correct. Make sure the encoder does the same.

### 7. Compound LOOP types intentionally fall back to flat

When `LOOPDetector` returns a compound type like `swapped_inverted`, it won't be in `LOOP_TYPE_TAGS` and `tryEncode` returns null (flat fallback). This is correct per spec. Add a comment explaining this is intentional, not a bug.

## Architecture Diagram

```
QR Generation (ChoreoCard.svelte)
  → qrCodeGenerator.generateForSequence(seq, { offline: true })
  → shortCodeManager.createOfflineCode(seq)
  → sequenceEncoder.encodeForQR(seq)          ← YOU MODIFY THIS
      → CompositionalEncoder.tryEncode(flat, seq)
          → LOOPDetector.detectLOOPType(seq)
          → Extract seed (first 4 beats for quartered)
          → Reconstruct via executor
          → Compare to original (round-trip)
          → If match: return "r:sr:{hash}:{compressed seed}"
          → If mismatch: return null (fall back to flat)
      → If recipe: return "s~r:sr:{hash}:{seed}"
      → If flat:   return "s~z:{all beats compressed}"

QR Scan Resolution (/p/[code]/+page.svelte)
  → shortCodeManager.resolveShortCode("s~r:sr:...")
  → sequenceEncoder.decodeFromQR("s~r:sr:...")  ← YOU MODIFY THIS
      → Detect "r:" prefix
      → CompositionalDecoder.decode(recipeString)
          → Parse tag, hash, compressed seed
          → Decompress seed
          → Reconstruct via executor
          → Hash reconstructed flat encoding
          → Compare to stored hash
          → If match: return SequenceData
          → If mismatch: throw error
```

## Testing Strategy

The "silent bug" test: if the recipe encoding produces a wrong sequence, the pictographs render incorrectly without any visible error. The QR code works but shows wrong movements. This is why round-trip verification AND hash checking both exist.

Your tests should:
1. Create a 4-beat seed with known motions
2. Run `strictRotatedLOOPExecutor.executeLOOP(seed, SliceSize.QUARTERED)` to get 16 beats
3. Build a `SequenceData` from the 16 beats
4. Encode it — verify the result starts with `s~r:sr:`
5. Decode it — verify the result matches the original beat-for-beat
6. Tamper with the encoded string — verify decoding throws hash mismatch
7. Encode a non-LOOP sequence — verify it falls back to flat `s~z:`

Use the `makeStep()` helper pattern from `tests/unit/services/SequenceEncoder.test.ts`.

## Verification Before Claiming Done

1. `npm run check` — zero new TypeScript errors
2. `npm test` — all tests pass including your new ones
3. Open the app, find a LOOP sequence in the gallery, open the viewer
4. The QR code should render (offline encoding now tries recipe first)
5. Use Chrome DevTools to check the encoded URL length — should be ~65% shorter for rotated LOOPs
6. Navigate to the QR URL in a fresh browser context — sequence should load correctly
7. Compare the QR code visual density to a non-LOOP sequence — recipe QR should be visibly simpler

## What NOT To Do

- Don't modify executor files. They're read-only dependencies.
- Don't modify LOOPDetector. It's a read-only dependency.
- Don't add compositional encoding to Firestore storage. QR codes only.
- Don't handle compound LOOP types (rotated+inverted, etc.). They fall back to flat.
- Don't skip the round-trip verification. It's the safety net.
- Don't skip the hash. It catches corruption on printed cards years later.
- Don't make the tests TODOs. Write real tests with real sequence data.
