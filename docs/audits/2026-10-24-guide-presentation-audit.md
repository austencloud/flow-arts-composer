# Guide presentation audit, 2026-10-24

Every guide page was measured at ten sizes before and after this pass: iPhone SE 375x667, Z Fold6 cover 412x915, Fold inner 707x772 and 823x600, 1024x768, 1366x768, 1920x1080, 2560x1440, and 4K at 1x and 2x. A page/size pair counts as bad when the page scrolls or a screen's content has to pan.

## Before and after

- Before: 531 of 540 page/size pairs scrolled or panned (54 pages, 10 sizes).
- After: 5 of 540.
  - `/guide/codex` scrolls at 375x667 and 823x600. It is a redirect stub with one pointer screen and was left alone.
  - `/guide/motion-paths` screen 2, the interactive explorer, pans inside its screen at 375x667, 707x772 and 1366x768. The explorer keeps its own layout when its room is under 560 px tall; at 1366x768 that room is 368 px.

"Screens" in the After column is the range of screens the page shows across the ten sizes. A count of 0 means the page fits as one frame with no screen stepper.

## Pages

| Page | Sense findings | Small (375, 412, Fold 707) | Medium (Fold 823x600, 1024, 1366) | Large (1920, 2560, 4K) | Severity | Fix | Before | After |
|---|---|---|---|---|---|---|---|---|
| /guide | Lead and pictographs line read like a brochure; rows were links in a list. | fits | fits | fits | High | Three drill-down screens with box rows; lead reworded. | 10/10 sizes scroll or pan; phone page 3687px | 0/10 sizes; screens 3-3 |
| the-grid | Definitions of the three point types sat under the figure; hand line breaks. | fits | fits | fits | High | Figure and definitions on their own screens; mid-sentence breaks joined. | 10/10 sizes scroll or pan; phone page 2524px | 0/10 sizes; screens 2-3 |
| hand-placements | Missing space in 'mirrored.Red'; definitions came after the figures. | fits | fits | fits | High | Each placement defined before its figures; one to four screens by tier. | 10/10 sizes scroll or pan; phone page 3065px | 0/10 sizes; screens 0-4 |
| hand-motions | Captions broken mid-phrase ('Move to an / adjacent point'). | fits | fits | fits | High | Moves, then combinations, a screen each; captions wrap naturally. | 9/10 sizes scroll or pan; phone page 2601px | 0/10 sizes; screens 2-4 |
| hm-type1 | Key explained after the first example. | fits | fits | fits | High | The key first, then one screen per mode. | 10/10 sizes scroll or pan; phone page 3073px | 0/10 sizes; screens 3-5 |
| hm-gamma | One line sat under the wrong example; 'sequence' for 'sequences'; tagline shown twice; switch example trailed Quarter-Same. | fits | fits | fits | High | Quarter-Same text under its example; tagline once; one screen per example. | 10/10 sizes scroll or pan; phone page 3607px | 0/10 sizes; screens 3-7 |
| hm-type2 | Lead-ins for the third and fifth examples were absorbed into the card before. | fits | fits | fits | High | Reworded; each example introduced on its own screen. | 10/10 sizes scroll or pan; phone page 3282px | 0/10 sizes; screens 3-6 |
| hm-type34 | Third paragraph mixed notes with an intro. | fits | fits | fits | Medium | Split by lead-in rule; one screen per example. | 10/10 sizes scroll or pan; phone page 3418px | 0/10 sizes; screens 0-6 |
| hm-type56 | Fourth paragraph trailed the wrong card. | fits | fits | fits | Medium | Lead-in attaches to the next card; one screen per example. | 10/10 sizes scroll or pan; phone page 5290px | 0/10 sizes; screens 6-12 |
| staff-placements | Table overflowed on phones. | fits | fits | fits | High | Table fits the screen; one placement per phone screen. | 10/10 sizes scroll or pan; phone page 3223px | 0/10 sizes; screens 2-5 |
| staff-motions | Long page of strips. | fits | fits | fits | Medium | One strip per screen below large. | 10/10 sizes scroll or pan; phone page 4306px | 0/10 sizes; screens 4-8 |
| negative-space | Prose written for print, not for saying aloud. | fits | fits | fits | High | Reworded; one screen per idea. | 10/10 sizes scroll or pan; phone page 3791px | 0/10 sizes; screens 2-7 |
| base-letters | Hand line breaks. | fits | fits | fits | Medium | One letter group per screen. | 10/10 sizes scroll or pan; phone page 3127px | 0/10 sizes; screens 2-6 |
| codex | Placeholder page that only links to the Codex. | fits | fits | fits | Low | One pointer screen. | 10/10 sizes scroll or pan; phone page 2166px | 0/10 sizes; screens 0-0 |
| codex-2 | Placeholder page that only links to the Codex. | fits | fits | fits | Low | One pointer screen. | 10/10 sizes scroll or pan; phone page 2166px | 0/10 sizes; screens 0-0 |
| lt1-abc-ghi | Reads in order. | fits | fits | fits | Medium | One word group per screen. | 10/10 sizes scroll or pan; phone page 4733px | 0/10 sizes; screens 6-7 |
| lt1-dj-ek-fl | Reads in order. | fits | fits | fits | Medium | One word group per screen. | 10/10 sizes scroll or pan; phone page 4715px | 0/10 sizes; screens 4-9 |
| lt1-mp-nq-or-stuv | STUV paragraph trailed the OR card; print phrasing. | fits | fits | fits | High | Reworded; STUV introduced on its own screen. | 10/10 sizes scroll or pan; phone page 4741px | 0/10 sizes; screens 5-10 |
| lt1-gamma-words | Reads in order. | fits | fits | fits | Medium | One word group per screen. | 10/10 sizes scroll or pan; phone page 4947px | 0/10 sizes; screens 0-8 |
| lt2-wxyz | Print phrasing. | fits | fits | fits | High | Reworded; one screen per pair. | 10/10 sizes scroll or pan; phone page 3765px | 0/10 sizes; screens 3-9 |
| lt3-dash-letters | Hand line breaks. | fits | fits | fits | Medium | One screen per letter group. | 10/10 sizes scroll or pan; phone page 3203px | 0/10 sizes; screens 3-9 |
| lt456-phi-psi-lambda | Reads in order. | fits | fits | fits | Medium | One screen per letter. | 10/10 sizes scroll or pan; phone page 3031px | 0/10 sizes; screens 3-6 |
| words | Hand line breaks in every paragraph. | fits | fits | fits | Medium | Breaks joined; one screen per idea. | 10/10 sizes scroll or pan; phone page 4125px | 0/10 sizes; screens 3-8 |
| permutations | Tagline shown twice; 'complimentary' typo; forced breaks; intro crowded the first figure. | fits | fits | fits | High | Intro rewritten and on its own screen on a laptop; one LOOP type per screen. | 10/10 sizes scroll or pan; phone page 4154px | 0/10 sizes; screens 0-6 |
| reversals | Reads in order. | fits | fits | fits | Medium | One reversal type per screen. | 10/10 sizes scroll or pan; phone page 3613px | 0/10 sizes; screens 0-10 |
| examples-abc | Lead-ins for examples 5 to 7 and 9 sat under the wrong card. | fits | fits | fits | High | Lead-ins attach to their example; one example per screen. | 10/10 sizes scroll or pan; phone page 3880px | 0/10 sizes; screens 3-7 |
| examples-cccc | Fifth paragraph's lead-in sat under the wrong card. | fits | fits | fits | Medium | Lead-in attaches to its example. | 10/10 sizes scroll or pan; phone page 4129px | 0/10 sizes; screens 4-6 |
| examples-acac | Lead-ins for examples 5, 6 and 8 sat under the wrong card. | fits | fits | fits | High | Lead-ins attach to their example. | 10/10 sizes scroll or pan; phone page 3645px | 0/10 sizes; screens 3-8 |
| misc-permutations | Second paragraph's label absorbed into a card. | fits | fits | fits | Medium | Label kept with its figure. | 10/10 sizes scroll or pan; phone page 2929px | 0/10 sizes; screens 3-3 |
| gamma-loops | Reads in order. | fits | fits | fits | Medium | One example per screen. | 10/10 sizes scroll or pan; phone page 3143px | 0/10 sizes; screens 3-5 |
| type2-loops | Reads in order. | fits | fits | fits | Medium | One example per screen. | 10/10 sizes scroll or pan; phone page 2886px | 0/10 sizes; screens 0-4 |
| sixteen-count | Reads in order. | fits | fits | fits | Medium | One example per screen. | 10/10 sizes scroll or pan; phone page 2597px | 0/10 sizes; screens 2-4 |
| eight-letter-words | Reads in order. | fits | fits | fits | Medium | One example per screen. | 10/10 sizes scroll or pan; phone page 2399px | 0/10 sizes; screens 2-3 |
| prop-reversal-loops | Hand line break mid-sentence. | fits | fits | fits | Medium | One example per screen. | 10/10 sizes scroll or pan; phone page 3215px | 0/10 sizes; screens 3-5 |
| full-reversal-loops | Reads in order. | fits | fits | fits | Medium | One example per screen. | 10/10 sizes scroll or pan; phone page 3001px | 0/10 sizes; screens 3-4 |
| /guide/codex | Redirect to the Codex; out of scope. | 375x667@2 page scrolls | 823x600@2.6 page scrolls | fits | - | None. | 2/10 sizes scroll or pan; phone page 759px | 2/10 sizes; screens 0-0 |
| /guide/eight-step | Pickers sat far below the player on smaller windows. | fits | fits | fits | High | Hands, player, pickers and each timing on their own screens; phones show one box per screen. | 10/10 sizes scroll or pan; phone page 8282px | 0/10 sizes; screens 8-17 |
| /guide/level-2 | Landing page scrolled. | fits | fits | fits | High | Landing and hubs on screens; phone hides topic descriptions. | 10/10 sizes scroll or pan; phone page 1731px | 0/10 sizes; screens 0-2 |
| /guide/level-2/turn-shifts | Long reference pages. | fits | fits | fits | High | Split rules by tier; figures and turn strips scale with the screen. | 10/10 sizes scroll or pan; phone page 3187px | 0/10 sizes; screens 2-5 |
| /guide/level-2/turns-dashes-static | Long reference pages. | fits | fits | fits | High | Split rules by tier; figures and turn strips scale with the screen. | 10/10 sizes scroll or pan; phone page 3548px | 0/10 sizes; screens 2-5 |
| /guide/level-2/glyphs-pads | Long reference pages. | fits | fits | fits | High | Split rules by tier; figures and turn strips scale with the screen. | 10/10 sizes scroll or pan; phone page 2669px | 0/10 sizes; screens 2-5 |
| /guide/level-2/types-1-6-turns | Long reference pages. | fits | fits | fits | High | Split rules by tier; figures and turn strips scale with the screen. | 10/10 sizes scroll or pan; phone page 5317px | 0/10 sizes; screens 0-16 |
| /guide/level-2/s-and-t | Long reference pages. | fits | fits | fits | High | Split rules by tier; figures and turn strips scale with the screen. | 10/10 sizes scroll or pan; phone page 4563px | 0/10 sizes; screens 0-7 |
| /guide/level-2/opening-closing | Long reference pages. | fits | fits | fits | High | Split rules by tier; figures and turn strips scale with the screen. | 10/10 sizes scroll or pan; phone page 4801px | 0/10 sizes; screens 4-8 |
| /guide/level-2/one-one-turns | Long reference pages. | fits | fits | fits | High | Split rules by tier; figures and turn strips scale with the screen. | 10/10 sizes scroll or pan; phone page 4639px | 0/10 sizes; screens 4-5 |
| /guide/level-2/double-turn-shifts | Long reference pages. | fits | fits | fits | High | Split rules by tier; figures and turn strips scale with the screen. | 10/10 sizes scroll or pan; phone page 3131px | 0/10 sizes; screens 2-5 |
| /guide/level-2/double-turn-dashes | Long reference pages. | fits | fits | fits | High | Split rules by tier; figures and turn strips scale with the screen. | 10/10 sizes scroll or pan; phone page 3113px | 0/10 sizes; screens 2-4 |
| /guide/level-2/double-turn-static | Long reference pages. | fits | fits | fits | High | Split rules by tier; figures and turn strips scale with the screen. | 10/10 sizes scroll or pan; phone page 2483px | 0/10 sizes; screens 2-4 |
| /guide/level-2/turns | Long reference pages. | fits | fits | fits | High | Split rules by tier; figures and turn strips scale with the screen. | 10/10 sizes scroll or pan; phone page 2187px | 0/10 sizes; screens 0-2 |
| /guide/level-2/double-turns | Long reference pages. | fits | fits | fits | High | Split rules by tier; figures and turn strips scale with the screen. | 10/10 sizes scroll or pan; phone page 1575px | 0/10 sizes; screens 0-2 |
| /guide/motion-paths | Reference hid behind a <details> disclosure. | 375x667@2 pans on screen 2; 707x772@2.6 pans on screen 2 | 1366x768@1 pans on screen 2 | fits | High | Reference split by tier; explorer fits the screen. | 10/10 sizes scroll or pan; phone page 1965px | 3/10 sizes; screens 6-11 |
| /guide/ratios | A 16,000 px phone page; links to 'One end or two' jumped down the page. | fits | fits | fits | High | One screen per idea; links go to the matching screen. | 10/10 sizes scroll or pan; phone page 16260px | 0/10 sizes; screens 17-52 |
| /guide/three-levels | Letters, VTG and the CAP chooser competed on one page. | fits | fits | fits | High | Each gets its own screen; word buttons scale with the screen. | 10/10 sizes scroll or pan; phone page 7331px | 0/10 sizes; screens 9-14 |
| /guide/zans-diamond | Long page of figures. | fits | fits | fits | High | Phone detaches the words; strips sit beside the canvas. | 10/10 sizes scroll or pan; phone page 5240px | 0/10 sizes; screens 7-14 |

## Known residuals

- The turn pickers on Motion paths and Eight Hand Paths still use dropdowns. They come from the shared TurnNotationControls component, which is outside a guide presentation pass.
- The Motion paths explorer pans on phones, the Fold inner screen and laptop windows 768 px tall.
- Translations still carry the old wording on reworded lines; new English lines have no translation yet.
- No real Z Fold6 was used. Fold sizes were emulated in Chrome at 2.6x.

## Decisions taken

Choices made without anyone to ask, each the option closest to the brief.

1. Figures scale with the screen's fit and prose keeps the site's type size, so text stays readable and pictures fill what's left.
2. Each page holds its current screen in `?screen=N` with a history entry per step, so Back and shared links land on the same screen.
3. The server renders every screen, so search and screen readers get the whole page; after load one screen shows.
4. No swipe gesture: Back, Next and the numbered pills move between screens.
5. Print, book and cover-lab surfaces are out of scope and unchanged.
6. A closing colon (or an explicit attach) makes a line a lead-in that travels with the figure after it.
7. Reworded lines keep their i18n keys; other locales stay as they were until translated. New lines are English only.
8. A phone gives long text its own screen (over 60 characters next to a figure, at most 340 per text screen); a laptop does the same at 280.
9. On a phone the title steps aside after screen 1; below a large window the kicker and tagline do too.
10. When even the smallest figures overflow, the screen's content area pans at 0.8 scale as a last resort rather than shrinking figures below readable size.
11. A step strip sits beside its canvas at 900 px and wider; beside-strips wrap at 96 px cells, and long strips under the canvas use 42 px cells.
12. The guide front page drills down in three screens; its lead and pictographs line were reworded, which also changes the print book's welcome line.
13. Hub and topic rows are boxes; the PDF row drops its description on smaller windows.
14. GuideScreens owns the frame's global rules; the hub link is optional.
15. The Grid, Hand Placements, Type 1 and Staff Placements get page-specific splits by tier.
16. Prospin and Inspin and Three Levels stay off the hub, as before.
17. 4K prose stays at the site type size; figures grow instead.
18. A narrow portrait window (the Fold inner screen) uses the phone tier.
19. Galleries split below the large tier; a large window keeps a figure set together.
20. The Codex pages become one pointer screen each.
21. Level 2 topics use split rules by tier (phone 340/60/60, laptop 560/160/160, large 900/500/500); the phone hides topic descriptions on the Level 2 landing.
22. Motion paths: the reference splits by tier in place of its `<details>` disclosure; the explorer fits the screen when the room is at least 560 px tall; its chips compact under 820 px.
23. GuideFitBox ignores figures parked off screen for offscreen rendering.
24. Zan's Diamond: a phone detaches the words and labels the player screens "Watch: X"; the strip sits beside the canvas; prop icons show below large.
25. Three Levels: a phone detaches words; the letters and VTG get their own screens; "Choose a CAP" is its own screen; word buttons scale with the screen.
26. The LOOPs intro was rewritten; on a laptop the opening words get their own screen when the first figure carries its own text.
27. Eight Hand Paths: pickers sit beside the player only on large windows, with the reading on the screen before; smaller windows give each picker and each timing box a screen; a phone reads each timing's words first; the three hands stay side by side.
28. Ratios: one screen per idea; two level cards and one ends card per phone screen; the phone's ends sum sits in one row; the "One end or two" links go to its screen; stills scale by fit, not zoom.
29. Lines the print sheets broke mid-sentence join on screen when the next word is lowercase (27 places); breaks between sentences, list lines and paragraph gaps stay.
30. English pill labels were written for screens that had no heading of their own (for example "Watch: 1:2 and 2:1", "Both ends: Level 2").
31. The turn pickers' dropdowns (TurnNotationControls, a shared component used by Motion paths and Eight Hand Paths) were left as they are, since changing a shared control is outside a guide presentation pass; reported below.
32. The ratios matrix keeps its sideways slide inside its own area on short windows, which the one-screen rule allows for a grid.
33. Ten locales drop the extra line breaks their translators added to three messages, so every locale carries the same tags as English; the words are unchanged.
34. The explorer's fit threshold stays at 560 px. A test at 420 px changed nothing at 1366x768, where the explorer gets only 368 px of room, so it was reverted.
