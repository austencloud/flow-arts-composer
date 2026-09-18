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
