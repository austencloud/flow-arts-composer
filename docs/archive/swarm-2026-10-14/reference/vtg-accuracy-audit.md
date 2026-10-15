# VTG Domain Package Accuracy Audit

**Date:** 2026-03-16
**Scope:** All files in `packages/vtg-domain/src/data/`
**Method:** Cross-referenced against VTG V1 PDF text (extracted), wiki harvest (`docs/reference/vtg-wiki-harvest.json`), web sources (noelyee.com, drexfactor.com, sirlorq.wordpress.com, flowartsinstitute.com, community forums)

---

## Summary

**Overall: PASS with 6 issues (2 high, 2 medium, 2 low)**

The data files are well-structured and mostly accurate. Source attribution (`document`, `community`, `tka-interpretation`) is used correctly throughout. The two high-severity issues involve misattribution of Transition Theory authorship within the VTG V1 document and a missing Maiki Nope contributor entry.

---

## Issues Found

### ISSUE 1 — Transition Theory attribution in VTG V1 TOC (HIGH)

**File:** `documents.ts` line 29
**Claim:** VTG V1 summary says: `"Transition Theory (Noel Yee & David Cantor)"`
**What the PDF actually says:** The VTG V1 TOC (p.3) reads: `"Transition Theory (Noel Yee and David Cantor)"`
**What community sources say:** Noel Yee and Jordan Campbell co-created Transition Theory in 2010 (per noelyee.com, wiki harvest, DrexFactor).

**Analysis:** The VTG V1 PDF table of contents credits "Noel Yee and David Cantor" for the Transition Theory section, and the `documents.ts` summary correctly reflects this. However, the `transitions.ts` file (lines 1-4) and `contributors.ts` (lines 48-51) credit Transition Theory to "Noel Yee and Jordan Campbell (2010)."

Both are partially correct but describe different things:
- The VTG V1 *document section* on Transition Theory was written/compiled by Noel Yee and David Cantor
- The *theory itself* was co-created by Noel Yee and Jordan Campbell in 2010

The data files conflate these. `transitions.ts` says "Created by Noel Yee and Jordan Campbell in 2010" with `sourceRef: "VTG V1 pp. 5-7"` — but those pages are credited to "Noel Yee and David Cantor" in the PDF. The theory may have been Jordan Campbell's co-creation, but the document section was David Cantor's collaboration.

**Severity:** HIGH — This is the core attribution question for Transition Theory. The data files should distinguish between who created the theory (Yee + Campbell) and who wrote the VTG V1 section about it (Yee + Cantor).

---

### ISSUE 2 — Maiki Nope missing from contributors (HIGH)

**File:** `contributors.ts`
**Claim:** VTG V1 p.12 credits 3D Hybrid Shapes to "Maiki Nope, Ben Drexler and Noel Yee" (per PDF TOC)
**What the data says:** Maiki Nope is not listed in `VTG_CONTRIBUTORS` at all.

**Analysis:** The VTG V1 TOC explicitly credits "3D Hybrid Shapes (Maiki Nope, Ben Drexler and Noel Yee)." The `hybrids.ts` file correctly references VTG V1 p.12 for the 3D shapes, but no contributor entry exists for Maiki Nope. Ben Drexler (aka "Drex" of DrexFactor) is also missing from contributors, though his contributions extend far beyond the VTG V1 document. At minimum, Maiki Nope should have an entry reflecting their credited contribution to the 3D Hybrid Shapes section.

**Severity:** HIGH — Named contributor in the primary source document is completely absent from the contributors list.

---

### ISSUE 3 — Ben Drexler missing from contributors (MEDIUM)

**File:** `contributors.ts`
**Claim:** VTG V1 TOC credits "3D Hybrid Shapes (Maiki Nope, Ben Drexler and Noel Yee)"
**What the data says:** Ben Drexler is not in `VTG_CONTRIBUTORS`.

**Analysis:** Ben Drexler (DrexFactor) is credited on VTG V1 p.3 for the 3D Hybrid Shapes section. He is also one of the most prolific documenters and educators in the VTG ecosystem (500+ blog entries on poi theory). While his broader contributions are community-level rather than document-level, his VTG V1 credit should be captured.

**Severity:** MEDIUM — Named in the PDF but less impactful than the Maiki Nope omission since the 3D section credits three people.

---

### ISSUE 4 — Elemental model attribution lacks verifiability (MEDIUM)

**File:** `elemental-model.ts` lines 42-46, 57-59, etc.
**Claim:** The four classical elements (Earth, Water, Air, Fire) mapping to VTG categories were "popularized by Leonardo Icaza (@poidanceflow, Vancouver BC) and taught in video form by Ronan McLoughlin."
**What web sources show:** Leonardo Icaza has an Instagram account (@poidanceflow) and appeared in the 2012 documentary "The Art of Flow." Ronan McLoughlin is a well-known poi educator. However, no web-accessible source confirms either person specifically created or popularized the Earth/Water/Air/Fire mapping to VTG timing/direction categories.

**Analysis:** The attribution to Leonardo Icaza and Ronan McLoughlin is plausible (both are respected poi educators) but unverifiable from public sources. This is sourced as `"community"` which is appropriate, but the specific attribution within the community source claim may be oral tradition rather than documented fact. The claim is not wrong, but it is not independently verifiable.

**Severity:** MEDIUM — Attribution may be accurate based on community knowledge, but no public source confirms it. At minimum, the source claim should note it is based on community attribution rather than a published source.

---

### ISSUE 5 — 3D hybrid count derivation unclear (LOW)

**File:** `hybrids.ts` lines 437-447
**Claim:** "16 compound 3D shapes x 3 contexts = 48 base combinations. With timing/direction applied, this yields 144 total patterns as stated in VTG V1 p.12."
**What the PDF says:** "When completed in Split L, Together L and Infinite L, these Yield 144 total Patterns."

**Analysis:** The data file lists 16 compound shapes and 3 contexts, stating 16 x 3 = 48 but then jumps to 144. The derivation of 144 from 48 is unexplained. The actual derivation is likely 48 x 3 (for timing/direction variants within each context) = 144, but the code comment says "With timing/direction applied" without being explicit about the multiplier. The VTG V1 PDF just states 144 as the total without showing the arithmetic. This is not wrong, just unclear.

**Severity:** LOW — The total (144) matches the source. The intermediate derivation is fuzzy but not incorrect.

---

### ISSUE 6 — VTG V1 originally focused on clubs, not poi (LOW)

**File:** `shapes.ts` line 4
**Claim:** "The 10 minimal beat shapes that form the building blocks of poi movement."
**What the wiki harvest says:** "VTG V.1 originally focused on clubs, not poi." (Vulcan_Tech_Gospel.wiki, History section)

**Analysis:** The shapes file describes them as "poi movement" building blocks. While VTG is prop-agnostic and these shapes apply to poi, the shapes were originally conceived in the context of clubs (Brian Thompson taught club spinning hybrids). This is a minor framing issue. The `documents.ts` Prop agnosticism section and wiki both note VTG applies to all two-prop spinning.

**Severity:** LOW — The shapes apply to all props including poi. Calling them "poi movement" is not wrong, just not original context.

---

## Specific Accuracy Checks

### Brian Thompson credit for Minimal Beat Shapes
**PASS.** `contributors.ts` line 75: "Contributed Minimal Beat Shapes section to VTG V.1". `glossary.ts` line 116: "(Brian Thompson)". Correctly attributed per VTG V1 TOC.

### Noel Yee AND Jordan Campbell credited for Transition Theory
**PARTIAL.** The *theory* is correctly attributed to both (per community sources). But see Issue 1 — the VTG V1 *document section* credits Noel Yee and David Cantor, not Jordan Campbell. The data files don't distinguish these.

### Maiki Nope credited for 3D Hybrid Shapes
**FAIL.** Not in contributors. See Issue 2.

### Planes attributed to Lorq Nichols
**PASS.** `orientations.ts` lines 119, 132, 145 all credit "Lorq Nichols" via `Book of P.H.A.T.` reference. Correctly sourced as `"document"`.

### Glossary: VTG "loop" vs TKA LOOP
**PASS.** `glossary.ts` lines 199-201 includes explicit disambiguation: "NOTE: This is VTG's arc/loop concept from Transition Theory, NOT the TKA LOOP system (which describes cyclic sequences built from transformation algebra)."

### Year ~2011 for VTG V1
**PASS.** `documents.ts` line 25: `year: 2011`. Consistent with "MORE TO COME SUMMER 2011" on p.13 and VTG2's "October 2011" date.

### Butterfly = TO Extension
**PASS.** `patterns.ts` line 82: Butterfly mapped to `tog-opp` + `extension`. Confirmed by community sources (e.g., sacredflowart.com, homeofpoi.com: butterfly = together opposite extension).

### Weave = SS Extension
**PASS.** `patterns.ts` line 98: Weave mapped to `split-same` + `extension`. Consistent with community usage.

### Buzzsaw = TS Extension
**PASS.** `patterns.ts` line 113: Buzzsaw mapped to `tog-same` + `extension`. Consistent with sacredflowart.com which teaches butterfly and buzzsaw as companion patterns.

### Corkscrew = SO Extension
**PASS.** `patterns.ts` line 129: Corkscrew/Windmill mapped to `split-opp` + `extension`. Confirmed: multiple sources (homeofpoi.com, sacredflowart.com, moodhoops.com) describe corkscrew/windmill as split-opposite extension in different planes.

### Quarter-same/quarter-opp marked as community extensions
**PASS.** `categories.ts` lines 109, 126: Both sourced as `sourceType: "community"` with description noting "community extension beyond the original four VTG categories."

### Elemental model (Earth/Water/Air/Fire) marked as community
**PASS.** `elemental-model.ts`: Four classical elements sourced as `"community"`. (See Issue 4 for attribution detail.)

### Sun and Moon marked as tka-interpretation
**PASS.** `elemental-model.ts` lines 72, 119: Both sourced as `"tka-interpretation"` with `sourceRef: "Austen Cloud"`. Correctly separated from VTG's own claims.

### TKA letter mappings marked as tka-interpretation
**NOT APPLICABLE.** TKA letters appear as `tkaLetters` fields on categories and elements but are not given their own source claims. They're metadata references, not sourced claims, which is appropriate.

### Driving styles attributed to Insignia
**PASS.** `glossary.ts` line 229: "Taxonomy attributed to Insignia." `driving-styles.ts` file header notes "Developed by Insignia." Wiki harvest confirms: "Documented the taxonomy (originally by Insignia)." Sourced as `"community"`.

---

## Source Attribution Review

| sourceType | Count | Assessment |
|---|---|---|
| `document` | ~60 claims | Correctly used for VTG V1/V2 citations |
| `community` | ~8 claims | Correctly used for quarter-time, elements, driving styles |
| `tka-interpretation` | 2 claims | Correctly used for Sun/Moon elements |

No claims are miscategorized between document/community/tka-interpretation, with the exception of the Transition Theory authorship nuance (Issue 1).

---

## Missing Coverage

Checked against wiki harvest sections for the main VTG article:

| Wiki Section | Covered in Data? | Notes |
|---|---|---|
| History | Partial | No dedicated history file. Origin at Vulcan Lofts mentioned in contributor bios. |
| VTG Trivium | YES | `glossary.ts` has "trivium" entry. |
| Timing and Direction | YES | `categories.ts`, `glossary.ts` |
| Snapshots | YES | `glossary.ts` has "snapshot" entry. |
| Pattern (Shape) | YES | `shapes.ts`, `patterns.ts` |
| Transition Theory | YES | `transitions.ts` with full matrix |
| Reference system | Partial | Mentioned in glossary "downbeat" entry. No dedicated file for ground-referenced vs center-referenced distinction. |
| Prop agnosticism | Partial | Mentioned in `documents.ts` summary. No dedicated data structure. |
| Planes | YES | `orientations.ts` |
| Documents | YES | `documents.ts` |
| VTG App | Partial | App links in `external-links.ts` and contributor bios. No dedicated app data structure. |
| Related frameworks | OUT OF SCOPE | CAPs, 9-Square, QFT are separate frameworks. Cross-references exist in TKA letter mappings. |

### Notable gaps:
1. **No VTG app data structure** — The wiki describes multiple app versions (first by Kevin/NCK, animations by Alien Jon, VTG2 visuals by Zack Buer, v3 by Michael Caden Pike). Only Michael Caden Pike's version is captured.
2. **No explicit history/timeline** — The collaborative origin at Vulcan Lofts (~2007-2011) is scattered across contributor bios. A dedicated timeline or history entry would centralize this.
3. **Snapshots only in glossary** — The six snapshots (Tog out, Split out, Tog in, Split in, Tog split, Split tog) from VTG V1 are not enumerated as data. Only a glossary definition exists.
4. **Kevin (NCK)** — The original VTG app developer is not in contributors. Wiki says "First by Kevin (NCK)."

---

## Overall Assessment

The vtg-domain data package is well-organized, accurately sourced, and properly distinguishes between document claims, community extensions, and TKA interpretations. The two high-severity issues (Transition Theory attribution nuance and missing Maiki Nope contributor) should be addressed. The medium-severity issues are worth fixing but don't compromise the package's factual integrity. The low-severity items are cosmetic or pedagogical framing choices.

The pattern name mappings (Butterfly, Weave, Buzzsaw, Corkscrew) are all confirmed correct. The 10 minimal beat shapes match VTG V1 p.4 exactly. The transition matrices align with VTG V1 pp. 6-7. The 3D hybrid shapes and 144 pattern count match VTG V1 p.12.
