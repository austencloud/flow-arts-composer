---
status: active
value: null
effort: null
work_state: unverified
remaining: Audit left/right motion identity migration across MCP, compact URLs, Firestore, and public index against the verification matrix.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Left/Right Motion Identity Migration

**Status:** Approved for implementation by Austen on 2026-08-31

## Decision

TKA's domain model identifies the two performers' hands as `left` and `right`.
Blue and red remain the canonical notation palette, but color is presentation,
not motion identity.

The canonical source is `packages/tka-types`. Its current `PropColor` contract
states that blue is the left prop channel and red is the right prop channel.
The bug is that the channel was named after its default ink instead of the
physical hand it represents. The glossary compounded that error by claiming
blue could mean a lead hand and red could mean a follow hand. Austen corrected
that claim: blue always represents the performer's left hand and red always
represents the performer's right hand.

## Canonical contract

```ts
export const HandSide = {
  left: "left",
  right: "right",
} as const;

export interface StepMotions {
  readonly left: Motion;
  readonly right: Motion;
}

export interface Motion {
  readonly hand?: HandSide;
}

export interface HandPalette {
  readonly left: string;
  readonly right: string;
}
```

The default presentation remains:

```ts
const CANONICAL_HAND_PALETTE = {
  left: BLUE,
  right: RED,
};
```

Motion records never use `color` as identity. Renderer and viewer settings use
the motion's `hand` to choose a value from a `HandPalette`.

## Scope

The semantic migration includes:

- `MotionColor` and `PropColor` identity types to `HandSide`;
- `motions.blue/red` to `motions.left/right`;
- flat `blueMotion/redMotion` models to `leftMotion/rightMotion`;
- reversal, solo-prop, path-hash, prop-type, visibility, and presentation fields
  whose blue/red names mean left/right identity;
- generators, transformations, animation, rendering, viewer settings,
  accessibility copy, tests, scripts, MCP payloads, and domain documentation;
- Firestore owner documents and public projections;
- embedded choreo-card and short-code payloads;
- PNG metadata and static gallery metadata.

Literal color constants and authored artwork may still say blue or red when
they genuinely refer to the canonical RGB color, not a hand.

## Compatibility boundaries

### QR and compact URLs

Existing encodings store the left hand first and the right hand second without
serializing the words `blue` or `red`. That byte order stays unchanged. Old QR
codes must decode to `motions.left/right`; re-encoding the decoded sequence
must preserve the historical bytes and recipe hashes.

URL query keys already printed on physical artifacts remain readable. New
links use left/right names only if changing the key does not alter the compact
wire contract; otherwise the old key is documented as legacy wire vocabulary.

### Firestore, public index, and embedded payloads

New writes use left/right fields. Every untrusted read accepts the legacy
blue/red shape and normalizes it before domain code sees it. Compatibility is
one-way: domain code does not branch on both vocabularies.

A corpus migration may rewrite owner documents, public projections, and
short-code embeds after dry-run parity proves that sequence length, exact word,
content hash, QR encoding, and render fingerprint do not change. The application
keeps the legacy reader after the corpus migration so old exports and offline
artifacts remain usable.

### PNG and static gallery metadata

Import accepts both `left_attributes/right_attributes` and the historical
`blue_attributes/red_attributes`. Export writes the new keys. Checked-in static
metadata is migrated so repository-owned artifacts exercise the current shape.

### Content identity and caches

The active content-hash version does not change merely because identifiers were
renamed. Hash extraction reads `left/right` but deliberately emits the same
ordered historical hash vocabulary where key names are part of the digest.
Render and skeleton hashes keep left-first/right-second serialization. This
prevents duplicate library entries, broken public mirrors, and cold choreo-card
caches after deployment.

## Migration order

1. Correct the canonical glossary and MCP definition tests.
2. Add `HandSide` to `@tka/tka-types`; migrate `Motion` and `Step` contracts.
3. Add one pure legacy normalizer at the sequence-data boundary.
4. Migrate app and package internals to left/right only.
5. Preserve QR, legacy URL, content-hash, and cache byte contracts with focused
   parity tests.
6. Migrate persisted field names and static metadata while retaining legacy
   readers.
7. Run the repository-wide type check, focused unit/integration suites, MCP
   lookup proof, QR round trips, choreo-card render hydration, and default/custom
   palette render verification.

## Protected invariants

- A canonical-palette pictograph renders exactly as before: left blue, right red.
- A custom palette recolors every representation of the same hand consistently.
- Existing QR codes, short codes, saved sequences, public sequences, PNG imports,
  and choreo-card payloads still open.
- Existing sequence content hashes do not change for identical motion content.
- Solo choreography remains hand-agnostic until assigned; `authoredHand` remains
  explicit metadata and aliases the canonical `HandSide` type.
- Mirroring, swapping hands, and swapping palette colors are separate operations.

## Verification matrix

| Boundary | Required proof |
| --- | --- |
| Canonical MCP | `get_term_definition(blue/red)` returns left/right only |
| Core types | builder and guard tests reject color-keyed canonical steps |
| Legacy objects | blue/red input normalizes to left/right with no data loss |
| QR | historical fixtures decode; re-encode is byte-identical |
| Short codes | embedded and compact payload fixtures hydrate identically |
| Persistence | owner/public projection normalization and round-trip tests pass |
| Content hash | before/after hashes match fixed fixtures |
| Choreo cards | render hydration and render-content hashes match fixtures |
| Palette | canonical and custom left/right colors reach props, arrows, and mandala |
| Repository | focused tests plus one full `npm run check` pass |

## Main risks

The migration is cross-cutting, but the dangerous seams are narrow:

1. changing QR or recipe bytes by changing left/right ordering;
2. changing content hashes because object keys participate in JSON digests;
3. dropping legacy Firestore, short-code, or PNG fields before normalization;
4. treating literal blue/red artwork colors as semantic hand identifiers;
5. mechanically assigning a hand to genuinely hand-agnostic solo motion.

Every phase is gated on parity tests for those seams before the next boundary
is migrated.
