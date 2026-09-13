# App-vs-engine LOOP parity audit

Read-only audit evidence for Phase 3 of
`docs/superpowers/specs/active/2026-04-20-sequence-engine-unification-design.md`
("delete the five app-side LOOP executors, rewire `SequenceExtender` to the
engine"). No production code is touched by anything in this directory.

Findings and migration sequence:
`docs/reports/opus-batch-2026-09-12/sequence-engine-parity.md`.

## What runs by default

| File | Question it answers |
| --- | --- |
| `orientation-calculator-parity.test.ts` | Do the app's and engine's duplicated end-orientation calculators agree? (Yes, exhaustively — so LOOP differences are attributable to executor logic.) |
| `loop-executor-parity.test.ts` | For each LOOP type and period, do the two executor paths produce the same behaviour? |
| `engine-pipeline-configuration.test.ts` | Which engine spec conversion and post-stage combination would actually reproduce the app's behaviour? |
| `minimal-divergence-repros.test.ts` | The smallest concrete sequences on which the two paths disagree, with both sides' exact output. |
| `downstream-reach.test.ts` | Which production entry points actually hit the divergent conversion, and what a caller sees when they do. |

These suites **lock measured current behaviour, including its defects.** Sets
named `*_DIVERGENT` / `*_INCOHERENT` / `*_OPEN` are defect inventories that
should shrink; when they do, these tests fail and say exactly what changed.
That is the intended signal, not a regression.

## What is quarantined

`quarantine/loop-closure-contract.quarantine.test.ts` states the plain contract
("every LOOP is internally coherent and returns to its start position") with no
allowance for the defects. **It fails today, by design.** Every `describe` is
gated on an environment variable, so it is skipped in the default run:

```bash
LOOP_PARITY_QUARANTINE=1 npx vitest run \
  --config tests/config/vitest.config.ts \
  tests/unit/opus-sequence-parity/quarantine
```

Four failures are expected at audit time (base `c4be1619`): app
`mirrored_swapped_inverted` and `mirrored_rotated_inverted_swapped` at both
periods, and engine quartered `rotated_inverted` and `rotated_swapped`.

## Determinism

Seeds come from `static/data/pictographs/*.csv` — the same canonical dataframes
the engine's own integration tests and the app's variation provider read.
Chains are enumerated in CSV order, breadth-first across root rows, with a
fixed per-cell budget. No RNG, no clock, no set-iteration dependence: the same
commit always produces the same corpus.
