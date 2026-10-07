---
status: active
value: null
effort: null
work_state: in-progress
remaining: Finish the Learn/Atlas progress projection and verify lesson start, concept return, and seven-viewport map behavior.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Unified Learn and Atlas - Product and Architecture Contract

**Date:** 2026-08-28  
**Status:** Approved direction, implementation in progress  
**Owner:** Learn module  
**Handoff:** [`../2026-08-28-unified-learn-atlas-handoff.md`](../2026-08-28-unified-learn-atlas-handoff.md)

## Mission

Make Lessons, Play, the written Guide, the Kinetic Atlas, the Letter Codex,
TIKA, and Composer handoffs feel like one learning product. They must share one
concept model, one progress language, and one navigation grammar. The learner
chooses a concept. The product then offers the useful way to engage with it.

The Atlas is not an encyclopedia and does not duplicate the Guide. It is the
bird's-eye map of the same journey the interactive lessons teach one step at a
time.

## Product jobs

The unified product must answer four learner questions:

1. Where am I in the Kinetic Alphabet?
2. What should I do next?
3. Where can I revisit or practice something I already encountered?
4. Where does this concept appear in real letters, sequences, and creation?

If a surface cannot answer one of those questions better than the existing
lesson, Guide, Codex, Composer, or TIKA, it does not earn a new destination.

## One graph, several activities

```text
Learn home
|- Continue
`- Atlas map
   `- TKA level
      `- Concept place
         |- interactive lesson
         |- free exploration or review
         |- relevant practice
         |- written Guide reference
         |- Codex, sequence, or Composer application
         `- contextual TIKA help
```

These are resources attached to one concept place, not parallel curricula.
Every entry point must return to the same concept and preserve the learner's
place.

## Vocabulary gate

### TKA levels

"Level 1" through "Level 9" always refer to the official Kinetic Alphabet
level system owned by `@tka/domain` and the Flow Arts Knowledge MCP. No other
feature may use those labels as a local difficulty ladder.

### Game progression

Games use one of these terms according to their mechanic:

- **Challenge** for a discrete authored difficulty step
- **Round** for one scored play unit
- **Stage** for a sequence of challenges inside a game
- **Difficulty** for a selectable intensity or constraint set

User-facing game copy must not call its local progression a level. Existing
internal `levelNumber` fields may remain during migration, but presentation and
routes must distinguish them from `MajorLevel`.

### Concept identifiers

Official knowledge nodes such as `1.1` and `1.2` are the canonical concept
places. Existing interactive lesson slugs such as `grid` and `hand-positions`
are resources attached to those places. They must not be treated as a second
level system.

## Concept place contract

A concept place is the smallest durable unit of the unified product.

```ts
interface LearnConceptPlace {
  id: string;                    // official knowledge node, for example "1.2"
  tkaLevel: MajorLevel;
  prerequisites: string[];
  lessonIds: string[];
  guideRefs: GuideReference[];
  exploration: ExplorationReference | null;
  practice: PracticeReference[];
  applications: ApplicationReference[];
}
```

The registry records relationships and provenance. It does not contain a
second copy of lesson prose, Guide prose, letter data, pictographs, sequences,
or game logic.

Each reference must point to the existing owner:

- Lessons: `concept-experience-registry.ts`
- Written material: Level 1 and Level 2 Guide manifests and reader configs
- Games: `game-registry.ts` and the Play session owner
- Letter exploration: Letter Explorer and canonical letter URLs
- TKA curriculum: `@tka/domain` knowledge graph
- Progress: the Learn and Play progress owners until a tested projection
  combines them

## Progressive disclosure

### First visit

- Default to TKA Level 1.
- Show one clear continuation action.
- Keep future concepts inspectable, but visually quiet.
- Do not show a glossary, a wall of definitions, or all activities at once.

### Before a concept is learned

- Show a real artifact or interaction preview.
- Make the lesson the primary action when one exists.
- Never start a timed or scored activity from concept selection alone.

### After a concept is learned

- Make review or free exploration available from the same place.
- Recommend at most one practice activity at a time.
- Keep Guide, Codex, and Composer paths secondary and contextual.

### Expert path

- Allow all published levels and concepts to be inspected without forcing a
  beginner through them.
- Do not mark unavailable content as a complete destination.
- Preserve stable URLs for level, concept, activity, and selected letter state.

## Mastery and human confirmation

Opening a concept is not mastery. Finishing a lesson is not proof of fluency.
The product may track a gradient such as encountered, learned, practiced, and
proficient, but every state must be backed by an observable event.

An interactive lesson is not `CONFIRMED` until Austen or another real learner
physically uses it and approves the experience. Code review, automated tests,
and visual inspection can establish `BUILT`; they cannot establish intuitive
learning.

Every lesson review must answer:

1. Can the learner touch something meaningful within five seconds?
2. Can the concept be discovered through the interaction instead of revealed
   by introductory prose?
3. Does a wrong action demonstrate what that action meant?
4. Does the difficulty move from discovery to an unassisted transfer task?
5. Can the learner return later and recognize the concept place immediately?
6. Can the learner leave and return without losing progress or map position?

## Navigation confidence contract

At every point, the learner must be able to answer:

- Where am I?
- What will happen if I select this?
- How do I return?

Therefore:

- One action is visually primary.
- Choices show the actual artifact before selection.
- Back returns to the same concept and map position.
- Browser history and reload preserve the active level and concept.
- A scored activity starts only after an explicit start action.
- Activity labels use a stable vocabulary across desktop and compact layouts.
- Progress never changes merely because a reference or preview was opened.

## First vertical slice

The first slice proves the relationship model with existing owners:

1. **1.1 The Grid** - confirmed interactive lesson, review surface, and Guide
   reference.
2. **1.2 Positions** - built interactive lesson, exploration surface, and Guide
   reference.
3. **1.3 Motion Types** - built interactive lesson, canonical pictographs,
   Guide reference, and an explicitly mapped practice candidate.
4. **1.5 Letter Types** - Letter Atlas and Letter Explorer, the available Type 1
   lesson, recognition practice candidates, and Composer handoff.

The slice must not imply that every planned lesson is already available.

## Known seams that must be resolved

1. The Learn course uses lesson slugs while `@tka/domain` uses numeric knowledge
   node IDs.
2. Lesson progress and Play progress are persisted separately.
3. Some quiz history currently records a coarse letter-to-concept fallback
   rather than the concept actually practiced.
4. Game-local `levelNumber` values can be confused with TKA levels.
5. The public Atlas groups glossary categories rather than curriculum concepts.
6. Only six interactive experiences are currently published, and only the Grid
   experience is confirmed.
7. The written Guide has published Level 1 and Level 2 material, while the
   interactive course is currently Level 1 only.

## Non-goals

- Rewriting all Guide prose into cards
- Creating decorative diagrams for concepts
- Duplicating lesson interactions inside the Atlas
- Calling search results a curriculum
- Hiding expert reference material behind hard locks
- Building all nine levels before the first slice is proven
- Renaming internal fields without a migration plan

## Verification gates

### Contract tests

- TKA level labels only use `MajorLevel` meaning.
- Game presentation never emits `Level N` for local progression.
- Every concept resource resolves to a registered owner.
- Routes preserve level, concept, and selected activity across reload and
  back/forward navigation.
- Opening reference or exploration does not complete a lesson.

### Interaction verification

- A first-time user can start the recommended lesson without scanning the map.
- Selecting a concept does not unexpectedly start scoring or a timer.
- Completing or leaving an activity returns to the same concept place.
- Completed concepts expose review without replaying the full lesson.

### Visual verification

Verify at 375x667, 960x412, 820x1180, 1440x900, 1920x1080, 2560x1440,
3840x2160, and 200 percent browser zoom. Inspect hierarchy, actual artifact
legibility, touch targets, focus, reduced motion, and whether the map feels like
a product rather than generated output.

## Drift rule

Before beginning or ending a deep lesson-specific pass, reread these sections:

- Mission
- Vocabulary gate
- Concept place contract
- First vertical slice
- Known seams

Update the handoff whenever a decision changes the broad architecture. A
lesson-level fix must not silently redefine the product model.
