---
status: backlog
value: 3
effort: L
remaining: "Stage 1 only, and Stage 1 is confirmed done as designed: +page.server.ts errors 404 outside dev and +page.svelte emits robots noindex,follow in production (re-verified 2026-09-13). Media production, integration, review and release stages are not started; no LessonMediaRequest or ApprovedLessonMediaPackage type exists in src/ yet. Gated on VIDEO-001 - the app requests and presents approved media, it does not produce it. Fixture-complete is not publish-ready."
depends_on: "2026-07-27-video-001-production-system-program.md"
plan_path: ""
tags: [learn, lesson, video, blocked-media-gate]
last_triaged: 2026-09-13
---

<!--
Reconciliation note, 2026-09-13. Two corrections, no scope change.

1. `depends_on` was empty while the body has always declared VIDEO-001 as the
   dependency. The queue skips a spec whose `depends_on` names an unshipped
   spec, so an empty field was ranking this as unblocked work. VIDEO-001 lives
   at `backlog/2026-07-27-video-001-production-system-program.md` and is not
   shipped; this spec is correctly blocked.
2. The read-only drift detector classified this DIVERGENT (53 topical commits
   of 913 touching its paths, 3 on named files). Adjudicated as a FALSE
   POSITIVE -- the sample subjects are MPFB thumb orientation, avatar staff
   grips and first-session lifecycle analytics, none of which is this lesson.
   That is the detector's documented "broad paths" mode. The production gate
   below is real and stays.
-->
# Staff Choreography First Lesson: Product Spec

**Date:** 2026-07-27  
**Status:** Scope approved; implementation not started; production gate active  
**Route:** `/learn/staff-spinning-choreography`  
**Depends on:** [VIDEO-001: TKA Video Production System](./2026-07-27-video-001-production-system-program.md)  
**Current gate:** [`+page.svelte`](<../../../src/routes/(public)/learn/staff-spinning-choreography/+page.svelte>)

## Decision

Keep the route. Replace the prose article with a first physical lesson.

The page earns its place by helping a new double-staff learner watch one move,
try it, and connect the movement to TKA notation. It does not earn its place by
repeating the guide, retelling the history of staves, or targeting a search
phrase with a long article.

Production stays gated until the app experience and its media package pass
separate review gates. App implementation may proceed against fixture media.
Fixture-complete is not publish-ready.

The governing boundary is:

> The app requests and presents approved media. It does not produce media.

## Ownership boundary

| Owner             | Owns                                                                                                                                                                     | Does not own                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff lesson page | Learning outcome, interaction order, playback behavior, notation synchronization, responsive layout, accessibility behavior, SEO integration, loading and failure states | Footage selection, scripts, shot design, filming, directing, editing, voiceover, captions production, encoding, upload operations, or media approval |
| VIDEO-001         | Intake, inventory, reuse-or-reshoot decision, production, post-production, accessibility assets, review, publishing, versioning, and the approved delivery package       | Page layout, public navigation, lesson UI, app analytics, or release of the gated route                                                              |
| Handoff contract  | A `LessonMediaRequest` going in and an `ApprovedLessonMediaPackage` coming out                                                                                           | Informal file drops, unreviewed URLs, or page code that reaches into raw production storage                                                          |

Existing footage is candidate inventory owned by VIDEO-001. Finding takes,
cutting clips, or exporting a delivery file is video work even when no new
camera is involved.

## Place in the public ecosystem

| Surface                              | Job                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `/notation/staves`                   | Explain why staves matter to the notation and provide technical context |
| `/guide`                             | Teach the full curriculum in order and remain the reference             |
| `/learn/staff-spinning-choreography` | Deliver the first physical practice session                             |
| `/create`                            | Let the learner build and explore after the first session               |

The staff lesson should link to the other three surfaces. It should not copy
their content.

When the page ships:

- The homepage strip label changes from `Staff Choreography` to `First Staff
Lesson`.
- The guide link describes a first physical session rather than a history
  article.
- `/notation/staves` keeps the explanation of why TKA starts with staves.
- The final action offers the guide and Composer as two clearly different next
  steps.

## Learner and outcome

The primary learner:

- is new to TKA or has only seen the notation;
- has two safe practice props and enough clear space to move;
- needs one concrete win before deciding whether to enter the full guide.

By the end of the page, the learner can:

1. choose A, B, or C without scrolling through an essay;
2. control the demonstration speed and playhead;
3. see the current notation step follow the human demonstration;
4. attempt each movement physically;
5. watch the three letters connected as an ABC sequence;
6. choose the guide or Composer as the next destination.

The page does not certify mastery. It does not replace the Learn concepts for
staff positions, staff motions, or negative space.

## Curriculum slice

The route uses one reviewed variation of each letter. The exact variation and
start position must be pinned in the media request so the video, notation, and
animation cannot drift.

Current MCP-grounded letter facts:

| Letter | Type               | Prop motion used by the lesson |
| ------ | ------------------ | ------------------------------ |
| A      | Type 1, Dual-Shift | pro / pro                      |
| B      | Type 1, Dual-Shift | anti / anti                    |
| C      | Type 1, Dual-Shift | anti / pro                     |

The existing tutorial scripts frame the physical teaching as:

- A: isolations and a body-turn solution;
- B: antispins, negative-space pockets, and body turns;
- C: one isolation and one antispin.

Those scripts are source material, not approved page media. The relevant
sections live in
[`Voiceover-Scripts.md`](../../tutorial-video-voiceover/Voiceover-Scripts.md).
The existing beginner class description also names isolations, antispins,
negative space, body turns, orientation, and ABC in
[`portfolio-seed.ts`](../../../src/lib/features/festivals/data/portfolio-seed.ts).

The current Learn curriculum records `staff-positions` and `staff-motions` as
built but awaiting audit, while `negative-space` is not started. This route
must not quietly stand in for those lessons. See
[`concept-status.md`](../../learn/concept-status.md).

## The experience

The interactive stage begins immediately after a short title and a clear-space
notice. There is no introductory essay.

### First frame

- A three-option
  [`SegmentedControl`](../../../src/lib/shared/ui/components/SegmentedControl.svelte)
  selects A, B, or C.
- A is selected initially.
- The selector uses its `tabs` semantics, roving focus, arrow keys, Home, and
  End behavior.
- The selected letter's poster, notation, and controls occupy reserved space
  before media loads.
- Nothing starts with sound or motion before the learner acts.

The learner can touch a meaningful control within five seconds. Selecting a
letter, starting playback, seeking, or choosing a notation step all count.

### One letter

Each letter view contains:

- one approved human demonstration;
- the matching TKA notation;
- one shared playhead;
- play and pause;
- seek;
- 0.5x, 0.75x, and 1x playback;
- a clickable notation step that seeks to its cue;
- captions when the media contains speech or meaningful sound;
- a visible descriptive transcript for the movement itself;
- one short physical practice instruction.

Desktop and wide tablet place video and notation side by side. Narrow screens
stack them, keep the selector and transport reachable, and preserve the same
playback state. Changing layout must not restart the clip.

Changing A, B, or C pauses the previous clip and restores the selected clip's
last position during the current visit. Reloading the page may reset the
lesson. Account persistence is outside this scope.

### Physical practice

The page invites physical practice without pretending to observe it. No
completion checkbox, camera permission, pose scoring, countdown ceremony, or
false mastery state is added.

The learner may watch, slow down, seek, and try the movement as many times as
needed. A, B, and C remain freely reachable. The interface does not lock one
letter behind another.

### ABC payoff

After the three letter tabs, one reviewed ABC sequence plays in the existing
public sequence stage with its notation strip.

Extend
[`SequenceHeroDemo.svelte`](../../../src/lib/shared/landing/components/SequenceHeroDemo.svelte)
to forward the `scrubbable` and `singlePlay` capabilities that already exist
in
[`InlineAnimationPlayer.svelte`](../../../src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte).
Do not build another animation player.

The ABC sequence must reference the same exact A, B, and C variations used in
the three approved clips.

### Exit

Two button-shaped actions close the lesson:

- `Keep learning` goes to `/guide`.
- `Build a sequence` goes to `/create`.

An in-sentence reference may link to `/notation/staves` for the history and
technical explanation. No shop action appears in this first-session flow.

## Media handoff

The canonical contract belongs to
[VIDEO-001](./2026-07-27-video-001-production-system-program.md). The page
consumes these approved fields and does not define a second media schema:

- stable package ID, revision, and approval status;
- exact sequence reference for each A, B, and C clip;
- immutable media URL and content hash;
- poster;
- intrinsic width, height, MIME type, and duration;
- WebVTT captions when applicable;
- descriptive transcript;
- step map compatible with the existing `StepMap` shape;
- publication metadata required for `VideoObject`.

Development fixtures must implement the same contract. They must be obviously
synthetic and must never become a production fallback.

## Reuse and extraction plan

The repository already contains the required mechanics.

| Need                        | Decision                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Letter selector             | Reuse `src/lib/shared/ui/components/SegmentedControl.svelte` with `semantics="tabs"`                                                                                            |
| Human video plus notation   | Extract the reusable playback surface from `src/lib/features/video/video-lab/views/SyncedPlaybackView.svelte`; update that view to consume the extraction instead of forking it |
| Video time to notation step | Reuse `StepMap` and `getHighlightedBeatFromVideo(...)` from `src/lib/shared/video-collaboration`                                                                                |
| Notation interaction        | Reuse the `ChoreoCard` highlighted-step and step-click path already exercised by `SyncedPlaybackView.svelte`                                                                    |
| ABC animation               | Extend `SequenceHeroDemo.svelte` to forward existing `InlineAnimationPlayer` options                                                                                            |
| Head metadata               | Reuse `src/lib/shared/components/Seo.svelte` and its JSON-LD passthrough                                                                                                        |
| Production gate             | Preserve the current `dev` wrapper, `UnderConstruction`, `noindex`, sitemap omission, and focused contract test until release review                                            |

`SyncedPlaybackView.svelte` already owns video time tracking, seeking, playback
rate, current-step highlighting, and click-to-step seeking. Its lab header,
back-to-mapping action, and BPM readout do not belong on the public lesson.
Extraction is required; copying that logic is forbidden.

Native HTML media, text tracks, and the internal playback paths cover this
scope. Do not add a third-party video player.

## States and failure behavior

| State                         | Behavior                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Production gate               | Existing review notice; route remains `noindex` and absent from the sitemap          |
| Development fixture           | Full interaction with clearly marked fixture media                                   |
| Loading                       | Poster and reserved notation shell remain stable; controls report busy state         |
| Ready                         | Media, notation, transcript, and transport are usable                                |
| Media failure                 | Keep notation and text instruction visible; show a retry button and the guide action |
| Package invalid or unapproved | Fail validation before release; do not render the package in production              |

Missing captions, transcript, step map, poster, dimensions, or final approval
is a package failure. The page does not silently substitute a legacy file.

## Accessibility and control requirements

- All functions work by keyboard and pointer.
- The A/B/C selector follows tab semantics and exposes the selected panel.
- The seek control uses a native range input or the existing accessible range
  path, with a useful `aria-valuetext` such as `12 seconds of 24 seconds`.
- Button targets meet the project 44px floor.
- Captions are synchronized and user-controllable.
- A descriptive transcript communicates the visible movement, not only spoken
  words.
- Paused video remains paused when the learner changes layout.
- Nonessential transitions stop under `prefers-reduced-motion`.
- Functional motion remains under direct learner control.
- Focus never jumps when the active letter changes.

W3C guidance requires accessible media controls, captions, transcripts, and
descriptions of meaningful visual information. The WAI slider pattern also
defines keyboard behavior and human-readable values for media seek controls.

## SEO and release integration

The page is a learning resource with embedded demonstrations, not an article.

After the media gate passes:

- `Seo.svelte` owns the standard title, description, canonical, Open Graph,
  and Twitter fields.
- JSON-LD describes a `LearningResource` containing the approved
  `VideoObject` entries.
- Each `VideoObject` is generated from approved package metadata.
- No `Clip` or `SeekToAction` markup is emitted unless the final media and URL
  behavior meet Google's requirements.
- The route returns to the sitemap.
- The homepage and guide labels change as described above.
- The production `noindex` and `UnderConstruction` branch are removed in the
  same reviewed release change.

There is no SEO word-count target and no filler section. Search value comes
from a useful first lesson, original demonstrations, clear metadata, and
working internal links.

## Explicit non-goals

This spec does not include:

- locating, reviewing, trimming, or encoding existing footage;
- deciding whether to reuse footage or shoot again;
- writing narration or a shot list;
- camera, lens, lighting, backdrop, wardrobe, audio, or performance direction;
- an editing project, caption authoring workflow, or upload workflow;
- raw-media storage, backup, naming, provenance, rights, or releases;
- an in-app video production console;
- recording the learner;
- computer vision, pose estimation, or performance scoring;
- accounts, saved progress, quizzes, grades, streaks, or rewards;
- a rebuild of the full Learn curriculum;
- a replacement for `/notation/staves`, `/guide`, or `/create`;
- release of the route before human review.

Every item concerning how a video is created belongs to VIDEO-001.

## Delivery stages

1. **Product fixture:** Build the page against a contract-valid synthetic
   package while retaining the production gate.
2. **Video package:** VIDEO-001 produces and approves the real package in a
   separate body of work.
3. **Integration:** Replace fixture data with the approved package and verify
   video-to-notation cue accuracy.
4. **Human review:** Review teaching, movement, copy, media, responsive layout,
   accessibility, and ecosystem links together.
5. **Release:** Remove the gate, restore the sitemap entry, and update the
   homepage and guide labels.

No stage may pull production tasks from stage 2 into the product implementation
ticket.

## Acceptance gates

### Product gate

- A meaningful control is available within five seconds.
- A, B, and C can be selected by touch, mouse, and keyboard.
- Playback, seeking, speed, notation highlighting, and step seeking use the
  shared implementation paths named in this spec.
- The ABC animation is scrubbable, single-play, and notation-linked.
- Loading and error states preserve layout.
- Focus, reduced-motion behavior, captions, transcript, and target sizes pass
  review.
- Focused tests, type checking, production build, and the required viewport
  screenshots pass.

### Media gate

- `ApprovedLessonMediaPackage.review.status` is `approved`.
- The exact A, B, and C sequence references match the rendered notation.
- Every cue map is checked against the final encoded delivery file.
- Poster, dimensions, duration, captions, descriptive transcript, publication
  metadata, and content hash are present.
- A human has reviewed the movement, instruction, edit, and accessibility
  assets.

### Release gate

- Product and media gates both pass.
- Austen reviews the complete page at its canonical URL.
- The focused gate contract is intentionally updated.
- `noindex` is removed and the sitemap entry is restored.
- Navigation copy points to the first lesson accurately.

## Evidence and design basis

Internal evidence:

- The current route gate and test:
  [`+page.svelte`](<../../../src/routes/(public)/learn/staff-spinning-choreography/+page.svelte>)
  and
  [`staff-choreography-review-gate.test.ts`](../../../tests/unit/staff-choreography-review-gate.test.ts)
- Existing synchronized playback:
  [`SyncedPlaybackView.svelte`](../../../src/lib/features/video/video-lab/views/SyncedPlaybackView.svelte)
- Existing step-map model and lookup:
  [`collaborative-video.ts`](../../../src/lib/shared/video-collaboration/domain/collaborative-video.ts)
  and
  [`step-map-utils.ts`](../../../src/lib/shared/video-collaboration/utils/step-map-utils.ts)
- Existing public animation stage:
  [`SequenceHeroDemo.svelte`](../../../src/lib/shared/landing/components/SequenceHeroDemo.svelte)
- Existing tutorial production state:
  [`HANDOFF.md`](../../tutorial-video-voiceover/HANDOFF.md)

External basis:

- [W3C: Making Audio and Video Media Accessible](https://www.w3.org/WAI/media/av/)
- [W3C: Slider Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/)
- [W3C: Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced)
- [Systematic review of observational and physical motor practice](https://www.nature.com/articles/s41539-024-00271-5)
- [Research on segmented learning videos](https://link.springer.com/article/10.1007/s10758-024-09745-2)
- [Google: People-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google: Video structured data](https://developers.google.com/search/docs/appearance/structured-data/video)
- [Schema.org: LearningResource](https://schema.org/LearningResource)
