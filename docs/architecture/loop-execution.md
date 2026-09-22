# LOOP execution

The sequence engine owns LOOP execution. App extension, public engine execution,
and explicit compositional generation use its transformation primitives. The app
owns pictograph lookup, letter recovery, view metadata, and editing history.

## Migration contract

The September 2026 migration resolves the competing app executors and engine
pipeline described in `docs/reports/opus-batch-2026-09-12/sequence-engine-parity.md`.
That report is historical evidence. Its tests originally asserted that defects
were present; a passing historical defect assertion did not mean correct output.

Searches used to establish ownership: `executeLOOPSpec`, `buildStrictQuarters`,
`closeOrientationCycle`, `reduceToMinimalLoop`, and `loopSpecFromLegacyRhythm`.
This work extends the engine's existing execution and reduction owners and
composes them at the extension boundary.

`completeLOOPExtension(steps, request)` accepts a legacy LOOP type and period or
an explicit symmetric `LOOPSpec`. Its result contains completed steps, the
authored seed length, derived step indices, the executed spec, and expansion
and reduction metadata. `isLegacyLOOPSeedValid` is the shared placement gate
used by extension pickers. Full completion additionally checks the authored
steps' continuity and placement labels against their hand locations.

The supported extension contract is:

- Accept a start-placement entry followed by authored steps, and validate the
  requested transformation against that particular seed.
- Preserve the authored prefix and its identifiers. Execution must not mutate
  the caller's sequence or motion objects.
- Compute generated placements from the transformed hand locations. Each
  generated step must join the preceding step without a location discontinuity.
- Return a sequence closed in hand locations, placement, and prop orientation,
  or fail with a specific reason. Placement closure alone is insufficient.
- An order-two transformation requested with quartered rhythm does not require
  a duplicate second cycle once the first cycle has already closed orientation.
  Genuine orientation cycles remain intact.
- Reduction must not trim authored steps or discard differences in timing,
  hand presence, motion geometry, or other authored content. Generated identity
  and derived labels do not by themselves make a repeat meaningful.
- Reject quartered rewound requests rather than silently returning a halved
  result.

## Compatibility

The legacy flat LOOP type and period describe the existing extension operation.
An explicit `LOOPSpec` describes independently timed components. These inputs
must be translated deliberately; assigning the same period to every component
does not make the two representations equivalent.

In particular, the legacy quartered rotated/inverted operation alternates
inversion across the four rotation sections. Explicit compositional generation
retains its chosen expansion or overlay mode. A migration may fix an incoherent
placement or an unclosed result; it must not silently reinterpret a saved spec.

Legacy extension translation follows these rules:

| Request                                  | Structural interpretation                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| No rotation component                    | One order-two transform; further cycles serve orientation closure.         |
| Rotation alone                           | The requested two or four rotation sections.                               |
| Rotation with mirror or flip             | The requested rotation sections, followed by an order-two outer transform. |
| Rotation with swap, optionally inversion | One fused stage at the requested period, advancing rotation on every pass. |
| Quartered rotation with inversion alone  | Four rotation sections with alternating inversion.                         |
| Quartered rewind                         | Refused.                                                                   |

The private extension translator keeps these rules out of the public
`loopSpecFromLegacyRhythm` generation helper. Explicit specs retain their own
periods and modes. Asymmetric specs and overlays that rewrite the authored
prefix are refused by extension; generation retains its existing support.

Legacy picker restrictions remain in force where transforms degenerate:
rotated/swapped combinations exclude alpha starts, and mirrored/swapped/inverted
and the all-four combination retain their beta1/beta5 start restriction. These
compatibility rules do not constrain explicitly supplied specs.

QR compositional decoding uses the engine's structural executor because its
encoded recipe specifies an exact expansion. It does not apply extension
reduction. App extension assigns fresh identifiers to appended steps and
derives their letters from canonical pictographs before applying editing state.

Existing saved sequences are not rewritten by this migration. The contract
applies when a user requests a new extension. The input remains available
unchanged if validation or execution fails.

## Evidence required

Use canonical dataframe fixtures and independent outcome assertions. Comparing
two adapters that call the same function only verifies their wiring.

The execution gate covers valid and invalid seeds, halved and quartered
requests, both supported grid modes, turn and orientation variations, seed
preservation, step coherence, closure, and non-redundancy. Direct app coverage
also checks letter recovery and generated-step identity. Package type/build
checks establish that the shared engine remains independently consumable.

The final migration removes app-local executor registrations and their unused
implementations only after all consumers have moved to the shared owner.
