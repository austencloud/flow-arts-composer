# Canonical LOOP completion contract

The pre-migration differential audit established that the app executors and the
engine disagreed. The extension path now uses the engine's completion boundary,
so these tests assert completed LOOP behavior directly instead of preserving
known defects as parity expectations.

Findings and migration sequence:
`docs/reports/opus-batch-2026-09-12/sequence-engine-parity.md`.

## What runs by default

| File                                    | Question it answers                                                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orientation-calculator-parity.test.ts` | Do the app's and engine's duplicated end-orientation calculators agree? (Yes, exhaustively — so LOOP differences are attributable to executor logic.)     |
| `loop-completion-contract.test.ts`      | Does each supported legacy operation preserve its seed, produce its requested transformation, chain coherent steps, and close placement plus orientation? |

The historical differential and the D1/D2 examples remain documented in
`docs/reports/opus-batch-2026-09-12/sequence-engine-parity.md`; the production
contract now requires those cases to be coherent and closed.

## Determinism

Seeds come from `static/data/pictographs/*.csv` — the same canonical dataframes
the engine's own integration tests and the app's variation provider read.
Chains are enumerated in CSV order, breadth-first across root rows, with a
fixed per-cell budget. No RNG, no clock, no set-iteration dependence: the same
commit always produces the same corpus.
