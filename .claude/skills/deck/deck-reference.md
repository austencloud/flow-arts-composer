# Deck Reference

Supporting data for the `/deck` skill. Not loaded into every conversation.

## Enumerator Flags

| Flag | Required | Values |
|------|----------|--------|
| `--loopType` | Yes | Any LOOPType string (rotated, mirrored, swapped, inverted, flipped, etc.) |
| `--slice` | Yes | `halved` or `quartered` |
| `--seedLength` | Yes | Integer (2, 3, 4, ...) |
| `--level` | Yes | 1, 2, or 3 |
| `--gridMode` | No | `diamond` (default), `box`, `skewed` |
| `--dry-run` | No | Count only, no writes |
| `--out <path>` | No | Save to JSON file |
| `--seed-firestore` | No | Write to Firestore |
| `--startPlacements` | No | Comma-separated override |

## Halved-Only LOOP Types

These reject `--slice quartered`:
mirrored, flipped, swapped, inverted, swapped_inverted, mirrored_swapped, mirrored_inverted, mirrored_swapped_inverted, rewound

## Firestore Structure

```
decks/{deckId}
  ├── name: string
  ├── description: string
  ├── families: DeckFamily[]
  │     ├── id: string
  │     ├── label: string
  │     ├── typeCombo: string
  │     └── sequenceIds: string[]
  ├── totalSequences: number
  ├── gridMode: string
  └── level: number

decks/{deckId}/sequences/{seqId}
  ├── word, name, steps[], startPlacement
  ├── gridMode, isCircular, loopType
  ├── level, sequenceLength
  └── metadata: { seedWord, handPathFamily }
```

**Deck ID convention:** `l{level}-{slice}-{loopType}-{totalBeats}beat`
**TnD deck ID convention:** `tnd-{N}to{M}-motions`

## TnD Ratio-to-Turns Mapping

| Ratio | Turns | Deck ID |
|-------|-------|---------|
| 1:1 | 0 | l1-tnd-motions (base) |
| 2:1 | 0.5 | tnd-2to1-motions |
| 3:1 | 1 | tnd-3to1-motions |
| 4:1 | 1.5 | tnd-4to1-motions |
| 5:1 | 2 | tnd-5to1-motions |
| 6:1 | 2.5 | tnd-6to1-motions |
| 7:1 | 3 | tnd-7to1-motions |

Script: `scripts/seed-tnd-turn-decks.cjs`

## Scaling Estimates

| Seed Length | Halved Total | Quartered Total |
|-------------|-------------|-----------------|
| 2 beats | 47 | 128 |
| 3 beats | 1,302 | 1,606 |
| 4 beats | 22,595 | 27,892 |
| 5 beats | ~300,000+ | ~400,000+ |

Each extra beat multiplies by ~17x. Level 2 (adding 1-turn motions) further multiplies.

## Current Decks (as of 2026-03-26)

| Deck ID | Beats | Sequences |
|---------|-------|-----------|
| l1-halved-strict-rotated-4beat | 4 | 47 |
| l1-halved-strict-rotated-6beat | 6 | 1,302 |
| l1-quartered-strict-rotated-8beat | 8 | 128 |
| l1-halved-strict-rotated-8beat | 8 | 22,595 |
| l1-quartered-strict-rotated-12beat | 12 | 1,606 |
| l1-quartered-strict-rotated-16beat | 16 | 27,892 |
| l1-tnd-motions + 6 ratio variants | 4 | 19 × 7 = 133 |

## Orientation Rules (L1, 0-turn)

- PRO/STATIC: preserves orientation (in→in, out→out)
- ANTI/DASH: **flips** orientation (in→out, out→in)

## Common Firestore Operations

### Fix deck name
```javascript
await db.doc('decks/DECK_ID').update({
  name: 'Level 1: Quartered Rotated LOOP (20 beats)',
});
```

### Delete a deck
```javascript
const seqs = await db.collection('decks/DECK_ID/sequences').get();
for (const d of seqs.docs) await d.ref.delete();
await db.doc('decks/DECK_ID').delete();
```

### Verify orientation correctness
```javascript
const snap = await db.collection('decks/DECK_ID/sequences').limit(5).get();
for (const doc of snap.docs) {
  const d = doc.data();
  for (const s of d.steps) {
    const b = s.motions.blue;
    if (b.motionType === 'anti' && b.startOrientation === b.endOrientation) {
      console.log('BAD:', d.word, 'beat', s.beat, 'anti should flip orientation');
    }
  }
}
```
