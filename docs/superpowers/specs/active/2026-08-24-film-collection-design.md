---
status: active
value: null
effort: null
work_state: unverified
remaining: Audit the Film collection naming, Library entry, persistence, and Director handoff against the design acceptance before claiming completion.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Film Collection — Design

**Date:** 2026-08-24
**Status:** Active
**Supersedes nothing. Extends:** `docs/superpowers/specs/2026-08-23-film-director-directive-language-design.md`

## Problem

The Film Director can now spin up an arbitrary directed 3D film from a JSON
document — cast, props, effects, planes, efforts, formation, environment,
camera language, and per-performer sequences including mirrors. Five films ship
in a hardcoded library at `src/routes/test/film-director/_films/`, selectable by
`?film=<key>`.

Nothing a user composes survives the tab. There is no way to save a film, name
it, come back to it, or show it to anyone.

Two things block a save feature, and the second one is the reason this spec
exists at all:

1. **There is no saved-artifact type for a film.** The nearest neighbour,
   `Collected3DScene`, is a frozen snapshot with one camera state and no time
   axis — its own source comment calls it a reusable "look". A film is a
   *movie*: multiple units, each with its own duration, camera moves, cast, and
   location. Photograph versus film. Not the same artifact.

2. **The vocabulary is wrong, and it will get worse the moment it is
   persisted.** The word `scene` currently carries four distinct meanings in
   this codebase, and the film director uses it for the one meaning the
   cinematography metaphor does not assign it.

## Part 1 — Vocabulary

### The collision inventory

| Current use | Meaning today | Where |
|---|---|---|
| `shot.scene: { environmentId, showStage, visiblePlanes }` | the **location** a unit is set in | film-director schema |
| `SceneEnvironmentId` | the catalog of 3D environments | `$lib/shared/3d/environments` |
| `Collected3DScene` | a saved frozen 3D look | `scene-3d-collection` |
| `@austencloud/scene-3d` | the 3D engine package | node_modules |

Two other candidate words are already taken and cannot be reused:

- **performance** — uploaded performance videos
  (`shared/video-collaboration/state/sequence-videos-store.svelte.ts`), *and*
  the director's own per-shot `performance` block (bpm, formation, performers).
- **sequence** — hard-taken by TKA choreography. Untouchable.

**film** is free. A repo-wide grep for film/movie/reel/production in `src/lib`
returns 311 hits, all of them build tooling and analytics noise. No product
concept holds it.

### The decision: Film / scenes / location

In film vocabulary, a **scene** is a continuous unit of action in one place. A
**shot** is one unbroken camera take; several shots normally cover one scene.
A **location** is where a scene is set.

Measured against that, the director's `shots[]` entries are not shots. Each one
carries its own environment, its own cast, its own camera *moves* (plural), and
its own duration. That is a scene. And the field currently named `scene:` holds
`environmentId` — that is a location.

So the labels are simply on the wrong things. The rename:

| Before | After |
|---|---|
| `film.shots[]` | `film.scenes[]` |
| `shot.scene: {…}` | `scene.location: {…}` |
| `DirectorShotInput` | `DirectorSceneInput` |
| `ResolvedDirectorShot` | `ResolvedDirectorScene` |

**"shot" is deliberately left free.** If the director later grows real coverage
— two or three camera takes within one continuous unit of action — the word is
waiting and correct. Spending it now on the wrong tier would foreclose that.

**"location" over "set".** `scene.location.environmentId` reads plainly.
`set` collides with `Set` and with setter semantics in a TypeScript codebase.

### Explicitly out of scope: renaming `Collected3DScene`

Under the new vocabulary `Collected3DScene` is misnamed — it is a saved *look*,
not a scene. It is also shipped, persisted in Firestore, and keyed in
localStorage as `tka:scene-3d-collection`. Renaming it is a data migration, not
a rename, and it is unrelated to shipping film saves. It stays as it is. This
spec notes the debt and does not pay it.

## Part 2 — Schema v3 and the rename

`FILM_DIRECTOR_SCHEMA_VERSION_3 = 3`. The `version` union accepts 1 | 2 | 3.

### Normalizer, not a hard break

A `normalizeFilmDirectorInput(raw)` preprocess step runs before validation and
upgrades legacy shape in place:

- `raw.shots` → `raw.scenes` when `scenes` is absent
- each unit's `scene` → `location` when `location` is absent

Two reasons this is worth the ~20 lines rather than a clean break:

1. The workbench has a live JSON editor. Any document pasted into it — from a
   chat log, an old file, a screenshot — keeps working.
2. Saved films persist the raw input document. A future v4 needs this same
   upgrade seam to exist; building it now means saved films are never orphaned
   by a later bump.

If both `shots` and `scenes` are present, that is a malformed document and the
schema rejects it rather than guessing.

### Seed stability is a hard requirement

Directive resolution seeds per-(unit, axis). `chance-suite` resolves its random
picks off those seeds, and the adversarial directive corpus asserts exact
resolved values — 244 assertions across 8 categories
(`tests/unit/film-director/directive-corpus/`), with a coverage bar of ≥200
entries and ≥30% rejection cases.

**Verified 2026-08-24: the rename cannot perturb seeds.** `createAxisStream` in
`_lib/directive-random.ts:40` derives its stream from
`hashString(\`${seed.base}\0${salt}\0${shotId}\0${axis}\`)`, where `seed.base`
is `hashString(filmId)`. The inputs are the film id, the per-axis salt, the
**unit's own `id` string**, and the **axis name**. Neither the array field name
nor the array index participates. Renaming `shots[]` → `scenes[]` is therefore
seed-neutral by construction.

Two things that WOULD shift seeds, and are consequently forbidden in this work:

- changing any unit's `id` in the five film files;
- renaming an axis string. `environmentId` keeps its name even though it moves
  from `scene` to `location` — the axis name is hashed.

`createAxisStream`'s `shotId` parameter may be renamed to `sceneId`; it is a
parameter name, not a hashed value.

**The corpus suite passing unchanged is the acceptance test for the rename.**

### Directive-axis lockstep

`FILM_DIRECTOR_DIRECTIVE_AXES` and the capability-matrix doc's
`<!-- directive-axes: … -->` comment are asserted equal by
`tests/unit/film-director/capability-matrix.test.ts`. The axis list itself is
unaffected by this rename (no axis is named `shot` or `scene`), but the doc's
prose describing shot-scope directives is updated to say scene-scope.

### Scale

~340 references across 34 files (18 source, 16 test). Mechanical, broad, and
fully covered by the existing suites.

## Part 3 — The collection

### Where it lives

`src/lib/features/film-collection/` — a real feature module, mirroring
`scene-3d-collection`'s layout:

```
domain/film-collection-types.ts       CollectedFilm + zod schema + keys
state/film-collection-state.svelte.ts CollectionState wiring
services/capture-film-poster.ts       poster off the live canvas
services/open-film.ts                 load a saved film into the director
components/SaveFilmModal.svelte       name + poster preview + save
FilmCollectionModule.svelte           the gallery
```

### The entry

```ts
export interface CollectedFilm extends CollectionEntry {
  // id, name, createdAt come from CollectionEntry
  poster: string;        // ~200px WebP data URL, "" if capture failed
  film: FilmDirectorInput;   // the raw input document, v3
  durationSeconds: number;   // denormalized from the resolved spec
  sceneCount: number;        // denormalized from the resolved spec
}
```

`film` stores the **raw input document**, not the resolved spec. Three reasons:

- Directives are the authored intent. A saved `chance-suite` should re-roll
  from its seed on open, not be frozen to one resolution.
- The resolved spec is derived and much larger.
- It is the exact thing the JSON editor round-trips, so save/open/edit is
  lossless.

`durationSeconds` and `sceneCount` are denormalized off the resolved spec purely
so the gallery can render meta chips without resolving every entry.

Storage key `tka:film-collection`, schema version 1.

### The state

Seventeen lines, copied structurally from `scene-3d-collection-state`:

```ts
export const filmCollectionState = new CollectionState<CollectedFilm>(
  createFirebaseCollectionRepository("film-collection", CollectedFilmSchema),
  new LocalCollectionRepository(
    FILM_COLLECTION_STORAGE_KEY,
    FILM_COLLECTION_SCHEMA_VERSION,
  ),
);
```

The shared engine at `$lib/shared/collections/` supplies everything else:
Firestore as source of truth when signed in, localStorage when a guest,
automatic migration of guest saves on sign-in, optimistic writes with rollback,
`add`/`remove`/`rename`/`update`, and read-only preview of another user's
collection. No `lifecycle` hook is needed — a film has no post-add enrichment.

### Poster capture — the one place films differ from 3D scenes

A saved 3D scene has no time axis, so "the current view" is the only poster it
could have. A film does have one, and frame 0 is usually a bad thumbnail —
Star of Five opens on a close-up of one performer's face, which represents a
five-person star badly.

**So: the poster is whatever is on canvas when you hit save.** Scrub the
transport to the frame that represents the film, then save. This needs no new
UI; the transport already scrubs.

Capture reuses `captureScene3DPoster(viewer3DState)` from
`scene-3d-collection/services/capture-3d-scene.ts` — the director workbench
holds a `Viewer3DState`, and that helper already wraps the shared
`captureTunnelPoster` (~200px WebP off the WebGL canvas, `""` when
unavailable). No second poster path.

### Save modal

Name field, poster preview, save. Deliberately **not** modelled on
`SaveSceneModal.svelte` (582 lines) — most of that file is the packing-list
group toggles that let a user choose which parts of the live viewer state get
snapshotted. A film needs none of it: the film document is already the complete,
authored, serialisable artifact. There is nothing to pick.

Default name: the film's `title`, editable.

### Gallery

`FilmCollectionModule.svelte` — poster grid, name, meta chips (scene count,
duration), open, rename, delete. Follows the `Scene3DCollectionModule` layout
conventions so it reads as a sibling shelf rather than a new design.

### Deep links extend rather than change

`?film=star` keeps naming built-in library films. Saved films get
`?film=saved:<id>`. `isLibraryFilmKey` gains a sibling `parseFilmKey` that
returns a discriminated `{ kind: "library", key }` | `{ kind: "saved", id }`,
and the workbench resolves accordingly. An unknown or unreachable saved id
falls back to `DEFAULT_FILM_KEY`, same as an unknown library key does today.

A saved film's link is therefore shareable and scriptable on exactly the same
terms as a built-in one, which is the property the `?film=` work established
and this must not regress.

## The Library is the front door (landed 2026-08-25, `8dd1a602fa`)

The Art rail in `MyCollectionsPanel.svelte` gains a fourth card — Films, amber,
beside Tunnels, Scenes and Mandalas. Opening it mounts the saved-films shelf in
the art-detail pane; opening a film navigates to the director with that film
loaded.

**Gating: `dev && authState.isAdmin && !previewReadOnly`.** Admin because the
director is not a public surface. `dev` because `src/routes/test/+layout.ts`
already redirects `/test/*` to `/browse/gallery` in production — a card there
would list films nobody could open. That redirect is *stricter* than an admin
guard, which is why no route guard was added to the director itself. The `dev`
half of the condition comes off when the director gets a real route, and that is
the only edit the unlock needs.

**Navigation moved out of the route.** `parseFilmKey` / `savedFilmKey` /
`savedFilmHref` now live in `$lib/features/film-director/domain/film-director-link.ts`,
so a Library component links to a film without importing from `src/routes/test`.
`parseFilmKey` takes the library predicate as a parameter, which keeps the route
owning which keys are built-in and keeps the domain module free of route
knowledge. `FILM_DIRECTOR_ROUTE` is the single constant that changes when the
director moves.

**The gallery supplies its own scroll shell.** The Library mounts each art
gallery as `<ArtGallery />` with no props inside a pane that sets
`overflow: hidden`. `FilmCollectionGallery.svelte` wraps the shelf in the scroll
container; the shelf itself stays a flowing block, which is what the director's
marquee wants.

**Sign-out tears the collection down.** The film and 3D-scene collections both
held a live Firestore subscription across an account switch, so the next
signed-in user saw the previous one's items until a reload. Both are now torn
down in `signOut()` alongside tunnels and collections.

## Scope boundary: the director route stays in `test/`

The authoring workbench remains at `/test/film-director` in this pass. Only the
*collection* is promoted to a real feature module.

Promoting the authoring route means owning its chrome, auth gating, mobile
layout, and navigation placement — a second project that would hold this one
hostage. The cost of deferring is a real, Firestore-backed collection whose only
writer is currently a test route. That is a live and useful state, not a broken
one, and the promotion is a clean follow-up because the collection module will
already be a real module by then.

## Testing

| Area | Test |
|---|---|
| Rename correctness | The existing directive corpus (244 assertions), unchanged, passing |
| Seed stability | Corpus expected values unchanged — this is the proof |
| Normalizer | v1/v2 documents upgrade; both-fields rejected |
| Schema | `CollectedFilmSchema` round-trips a real saved film |
| Deep link | `parseFilmKey` on library / saved / unknown / malformed |
| Collection wiring | Save → reload → open reproduces the film |

Film-director suites live in `tests/unit/film-director/`; the collection's
domain test follows `scene-3d-collection/domain/__tests__/` convention.

## Risks

**The rename is broad.** 34 files, ~340 references. Mitigated by the corpus
suite: it asserts exact resolved output across 244 directive assertions, so a
rename that changes behaviour cannot pass it.

**Baseline is green.** All 15 film-director suites pass — 372 tests — verified
2026-08-24 immediately before implementation. Run them with the project config:
`npx vitest run --config tests/config/vitest.config.ts tests/unit/film-director/`.
A bare `npx vitest run` uses a different default config that supplies no jsdom
environment and does not exclude `.claude/worktrees/`, which manufactures both a
phantom `document is not defined` failure in `director-viewer-adapter.test.ts`
and duplicate collection of every test file. Neither is real.

**Seed drift — retired.** This was the spec's original headline risk. Reading
`directive-random.ts:40` closed it: seeds hash the unit's `id`, not the array
field name or index, so the rename is seed-neutral by construction. What
survives is the narrower constraint recorded above — do not change unit `id`s,
do not rename axis strings.

**Poster capture can silently return `""`.** `preserveDrawingBuffer` is enabled
on the renderer so the buffer is readable, but a capture attempted before first
paint returns empty. The modal shows the poster preview, so an empty capture is
visible to the user at save time rather than discovered later in the gallery.
