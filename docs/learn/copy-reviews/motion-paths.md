# Motion paths

Review state: IMPLEMENTED under delegated editorial approval, September 8, 2026.

Austen requested the AI-bust review and instructed the agent to finish the explanation page without further questions while he was at the park. This supersedes the earlier exact-copy approval checkpoint. It does not claim that Austen personally reviewed the final wording.

## AI-bust review

Applied [.agents/skills/ai-bust/SKILL.md](../../../.agents/skills/ai-bust/SKILL.md) to the page, explorer labels, and new navigation/help links. Result: Clean after tightening indirect phrasing in the third-order section. No banned openers, blacklisted words, em dashes, promotional claims, negative-to-positive flips, or uniform sentence rhythm remain in the delivered copy. Existing code comments were excluded.

The prior draft's per-hand reset description was corrected from inheriting the sequence setting to returning to the current default, matching Composer's implementation.

## Delivered page copy

### Motion paths

The same sequence can draw a different mandala. Pick a path and watch how the hands travel.

The interactive comparison loads in your browser.

### What changes?

A path sets how a hand travels between its positions. The sequence keeps its letters and turns.

**Arc**

The hand follows the circle around the grid center.

**Linear**

The hand takes a straight line between the endpoints.

**Concave**

The hand curves inward between the endpoints.

**Hybrid**

Pro motions use Arc. Anti motions use Concave.

Dashes stay straight. Static hands stay at their grid point, even when the prop rotates. Float uses the underlying fixed path when Hybrid is on.

Pick a matrix cell, then compare Arc with Hybrid. When one hand is pro and the other anti, they follow different kinds of paths. Switch the trace between Hands and Prop tips to see what the prop’s rotation adds.

### Where the setting applies

In the sequence viewer, open Motion on desktop or Playback on a phone. You can also right-click the animation canvas and open Motion Paths. Choose Arc to turn Hybrid off.

**Preview**

A path choice applies to the sequence you’re viewing. It also overrides any saved step exceptions while you compare.

**Restore saved paths**

Returns to the sequence’s saved choices, including its step exceptions.

**Save paths**

Keeps the preview on a sequence already saved in your library that you own.

**Make default**

Sets your starting choice for sequences without a saved path setting. Saved step exceptions still take precedence.

In Composer, select a step to set a different path for either hand. The reset arrow clears that hand’s exception and returns it to the current default.

Path lines are the drawn guides. You can hide them while keeping the same movement.

### The connection to third order

The hand’s path can be a motion of its own. In Third Order, a moving grid carries another sequence. The outer motion moves the grid; the inner sequence moves within it.

Explore extension and antispin by starting with circular travel, then trying a flower as the carrier path. A flower can be built from two rotations before the prop adds its own rotation.

The current Concave option bends an arc inward. It is not an exact four-petal antispin construction. Use the flower carrier in Third Order when you want to work with the constructed path and its spin ratio.

Open Third Order

Spin ratios and petals

Third Order requires sign-in.

### When the drawing works but the motion doesn’t

A mandala shows the whole trace at once. It can hide a sharp change where two steps meet.

Watch those joins in the animation, including the return to the first step. Compare Arc with Concave, then try a per-hand exception in Composer. Keep the path that suits the movement you want to perform.

Open Composer

## Explorer copy and interaction

- Sequence selection uses the Shape Engine matrix and hand timing/direction choices. The community/library picker remains available as a secondary choice.
- Arc, Linear, Concave, Hybrid use the shared PathShapePanel and canonical SequenceMandala renderer.
- Hands traces the hand centers. Prop tips includes the staff rotation.
- Changes here stay in this explorer. Your saved paths and defaults stay as they were.
- Play/Pause and Path lines operate only in this explorer. Reduced-motion preference starts playback paused.
- Loading animation… / Loading sequence picker… / The sequence picker could not load. / Close.

## September 13 sequence-selection revision

Austen reviewed the page and requested replacing the Pro / Anti / Pro + anti example toggles with selection through the Shape Engine matrix, with hand timing and direction available. This is a new selection preference and one observed substantial correction round. The revised experience is pending user review.

The lead applied the Teacher briefing; Terra owns the bounded implementation. Existing delegated editorial authorization covers the wording revision, which removes instructions naming the old toggle. The AI-bust review still applies.

| Capability                     | Evidence / current consumer                                 | Owner and decision                                                                                                 |
| ------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Inspectable pair selection     | `matrix`, `selectedPair`, `onselect`; ShapeMatrixMatrixPane | Reuse ShapeMatrixGrid, including its full selection perimeter, native buttons, lazy artwork, and minimum tile size |
| Hand timing and direction      | ShapeMatrixDrill                                            | Reuse ElementChipRow and the canonical mode definitions                                                            |
| Shape-to-sequence construction | ShapeMatrixDrill                                            | Compose the existing realization builder and static TnD sequence source; no local motion construction              |
| Path comparison and playback   | Existing motion-path guide                                  | Keep PathShapePanel, SequenceMandala, scoped visibility, and InlineAnimationPlayer                                 |
| Word and notation              | Motion-path guide and ShapeMatrixDrill                      | Keep TKAWordGlyph; use the shared timeline StepStrip carousel directly beneath the animation                       |
| Secondary sequence selection   | Existing motion-path guide                                  | Keep SequencePickerModal                                                                                           |

Matrix choices remain visible before selection. The matrix shows Arc reference shapes; changing the comparison path does not change the selection grid. Phones stack the matrix and comparison, while wider hosts allocate a bounded matrix alongside the comparison where space permits. Shared selection treatments replace the rejected three-example toggle row. No decorative edge accents or duplicate artifact frames are introduced.

### Playback continuity follow-up

Austen's next review requested continuous playback when changing timing and direction: keep an unchanged prop moving and fade the other into its new relationship, following the Shape Engine experience. This is a second observed interaction correction round, with the resulting behavior pending user review. Page explanation copy remains unchanged.

The transition composes `DualSourceCrossfade` and `InlineAnimationPlayer`, using the Shape Engine's `resolveRealizationEntryStep` as the fallback phase owner. A motion-path adapter matches complete cyclic hand motions to preserve a reference hand when the sequences share one. It uses authored motion data rather than introducing another position interpolator. The animation stage keeps its existing dimensions and playback controls.

Seventeen focused tests passed, including real matrix realizations: SS → TS retains the right hand's full loop, and SS → SO retains the left hand's full loop at the same fractional beat. Negative cases reject reversed motion and a matching beat followed by a different curve. Svelte check reported zero errors and warnings.

### Response time and attached carousel

Austen's subsequent screenshot and review reported a delay before the fade began and requested a carousel attached to the animation. This is a third observed interaction correction round. The replacement composes the shared timeline `StepStrip` used in ShapeMatrixDrill, with active-step tracking and seeking beneath the canvas. The detached `GuideStepStrip` is removed. Animation and notation use the displayed sequence during a pending handoff.

The latency work reuses the canonical players instead of rebuilding their canvases for every selection, and caches matrix relationship realizations. The baseline browser click-to-handoff samples were 476, 735, and 642 ms; these include automation round-trip time and the latter two overlap the preceding fade, so they are comparison measurements rather than isolated browser event timings. The revised experience remains pending user review.

Nineteen focused tests passed across explorer state, whole-loop anchor matching, and canonical phase mapping, including prewarmed selection reuse and retry after a null build. Svelte check reported zero errors and warnings. The rail reserves its height before loading and excludes the static start pose from the continuous loop.

## Evidence and teaching boundaries

### Focus and wrapping revision, September 13

Austen rejected the simultaneous four-demo layout as overwhelming and pointed out the introduction's unnecessary second line. The introduction now uses the available article width. The lower section presents one topic at a time through the shared SegmentedControl: Hand travel, Step joins, Motion layers, Apply paths. A visited topic retains its settings when hidden, while its playback becomes inactive. The selected topic has one short instruction; duplicate headings and the extra staff-rotation sentence were removed. Carrier and Inner labels replace longer labels that wrapped on phones. The detailed reference remains optional.

This revision applies the existing delegated editorial authorization. AI-bust review found no banned patterns in the revised labels and instructions. The top matrix explorer is unchanged. User review of the new layout remains pending.

### Interactive reference revision, September 13

Austen requested interactive pictures, animations, and integrated components below the matrix, then approved implementation with “do it.” The four examples cover single-hand travel, synchronized step joins, third-order composition layers, and sequence-versus-step settings. The existing prose remains available in a collapsed Motion path reference. The upper matrix explorer is unchanged.

The lead applied the Teacher briefing inline and reviewed the new labels with AI-bust. The concise instructions name controls and observable movement; no banned writing patterns were found. Existing delegated editorial authorization applies. User review of the resulting experience is pending.

| Capability                                          | Existing owner reused                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Playback, scrubbing, and matching comparison frames | InlineAnimationPlayer and its canonical seek/external-step interface                         |
| Notation and step selection                         | StepStrip                                                                                    |
| Path choice and explicit per-step paths             | PathShapePanel and applySequencePathPreview                                                  |
| Layered motion                                      | ThirdOrderCompositionSampler, ThirdOrderFlowerOverlay, AnimatorCanvas, TrajectoryMandala     |
| Offscreen activity and lazy mounting                | RenderActivityGate and LazyMount                                                             |
| Full viewer handoff                                 | saveSequenceRouteHandoff and generateSequenceRoutePath, as used by standalone sequence pages |

Each example owns ephemeral state. Save and Restore affect only the example; the real viewer is reached through an explicit button. The examples reuse frozen motion data and canonical sampling, without inventing a flower formula or equating Concave with an exact four-petal antispin construction. No performer footage was available for this revision.

Focused tests cover selected-step isolation, source preservation, local save/restore/reset, and single-hand visibility. Type checking reported zero errors and warnings before browser verification.

Browser verification covered 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, and 3840×2160. The new sections had no horizontal overflow. Keyboard scrubbing, Circle/Flower, layer switching, and per-step Save/Restore were exercised. Save/Restore returned the selected Concave control and announced the restored example. No console errors were reported. Browser inspection also prompted explicit effect-map isolation for the settings example and visible path lines with a fractional initial pose for the single-hand example.

The final viewer-button check exposed that the public guide does not host the application drawer or configure its short-code manager. The lesson now uses the established standalone sequence route and one-time route handoff, which carries the complete edited sequence and the return label without opening the application drawer or minting a short code from the guide.

- Hand paths and Hybrid mapping: src/lib/shared/animation-engine/services/prop-interpolator.ts. Concave uses 2 \* straightPoint - circlePoint; it is not the exact flower construction.
- Preview/save/default and authored exception behavior: src/lib/shared/sequence-viewer/services/sequence-path-policy.ts, animation-visibility-state.svelte.ts, and their tests.
- Per-hand reset: PropTurnsControl.svelte and path-shape-handler.ts.
- Path-line visibility is separate from movement policy.
- Third Order: third-order-composition.ts, third-order-flower-path.ts, and ThirdOrderCompositionSampler.ts. Links lead to the toy and existing ratios reference rather than duplicating petal formulas.
- Fresh Flow Arts MCP glossary checks covered pro, anti, dash, static, and float. Concave and third order were absent from the glossary; the copy describes verified application behavior.
- AAAA, BBBB, and CCCC examples are the unedited data returned by Flow Arts MCP on September 8 with smooth constraints, adapted through the canonical factories. Closure is tested.
- This is a public reference and comparison tool, not a new mastery lesson or a change to the concept progression. Inline lead applied the Teacher briefing. User review of the completed experience is pending; no learning outcome or satisfaction claim is inferred.

## September 8 verification

- Fifteen focused tests passed across the explorer, sequence path preview, and mandala path policy suites. They cover source preservation, scoped state, Hybrid float behavior, render identity changes, and closure of the example sequences.
- Svelte check reported zero errors and warnings. A separate full TypeScript run reported two existing option-type errors in the unchanged `an-slice.test.ts` and ten external scene/camera diagnostics; none referenced this task's changed files.
- Direct browser inspection covered 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, and 3840×2160 for the new page, viewer help entry, and Learn navigation. No horizontal overflow was observed. Path controls and navigation links meet the 44px target minimum, allowing subpixel measurement rounding.
- Verified Hybrid → Arc, hand versus tip traces, playback, path lines, and reduced-motion startup. A real AABB gallery selection loaded into the explorer after registering the canonical loop detector on the public route.
- Checked equivalent 200% reflow at 720×450 CSS pixels. This was viewport emulation, not a native browser zoom measurement.
- Third Order is sign-in gated; the page states that requirement. No authenticated save or account mutation was performed.
- Screenshots are stored outside the repository in `C:/Users/Austen/.codex/visualizations/2026/09/08/motion-path-guide`.

## September 13 verification

- Ten focused tests passed across the explorer and canonical mixed-turn realization suites. They cover asynchronous selection ordering, retained path policy, source preservation, scoped state, and generated sequence behavior.
- Svelte check reported zero errors and warnings. Updated interface wording passed the AI-bust review.
- Direct browser inspection covered 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, and 3840×2160. The matrix showed all 16 cells without horizontal document overflow. A tablet spacing issue was corrected and inspected again at tablet and landscape widths.
- Verified 0-, 1-, and 2-turn selections, timing/direction changes, keyboard activation, retained Hybrid selection, switching back to Arc, and paused startup with reduced motion. A real AABB gallery selection loaded its word and notation into the explorer.
- Checked equivalent 200% reflow at 720×450 CSS pixels through viewport emulation; native browser zoom was not measured.
- Screenshots are stored outside the repository in `C:/Users/Austen/.codex/visualizations/2026/09/13/motion-path-matrix`. User review of the revised selection experience remains pending.

## September 14: replace the disconnected demonstrations

Review state: DRAFT under Austen’s delegated editorial authorization. User review pending.
Austen rejected the lower demos as unclear and visually overwhelming, then explicitly requested starting over. This is a further substantial correction round in the same task. The lead applied the Teacher briefing inline; no improvement or approval is inferred.

The top explorer remains the selection owner. One explanation now receives its displayed sequence and trace selection. A chosen movement compares Arc and Concave simultaneously, using a solid and dashed line in the selected hand’s actual color. One scrubber moves both markers at the same time. Two canonical mandalas show that hand across the same complete sequence. Dashes and static hands explicitly report unchanged routes. The four demos, their tabs, their state, and their demo-only tests are removed.

Ownership ledger: keep MotionPathExplorer and ShapeMatrixGrid for selection, MotionPathTransitionStage for playback and notation; compose interpolatePropAngles and applySequencePathPreview for the route diagram; reuse SequenceMandala for whole-sequence geometry and one-tip rendering; getSettings owns hand colors; native labelled range/select provide keyboard and touch interaction. The SVG is a new presentation of canonical calculations, not a new interpolation system. The existing GuideShell and theme tokens own layout and typography. No new notation glyphs are drawn. Rejected: multiple disconnected toys, tab navigation between them, third-order simulation, pretend save/restore workflow. Wide layouts compare movement and whole-sequence drawings side by side; narrow layouts stack the drawings beneath the scrubber.

Copy and evidence:

- “Change the path. See what it draws.” / “Same endpoints, different routes” / “Compare one movement from your sequence above.” Describe the selected sequence preview; endpoint preservation is tested against PropInterpolator.
- “Look at” / “Step [number] · Left/Right hand” / “Drag to follow the hand” / percentage identify the selected motion and its time directly.
- “The hand reaches the same endpoint by a different route.” Supported by PropInterpolator and endpoint tests.
- “This is a dash. Both settings keep its route straight.” / “This hand stays at its grid point with either setting.” Supported by sequence-path-policy and verified fixed-path behavior.
- “Across the whole sequence” / “The same hand’s complete trace.” / “The same hand, tracing one staff tip.” SequenceMandala receives the entire selected sequence, selected hand, and tipEnds=1; hand traces use tipDx=0.
- “Each movement contributes to the full drawing.” / “The staff keeps its rotation as the hand takes a different route.” Geometry calculator and PropInterpolator preserve authored rotations under path changes.

AI-bust review: clean. Copy names the action and visible result; no claims of learning efficacy or ease. Detailed third-order and persistence reference remains collapsed. No new domain claims about third order are introduced.

## September 14: visible movement selection

Austen rejected the native dropdown and restated the preference for visible selection patterns. This supersedes the dropdown ownership recorded above and is a repeated-preference correction in the same task. The replacement composes the canonical StepStrip (pictographs, whole-object selection and keyboard activation) with SegmentedControl (Left hand / Right hand, shared color tones and arrow-key navigation). The current step number remains visible. Step changes preserve the chosen hand when it is present, otherwise choose the visible hand in that step. Hand colors follow the user's settings; scrub progress is retained. Existing explanation copy is unchanged apart from removing “Look at” and replacing the combined dropdown label with the visible step and hand labels. AI-bust: clean. User review remains pending.

## September 14: teach one idea at a time

Review state: DRAFT under Austen's delegated editorial authorization. User review pending.

Austen rejected the entire sequence-based introduction: step selection, pictographs, hand selection, scrubbing, and whole-sequence comparisons all introduce decisions before the basic path concept is clear. This supersedes both comparison revisions above. The Grid lesson is the explicit pacing reference: one persistent drawing, one small reveal per press of Next, and deliberate transitions between reveals.

The lower introduction now has six bites. The top explorer remains independent. There is one action, Next, becoming Start again at the end. Stages never advance automatically. A finite animation demonstrates each reveal; reduced motion shows the completed drawing. Only the last reveal shows the three routes together.

| Title       | Caption                     |
| ----------- | --------------------------- |
| Your hand   | This is your hand.          |
| Two points  | It moves from here to here. |
| Arc         | Go around.                  |
| Linear      | Go straight.                |
| Concave     | Bend inward.                |
| Three paths | Same start. Same finish.    |

Ownership ledger: compose LessonStageControls and Crossfade for progression and text transitions; use RenderActivityGate and shared motion preferences for animation lifecycle; retain settings-owned hand color and render the actual hand through PropCompositionPreview with PropType.HAND. The SVG samples the canonical PropInterpolator's Arc, Linear, and Concave routes and applies only a rigid presentation transform and scale. Equal sample counts support continuous route morphs. The source fixture remains unchanged. The former comparison helper and its obsolete tests are removed.

The lead applied the Teacher briefing and Grid reference; a bounded implementation worker owns the visual component. AI-bust review: clean. Copy describes only the visible hand, endpoints, and routes. No sequence terminology or new third-order claims enter this introduction. No learning outcome or user acceptance is inferred.

Austen also rejected substituting a dot for the hand. The introduction uses the existing recolorable hand artwork, with neutral endpoint markers only. This is a repeated reuse correction; no new hand symbol is invented.

## September 14: establish the center and the shift

Austen approved the simple progression as a starting point and identified its missing spatial context: the horizontal presentation resembled travel between opposite grid points. Arc and Concave need a reference center. The introduction now establishes the canonical diamond grid and its center before demonstrating a shift between neighboring points. This supersedes the horizontal presentation transform described above.

The geometry adapter preserves the animation engine's east-to-south quarter shift, scaled around the original center. GridSvg supplies the existing grid artwork; a faint circle makes the Arc reference visible. The same center, circle, and cardinal landmarks remain through Linear and Concave. Tests verify shared adjacent endpoints, constant Arc radius, the Linear chord, and Concave's smaller distance from the center.

The seven bites are: “Your hand” / “This is your hand.”; “Your grid” / “The grid has a center.”; “A shift” / “Move to a neighboring point.”; “Arc” / “Follow the circle around the center.”; “Linear” / “Take a straight path between the points.”; “Concave” / “Curve inward toward the center.”; “Three paths” / “Same shift. Different paths.” Each remains Next-driven. AI-bust review: clean. The Flow Arts MCP shift entry confirms adjacent cardinal points; the existing path-policy/interpolation implementation supplies the alternative paths for that authored shift. No new sequence or notation selection is introduced. User review of this revision remains pending.

## September 14: introduction first, one reveal per press

Austen accepted a six-point review of the center-and-shift revision and asked for all of it. The introduction now precedes the explorer, so the first thing on the page is the seven-bite progression rather than the matrix. A short bridge heading, "Try all four on a sequence", introduces Hybrid in one sentence before the explorer.

Inside the introduction: "A shift" now only reveals the destination point with a pulsing ring while the hand waits at its start, and "Arc" performs the first traversal, so the two stages no longer show the same picture. The start and end markers are drawn after the hand and the hand artwork is smaller, so the point stays visible when the hand lands on it. "Three paths" draws Arc, Linear, and Concave in the same hand color and stroke weight, distinguished only by solid, dashed, and dotted lines; the legend uses larger labels. The drawing stage is taller at every width.

Captions: "A shift" reads "From this point to the next one." All other stage copy is unchanged. AI-bust review: clean. Geometry tests are unchanged and pass. Browser inspection covered the intro progression at 1440×900 and 375×812 on a task-owned server. User review of this revision remains pending.

## September 14: steps indicator, colored routes, turns follow the selection

Austen questioned the green-dot progress pill and asked why it keeps reappearing. It is the default appearance of the shared lesson controls; the September 8 unification added a flat "steps" appearance that Motions and Reading Choreo Cards use. This page now opts into that appearance. The default itself is unchanged, so the other lessons keep their current look until Austen decides otherwise.

Austen also weighed the solid, dashed, and dotted line styles for the final "Three paths" reveal against color coding and chose color. The three routes now use the same colors as the path panel tiles directly below, drawn from one shared constant so the panel and the introduction cannot drift. The hand keeps its settings-driven color. No line styles remain.

Explorer: changing a left or right turn value while a matrix cell is selected previously cleared the selection and left the animation on the old sequence. It now carries the selected shapes to the new turn value, the same way the Shape Engine keeps a cell's style and orientation when its turn moves, and rebuilds the animation. The helper that does this was extracted from the Shape Engine app state into a shared domain module so both consumers use one implementation; three focused tests cover it. The nine explorer state tests still pass. Browser inspection confirmed the selection moved from the 0-turn row to the 1-turn row with the animation and word notation reloaded. User review remains pending.

## September 14: paths first in the explorer

Austen reported that the explorer drops the reader into five decisions at once after the introduction taught only paths. Three options were compared: progressive reveal with paths first, an extra bridge bite, and cutting the explorer to paths only. Austen accepted the progressive reveal.

The explorer now opens with the loaded sequence, its animation, and the four path tiles. The shape selection (timing and direction, turns or ratios, the matrix, and the sequence browser) is hidden behind one secondary button, "Change the shapes", beneath the animation. Revealing it moves focus to the Sequence heading and it stays open for the visit. The default CCCC example is an anti-plus-pro pair, so Hybrid shows a difference on the first click. On wide hosts the revealed panel takes its previous first column; on phones it stacks below the comparison. No controls were removed and the explorer state is unchanged. Browser runtime checks at 1440×900 and 375×812 confirmed the two-column start, three-column reveal, focus handoff, stacking order, and absence of horizontal overflow. User review remains pending.

## September 15: the matrix is the playground

Review state: DRAFT under Austen's delegated editorial authorization. User review pending.

Austen reversed the September 14 progressive reveal after seeing it live: the Shape Matrix is the delightful part, and hiding it behind a plain "Change the shapes" button meant most readers would never find it. He also rejected the frozen CCCC example (one hand isolating at the center, the other a bare antispin) and pointed out that the whole introduction sat in a narrow column with both rails empty.

Changes:

- The introduction responds to the page width. Above 52rem the copy and the Next button sit beside the drawing, clustered at its vertical center; below that the stack stays portrait. One document serves every viewport.
- The explorer opens with the Shape Matrix visible and a real matrix pair already selected: one turn on each hand, left pro-in (2 petals) and right anti-in (4 petals). One pro and one anti keep Hybrid distinct from Arc on the first click, which the September 14 note required. The frozen example remains only as the placeholder while the matrix builds.
- Turns and ratios stay visible above the matrix. Timing and direction, the one selector that uses vocabulary the introduction never taught, folds behind a disclosure that names the current relationship. Browse sequences stays in the heading.
- The matrix always traces prop tips. Under a hands trace every cell drew the same shape, because hand paths do not vary across the grid. The trace toggle now affects only the animation and the four path tiles.

Ownership ledger: ShapeMatrixGrid, TurnNotationControls, ElementChipRow, PanelButton (aria-expanded), growFade, SegmentedControl, and LessonStageControls unchanged; the explorer state factory unchanged; flowerPetals owns the default pair's petal counts. No new controls or motion.

Evidence: browser pass at 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, 3840×2160 and a 720×450 reflow stand-in for 200% zoom; no horizontal overflow at any tier; matrix cells stay at or above 60px on the phone tier; keyboard focus reaches the intro button, matrix cells, the disclosure, and the trace toggle. The disclosure animates through growFade, which carries the shared reduced-motion behavior.

AI-bust review: clean. Copy names the control and the visible result. User review remains pending.

## September 17: fold the shift into Arc

Review state: Austen approved the recommendation ("do so") including the proposed Arc caption. User review of the rendered result pending.

Austen pointed out that the "A shift" stage re-teaches a word Level 1 already taught with real pictograph demos. Its only job on this page was to plant the two endpoints the three paths share. The stage is gone; the introduction has six bites.

The page has three front doors: the guide index, the "About motion paths" link in the animation path-shape settings, and the animation canvas context menu. Readers from the last two may never have opened Level 1, so Arc names the shift once. "Arc" now reads "One shift. Follow the circle around the center." The endpoints appear when Arc begins, the destination pulses while the hand waits at its start, and the traversal follows. Linear and Concave captions are unchanged. "Three paths" still closes with "Same shift. Different paths."

The September 14 split of "A shift" from "Arc" existed because the two stages showed the same picture. With one stage there is nothing to duplicate. Under reduced motion Arc settles directly on the finished route with no pulse, as before.

Ownership ledger: LessonStageControls, Crossfade, the intro geometry module, and the fade owner unchanged. Geometry tests unchanged. AI-bust review: clean.

## September 17: Next moves to the right

Austen asked whether Next should sit on the right. On the landscape composition the drawing now leads on the left and the copy and Next cluster at its vertical center on the right. The reason is stepper convention and reading order (look, read, advance), with right-thumb reach on landscape phones as a secondary benefit. Portrait is unchanged: the button stays centered below the drawing. No copy changed. Ownership ledger unchanged.

## September 17: the words sit beside the drawing; "Three paths" reworded

Austen saw the landscape composition with the copy and Next floating far from the drawing and asked for the gap closed. The drawing track is now capped at the drawing's own size and the copy track at the longest caption, and the pair is centered as one unit, so the words sit a short gap from the drawing's edge at every landscape width.

He also called out "Same shift. Different paths." as reading machine-made. The closing caption now reads "All three start and end at the same points. Only the path changes." Two plain sentences that say what the picture shows. Austen has not yet confirmed this exact line; it is the one string in this revision that needs his eye. No other copy changed.

## September 17: What Hybrid does

Review state: Austen approved the plan ("do it"). User review of the rendered result and of the new strings pending.

Austen rejected an intro prototype that animated "Pro rides the Arc, Anti bends inward" as if spin caused the path. Any motion can take any path; Hybrid is the animator's rule for choosing one per motion. That prototype was reverted. In its place a section between the introduction and the explorer shows the rule through examples rendered by the canonical owners: three sequences (all pro, all anti, one hand of each) under Arc, Concave, and Hybrid.

Austen rejected the first heading, "Hybrid is a rule, not a path", as machine-made (the "X, not Y" flip). The section copy was rewritten to say what the picture shows.

New strings, pending Austen's eye:

- Heading: "What Hybrid does"
- Lede: "Hybrid uses Arc for pro motions and Concave for anti motions. Any motion can take any path, so this is a default, not a law. Three sequences show where it lands."
- Row labels: "All pro" / "All anti" / "Left anti, right pro"
- Row results: "Same as Arc." / "Same as Concave." / "Concave on the left hand, Arc on the right."
- Explorer lede replaced. Old: "Hybrid is the fourth choice. It uses Arc for pro motions and Concave for anti motions." New: "Pick a pair of shapes from the matrix, or one shape from its edge, and switch the path while it plays."
- Explorer status while a header solo plays: "One hand on its own. Pick a cell to pair it again."

The tiles trace hands, not prop tips. The path shape is a rule about the hand path, and under a tip trace the all-pro row collapsed to a dot at the center, which taught nothing. Under a hand trace the Arc and Concave columns repeat across rows and only the Hybrid column changes.

Two explorer changes on Austen's request in the same review. Timing and direction no longer fold behind a disclosure; the chip row sits above the animation canvas as it does in the Shape Engine drill. A matrix header (one of the axis flowers) now plays that hand alone: the other prop, its path line, the letter and placement glyphs, and the chip row leave; the four path tiles draw that hand only. Picking a cell restores the pair.

Ownership ledger: SequenceMandala, GuidePictograph (the guide's static notation cell; StepStrip is a playback carousel and would ring a current step), applySequencePathPreview, PATH_SHAPE_COLORS, ShapeMatrixGrid (its existing onsolo/soloHand contract), ElementChipRow, SequenceViewerVisibilityState via the viewer visibility context (the same owner the Shape Engine shell uses for a solo), InlineAnimationPlayer's hideTkaGlyph/showPlacementGlyph, growFade. No new controls or motion owners. The explorer state gains soloHand and chooseMatrixSolo.

Evidence: browser pass at 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, 3840×2160 and a 720×450 stand-in for 200% zoom; no horizontal overflow at any tier; root 16px at every tier. The examples table stacks each sequence over its three labelled tiles below a 44rem container width and reads as one row per sequence above it. Solo verified: one prop, one path line, no glyphs, no chip row, one-hand tiles; pair restored on a cell click; Path lines toggle honours the solo. AI-bust review of the new strings: clean.

## September 17: the explorer's two sources

Austen asked for the explorer's left column to hold two modes instead of a Browse button beside the matrix. Before, a browsed sequence played in the animation while the matrix stayed on screen with a stale selection. Now a segmented control at the top of the column picks the source. "Shape matrix" shows the turn controls and the matrix. "Sequence" shows a Browse button and the browsed sequence's card in the matrix's square. Picking from the browser switches to the Sequence source; switching back to the matrix replays the remembered pair, or the default pair at the current turns if none was picked. The timing-and-direction chip row belongs to the matrix and leaves with it.

Strings, pending Austen's eye:

- Source control options: "Shape matrix" / "Sequence"; accessible name "Sequence source"
- Explorer status in the Sequence source: "Switch the path while it plays."
- "Browse sequences" unchanged.

The card shows the word and step numbers, no start placement (the player shows it), no notes, difficulty, or LOOP glyph, and staff props to match the animation. It is contained in the same square the matrix uses, so the swap moves nothing below it; the card's own layout owner picks the grid that fits.

Ownership ledger: SegmentedControl (the exactly-one owner already used for Trace), Crossfade for the controls swap (animateHeight, since the turn controls are taller than the Browse button) and the stage swap, ChoreoCard with forceContain and fitWidth, SequencePickerModal unchanged. The explorer state gains `source` and `browsed`; chooseSequence remembers the sequence and shows it, and showMatrix re-selects the pair.

Evidence: browser pass at 375×667, 820×1180, and 1440×900 (the three compositions of the explorer); both sources, the swap in both directions, and the browse-and-pick flow observed; no horizontal overflow; the source stage stays 1:1 in both modes and the feedback line does not move. AI-bust review of the new strings: clean.

## September 17: Hybrid lede loses its "X, not Y"

"Any motion can take any path, so this is a default, not a law." carried the same flip Austen rejected in the heading an hour earlier. It now reads "Any motion can take any path; Hybrid only sets the default." Same fact, no flip. Pending Austen's eye with the rest of the section.

## September 17: "What Hybrid does" cut

Austen reviewed the rendered table on main and said it was not informative. He was right: every Arc tile was a circle, every Concave tile a star, both hands drew the same shape in the same colour, and nothing in a tile showed the spin the rule keys on. Nine drawings restated one sentence. The explorer below already shows the rule properly (a pro hand paired with an anti hand, switch to Hybrid, watch which hand changes), so the section is gone and the rule moved into the explorer's lede.

Explorer lede now: "Pick a pair of shapes from the matrix, or one shape from its edge, and switch the path while it plays. Hybrid uses Arc for pro motions and Concave for anti motions. Any motion can take any path; Hybrid only sets the default."

The explorer also starts on Hybrid instead of Arc. The default pair mixes pro with anti, so the first frame is the rule at work: one hand on Arc, the other on Concave, and PathShapePanel's own header reads "Pro → Arc · Anti → Concave".

Ownership ledger: MotionPathHybridExamples.svelte deleted; PathShapePanel and the animation scope's setPathPolicy unchanged. Evidence: 1440×900, section absent, Hybrid tile pressed on load, lede as above, no overflow.

## September 17: the path comes first

Austen looked at the explorer on main and asked how to make it more approachable. The first screen was a matrix of forty shapes with turn menus, six timing chips, a step strip and two toggles before the reader reached the four path tiles. He approved the recomposition ("Let's see you try").

The lesson is the path, so the four tiles now open the explorer, beside the animation. Everything that picks what plays (the source toggle, turn controls, timing chips, the matrix or the browsed sequence's card, and their status line) waits behind one button under the canvas. The step strip is gone from the explorer; the transport keeps Play and Path lines. Trace defaults to Hands, since the hand path is what the rule is about and the tiles then read as a circle, straight lines, a star and a mix. On a phone the canvas comes first with the chooser opening under its button, and the tiles follow one swipe down; side by side, the path is on the left.

Strings, pending Austen's eye:

- Disclosure button and its region's accessible name: "Change what plays"
- Now-playing line under the canvas, from the matrix pair: "Left hand pro, 1 turn. Right hand anti, 1 turn." (turn counts follow the pair; a float reads "float"); for a header solo: "Right hand pro, 1 turn, on its own."; from a browsed sequence: "AKEJ, 4 steps." (the word simplified as the card shows it; "A browsed sequence, 4 steps." if the sequence has no word); before the first pair loads: "Loading a sequence…"
- Under the tiles: "Only the hand’s path between positions changes. The positions and the spin stay the same."
- Matrix status: "Rows are left-hand shapes, columns are right-hand shapes. Pick a cell to play that pair, or a shape on the edge to play it alone." (replaces "Change the motion path to compare these shapes." and "Pick a cell to animate its shapes.")
- Explorer lede now: "Switch the path while the sequence plays. Hybrid uses Arc for pro motions and Concave for anti motions. Any motion can take any path; Hybrid only sets the default." The first sentence no longer points at a matrix that is behind the button.

Ownership ledger: PathShapePanel, MotionPathTransitionStage, SegmentedControl, Crossfade, ShapeMatrixGrid, ElementChipRow, TurnNotationControls, ChoreoCard, SequencePickerModal and growFade as before; PanelButton gains an `ariaControls` prop so the disclosure names its region. StepStrip leaves the explorer. The explorer state changes only its trace default.

Evidence: browser pass at 375×667, 960×412, 820×1180, 1250×800, 1440×900, 1920×1080, 2560×1440, 3840×2160 and a 720×450 stand-in for 200% zoom; no horizontal overflow at any tier. Chooser open and closed, both sources, browse-and-pick, a header solo, the trace toggle and a cell pick observed with the now-playing line following each. Below a 900px container the chooser stacks so the timing chips keep their words (at 820 a two-column chooser clipped them to "S", "1", "("); above it the chooser's columns take the workspace's ratio so the stage sits under the canvas. AI-bust review of the new strings: clean.

## September 17: the open chooser packs

Austen opened "Change what plays" on main and found two voids: one under the button (the tile column ran about a hundred pixels past the canvas column, so the chooser opened under a gap) and one under the chooser's controls (a 544px matrix beside a short stack of controls). Layout only; no strings change.

Trace moves from under the tiles into the transport row with Play and Path lines, which brings the two columns to about the same height; the motion column then stretches to the row and pins the now-playing line to its bottom, so the button always sits level with the tiles' note and the chooser opens right under it. Inside the chooser the status line joins the controls stack, and the stage becomes a square the height of that stack (never under 20rem so the card and the matrix stay readable, never over the matrix's 34rem). At desktop the matrix is now about 320px with 63px cells beside the turn and timing controls; in the Sequence source the card takes the same square beside its shorter controls. Stacked, below a 900px container, the stage is a square as wide as the column, as before.

Ownership ledger: no new owners. Crossfade's `fill` mode sizes the two stage layers to the square; SegmentedControl gets a set width in the transport (a flex basis is not content, so the row sized itself from the labels and wrapped "Prop tips").

Evidence: browser pass at 375×667, 960×412, 820×1180, 1250×800, 1440×900 and 1920×1080; no horizontal overflow at any tier. At 1440 both columns measure 677px and the chooser opens at the button's edge; the matrix stage is 320×320 beside 266px of controls plus the status line, and the card takes the same 320px square in the Sequence source. At 960 the columns were 587 and 558 before the pin and both 587 after. Both trace options read on one line at every tier. Console clean apart from the PostHog notice. Focused tests: pill resolution, motion-path explorer and SSR guards, 29 passing.

## September 18: the four boxes on one screen

Austen saw the packed chooser on his 2560×1440 monitor and rejected the 320px matrix: it was already small, and the point was never to shrink it. He wanted the tile pickers bigger, and above that he wanted the controls, the matrix, the tiles and the animation to fit on one screen on any device, so picking a cell does not mean scrolling back up to watch it play. Layout only; no strings change.

Fit mode. Once the tiles and the canvas sit side by side (a 900px container) on a viewport at least 900px tall, the workspace takes the viewport under the site header (capped at 1400px), its top row gets a little more than the bottom, and every box scales to its quadrant: the tiles size to their height as well as their width, the canvas is the tallest square its stage holds, the matrix stretches to the chooser row up to its 34rem cap, and the chooser is simply there, with no "Change what plays" button and the timing chips at their full size. The controls keep their top edge in that row: centred, a switch to the Sequence source (whose controls are far shorter) moved the clicked button and the page scrolled after it. Below either threshold, phones, tablets and short desktop windows keep the stacked flow with the chooser behind its button.

Ownership ledger: PathShapePanel gains a `fill` prop for the explorer's preview tiles (the largest squares that fit the grid's height too, centred as a pair); MotionPathExplorer mirrors the two thresholds in script for what CSS cannot drive. The stage, the matrix, the card and the canvas keep their owners; the canvas already filled its box through the player's `fill` mode.

Evidence: browser pass at 2560×1340, 1920×950, 1440×900, 1250×900, 1440×800 and 375×667. At 2560 the workspace is 1368×1252 under the header, the tiles 267×290, the canvas 558, the matrix 542 with 107px cells (its original size) and the chips 218×84, all without a scroll. At 1440×900 the tiles are 147×170, the canvas 318 and the matrix 342, still on one screen; at 1250 the transport wraps and the canvas is 266. At 1440×800 and on the phone the layout is the one shipped on September 17, button and all. Switching sources in fit mode leaves the scroll position where it was. Console clean apart from the PostHog notice. Focused tests: pill resolution, motion-path explorer and SSR guards, 29 passing.

Found in passing, not fixed here: the shared Crossfade's `animateHeight` freezes at the outgoing layer's height when a key reverts to a layer that is still fading out (Svelte resumes that layer without re-running the tracking action). Reproduced by switching the chooser's source back and forth within the fade; logged as its own task.

## September 18: the captions go, the canvas names the timing

Austen, on the fit-mode layout at 2560×1440: better, but he is not going to read captions like the tiles' note or the "Left hand pro, 1 turn" line, so they go; the timing chips can be taller with icons that grow with them; and the canvas should stop showing the beat number and the positions and show the prop and hand timing-and-direction glyphs instead. He also wondered whether the matrix's top-left corner could carry the turn controls, as the shape engine's does.

Strings removed: the tiles' note ("Only the hand's path between positions changes. The positions and the spin stay the same."), the now-playing line under the canvas (kept as a visually hidden live region, so assistive technology still hears what plays), and the chooser's idle instructions ("Rows are left-hand shapes, columns are right-hand shapes…", "One hand on its own…", "Switch the path while it plays."). The status strip keeps its height and now carries only a build in progress or an error with its retry. No strings added.

Canvas: the beat number and the α/β/γ positions are off; the hand relationship glyph (bottom right) and the prop relationship glyph (top right) are on, beside the letter and its turns. A solo takes both relationship glyphs off with the letter, since each describes a pair.

Chips: in fit mode the controls fill their row (the crossfade fills instead of measuring) and the chip row takes what the turn picker leaves; ElementChipRow's new `fill` makes the row a size container and RelationshipChoiceChip reads its icon and word sizes from it, so a taller chip gets a bigger icon (about half the chip) rather than more air. Stacked and phone hosts keep the compact row shape; the shape engine's drill sets no sizes and is unchanged.

Ownership ledger: ElementChipRow `fill`, RelationshipChoiceChip `--choice-icon-size` and `--choice-copy-size` fallbacks. The glyph overlay already owned both relationship glyphs behind the scope's visibility flags; the explorer state sets them. No new owners.

Evidence: browser pass at 2560×1340 (chips 218×182 with 82px icons, tiles 281×305, canvas 610, matrix 542), 1920×1080 (chips 218×123, icons 61px, canvas 469, matrix 423), 1440×900 (chips 177×82, icons 42px, canvas 370, matrix 342), 1440×800 (stacked flow, button at the right of its row, compact chips 177×45 with 34px icons, the crossfade back on its measured height) and 375×667 (compact chips 95×45). Solo removes both relationship glyphs and the chip row; picking a pair brings them back. Source switches in fit mode leave the scroll where it was. Console clean apart from the PostHog notice. The drill could not be opened on the task server: `/shape-engine` fails to boot until the primary installs `svelte-awesome-color-picker`, a dependency main added on September 18.

Corner as a control surface: not built. The shape engine's corner holds Surprise and two axis steppers because its cells reach 320px; the explorer's corner is 107px at 2560, 72px at 1920 and 68px at 1440, which cannot hold two 44px steppers, so the turns stay in the controls column.

## September 22: the intro's hand never waits or crawls

Austen, stepping through the intro: after the grid stage, Next into Arc left the hand still for a moment before it traveled, and Next pressed while a path was drawing brought the next path in slowly, as if it were finishing the old motion from wherever the hand was.

Measured on the live page: entering Arc ran a 700 ms reshape from the arc route to the same arc route before the hand could move. Each later stage kept the hand's leftover progress: a 700 ms reshape with the hand nearly still, a 1.4 s slide back along the new path, then a 1.4 s redraw, 3.6 s in all when interrupted.

Interaction now: every path stage is one motion. The route reshapes toward the new path while the hand slides back along it to the start (700 ms from the end, proportionally less from partway), then the hand draws the new path at the animator's even pace. Next pressed at any moment starts that motion from wherever the hand and route are. Arc starts drawing on the first frame, and its destination pulses until the hand arrives. The closing comparison lets a draw in flight finish along its own line. Reduced motion still jumps each stage to its end state. No strings changed.

Evidence: task server, frame-by-frame hand positions. Arc moves on the first frame and arrives in 1.4 s. Next at 60% of Linear returns in about 0.4 s, then Concave draws in 1.4 s. Next during the grid glide, two Nexts 150 ms apart and Next mid-draw into the comparison all stay continuous (largest step between frames 12 units of a 330-unit drawing). Reduced motion lands every stage at once.

## September 22: the hand lifts and sets down instead of rewinding

Austen, after the single-motion version: on Next the hand slid back to the east start point, and the slide looked rushed. He asked for the clearest effect available.

Chosen: a lift and set-down, the way a teacher starts a demonstration over. On Next the hand fades and shrinks slightly where it is (200 ms), reappears at the start point slightly large and settles (350 ms), then draws the new path at the animator's even pace (1.4 s). It never travels backward along a path, so nothing can read as a replay. The finished path fades off and stays behind as a faint line, so Linear is drawn beside Arc and Concave beside both, and the closing comparison colors all three. Start again lifts the hand and sets it down at the center. Next pressed mid-lift carries on from the hand's current fade instead of popping it back to full. Reduced motion still jumps each stage to its end state. No strings changed.

Options weighed: sliding back along the path (read as a hurried replay), drawing each new path from the end back to the start (reverses the shift's direction between stages), and a continuous loop (Next would wait for the lap). The lift keeps one direction and answers Next at once.

Evidence: task server, frame-by-frame hand position, opacity and scale. Arc draws on the first frame. Linear: the hand is gone at 200 ms, back at the start and settled by 500 ms, and draws 550 to 1950 ms. A second Next 100 ms into a lift, Next mid-draw into the comparison, and Start again all change opacity by at most 0.23 per frame, and the hand never jumps while visible. Ghost counts are 1 on Linear, 2 on Concave, and 0 once the comparison shows.

## September 23: the toy box replaces Path lines

Austen, with Trace on Hands: switching Path lines on or off changed nothing he could see, the button showed no pressed state, and a lone visibility switch implied the prop, speed and effect controls the page did not offer. He asked for the viewer's bottom panel (Effects, Props, Effort, Display) here, and for that panel on every canvas meant for play.

Why the toggle looked dead: the full curve on the canvas is the mandala, which follows the Trace point. Path lines draw only the current beat's segment per hand. Under Hands that segment lies on the mandala, so hiding it removes nothing visible. Under Prop tips the two separate.

Interaction now: the transport row keeps only Trace. Under the canvas sits the shared animation panel, bound to the explorer's own scope: Effects, Props, Effort, Playback (tempo) and Display, with Play/Pause as the dock's trailing button. Display's Hand paths and Mandala tiles preview what each layer draws and show a pressed state, so the overlap under Hands can be read and undone by turning Mandala off. The canvas opens as before: no effect, 48 BPM. Picking an effect applies it to every tip and follows Trace. A prop change reloads the matrix for that prop and keeps the current grid on screen until the new one is ready. A solo still keeps the other hand's path line off, even when Hand paths is turned on during it. Path shape is left out of the panel because the four tiles are that control. Word is left out of Display because this player never draws a word header.

Stacked, the dock's tray opens under the canvas and the page grows. In fit mode the canvas is sized to its quadrant, so the open section covers the chooser band instead (header plus Done) and the canvas keeps its size.

Strings: removed the "Play"/"Pause" and "Path lines" transport buttons. Added "Done" and the section names Effects, Props, Effort, Playback, Display (the panel's own labels). Region names: "Animation controls", "Animation settings". The reference sentence "Path lines are the drawn guides…" describes Composer and is unchanged; Composer's Display tile now calls that layer "Hand paths", so the sentence is worth a follow-up review.

Ownership ledger: AnimationPanel (reused, `presentation` navigation/content split as ShapeMatrixFocusWorkspace uses it), DisplayPanel (extended with `showWordToggle`, threaded through AnimationPanel), EffectsConfigState/foldTrailIntentIntoSettings (reused for the trail look; Trace keeps tracking), flyFade (section presence). No new owners.

Evidence: task server at 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, 3840×2160; root 16px, no horizontal overflow at any tier. Fit-mode canvas height is unchanged with a section open (397 at 1920, 593 at 2560, 620 at 3840). Display reads as eight tiles: one row in fit mode and wide trays, 4 + 4 on a tablet tray. Trails draws along the traced hands; Fan replaces the staffs on the canvas; tempo steps 48 to 53. Hand paths off removes both segments, on restores them; during a right-hand solo it restores only the right. Console clean apart from the PostHog notice. Focused tests: motion-path explorer, intro, entry step and SSR guards, 22 passing.

## September 23: the toy box opens a studio

Austen, on the toy box: close, but the section appeared without a transition, and a reader picking a display option was still looking at the path tiles and the chooser. He wants one decision on screen at a time, a mode that shows only what is being picked from, and asked whether the pills themselves should enter it or a separate button should.

Chosen: the pills enter it. A separate button would add a click and a second control with the same job, and the Shape Engine already enters its focus mode from the control the reader is using. The cost is that a pill press now changes the page's layout, so the change is staged and has a labelled way out.

Interaction now: pressing a pill fades out Trace, the path tiles and the chooser (150 ms). Then the canvas grows into the room they leave and the section opens beside it on a landscape screen or under it on a portrait one (280 ms). The canvas and its pills stay together, centered, and the pills switch sections from there. The pressed pill, Back to paths or Escape reverses the same steps. Focus returns to the pill, and the page never has to scroll back to find the lesson. A press at any point reverses from wherever the layout is: letting go while the pickers fade brings them straight back, and another pill pressed while the section closes reopens on that section. On narrow guide screens the floating Guide contents button stays hidden while the studio is open, since it sat over Back to paths. Reduced motion (the system setting or the app's) makes each change at once.

Layout: side by side whenever the screen is landscape and the explorer is at least 480 px wide, so a phone on its side or a zoomed-in laptop keeps a usable canvas instead of a band with no height above it. The side panel uses the inspector's page; the stacked band uses the dock tray's dense page and crossfades between sections. The studio takes the viewport under the site header and keeps fit mode's 1400 px cap.

Strings: removed "Done". Added "Back to paths" and the panel title, which is the section's own name (Effects, Props, Effort, Playback, Display). Region names: "{Section} settings" for the panel, and the section page is labelled with the section name. The Effects page still shows its own EFFECTS heading under the panel title; worth a follow-up to decide which one stays.

Ownership ledger: createLayoutMotion (canvas and dock grow and shrink from their measured boxes), flyFade (panel presence), Crossfade (stacked section switch), the escape layer manager (Escape), AnimationPanel's navigation/content split (unchanged roles; the content region now takes the active section's name). New: AnimatorInspectorShell `pageOnly`, the inspector's page without its rail and title for a host that supplies its own header, and GuideShell's chrome context with `holdPillAway`, which a page region that fills the viewport uses to keep the contents button out of the way.

Evidence: task server. 1440×900: canvas 299 at rest, 658 in the studio, panel 449×812. 1920×1080: 397 to 805, panel 547×992. 2560×1440: 593 to 805 with the dock directly under the canvas and the pair centered (238 px above and below). 3840×2160: 620 to 805 inside the 1400 px cap. 820×1180: stacked, canvas 556, panel 771×448. 375×667: stacked, canvas 252, panel 303×256; Effects scrolls inside its band. 960×412: side by side, canvas 252, panel 361×324, contents button hidden and back after exit. 667×375: side by side, canvas 221, panel 288×295. 200% zoom (720×450): side by side, canvas 213, panel 288×370 (stacked it had left the canvas 30 px); the dock is 217 wide, so Playback and Display sit past the edge of its scrolling pill strip, as they do on the viewer's compact dock. No horizontal page overflow at any tier. Reduced motion: open and close each land within two frames with no transform left on the canvas. Focused tests: motion-path explorer, intro, entry step and SSR guards, 22 passing; viewer transition orchestration and landing route morph contracts, 46 passing.

## September 24: the canvas gets the viewer's transport

Austen, on the studio: a Playback section under the canvas contradicted the viewer, where play, the scrubber and tempo live behind the canvas's own "…" button. Then, on the side-by-side Effort page: Effort and Playback had folded into one page, so both pills opened Tempo and Effort together.

Chosen: the viewer's pattern. The canvas owns its transport, and the toy box holds only what changes the look or the motion.

Interaction now: under the canvas sits the viewer's compact transport, with Play/Pause, a scrubber with beat marks, and "…" opening Tempo. It follows the canvas on screen, so while a new path loads it still scrubs the one being shown. The pills are Effects, Props, Effort and Display. The dock's trailing Pause and the canvas's hover Pause badge are gone; tapping the canvas still toggles play. The Effort page shows only Effort, in the side panel and in the stacked band. A reader who last had Playback open lands on Effort. In the studio the canvas, its transport and the pills stay one centered group.

Strings: removed the Playback pill (label and its BPM summary), the dock's "Play"/"Pause" button and the hover badge. Added the transport's own labels: "Playback transport", "Play"/"Pause", "Playback progress", "More playback controls", and "Tempo" with its BPM presets in the "…" popover. The Effort page drops its section label when Effort is the whole page.

Ownership ledger: UnifiedTimeline (compact mode, as the viewer uses it), createAnimatorPlaybackAdapter (bound to the explorer's step, play state and tempo; seeks through the stage's displayed-canvas seek), AnimationPanel (Playback is offered only when the host has something to put on it), resolveActivePill (a missing Playback falls to the other motion part). No new owners.

Evidence: task server. 1440×900: at rest the canvas is 238 (299 before; the 60 px transport row comes out of the fixed top quadrant). Studio side by side, canvas 658, transport 60, dock 63, grouped. "…" shows Tempo 48 BPM with presets 15 to 150; picking 90 sets 90 BPM; Escape closes the popover and leaves the studio open. Arrow keys on the paused scrubber move the canvas. 820×1180: stacked studio, canvas 495, Effort alone. 375×812: canvas 303, transport and four pills, no horizontal overflow. 667×375: side by side, canvas 167, transport and dock under it, panel 288×295. Console clean apart from the PostHog notice. Focused tests: pill resolution, motion-path explorer and SSR guards, 29 passing.

## September 24: the studio fits its canvas

Austen, on the side-by-side studio at a tall window: Props and Effects look right because they have a lot to pick from, but Effort and Display sat in a panel with a lot of empty space below them, and the page had more empty space under the studio. He asked for a rethink rather than another shift.

Why it happened: the studio took the window's height while the canvas was limited by its column's width, so at 1278×1249 a 567 px canvas sat in a 1161 px studio with 231 px of empty stage above and below it. The section panel always filled that full height, whatever the page held. Effort's descriptions were hidden by a rule written for the older merged Motion page.

Chosen: the canvas sets the size. The studio is as tall as the canvas, its transport and its pills, capped by the old window-based height. The section card is placed beside them without setting the row's height. A short page (Effort, Display) gets a card sized to it. A long one (Props, Effects) takes the full height and scrolls. A card that would stop within 48 px of the canvas group's bottom takes the full height, so the two bottoms line up. The height change between sections animates, and reduced motion applies it at once. The stacked (portrait) studio is unchanged.

Strings: none added or removed. Effort's eight descriptions return in the side panel ("constant speed", "light, sustained", "light, sudden", "strong, sustained", "strong, sudden", "overshoot, rebound", "percussive rebounds", "wind-up, release"), in two columns under "How each beat speeds up and slows down." They also appear in any sidebar where Effort is alone on the Motion page.

Ownership ledger: createIntrinsicHeightMotion (the card's height, as BaseModal uses it), AnimatorInspectorShell (new `onPageHeight`: reports the active page's own height, or none for a page laid out in whatever height it is given), AnimationPanel (passes it through; Display lays its tiles out by width when the host sizes the panel), the motion-stack rule (compact Effort tiles only when Effort shares the page).

Evidence: on the main dev server. 1278×1249 at 1.5x: studio 699 tall (was 1161), canvas 567; Effort card 399 with descriptions, Display 699 (two columns, snapped), Props and Effects 699 and scrolling. 1440×900: studio 791, canvas 658; Effort 399, Display 399, Props 791. 1920×1080 and 2560×1440: studio 937, canvas 805 with no empty band (2560 had 238 px above and below before); Effort 399, Display 391 in four columns, Props and Effects 937. 820×1180: stacked as before, canvas 496, panel 771×448. 667×375: side by side as before, canvas 167, panel 288×295, pages scroll inside. 375×812: stacked, opening lands the studio under the header. Switching Effects to Effort animates 699 to 399 over 200 ms; with reduced motion it goes straight there. Escape and Back to paths return to the lesson with focus on the pill. No horizontal overflow; console clean. Focused tests: motion-path explorer, SSR guards, shape-matrix app boundary and visibility, 38 passing; svelte-check 0 errors.

## September 24: every studio section fills its card

Austen, on the side-by-side studio at a wide window: still a lot of wasted space. Display sat in a 425×305 card at the top of the column with the rest empty, beside a canvas group about 725 tall. He asked for the most effective and reasonable fix.

Why it happened: the previous change sized the card to the page, so a short page left the column under it empty. Display's fitted grid also kept its pictures at a fifth of the box's short side, a cap meant for a free-standing rail as tall as the window, so even a full-height card would have held small pictures with space around them. Effort's tiles are text only, so a taller card could only have stretched labels.

Chosen: the card always matches the canvas group, and the short pages spend that height. Display's pictures grow into the card (the canvas beside it already bounds the box, so the rail cap is lifted for this host). Each Effort tile draws its timing curve above its name and description, sampled from the same easing the animation runs: time through the beat across, how far the move has got up, with faint start and end lines. All eight share one vertical scale, so Elastic's overshoot and Anticipation's wind-up read against the same lines as the rest. The chosen effort's curve is at full strength and the others are dimmed. A card too short for pictures keeps whole labels and scrolls: Effort's curves collapse away and Display falls back to its width-only grid. The card no longer changes height between sections, so the height animation and the page-height reporting are removed. The stacked (portrait) studio is unchanged.

While checking a phone held sideways, Display's fit turned out to size a tile's width from its side padding but draw it square at picture plus label, so four 81 px tiles went into 59 px columns and were clipped. The fit now checks the square's side on both axes and falls back below 48 px pictures. It lives in a pure module with tests.

Strings: none added or removed. The curves are pictures with no text of their own and are hidden from assistive technology; each tile's name and description still label it.

Ownership ledger: sampleEffortCurve in effort-easing-unified (reused; previously unused), EffortPanel (extended with `fill`: the tiles share a given height and draw their curves), DisplayPanel (extended with `grow`; fit moved to display-grid-fit), AnimationPanel (`fillPages` replaces `onPageHeight`). Curve search: `curve`, `easing`, `effort` in canonical-capabilities (no owner) and the source tree; the only drawing is the phrase-effort lab's overlay, which plots two phrases across a boundary for a different purpose. Decision: compose the domain sampler inside EffortPanel, no new shared owner. Removed: AnimatorInspectorShell `onPageHeight` and the explorer's card height motion.

Evidence: on the main dev server. 1920×1000: card 547×912 on every section (Effort was 399, Display about 305 in Austen's screenshot), Effort tiles 249×195 with 230×122 curves, Display two columns of 157 px pictures filling 830 of 830, nothing scrolls. 2560×1440: card 547×937, curves 230×128, Display 163 px. 1440×900: card 449×791, curves 181×92, Display 126 px. 1278×1249: card 389×699, curves 151×69, Display 105 px. 852×833 at 1.5x: card 316×591, curves 115×42, Display 78 px. 960×412: Effort tiles at their 56 px minimum with the curves collapsed, 13 px of scroll; Display width-only and scrolling. 667×375: Display width-only, 2 columns of 96 px pictures inside the 255 px column and scrolling (clipped at both edges before the fit fix). 820×1180 and 375×812: stacked as before, no curves. No horizontal overflow; console clean. Focused tests: motion-path explorer, SSR guards, shape-matrix app boundary, visibility and viewer transition contract, 58 passing; display-grid-fit, 4 passing; svelte-check 0 errors. The prop-colour picker contract test fails on main for an unrelated reason (AnimationPanel mounts PrimaryPropColorSettings again).

## September 24: Effects fills its card

Austen, on the side-by-side studio with effects off: make Effects feel as cohesive as the other three; there was a lot of empty space. The page showed an Effects heading, the Off button, a 4×4 grid of small icon tiles, the Reset button, and about 60% of the card empty.

Why it happened: the previous change gave every section the canvas group's height, and Effort and Display spend it. Effects kept its compact grid, which is sized for the state with an effect on, when the looks dock sits under it. With nothing on there is no dock, so the grid sat at the top of an empty card.

Chosen: two states. With no effect on, the roster is the whole page, so each tile shows a picture of the effect's current look (the same picture as its looks card, in the same 8:3 frame) with its icon and name beside it: two columns of eight filling the card down to Reset. An effect with no named looks (Ghost) draws its picture from its defaults. A card too narrow for pictures at least 64 px wide (a third of a laptop screen) fills with the names as a two-column list of buttons instead; a card too short for 44 px rows keeps the compact grid and scrolls as before. Turning an effect on returns the compact grid and the dock, unchanged: while you compare effects the grid holds still and only the footer moves, as before. Turning effects on or off is the only thing that changes the arrangement, and the view crossfade animates it; reduced motion swaps at once. The inner Effects heading is gone from the side studio, where the card's header already names the section. The stacked (portrait) studio keeps its strip.

Strings: none added. The side studio no longer repeats "Effects" as a heading inside the card. Each picture is hidden from assistive technology; the tile's name still labels it.

Ownership ledger: EffectPresetThumbnail and createEffectLookPreview (reused for the pictures), pickedPresetId and matchPresetId (reused to show the look each effect is set to), the EffectsPanel view Crossfade (reused for the arrangement change), EffectSelector (extended with `catalog` and a `portrait` snippet: picture and list arrangements), EffectsPanel (extended with `fill`), AnimationPanel (passes `fill` from `fillPages` and hides the repeated heading). Created fitEffectCatalog in effect-catalog-fit, a pure fit beside display-grid-fit. Search: `catalog`, `grid fit`, `thumbnail`, `preset preview`, `look preview`. Closest matches: fitDisplayGrid (square picture-over-label tiles for Display; a different frame and fallback) and EffectPresetsSection's looks cards (one effect's looks, not the roster). Decision: compose the existing pictures in a new EffectSelector arrangement with its own pure fit.

Evidence: on the task server. 1920×1000: card 536×858, two columns of 249×84 tiles with 153×57 pictures, nothing scrolls. 1920×1080, 2560×1440 and 3840×2160: card 536×883, tiles 249×87, pictures 152×57. 1440×900: card 438×737, tiles 200×69, pictures 104×39 (a half-pixel overflow from a rounded height was fixed by measuring fractional sizes). 1278×1249 at 1.5x: card 377×645, tiles 170×57, pictures 73×27. 852×833 at 1.5x: card 305×537, the list, two columns of 134×45 buttons ending 14 px above Reset (the compact grid left about 180 px empty). 960×412: compact grid, the card scrolls as before. 820×1180 and 375×667: stacked strip unchanged. Turning on Sparkle, Ghost, Goo and Fire: the compact grid holds at 213 tall at the top; Effects off returns to the pictures (or the list). Reduced motion: the swap is immediate both ways, with no overlap. No clipped names, no horizontal overflow; console clean. Tests: effect-catalog-fit, 5 passing (a sweep checks every picture, name and list row fits its tile).

## September 24: pictures in both states

Austen, after the catalog shipped: the effects get their own pictures while nothing is on, then turning an effect on brings back the same Font Awesome icons, as if the program can't decide what the effect thumbnails should look like.

Why it happened: the previous entry treated the pictures as a way to fill the empty card, so they appeared only with nothing on. With an effect on, the roster went back to the compact icon grid to leave the dock room and to hold still.

Chosen: one rule decides between pictures and icons, and it holds in both states. Wherever the roster fits four pictures across at least 56 px wide, every tile shows its effect's picture with the name under it, whether an effect is on or not; with nothing on the tiles still grow to fill the card, two columns with the name beside the picture. The picture replaces the icon on those tiles instead of sitting next to it, which also leaves room for bigger pictures in the catalog. Where four pictures would be too small (a third of a laptop screen, short landscape, the stacked tray) the icons stay in both states: the list with nothing on, the compact grid with an effect on. With an effect on, the roster's height depends on the card's width alone, so it still holds still while you compare effects and only the dock under it changes. The tune badge sits on the picture's corner. The roster is about 130 px taller than the icon grid at 1080p, so the looks dock under it needs a short scroll for most effects; with the icon grid about four effects did.

Strings: none added or changed.

Ownership ledger: fitEffectCatalog in effect-catalog-fit (extended with fitEffectRoster, the width-only fit for the roster above the dock, and a `fill` flag; picture tiles count the name alone and the tile border), EffectSelector (the `catalog` arrangement now covers a natural-height roster; the picture frame's height is set outright, because a 15:7 picture inside an 8:3 frame stretched it and made the rows taller than the fit allowed), EffectsPanel (passes the roster fit whenever an effect is on and builds the pictures for both states). Reused unchanged: EffectPresetThumbnail, createEffectLookPreview, pickedPresetId and matchPresetId, the view Crossfade.

Evidence: on the task server. 1920×1080: nothing on, two columns with 173×65 pictures; Fire on, four columns with 102×38 pictures in a 504×342 roster. Switching through all 16 effects, the roster's top and height and the dock's top edge stay the same. 2560×1440 and 3840×2160 match 1920×1080. 1440×900: 125×47 off, 78×29 on. 1278×1249 at 1.5x: 94×35 off, 62×23 on. 852×833 at 1.5x: icons in both states (the list off, the compact grid on). 960×412: the compact grid in both states. 820×1180 and 375×667: the stacked tray unchanged. Reduced motion: the swap is immediate both ways. No clipped names, no horizontal overflow, console clean. Tests: effect-catalog-fit, 11 passing (sweeps check that every picture and name fits its tile and that the catalog shows pictures only where the roster keeps them); with the related motion-paths and effects suites, 80 passing.
