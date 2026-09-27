# Notation Archive: Spin Science Attribution and VTG Sourcing — Handoff (2026-07-29)

## Mission

`/test/notation-playable` is a prototype "playable archive" of nine flow-arts
notation systems, 2009–2022. This stretch of work did two things: gave the
Vulcan Tech Gospel tile a hand-driven stepper through VTG V.1's five chapters,
and then followed a claim of Austen's ("the shape matrix IS vtg") to primary
sources, which turned out to be true, publishable, and to expose two factual
errors we had already shipped.

The shared data layer is `src/lib/shared/notation/notation-catalog.ts`, which
**production `/notation` also reads**. Changes there are live-facing, not
prototype-only.

Related: `.claude/rules/verify-at-canonical-source.md`, `no-fabrication.md`.

---

## Done — verified

### 1. VTG artifact treatments, side by side (`438ca4c8ff`)

Five candidate displays at real measured tile size, plus 17 figure plates
cropped from the source PDFs.

Evidence: `ls static/images/notation/vtg/figures/*.webp | wc -l` → **17**,
`du -sh` → **2.0M**. Route `src/routes/test/notation-vtg-options/` exists.

### 2. The Vulcan tile becomes VTG's own timeline (`cbbf048829`)

Auto-fade replaced with a `role="tablist"` stepper over VTG V.1's five
chapters; VTG rendered as a **span** (2010–2011) on the archive's 2009–2022
rail; the dated decade list moved into the detail view.

Evidence: `src/routes/test/notation-playable/_components/VtgChapterStepper.svelte`,
`_lib/vtg-chronicle.svelte.ts`. Verified in-browser at 3840 / 1920 / 1440 /
960×412 / 375 during the session (Chrome DevTools MCP, `emulate`).

### 3. Spin Science credited, VTG connection stated (`3497ef2f80`)

Production `/notation/shape-matrix` rewritten to name Spin Science, quote
Nichols' own gloss, cite page 32, and carry four outbound credit buttons.
Catalog `lorq` entry gained sub-works and `explore`. New contract test pins the
no-relationship exception at exactly one entry.

Evidence: `npx vitest run tests/unit/notation-roots-remediation-contract.test.ts`
→ **14 passed**. Credit buttons hold 4/2/1 per row with no orphan at 3840 /
1920 / 1440 / 375.

### 4. Link set pinned (`33d9953e45`)

All four Spin Science links verified live; `/store` → `/store/` to skip a 301.

Evidence, `curl -o /dev/null -w '%{http_code}'` on 2026-07-29:

```
http://spinscience.xyz/                      200
http://spinscience.xyz/work/                 200
http://spinscience.xyz/2014/07/10/...rework/ 200
http://spinscience.xyz/store                 301 -> /store/ 200
https://sirlorq.wordpress.com/tech-tiles/    200
```

### 5. Two shipped falsehoods removed (`442d42e420`)

Extracted the VTG V.1 PDF text directly (`pdfjs-dist/legacy`, 13 pages). Name
census over the whole document:

```
Lorq 0   Nichols 0   Campbell 0   Jordan 0
Thompson 1   Cantor 2   Drexler 1   Nope 1   Sterns 1   Stearns 0
```

Fixed, all three:

- **Catalog `vtg.people` had Lorq Nichols inside V.1.** He is not in it.
- **`vtg-chronicle.svelte.ts` credited a "Jordan Campbell"** for Transition
  Theory. That name appears nowhere in the document. It was invented.
- **Forest Sterns**, per his own cover credit, not Stearns.
- Alt text on `/notation/shape-matrix` described his diagram's axes backwards.
  His own 2014 caption: *"the driving style of the left hand (columns) paired
  with a driving style of the right hand (rows)."* We had it reversed.

Evidence: contract tests **14 passed** after the change.

The V.1 contents page, verbatim, for anyone re-checking:

```
Transition Theory ........... Noel Yee and David Cantor          1
Minimal Beat Shapes ......... Brian Thompson                     2
Necessity of 40 Patterns .... Noel Yee                           3-4
TRANSITIONS BETWEEN SHAPES .. David Cantor                       5-8
3D HYBRID SHAPES ............ Maiki Nope, Ben Drexler, Noel Yee  9
```

---

## Believed done — unverified

- **Nothing is pushed.** All five commits are local. `git log origin/main..HEAD`
  showed 7 ahead at handoff time (mine plus another session's).
- The **Etsy shop** link (`https://www.etsy.com/shop/SpinScience`) returns 403
  to curl. Bot-block, not necessarily dead. It is **not** in the shipped page;
  verify in a real browser before adding it.
- `www.thevulcan.org`, cited inside VTG V.1 itself as the collective's own
  site, is dead on both schemes. Wayback was rate-limited before snapshots
  could be checked. Unknown, not confirmed gone.

---

## In flight

Nothing of mine is uncommitted. `git status --short` over
`src/lib/shared/notation/`, `src/routes/(public)/notation/`,
`src/routes/test/notation-playable/`, `src/routes/test/notation-vtg-options/`
and `static/images/notation/` was clean at handoff.

**On `main`, in the primary checkout.** No branch, no worktree.

Other sessions are live in this tree. At handoff they held
`src/lib/features/write/**`, `tests/unit/sheet-*.test.ts`,
`src/routes/notation/qft/+page.svelte`, and
`src/lib/shared/transitions/view-transition-name-registry.ts`. **Those are not
yours.** A failing `sequence-viewer-shell-contract` scan test and a
`transportRow` type error in the qft route both belong to other sessions and
were deliberately left alone.

---

## Loose ends (ranked)

1. **Austen emails Lorq Nichols** at the address on Lorq's own contact
   page. A full draft is in the session transcript; the ask is one question:
   *did I get the lineage right?* This is on the critical path, see Gotchas.
2. **Decide `static/notation/lorq-144-shape-matrix.webp`.** His actual poster
   art, self-hosted, sitting beside our own rendering of the same space. The
   agreed sequence is: **pull the image, push the page, then email** — the page
   needs no permission without it. One file, fully separable.
3. **Retry Wayback on `www.thevulcan.org`.** If anything survives, it is the
   Vulcan Lofts' primary self-description and exists nowhere else.
4. **Delete unused option-page figures** (~2MB of the 17) once a VTG treatment
   is final. Candidate A still imports `VtgMinimalBeatShapes.svelte`, so that
   component cannot be deleted while `/test/notation-vtg-options` exists.
5. **Open question Austen has not answered:** should the archive tile read
   "2010–2011" rather than "2010"? My position: 2010 is sourced as the creation
   year, and the span plus the dated list already carry the range. Changing it
   edits the shared catalog that production reads.
6. Original archive loose ends, unstarted: Trochoid model + Unit Circle Theory
   explainers; PoiNotation as a pattern (blocked on sourcing); 9-Square "fan out
   a little more prettily"; Lorq matrix small-tile legibility; production
   integration of the archive itself.

---

## Decisions already made

Do not re-litigate these.

- **Do not push.** Standing for this whole stretch of work.
- **No branches, no worktrees.** Work on `main` in the primary checkout.
- **Scoped commits only:** `git commit -m "..." -- <paths>`. The index is
  shared with live sessions.
- **Keep the page name "Shape Matrix"** (Austen, 2026-07-28, choosing "Keep the
  name, credit Spin Science hard"). It is Nichols' own printed title, so keeping
  it credits him; renaming to "Spin Science" would put his brand on our tool
  while removing his term.
- **Imagery: "Ask him first"** (Austen, 2026-07-28).
- **No relationship claims between notation systems** without primary-source
  evidence on both sides. The Lorq/VTG link is the **single** documented
  exception and is pinned by test.
- Austen, 2026-07-28: *"the shape matrix IS vtg. it's just that spin science as
  a whole took it way further."* Sourcing confirmed the publication fact and
  refined the chronology: he is **not** in V.1 and joins the lineage after it.

---

## Gotchas

**The http:// links are deliberate.** `spinscience.xyz` has an expired
certificate, so `https://` fails outright with an interstitial. This runs
against `.claude/rules/clickable-links.md`, which makes https the default for
everything we hand out. There is a comment in the page saying so. **Do not
"fix" them.** The catalog's `sources` array is https-only by test contract,
which is why the live site is linked from the page and not from the catalog.

**Our page is the only place on the public web** asserting Nichols is a VTG
author. Noel Yee's own pages, Flow Arts Institute, and DrexFactor's tech
history all omit him. Being the sole public source is a different posture than
repeating a known fact. It is also the strongest argument for the email: he is
simultaneously the only confirmation available and the only holder of the
missing evidence.

**One quote is permanently unrecoverable.** Nichols' December 2012 post
thanking *"all the Vulcan Tech Gospel crew: Noel Yee, Brian…"* is cut mid-name.
Dead ends already tried, do not repeat them: Wayback CDX (no capture of any
2012 sirlorq.com post), Wayback availability API (`"archived_snapshots": {}`),
Common Crawl CC-MAIN-2013-20 (`No Captures found`). Self-hosted WordPress on a
lapsed domain, first crawled Oct 2013. The surviving trackback on
`sirlorq.wordpress.com/tech-tiles/` is the only fragment.

**A tempting connection that must stay out.** Brian Thompson's V.1 chapter
"Minimal Beat Shapes" enumerates ten shapes and is recognisably the ancestor of
Nichols' driving-style enumeration. **No source states this.** Writing it would
be exactly the invented-lineage move the catalog exists to prevent. One page
number of real evidence beats any resemblance.

**A subagent claim that did not survive checking.** A research agent reported
"two distinct twelves" (a separate Feb 2012 club/three-plane driving-style set)
and recommended disambiguating the catalog. His 2012 archive contains no such
post, site search finds nothing, and the agent's own final summary dropped the
claim. The 2014 post enumerates *"12 Even-Petaled Driving Styles (in wall
plane)"* across 1:1, 1:3, 1:5. One twelve. The catalog was right. Do not "fix"
it.

**Environment.** A vite dev server on **:5175** serves these prototype routes
(verified 200 at handoff). It is required: the routes postdate the manifests of
the servers on 5173 and 5174, so `/test/notation-playable` silently redirects to
`/create/construct` on those. **:5173 is Austen's — never touch it.**

**Screenshots.** Use `emulate` with `<w>x<h>x1`, never `resize_page`; the shared
browser tab carries 90% zoom, so OS-window resizing produces wrong CSS widths
(3456 emulated read as 3840 CSS).
