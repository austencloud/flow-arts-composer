# VTG Domain Package: Final Accuracy Audit

**Date:** 2026-03-16
**Package:** `packages/vtg-domain`
**Scope:** Exhaustive accuracy check + structural separation of elemental model from VTG

---

## Structural Fix: Elemental Model Separated From VTG

The elemental model (Earth, Water, Air, Fire, Sun, Moon) was incorrectly embedded into VTG category data. VTG's creator Noel Yee does not endorse this overlay. The following changes were made:

### 1. `categories.ts` -- `elementalName` field removed

- Removed `elementalName` from the `VTGCategory` interface
- Removed all six `elementalName` values from category entries
- VTG categories now contain only VTG vocabulary

### 2. `elemental-model.ts` -- rewritten with separation framing

- Added prominent file-level comment: "The elemental model is a SEPARATE classification system that maps to VTG categories but is NOT part of VTG itself."
- Added `sourceType` field to `ElementDefinition`: `"community"` for Earth/Water/Air/Fire, `"tka-interpretation"` for Sun/Moon
- Clarified that Sun/Moon are Austen Cloud's unpublished additions
- Each source claim now notes "Community overlay, not part of VTG"

### 3. `cross-domain.ts` -- elemental names removed from output

- `CrossDomainMapping` no longer includes `elementalName`
- `vtgToTKA()` returns only VTG category and TKA letter mappings
- Added file-level comment explaining why elements are excluded

### 4. `index.ts` -- elemental exports clearly separated

- Elemental type and data exports are now in a separate section with comment: "Elemental Model (SEPARATE system, not part of VTG)"

---

## Accuracy Audit Results

### A. Transition Matrices

**Status: VERIFIED (with one unresolvable gap)**

The four transition types (soft, hard, mixed-1, mixed-2) are correctly defined:

- Soft: hand maintains, prop maintains. Preserves arc/loop character.
- Hard: hand reverses, prop reverses. Creates mirror image, preserves arc/loop.
- Mixed-1: hand reverses, prop maintains. Reverses arc/loop character (C-CAP mechanism).
- Mixed-2: hand maintains, prop reverses. Reverses arc/loop character.

Verified against:

- noelyee.com/transition-theory-with-noel-yee/ (Noel Yee, 2010)
- drexfactor.com/weirdscience/2010/09/29/soft_hard_and_mixed_transition_theory (Ben Drexler)

The transition matrix entries (which transition type connects which categories) cannot be verified from web sources alone -- they require the VTG V1 PDF pp. 6-7 which is not machine-readable. The current matrices are internally consistent: changing direction within the same timing = hard, changing timing within the same direction = soft, changing both = mixed. The asymmetry (SO->TS uses mixed-2 while the other three diagonals use mixed-1) is logically sound as the inverse operation.

**Gap:** The exact matrix entries from VTG V1 pp. 6-7 should be verified against a human reading of the PDF.

### B. 144 Pattern Count

**Status: PARTIALLY RESOLVED**

The current code correctly notes the 144 claim from VTG V1 p.12 and honestly documents that the exact multiplication path is unclear: 16 compound shapes x 3 contexts = 48, leaving a factor of 3 unexplained.

Lorq Nichols' system (spinscience.xyz/324-patterns/) separately describes "144 Atomic Hybrids (16 shapes x 3 presentations x TL/SL/LL)" which uses 16 x 3 x 3 = 144. This suggests the VTG V1 claim may use a similar 3x multiplier beyond just the three L-contexts.

**No change made.** The honest uncertainty note in `THREE_D_PATTERN_COUNT` is the right approach until the PDF can be human-verified.

### C. 40 Patterns (10 shapes x 4 categories)

**Status: VERIFIED**

The 10x4 = 40 derivation is confirmed by noelyee.com/vtg-11-necessity-of-40-patterns/. The 10 shapes and 4 categories are correctly listed. The four named extension patterns (Butterfly, Weave, Buzzsaw, Corkscrew/Windmill) are standard community names.

### D. Contributor Accuracy

| Contributor            | Status             | Notes                                                                                                                                                                                                                       |
| ---------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Noel Yee**           | VERIFIED           | Compiled VTG V.1, co-created Transition Theory with Jordan Campbell (2010), part owner and founder of FireDrums, co-founded Flow Arts Institute, IJA board member. Source: noelyee.com/about-me/                            |
| **Jordan Campbell**    | VERIFIED           | Co-created Transition Theory with Noel Yee (2010). Source: noelyee.com/transition-theory-with-noel-yee/, templeofpoi.com artist profile                                                                                     |
| **David Cantor**       | VERIFIED           | "Tankboy" alias confirmed. Co-authored VTG #2 with Noel Yee. Taught at Vulcan Lofts. Source: drexfactor.com VTG Explained, noelyee.com/instruction/vulcan-tech-gospel/                                                      |
| **Brian Thompson**     | PARTIALLY VERIFIED | Confirmed as Vulcan Studios resident since 2009, multi-prop instructor. "Minimal Beat Shapes" attribution in VTG V1 can only be confirmed by reading the PDF directly. Source: flowartsinstitute.com/september-instructors/ |
| **Alien Jon**          | VERIFIED           | Created Encyclo-poi-dia Vol 2 with Zan Moore. Explained/popularized CAP concept. Changed "articulated" to "popularized and explained" since attribution of invention is uncertain.                                          |
| **Forest Sterns**      | VERIFIED           | Cover artwork for VTG V.1. Confirmed by PDF title: "Cover Artwork by: Forest Sterns"                                                                                                                                        |
| **Michael Caden Pike** | VERIFIED           | VTG v3 app developer. Also created Poi LAB, Double Staff LAB, Hoop Twinz LAB. Source: Google Play developer page                                                                                                            |
| **Zack Boutilier**     | UNVERIFIABLE       | No web evidence found connecting Zack Boutilier to VTG2 visuals. The VTG app credits page is not publicly accessible. Keeping entry but noting it cannot be independently verified.                                         |
| **Maiki Nope**         | VERIFIED           | Co-authored 3D Hybrid Shapes section. Confirmed by sirlorq.wordpress.com VTG 3D page and noelyee.com/instruction/vulcan-tech-gospel/                                                                                        |
| **Ben Drexler**        | VERIFIED           | DrexFactor, extensive VTG documentation. drexfactor.com/about confirms 11M+ YouTube views, 100K+ subscribers. "500+ blog entries" cannot be precisely verified but is plausible.                                            |
| **Lorq Nichols**       | VERIFIED           | Created Tech Tiles, Shape Matrix, 324 Patterns, 144 Atomic Hybrids, 27 Arm Path Theory. Source: sirlorq.wordpress.com, spinscience.xyz                                                                                      |
| **Leonardo Icaza**     | PARTIALLY VERIFIED | @poidanceflow attribution is in project memory but no web results confirm the elemental model attribution. Widely cited in flow arts community but specific web evidence is sparse.                                         |
| **Ronan McLoughlin**   | UNVERIFIABLE       | Taught elemental model in video form -- no web evidence found to confirm. Keeping entry based on community knowledge.                                                                                                       |
| **Austen Cloud**       | N/A                | Project creator, claims are first-party.                                                                                                                                                                                    |

### E. Glossary Accuracy

| Term                       | Status       | Fix Applied                                                                                                                                    |
| -------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| together                   | CORRECT      | --                                                                                                                                             |
| split                      | CORRECT      | --                                                                                                                                             |
| same                       | CORRECT      | --                                                                                                                                             |
| opposite                   | CORRECT      | --                                                                                                                                             |
| downbeat                   | UNVERIFIABLE | VTG V1 PDF needed to confirm "south/bottom" is the specific reference point. Keeping as-is since it's consistent with community understanding. |
| snapshot                   | CORRECT      | Matches VTG V1 section title "Snapshots/Prop Facing"                                                                                           |
| VTG Trinity                | FIXED        | Was "trivium" -- VTG uses "Trinity" per flowartsinstitute.com/yee-vtg/. Updated term, aliases, and definition.                                 |
| pattern                    | CORRECT      | --                                                                                                                                             |
| minimal beat shape         | CORRECT      | --                                                                                                                                             |
| soft/hard/mixed transition | CORRECT      | Refined soft/hard definitions to say "hand and prop" not just "both props"                                                                     |
| arc/loop                   | CORRECT      | --                                                                                                                                             |
| quarter time               | CORRECT      | Correctly marked as community extension                                                                                                        |
| driving style              | CORRECT      | Correctly attributed to Insignia                                                                                                               |

### F. Source Attribution

| File               | Status  | Notes                                                                                                            |
| ------------------ | ------- | ---------------------------------------------------------------------------------------------------------------- |
| categories.ts      | CORRECT | VTG V1 p.5 for original four; community for quarter-time                                                         |
| transitions.ts     | CORRECT | VTG V1 pp. 5-7                                                                                                   |
| patterns.ts        | CORRECT | VTG V1 pp. 3-4, 8-11                                                                                             |
| hybrids.ts         | CORRECT | VTG V1 p.12 for 3D shapes; VTG2 Index for hands-vs-poi                                                           |
| shapes.ts          | CORRECT | VTG V1 p.4                                                                                                       |
| glossary.ts        | CORRECT | Mixed sources, all appropriately labeled                                                                         |
| elemental-model.ts | CORRECT | Community for Earth/Water/Air/Fire, tka-interpretation for Sun/Moon                                              |
| documents.ts       | FIXED   | Transition Theory attribution was "Noel Yee & David Cantor", corrected to "Noel Yee & Jordan Campbell"           |
| contributors.ts    | FIXED   | FireDrums: "co-founded" -> "part owner and founder". Alien Jon CAP: "articulated" -> "popularized and explained" |

### G. Cross-Domain Mappings (VTG to TKA)

**Status: VERIFIED**

After removing elemental names, the letter mappings are:

- SS (Split Same) -> A, B, C (alpha to alpha, same direction)
- TS (Together Same) -> G, H, I (beta to beta, same direction)
- SO (Split Opposite) -> J, K, L (alpha to beta, opposite direction)
- TO (Together Opposite) -> D, E, F (beta to alpha, opposite direction)
- QS (Quarter Same) -> S, T, U, V (gamma, same direction)
- QO (Quarter Opposite) -> M, N, O, P, Q, R (gamma, opposite direction)

These are consistent with TKA's letter-type definitions.

---

## Remaining Gaps (Require Human Verification)

1. **Transition matrix entries (pp. 6-7):** The specific transition types connecting each pair of categories should be verified by a human reading VTG V1 pp. 6-7.
2. **144 pattern derivation (p.12):** The multiplication factor beyond 16x3=48 is unclear from available sources.
3. **Zack Boutilier:** No independent web verification found.
4. **Brian Thompson "Minimal Beat Shapes":** Section attribution in VTG V1 can only be confirmed from the PDF.
5. **Leonardo Icaza elemental model:** Community knowledge but sparse web evidence.

---

### Earlier accuracy-pass provenance

Merged from [vtg-accuracy-audit.md](../archive/swarm-2026-10-14/reference/vtg-accuracy-audit.md) (original directory: `docs/reference/`) on 2026-10-14.

The initial pass used the extracted VTG V1 PDF text and
`docs/reference/vtg-wiki-harvest.json` alongside its cited websites. It distinguished
VTG V1 section authorship from the theory's creators, and noted the original
club-spinning context of the minimal beat shapes. Those are source-context
questions; the final audit's correction record above remains the outcome.

Its coverage inventory also recorded snapshots only in the glossary, scattered
origin/history material, no dedicated ground-versus-center reference model, and
older app-version credits beyond the captured Michael Caden Pike version.
These describe the March inventory, not newly established current defects.
The initial pass's unsupported multiplication from 48 to 144 and sparse public
support for elemental-model attribution remain covered by the gaps above.

### Earlier attribution-pass citations and uncertainties

Merged from [vtg-attribution-audit.md](../archive/swarm-2026-10-14/reference/vtg-attribution-audit.md) (original directory: `docs/reference/`) on 2026-10-14.

The initial attribution report cites `sirlorq.wordpress.com/about-2/` for Lorq's
September 2010 club-hybrid collaboration with Brian Thompson and David Cantor;
`noelyee.com/transition-theory-with-noel-yee/` for the theory's Yee/Campbell
credit; and the VTG V1 contents for Cantor's "Transitions Between Shapes"
section and the Maiki Nope/Ben Drexler/Noel Yee "3D Hybrid Shapes" credit.
These preserve the report's citation trail and were not re-browsed in this
consolidation.

It also records uncertainty over the older "Zack Buer" name versus "Zack
Boutilier", the scope of direct-document versus wider community contributor
lists, and ancillary app credits for Kevin (NCK), Jon Everett, Remy Holwick and
Pierre Baudin. The final audit's unverifiable-name disposition remains in force.
Its proposed elemental-model contributor treatment predates the structural
separation recorded above and does not undo that separation.

## Files Modified

- `packages/vtg-domain/src/data/categories.ts` -- removed elementalName
- `packages/vtg-domain/src/data/elemental-model.ts` -- rewritten with separation framing
- `packages/vtg-domain/src/data/documents.ts` -- fixed Transition Theory attribution
- `packages/vtg-domain/src/data/glossary.ts` -- trivium->Trinity, refined transition defs
- `packages/vtg-domain/src/data/contributors.ts` -- FireDrums phrasing, Alien Jon CAP phrasing
- `packages/vtg-domain/src/reference/cross-domain.ts` -- removed elemental from output
- `packages/vtg-domain/src/index.ts` -- separated elemental exports

**Build status:** Clean (0 errors)
