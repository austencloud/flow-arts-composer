# Canonical Learning Experience

**Decision (2026-08-21, Austen):** Interactive Concepts is the canonical way
to learn The Kinetic Alphabet. The faithful Guide pages remain the canonical
written reference and the source for print/PDF publication.

This separates two jobs that were previously competing under the word
"Guide":

- `/learn/concepts` is the course. It teaches one layer at a time through
  direct interaction, guided practice, and assessment.
- `/guide` is the readable reference. It supports topic lookup, continuous
  reading, print-faithful pages, downloads, and search indexing.
- `/learn/play` is the standalone arcade. Lessons may launch configured
  practice slices from its games later, but they do not copy game engines.

Both learning modes remain mutually discoverable. A published lesson links to
its written topic, and a written topic links back when an interactive lesson
exists.

## Amendment: one topic, three views (2026-10-10, Austen)

Austen approved the Guide rethink pilot
(`docs/superpowers/specs/2026-10-10-guide-rethink-design.md`). Each topic now
has one shared record of its explanations, figures and examples, read by
three views: the interactive lesson, the Guide web page and the print
handbook. Each view composes that content for its own medium; bespoke lesson
state machines stay.

- Authority for written content and print moves from the faithful pages to
  the shared topic record as each topic migrates. The Grid is the first
  (`src/lib/shared/guide-topics/grid-topic.ts`); topics not yet migrated keep
  the faithful pages as their source.
- The faithful book stays available at `/guide/level-1/print` and becomes the
  Level 1 first edition. The new handbook (`/guide/level-1/handbook`, noindex
  until complete) is built from the shared records.
- `/guide` is lesson first: "Start the first lesson" is the primary action and
  "Read the guide" the second.
- A Guide topic's lesson link opens the lesson from its first step. Other
  lesson links resume saved progress.
- A test proves that one edit to a shared record changes the lesson, the
  web page and the handbook together.
- One interactive explainer per concept (2026-10-12, Austen). Each concept's
  interactive explainer lives in one route; every other view names the
  concept in a sentence and links to that route instead of teaching it again.
  Timing and direction are taught by the Timing and Direction lesson intro and
  the `/timing-and-direction` mode guides, so the Type 1 Dual-Shifts Guide
  page links its four mode chips there rather than adding its own stage.

## Product truth

`concept-experience-registry.ts` owns the set of lessons that can actually be
opened. The 28-item curriculum in `concepts.ts` remains the planning sequence;
it is not an availability claim. Cards, deep links, progress totals, rendering,
and Guide cross-links must derive availability from the experience registry.

Every published lesson has a stable URL:

```text
/learn/concepts/<concept-id>
```

Unknown and unpublished concept IDs return to the course path rather than
opening a placeholder that looks released.

## Capability ownership evidence

Searches covered `concept`, `lesson`, `guide`, `route`, `active concept`,
`progress`, and `game`. The closest owners were:

- `concepts.ts`: curriculum order and prerequisite metadata;
- `ConceptDetailView.svelte`: experience rendering, previously a duplicated
  hard-coded availability list;
- `experience-persistence.svelte.ts`: lesson resume state;
- `url-state.ts`: browser URL/history writes;
- `game-registry.ts`: standalone arcade definitions.

This change extends those owners. It creates one feature-local availability
registry, composes the existing URL writer for concept deep links, and keeps
the readable Guide and arcade implementations separate.

## Superseded ambiguity

This decision refines, rather than discards, the earlier ADRs:

- The [July Guide source decision](../archive/swarm-2026-10-14/architecture/guide-single-source.md) records the earlier print/online parity plan; the October amendment above governs migrations.
- The [June convergence notes](../archive/swarm-2026-10-14/learn/concepts-convergence-notes.md) record the earlier instructional rationale.

"Canonical Guide content" and "canonical way to learn" are no longer treated
as the same product role.

## Print-source continuity

Merged from [guide-single-source.md](../archive/swarm-2026-10-14/architecture/guide-single-source.md) (original directory: `docs/architecture/`) on 2026-10-14.

The faithful-page rebuild tracked in
`docs/superpowers/specs/audits/2026-06-21-guide-rebuild-tracker.md` preserves
original PDF artboard fidelity. Its July Guide Reader checkpoint is recorded in
`docs/superpowers/specs/shipped/2026-07-07-guide-reader-design.md`.
Keep prose, pictograph data and reading order separate from absolute print
coordinates so each medium can compose the same content. Preserve Guide SEO,
canonical URLs and pictograph accessibility labels as individual topics migrate.
The October amendment above governs topic ownership; reconcile each remaining
legacy page before retiring it.

## Instructional rationale retained from convergence

Merged from [concepts-convergence-notes.md](../archive/swarm-2026-10-14/learn/concepts-convergence-notes.md) (original directory: `docs/learn/`) on 2026-10-14.

The June 19 rejection of the concept skeleton's simultaneous 2D grid,
pictograph, animation and 3D panels remains useful: a static hand placement gains
nothing from a static-hold animation, and duplicating its pictograph adds noise.
Choose the representation that explains the concept and let that artifact
transform through progressive reveal and construction. Reserve an avatar-led
view for concepts where embodiment or motion explains something the flat view
cannot. Reuse the existing pictographs and motion assets.

Placements describe where hands are. Sliding between placements is a teaching
transition, not part of a static placement's definition. The June lesson plan and
September quiz-pending snapshot remain in the archived notes; current lesson
availability and review status come from the experience registry.

## Release rules

1. A lesson appears in the learning path only after its experience is entered
   in the registry.
2. `CONFIRMED` still requires Austen to use and approve the lesson. A built
   lesson may ship, but its internal review status remains explicit.
3. A Guide topic only advertises an interactive lesson when the registry maps
   that exact topic.
4. Future game reuse goes through a configured practice adapter owned by Learn;
   scoring and game mechanics remain owned by Play.

## Verification

- Registry IDs must exist in the curriculum and remain unique.
- Guide mappings must remain unique and point to real Level 1 slugs.
- Direct load, refresh, in-page Back, and browser Back/Forward must preserve the
  selected lesson and URL.
- Course and Guide entry points are checked at 375x667, 960x412, 820x1180,
  1440x900, 1920x1080, 2560x1440, and 3840x2160.
