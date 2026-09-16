---
name: deck
description: Use when enumerating new LOOP decks, seeding decks to Firestore, expanding VTG turn variants, or troubleshooting deck orientation/count issues
---

# Deck Management

Enumerate, seed, and manage algorithmic LOOP decks. Reference data (flags, Firestore schema, VTG table, scaling) is in `deck-reference.md`.

## When NOT to Use

- Library sequences (user-created) — those use `import-sequence.cjs` and `LibraryRepository`
- Browse/gallery features — separate system, different Firestore paths
- Single-sequence generation — use the MCP tools or the Create module

## Enumeration Pipeline

```bash
# Always dry-run first
node scripts/enumerate-deck.cjs --loopType rotated --slice quartered --seedLength 4 --level 1 --dry-run

# Then seed if count is reasonable
node scripts/enumerate-deck.cjs --loopType rotated --slice quartered --seedLength 4 --level 1 --seed-firestore
```

1. Load CSV adjacency graph
2. Filter by level (L1 = 0-turn only)
3. Resolve end-placement constraint from engine validation sets
4. DFS walk N beats with rotation continuity
5. Dedup by `(startPlacement, seedWord)`
6. Group by hand-path family
7. Execute LOOP on each seed
8. **MUST propagate orientations** through the full sequence
9. Write to Firestore

## Guardrails

1. **MUST `--dry-run` first** for any new configuration
2. **MUST verify orientation** after seeding — anti motions MUST flip (in→out). See verification snippet in `deck-reference.md`
3. **MUST NOT seed L2+ decks** without user discussion — tree size explodes (~17x per beat)
4. **MUST include beat count in deck name** — users need sequence length at a glance
5. **SHOULD verify family counts match actual docs** after seeding
6. **SHOULD update deck name/description** if the enumerator auto-generates a generic one

## VTG Turn Expansion

Script: `scripts/seed-tnd-turn-decks.cjs` — clones the base TnD deck (19 sequences) with different turn values per VTG ratio (1:1 through 7:1). See `deck-reference.md` for the ratio table.

## UI Structure

Three-level navigation in `DeckBrowser.svelte`:
1. Deck list → 2. Family cards (motion-type pills) → 3. Sequences grouped by start placement (α/β/γ)

Family-level loading prevents 27,000+ sequence decks from loading all at once.

## Exit Criteria

You're done when:
- The deck appears in the Decks tab with correct name and beat count
- Family count in metadata matches actual Firestore document count
- At least one anti-motion sequence shows correct orientation flipping (in→out→in)
- The deck loads without errors in the browser console
