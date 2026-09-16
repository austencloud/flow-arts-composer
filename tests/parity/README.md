# Parity Harness

Scaffolding for the bit-exact sequence-engine parity corpus used by the
sequence-engine unification (see
`docs/superpowers/specs/2026-04-20-sequence-engine-unification-design.md`).

## What this is

The parity harness captures a pinned baseline of engine output for a fixed
set of sequences. Every later phase of the unification re-runs the engine
over the corpus and diffs bit-for-bit against the baseline. Any divergence
fails the phase.

## Layout

```
tests/parity/
  README.md                  this file
  edge-cases.json            50 manually enumerated edge inputs
  corpus-manifest.json       pinned baseline manifest (populated by capture)
  capture-corpus.ts          CLI — build the baseline
  run-parity.ts              CLI — re-run engine and diff against baseline
  corpus/                    per-entry <id>.json + <id>.meta.json (generated)
```

## Capture the baseline

```
tsx tests/parity/capture-corpus.ts --sources=edge
```

Writes one `<id>.json` (canonical engine output) and one `<id>.meta.json`
(the inputs used) per sequence into `tests/parity/corpus/`, plus updates
`corpus-manifest.json` with a `capturedCommit` hash.

Full corpus (edge cases + deck enumeration + 30-day prod writes):

```
tsx tests/parity/capture-corpus.ts --sources=edge,decks,firestore
```

Deck and Firestore sources are stubbed in Phase 0 and light up during
Phase 1 preparation (see
`docs/superpowers/plans/2026-04-20-sequence-engine-unification-plan.md`
Task 0.6).

## Run parity

```
tsx tests/parity/run-parity.ts
```

Exits `0` on zero divergences, `1` on at least one. Use `--filter=<substr>`
to narrow to specific entries during triage, or `--fail-fast` to stop on
the first divergence.

Help text:

```
tsx tests/parity/run-parity.ts --help
tsx tests/parity/capture-corpus.ts --help
```

## Adding edge cases

Edit `edge-cases.json`. Each entry needs:

- `id` — unique, kebab-case
- `kind` — `"word"` or `"start"`
- `word` or `startPlacement` — the input
- `options` — engine-generation options (constraintPreset, loopType, etc.)
- `description` — one sentence on what this edge guards against

Re-capture after adding to get the new baseline into the corpus. The
commit hash in `corpus-manifest.json` pins the exact engine version that
produced that baseline; never edit baselines by hand.

## Corpus methodology

Canonical methodology is in the unification plan under Task 0.1. Sources:

1. Every sequence in every registered LOOP deck.
2. Last 30 days of user-written sequences from Firestore `sequences/` (cap
   at 500 most recent).
3. The 50 manually-authored edge cases in `edge-cases.json`.

Each captured entry is serialized via a canonical stringify (keys sorted,
deterministic whitespace) so diffs are bit-exact.
