> Archived 2026-10-14: Superseded scope is retained in `docs/superpowers/specs/archived/2026-07-26-notation-catalog-design.md`; later playable-archive handoff remains open with notation extensions and acceptance work.

# /notation catalog — device polish handoff (2026-07-27)

> [!IMPORTANT]
> This layout brief was superseded on 2026-07-27 after Austen rejected the
> scrolling document model. Preserve its sourcing and verification evidence,
> but do not execute the Agent A or Agent B layout assignments. Continue from
> [`2026-07-27-notation-playable-archive-handoff.md`](./2026-07-27-notation-playable-archive-handoff.md).

Two agents, in order. **Agent A makes it stunning at 4K. Agent B, after A lands,
makes it stunning on an iPhone SE.** Austen's framing, 2026-07-27: these
*"require completely unique approaches in order to optimally display information
for the user who might be using that device."* Do not treat B as A's layout with
smaller numbers. That is exactly the failure being pre-empted.

Shared context is in **Mission**, **Decisions**, and **Gotchas**. Each agent's
own brief is under **Agent A** and **Agent B**.

## Mission

`/notation` is a chronological catalog of systems for writing flow arts down.
Nine entries, oldest first, every row the same shape, every link out to the
creator's own material. It **explains nothing** by design.

Design spec, including a "What shipped" section recording every delta:
`docs/superpowers/specs/2026-07-26-notation-catalog-design.md`

- Data + sourcing rules: `src/lib/shared/notation/notation-catalog.ts`
- View (all layout lives here): `src/routes/(public)/notation/_components/NotationCatalog.svelte`
- Route + SEO/JSON-LD: `src/routes/(public)/notation/+page.svelte`
- Video card: `src/lib/shared/components/SourceVideoCard.svelte`
- Contracts: `tests/unit/notation-roots-remediation-contract.test.ts`

The page works. It is not yet beautiful on either end of the range. That is the
whole job.

## Done — verified

**1. The catalog shipped and is un-gated — `6316f552c9`.**
Nine entries; `NotationHubDraft.svelte` deleted; `noindex` dropped; JSON-LD
restored; `{ url: "notation" }` back in the sitemap.

Evidence: `curl -sk https://localhost:5173/notation` → `200` containing every
system name. `npx vitest run tests/unit/notation-roots-remediation-contract.test.ts`
→ **12 passed / 12** at that commit. `npm run check` → 3 errors, **all** in
`src/lib/shared/notation/qft/qft-model.ts`, another session's in-flight file
(`M` in git status, untouched here); zero in this diff.

**2. Screenshotted at all seven required viewports** per
`.claude/rules/visual-verification-mandatory.md`: 3840×2160, 2560×1440,
1920×1080, 1440×900, 820×1180, 960×412, 375×667. That pass found and fixed two
real defects:
- A phantom `videos` grid track left ~24px of dead space under all eight rows
  without a strip. Measured before: 72px slack below content on every row;
  after: 47px, which is the row's own bottom padding. Fixed by scoping the
  track to `.row.has-videos`.
- `c. 2010` wrapped to two lines in the year rail (text 222px in a 192px
  column). Fixed by sizing the rail to its widest label; all nine rows now
  start their content at the same x (measured: one distinct `.body` left edge,
  984px at 1920).

**3. Em dashes stripped from all shipped copy — `6435073a28`.**
Four of them, plus three "perfect threes" the `ai-bust` skill flags. Rendered
page now measures **0 em dashes** (`.editorial` innerText); the single en dash
left is `2012–`, a date range. A contract test now fails on an em dash in any
reader-visible field. **13 passed / 13.**

**4. Five Home of Poi threads archived verbatim** to
`E:\flow-arts-wiki\content\sources\homeofpoi\` (wiki repo `a96f00f` plus an
earlier commit). No homeofpoi.com forum topic has **ever** been captured by the
Wayback Machine (checked via the CDX index), so these are the only copy outside
the live site.

All three commits are pushed. `git log origin/main..HEAD` for my paths is empty.

## Believed done — unverified

Nothing in the layout. Every claim above has evidence inline.

One **content** item is explicitly unproven and is flagged in the spec and in
memory: the entry titled *Unit Circle Theory* rests on an inference that Alien
Jon's 2009 "poi unit circle" and the later theory label name the same thing. No
source states it. Neither agent here should touch it; it is not a layout
problem.

## In flight

**Nothing of mine.** Working tree is clean for every file this work touched.

Other sessions have uncommitted work in the tree, including
`src/lib/shared/notation/qft/qft-model.ts` and `src/routes/test/qft-notation/*`.
**Do not stage or commit those.** Use explicit pathspecs
(`.claude/rules/commit-only-your-own-changes.md`). Expect `npm run check` to
report those 3 pre-existing errors; they are not yours and not a blocker.

---

# Agent A — make it stunning at 4K

## What is actually wrong (measured at 3840×2160, `--force-device-scale-factor=1`)

The page is *correct* at 4K and *unremarkable*. It reads as a long ribbon of
uniform paragraphs. Numbers from a live measurement pass:

| Measure | Value | Why it matters |
|---|---|---|
| Band width | 2600px | Capped by `--shell-w`. Matches SiteHeader. |
| Dead rail | **620px each side**, 32% of the viewport | Intentional, matches chrome. Read the gotcha before you fight it. |
| Root font | 24px (ramp working) | Type scaling is *not* the problem. |
| Body measure | **1539px**, ~110 characters | Genuinely hard to read. The longest line on the page. |
| Sources column | 576px wide, **13–40% vertically filled** | 62–229px of unused height in every row. The column earns its width horizontally and wastes it vertically. |
| Video strips | **1 of 9 rows** | Eight rows have no visual event at all. |
| Scroll | 2.5 screens | Uses the vertical, but every screen looks like the last. |

So: the composition problem is no longer dead rail (the third column fixed
that). It is **monotony and an over-long measure**. Nine rows of near-identical
grey paragraph at 110 characters wide, with one strip of video near the middle.

## Your brief

Make a 4K user feel the page was designed for their screen. Concretely, the
things worth exploring:

1. **Break the 110-character measure without capping the band.** Reading
   `.claude/rules/4k-native-layout.md` and `feedback_no_text_max_width`: narrow
   ribbons of text are banned, and no `ch`-capped prose on public pages. The
   escape is not `max-width`. Options: let the records line take a larger type
   size at 4K so 1539px is a *comfortable* measure rather than a cramped one;
   or give the row a second internal column so body and people sit side by side;
   or promote `records` to a display size and let it be the thing you read.
2. **Use the vertical you have.** 2.5 screens at 4K for nine entries is thin.
   A 4K viewer can hold two or three entries in view at once — consider whether
   the row wants more air and more presence rather than less.
3. **Give the sources column something to do vertically.** 576px wide and a
   quarter full is the most obviously wasteful space on the page.
4. **Solve the eight bare rows.** Only 9-Square has video. Padding the others
   with third-party video is **forbidden** by the spec. So the visual variety
   has to come from typography and structure, not from adding media.

## Constraints you must not break

- **The catalog explains nothing.** No explainer sections, no diagrams of other
  people's systems, no comparative framing. That is what got the previous page
  taken down. The contract test enforces it.
- **No new content.** You are not adding entries, video, or copy. If a row
  needs a line to look right, that line needs a source, and you almost certainly
  do not have one.
- **`--shell-w` is site-wide.** See the gotcha below.
- Keep sizes in `rem` so they ride the lockstep root ramp.
- 13/13 contract tests stay green, em-dash guard included.

## Definition of done

Screenshots at 3840, 2560, and 1920 that you would put your name on, plus
1440/820/960×412/375 to prove you did not break the small end (Agent B will
rebuild the small end, but you must not hand over something broken). Numbers
alone are not verification here; the failure mode is aesthetic and only a frame
shows it. `.claude/rules/visual-verification-mandatory.md` is binding.

---

# Agent B — make it stunning on an iPhone SE

**Start after Agent A has landed and pushed**, then re-measure. A's changes will
move these numbers.

## What is actually wrong (measured at 375×667, DPR 2)

| Measure | Value | Why it matters |
|---|---|---|
| Page height | 6314px, **9.5 screens** | Nine entries should not cost nine screens. |
| Row heights | 275–787px | The 9-Square row alone is more than a full screen. |
| Measure | 39 characters/line | Fine. Not your problem. |
| Longest `records` | 273 characters | ~7 lines on a phone. |
| Video thumbs | 148px wide, 2 columns | Small, and captions run 13.6px. |
| `.sources-label` | 11.52px | "READ IT THERE" is near the legibility floor. |
| Tap targets | 44px minimum | Meets the floor. Do not regress it. |
| Horizontal overflow | none | Keep it that way. |

The real failure is **loss of the spine**. On desktop the year rail is the
argument: you see 2009 → 2022 at a glance and the chronology *is* the page. At
375 the rail is hidden and the year moves inline into the heading, so the reader
gets nine long articles in a row with no sense of shape, position, or how much
is left. That is the thing to fix, and it is not a sizing problem.

## Your brief

Ask what a phone reader actually wants from a chronological catalog, then build
*that*, not a squeezed version of the desktop row. Directions worth weighing:

1. **Give the chronology back.** A sticky year, a progress rail, a compact index
   at the top that jumps to entries, a horizontal timeline strip. The reader
   should always know where in 2009–2022 they are.
2. **Consider progressive disclosure.** Nine entries as scannable cards, with
   `records` and sources revealed on tap, turns 9.5 screens into one. Weigh it
   against the catalog's purpose: someone should be able to skim who wrote flow
   arts down in fifteen seconds. Note `.claude/rules/no-checkboxes.md` and
   `clickables-look-like-buttons.md` if you build any control.
3. **Fix the video strip for a phone.** Four 148px thumbnails with 13.6px
   captions is not a phone treatment. One-up cards, a horizontal snap-scroll
   carousel, or a single card plus "all eleven parts" are all more honest.
4. **Raise `.sources-label`** off 11.52px, or drop the label and let the buttons
   speak.

## Constraints you must not break

- Everything in Agent A's constraint list still applies, especially "explains
  nothing" and "no new content."
- **Do not regress the 44px tap-target floor** (`feedback_design_system_mandatory`).
- Do not reintroduce horizontal overflow at 375.
- Whatever you build for the phone must not damage what A built. Both agents
  edit the same component; check the wide viewports before you claim done.

## Definition of done

375×667 frames you would put your name on, plus 820 and 960×412 (wide and
short, kills stacked layouts), plus 1920 and 3840 to prove A's work survived.

---

## Decisions already made

Do not re-litigate these.

- **Catalog, not explainer** (Austen, 2026-07-26): *"framing it as a catalog
  seems more honest and short than trying to explain the previous systems ...
  a little pretentious to try to actually explain QFT."* This is the load-bearing
  decision. Every layout idea that involves teaching a system is out.
- **Uniform rows are the argument.** From the spec: *"a record where every entry
  has the same shape is a record that is not arguing."* No per-entry accent
  colors, no decorative images. **This is in tension with Agent A's monotony
  problem, and resolving that tension is A's actual design work.** Uniform
  structure does not have to mean uniform visual weight. If you conclude the
  rule has to bend, say so out loud to Austen with a frame, do not bend it
  quietly.
- **The TKA row links to `/guide`** and gets no CTA button, because every row
  links to its creator's own material and TKA's is this site. Consistency, not
  a funnel. Enforced by a test.
- **No video strip is padded with third-party coverage** to fill a row.
- **Siteswap is not an entry**, it is one line above the spine.
- **TKA is 2022**, flat (Austen, 2026-07-27). Not "c. 2022".
- **Em dashes are out of shipped copy** and a test enforces it. Austen,
  2026-07-27: *"I really shouldn't have to tell you that."*

## Gotchas

**`--shell-w` is site-wide; do not unilaterally widen it.** It is defined in
`src/app.css` (floor 1720px, fluid 88vw, ceiling 2600px) and shared by
SiteHeader, SiteFooter, `.editorial`, and every public page shell. The 620px
rail at 3840 is that ceiling, and it is the same rail the header has. Widening
it for this page alone desyncs the page from the chrome above it; widening it
globally is a site-wide change that needs Austen's call. If you believe the
ceiling is wrong, that is a conversation, not a patch.

**The lockstep root ramp is already working — do not "fix" type scaling.**
Measured at 3840: root font 24px, `.records` 28.8px, `.year` 62.4px. Screenshots
of a 3840 viewport are downsampled in the tool output, so everything *looks*
half-size in the frame. It is not. Measure before concluding type is too small.

**Reaching a real 3840 viewport** needs Chrome launched with
`--force-device-scale-factor=1` and `resize_page` (page dimensions), **not**
`resize_window`. For 375 use `emulate` with a viewport override; the OS window
has a ~500px minimum width and cannot go that narrow.

**Use Chrome DevTools MCP, not Claude in Chrome, to verify your own diff.**
Own instance, `--user-data-dir=C:\Users\Austen\.claude\chrome-profile`,
`take_screenshot` with `format: "webp", quality: 70`. Claude in Chrome drives
Austen's signed-in window and its screenshots take no quality parameter.

**Port 5173 is Austen's dev server** on the primary checkout, which is where
these files live, so HMR picks up your edits with no server of your own. Never
run `npm run dev`, never kill 5173. If you need your own, `vite --port 5174`,
and reap it before you end the turn (`.claude/rules/resource-budget.md`).

**`npm run check` has 3 pre-existing errors** in another session's
`qft-model.ts`. Do not fix them, do not commit that file, and do not treat them
as your regression. Confirm your own files are absent from the log instead.

**`scripts/component-manifest.json` is generated.** If you add or delete a
component, run `node scripts/component-inventory.mjs` — a contract test reads
that manifest, and a stale entry for a deleted file will sit there otherwise.

**A `.svelte.test.ts` naming footgun exists** in the component-test layer if you
go that route; see `docs/reference/component-testing.md`. Note also
`.claude/rules/component-test-discipline.md`: do not add component tests for
coverage's sake. Neither of these jobs obviously needs one.

**The `.claude/rules/crossfade-primitive.md` warning applies if Agent B builds
progressive disclosure.** AI-written crossfades get variable-height content in a
sized container wrong on the first attempt every time. Use
`$lib/shared/components/Crossfade.svelte` with `fill`, do not hand-roll two
faded siblings.

## Related

- Rules: `4k-native-layout.md`, `visual-verification-mandatory.md`,
  `no-layout-shift.md`, `never-hand-roll.md`, `clickables-look-like-buttons.md`,
  `commit-only-your-own-changes.md`
- Memory: `project_notation_catalog`, `feedback_4k_is_home`,
  `feedback_no_text_max_width`, `feedback_visual_verification_mandatory`
- No expert agent in `.claude/rules/expert-routing.md` owns notation-history
  canon or public-page layout, so no expert file needed updating.
