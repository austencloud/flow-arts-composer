# VTG Attribution Audit Report

**Date:** 2026-03-16
**Scope:** All files in `packages/vtg-domain/src/data/`
**Verdict:** CONDITIONAL PASS -- mostly accurate, with several issues requiring correction

---

## 1. Summary

The vtg-domain package does a generally good job of attributing contributions to specific people and distinguishing VTG-original content from community extensions and TKA interpretations. However, there are several attribution errors, one significant misattribution in documents.ts, and notable omissions from contributors.ts.

**Issues found:** 7 (2 high severity, 3 medium, 2 low)

---

## 2. Attribution Issues

### ISSUE 1 (HIGH): documents.ts misattributes Transition Theory section of VTG V1

**File:** `documents.ts`, line 29
**What it says:** `"Transition Theory (Noel Yee & David Cantor)"`
**What it should say:** The VTG V1 TOC has two distinct sections:
- "Transition Theory" (page 1) -- per the PDF TOC, this may list Noel Yee & David Cantor as section authors
- "Transitions Between Shapes" (pp. 5-8) -- by David Cantor

However, *Transition Theory as a concept* was co-created by Noel Yee and Jordan Campbell in 2010, per:
- Noel Yee's own website (noelyee.com/transition-theory-with-noel-yee/): "Created by Noel Yee and Jordan Campbell in 2010"
- DrexFactor (2015): "Noel Yee and Jordan Campbell created transition theory in 2010, which settled the core dogma of VTG"
- contributors.ts itself (line 49): "Co-created Transition Theory with Noel Yee (2010)"

The VTG V1 PDF section called "Transition Theory" on page 1 may credit David Cantor as a co-author of that *section's writing*, but the *theory itself* is attributed to Noel Yee and Jordan Campbell everywhere else. The summary conflates the section authorship with the theory's creation. David Cantor's clear contribution is the "Transitions Between Shapes" section (pp. 5-8).

**Recommendation:** Change to: `"Transition Theory section (Noel Yee; theory co-created with Jordan Campbell, 2010), Transitions Between Shapes (David Cantor)"`

---

### ISSUE 2 (HIGH): Lorq Nichols missing from contributors.ts

**File:** `contributors.ts`
**What it says:** Lorq Nichols is not listed as a contributor.
**Why this is wrong:** Noel Yee's own VTG page lists Lorq Nichols as one of the VTG authors. Lorq's own about page (sirlorq.wordpress.com/about-2/) describes how he posted "24 Club Hybrids" in September 2010, then collaborated with Brian Thompson and David Cantor on what became VTG V1. He is referenced extensively in:
- `orientations.ts` (three planes attribution)
- `documents.ts` (Book of P.H.A.T.)
- `external-links.ts` (7 links)

But he has no entry in contributors.ts despite being a named VTG V1 author. His contributions include:
- VTG V1 contributor (mapped club hybrids that catalyzed the document)
- Created the Book of P.H.A.T. (Tech Tiles notation system)
- Formalized the 3 Planes system (Wall, Wheel, Floor)
- Created the Shape Matrix
- Created the Tech Tiles 3D Pattern Player
- Collaborated with Maiki Nope on 3D mapping

**Recommendation:** Add Lorq Nichols to contributors.ts with role "VTG V1 contributor, Tech Tiles and 3 Planes creator"

---

### ISSUE 3 (MEDIUM): Leonardo Icaza, Ronan McLoughlin, Austen Cloud missing from contributors.ts

**File:** `contributors.ts`
**What it says:** None of these people are listed.
**Context:** The file header says it covers "People who created, extended, or significantly contributed to VTG and its surrounding ecosystem." All three are credited in `elemental-model.ts`:
- Leonardo Icaza: popularized the four-element model mapping VTG categories to Earth/Water/Air/Fire
- Ronan McLoughlin: taught the elemental model in video form
- Austen Cloud: added Sun and Moon elements

If the scope of contributors.ts is limited to direct VTG document contributors, these omissions are defensible. But the file header explicitly says "surrounding ecosystem," and the elemental model is presented as part of the vtg-domain package.

**Recommendation:** Either (a) add ecosystem contributors with a distinct role like "ecosystem contributor" or (b) narrow the file header to say "People who directly contributed to VTG documents" and note that ecosystem contributors are credited in their respective data files.

---

### ISSUE 4 (MEDIUM): David Cantor's contributions may be incomplete

**File:** `contributors.ts`, lines 63-69
**What it says:** Two contributions listed:
1. "Co-authored VTG #2 (Beta) with Noel Yee -- a four-petal antispin flower index"
2. "Taught tech poi at the Vulcan Lofts in Oakland, CA"

**What's potentially missing:** Per Lorq Nichols' about page, David Cantor was part of the collaborative discussions that produced VTG V1 (not just V2). The VTG V1 TOC credits "Transitions Between Shapes" to David Cantor. The documents.ts summary does mention this correctly as a separate section. But contributors.ts only credits him for V2, not his V1 section.

**Recommendation:** Add "Contributed 'Transitions Between Shapes' section to VTG V.1" to David Cantor's contributions list.

---

### ISSUE 5 (MEDIUM): Maiki Nope missing from contributors.ts

**File:** `contributors.ts`
**What it says:** Maiki Nope is not listed.
**Why this matters:** VTG V1 p.12 credits "3D Hybrid Shapes" to "Maiki Nope, Ben Drexler, Noel Yee." The documents.ts summary correctly includes this attribution. Noel Yee's website calls Maiki Nope "one that started it all with hoops." Lorq Nichols credits Maiki Nope as inspiring his transition to 3D mapping.

Ben Drexler (DrexFactor) is also missing from contributors.ts despite being credited for the 3D Hybrid Shapes section of VTG V1.

**Recommendation:** Add both Maiki Nope and Ben Drexler to contributors.ts.

---

### ISSUE 6 (LOW): Alien Jon CAP attribution needs nuance

**File:** `contributors.ts`, line 85
**What it says:** "Articulated the CAP (Continuous Assembly Pattern) concept"
**Nuance needed:** The Home of Poi forum and DrexFactor confirm that Alien Jon articulated CAPs as "a way of thinking about movement" and demonstrated them in Encyclo-poi-dia Volume 2. However, the concept of continuous patterns existed in practice before Alien Jon named it. The current phrasing "articulated the concept" is reasonable, but some sources suggest the term/concept evolved communally.

**Assessment:** Current attribution is acceptable. "Articulated" is the right verb (not "invented" or "created"). No change needed.

---

### ISSUE 7 (LOW): Zack Buer entry lacks verification

**File:** `contributors.ts`, lines 135-140
**What it says:** "Created VTG2 visuals for the VTG app"
**Issue:** Web searches found no corroboration for "Zack Buer" specifically. The VTG app credits page on Google Play lists "Zack Boutilier" as a graphics designer (along with Pierre Baudin and Remy Holwick as logo designer). "Zack Buer" may be the same person as "Zack Boutilier" or may be a different person entirely.

**Recommendation:** Verify whether "Zack Buer" is the correct name or if it should be "Zack Boutilier." The VTG app credits list "Graphics Designers: Pierre Baudin and Zack Boutilier" and "Logo Designer: Remy Holwick."

---

## 3. Framework Attribution Verification

| Framework/Concept | Attributed to | Correct? | Notes |
|---|---|---|---|
| VTG V1 compilation | Noel Yee (compiler) | YES | Correctly uses "compiler" not "creator" |
| Transition Theory | Noel Yee + Jordan Campbell (2010) | YES in contributors.ts, NO in documents.ts | documents.ts says "Noel Yee & David Cantor" -- see Issue 1 |
| 3 Planes (Wall/Wheel/Floor) | Lorq Nichols | YES | Correctly attributed in orientations.ts |
| Elemental model (4 elements) | Leonardo Icaza, taught by Ronan McLoughlin | YES | Correctly attributed in elemental-model.ts |
| Sun/Moon elements | Austen Cloud (TKA addition) | YES | Correctly marked as tka-interpretation |
| Book of P.H.A.T. | Lorq Nichols | YES | Correctly attributed in documents.ts |
| Tech Tiles | Lorq Nichols | YES | Referenced in documents.ts summary |
| CAP concept | Alien Jon | ACCEPTABLE | "Articulated" is the right framing |
| VTG V2 | David Cantor + Noel Yee | YES | Correctly attributed |
| VTG app | Michael Caden Pike + Noel Yee | YES | Verified via App Store/Google Play |
| Driving styles | Insignia | UNVERIFIED | Attributed in glossary.ts, but no web evidence found to confirm or deny |
| 3D Hybrid Shapes | Maiki Nope, Ben Drexler, Noel Yee | YES in documents.ts | But Maiki Nope and Ben Drexler are missing from contributors.ts |

---

## 4. Source Type Verification

### "document" sources
All document-sourced claims reference VTG V1 or V2 with specific page numbers. These are verifiable against the PDF. The page references appear consistent (shapes on p.4, transition matrices on pp. 5-7, patterns on pp. 8-11, 3D hybrids on p.12).

### "community" sources
- **Quarter-time categories** (categories.ts): Correctly marked as community extensions, not VTG-original. No specific person attributed, which is appropriate for communal evolution.
- **Elemental model** (elemental-model.ts): Marked as "community" with Leonardo Icaza + Ronan McLoughlin credited. This is reasonable -- it's not in any VTG document, it spread through community teaching.
- **Driving styles** (glossary.ts): Attributed to "Insignia" as community source. Could not verify via web search. Low risk since the entry is a glossary definition, not a core claim.
- **Quarter time** (glossary.ts): Correctly marked as community extension not in VTG V1/V2.

### "tka-interpretation" sources
- **Sun element** (elemental-model.ts): Correctly marked as TKA addition by Austen Cloud.
- **Moon element** (elemental-model.ts): Correctly marked as TKA addition by Austen Cloud.

No instances found where a "tka-interpretation" should actually be "document" or "community", or vice versa.

---

## 5. External Links Verification

| URL | Author Attribution | Type | Status |
|---|---|---|---|
| noelyee.com/about-me/ | Noel Yee | website | Correct |
| noelyee.com/transition-theory-with-noel-yee/ | Noel Yee | website | Correct |
| noelyee.com/vtg-11-necessity-of-40-patterns/ | Noel Yee | website | Correct |
| drexfactor.com/.../vulcan_tech_gospel_vtg_explained | DrexFactor | website | Correct |
| sirlorq.wordpress.com/about-2/ | Lorq Nichols | website | Correct |
| sirlorq.wordpress.com/tech-tiles/ | Lorq Nichols | website | Correct -- title says "VTG Tech Tiles" which matches |
| sirlorq.wordpress.com/book-of-lorq-2/ | Lorq Nichols | website | Correct |
| apps.apple.com/.../vtg-full.../ | (none) | app | Correct |
| play.google.com/.../VTGv3 | (none) | app | Correct |
| templeofpoi.com/.../jordan-campbell/ | Temple of Poi | website | Correct, year 2009 matches |
| encyclopoidia.com/ | (none) | website | Should be attributed to Alien Jon + Zan Moore |
| flowartsinstitute.com/... | Flow Arts Institute | website | Correct |

---

## 6. Missing Attributions Summary

| Person | What they contributed | Where they should appear |
|---|---|---|
| Lorq Nichols | VTG V1 co-author, Tech Tiles, 3 Planes, Shape Matrix, Book of P.H.A.T. | contributors.ts |
| Maiki Nope | 3D Hybrid Shapes section of VTG V1, inspired 3D mapping | contributors.ts |
| Ben Drexler | 3D Hybrid Shapes section of VTG V1, VTG educational videos | contributors.ts |
| Leonardo Icaza | Popularized elemental model for VTG categories | contributors.ts (if ecosystem scope) |
| Ronan McLoughlin | Taught elemental model in video form | contributors.ts (if ecosystem scope) |
| Jon Everett | Video animator for VTG | contributors.ts (minor) |
| Remy Holwick | VTG logo designer | contributors.ts (minor) |
| Pierre Baudin | VTG graphics designer | contributors.ts (minor) |

---

## 7. Overall Assessment

The package demonstrates careful attention to attribution in most areas. The SourcedClaim pattern with sourceType discrimination (document/community/tka-interpretation) is well-designed and mostly correctly applied. The three planes are properly attributed to Lorq Nichols rather than VTG. The elemental model is properly attributed to Leonardo Icaza rather than VTG. Sun/Moon are properly marked as TKA additions.

The two high-severity issues are:
1. **documents.ts conflates "Transition Theory" section authorship with Transition Theory creation** -- Jordan Campbell is the co-creator, not David Cantor
2. **Lorq Nichols is absent from contributors.ts** despite being a named VTG V1 author and the creator of multiple frameworks referenced throughout the package

The medium-severity issues (missing Maiki Nope, Ben Drexler, incomplete David Cantor credits) are gaps rather than misattributions -- no one is credited for someone else's work, but important contributors are simply missing.

No instances were found of:
- Crediting Noel Yee for everything (the package correctly distributes credit)
- Treating VTG as single-author (correctly described as collaborative)
- Attributing Lorq's independent frameworks to VTG (3 Planes correctly credited to Lorq)
- Misattributing community extensions as VTG-original (quarter-time correctly marked as community)
