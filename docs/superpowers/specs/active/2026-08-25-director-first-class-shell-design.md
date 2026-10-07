---
status: active
value: null
effort: null
work_state: unverified
remaining: Verify the Director shell on both entry surfaces at seven viewports and resolve the signed-in save rule gap described in this design.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Director First-Class Shell — Design

**Date:** 2026-08-25
**Status:** Active
**Route:** `/test/film-director`
**Related:** `2026-08-25-director-control-surface-design.md` (the rail edit sink),
`2026-08-24-film-collection-design.md` (saved films),
`2026-08-23-film-director-directive-language-design.md` (the film document)

## 1. The problem

The Director was built to answer "can a film be directed from a document at
all." It answers that. What it still looks like is the harness that asked the
question: a titleplate reciting scene metadata, a five-chip picker for the
built-in films, a status pill that reads green and never changes again, two
save buttons for two different artifacts, and a two-row playback bar carrying a
hand-rolled play button plus a scene chip strip.

Austen, 2026-08-25:

> this whole thing's filled with all sorts of transitional clutter and we need
> to make it a 1st class package that feels elegant and simple and
> straightforward to use just like our other 1st class packages

The point of the surface is the movie, not the scene. Every piece of chrome
either serves authoring a film or comes off.

## 2. Scope

**In:** the shell. Two surfaces (a film library front door, a stage), the
chrome deletions, a rebuilt one-row transport on the canonical playback
primitive, a film panel that owns save and Scene JSON, explicit film identity
so overwrite and save-as-new can both exist, and suppressing the shared rail's
Save scene on this host.

**Out:** the route stays `/test/film-director`. Moving the Director into the
Library's Art shelf, admin-gating it, and the choreography and camera-preset
work are separate. Nothing here blocks them; §9 notes the seams they will use.

## 3. Two surfaces, two components

The Director becomes a route with two states, chosen by the URL.

| URL | Surface |
| --- | --- |
| `/test/film-director` | **Marquee** — the film library |
| `?film=<library key>` | **Stage** — that built-in film |
| `?film=saved:<id>` | **Stage** — that saved film, once the collection resolves |

`createFilmDirectorState` takes a `FilmDirectorInput` and clones and resolves it
in the constructor. It has no empty state and must not grow one: making the
director nullable would push `?.` through the entire scene stack for the sake of
a screen that shows no scene. So the marquee is a **sibling component**, not a
mode inside the workbench, and the workbench mounts only once a film resolves.

### 3.1 Route ownership

`+page.svelte` keeps lazy-loading the workbench and gains the mode decision:

```ts
type Mode =
  | { kind: "marquee" }
  | { kind: "stage"; film: FilmDirectorInput; origin: FilmOrigin };
```

- `parseFilmKey` returns `unknown` → marquee.
- `library` → stage immediately.
- `saved` → **stay on the marquee** while `filmCollectionState.loading`, then
  enter the stage if the entry exists, or remain on the marquee if it does not.

That last row deletes the `pendingSavedId` effect from the workbench along with
the boot-the-default-film-then-swap-it dance. A saved deep link now loads into
the library it belongs to instead of flashing an unrelated film, and a link to a
film the user cannot see lands somewhere useful rather than on Sky Is the Limit.

### 3.2 Film identity

New in `_lib/film-origin.ts`:

```ts
export type FilmOrigin =
  | { kind: "library"; key: string }
  | { kind: "saved"; id: string; name: string };
```

The workbench holds the origin as `$state` and it is the authority for three
things: what the URL says, what the film panel labels the current film, and
whether Save overwrites or creates. Today `selectedFilmKey` is cleared to `""`
after opening or saving a collected film and no document id survives, which is
why "Save film" and "Save as new" cannot currently be distinguished.

### 3.3 Marquee

`_components/FilmDirectorMarquee.svelte`. Two sections on one scrolling page:

- **Starting points** — the five `FILM_LIBRARY` entries as cards, using the full
  `label` rather than the invented one-word short labels, which exist only
  because a segmented control needed to fit. A library entry has no poster, so
  these cards carry title, scene count, and duration — read off the resolved
  spec at render — over a plain themed field, not an empty image box.
- **Saved films** — `FilmCollectionModule`, which already renders this gallery
  with rename, delete, and open, and is currently trapped in a `.film-shelf`
  popover. It moves; it is not rewritten.

Choosing either one stamps the URL and enters the stage. Empty saved collection
keeps `FilmCollectionModule`'s own empty hint.

The marquee follows `4k-native-layout.md`: `--shell-w` for the band, pinned
column counts per tier (never `auto-fill` against a floor with five known
cards), sizes in `rem`.

## 4. Chrome deletions

From `FilmDirectorWorkbench.svelte`:

| Deleted | Lines today |
| --- | --- |
| `.top-left` wrapper and `.titleplate` | 173–199, 341–415 |
| `.film-picker`, `filmOptions`, `FILM_SHORT_LABELS`, `selectFilm`, the `SegmentedControl` import | 63–82, 187–198, 352–373 |
| `.readiness` pill | 201–204, 417–436, 541–554 |
| `.film-actions` and `.film-shelf` | 206–228, 438–497 |
| `--director-header-reserve` effect, `topLeftEl`, `topLeftHeight`, `filmActionsEl`, `filmActionsHeight` | 40–58 |

Kept: the `.film-preparation` card. It is a real progress state with a real
progress bar, not a bubble that reads ready forever.

Two things that break as a consequence and are part of this work, not a
follow-up:

1. **`FilmDirectorScene.svelte` still passes
   `topOffset="calc(var(--director-header-reserve, 12rem) + 0.75rem)"`.** With
   the setter gone the custom property is never defined and the rail freezes at
   the 12rem fallback. The prop is removed so the workspace uses its own 12px
   default. `bottomOffset` stays — the transport still owns the bottom edge and
   still publishes `--director-transport-reserve`.
2. **`.edit-error` anchors to `--director-header-reserve`** in its narrow
   layout. It moves to the top of the stage, inset below the safe area, clearing
   the rail on the right; the existing `min-width: 64rem` branch that parks it
   above the transport is unchanged.

## 5. The transport

One row. `_components/FilmDirectorTransport.svelte` composes:

```
[ TransportControls ] [ FilmTimeline ................. ] [ timecode ] [ Film ]
```

**Playback** is `TransportControls` from
`shared/animation-engine/components/controls/`, the primitive seven surfaces
already use. It renders only the buttons whose handlers are supplied, so:

| Prop | Handler |
| --- | --- |
| `isPlaying` | `director.wantsToPlay` |
| `onPlaybackToggle` | `director.togglePlayback` |
| `onStepFullBeatBackward` | `director.previousScene` |
| `onStepFullBeatForward` | `director.nextScene` |

`wantsToPlay`, not `isPlaying`. The director suspends `isPlaying` during scene
preparation and transition holds while intent stays true; binding the icon to
`isPlaying` would show Play during a hold, and clicking it would cancel the
playback the user already asked for.

**`FilmTimeline.svelte`** replaces both the `<input type="range">` scrubber and
the `.scene-strip` chip row. One track divided into segments sized by
`scene.durationSeconds`, each labeled, with a playhead. That is where the
vertical space comes back, and a segmented track is what a film timeline is —
the chip strip was a second control describing the same axis.

Interaction, in one pointer-captured pipeline on the track:

- `pointerdown` captures the pointer, records whether playback was running, and
  pauses.
- `pointermove` converts x to seconds and calls `director.seek` only.
- `pointerup` releases and resumes if it had been running.
- A click that does not drag seeks to that point, same path.

`selectScene` fires only from a segment's label button, never from the drag.
Seeking has no reactive feedback loop, but the rAF tick keeps advancing
`playheadSeconds` between pointer samples, and `selectScene` restarts scene
transitions — a drag that fired both would repeatedly retrigger transitions
across every segment it crossed.

**Timecode** stays, `tabular-nums`, sized to its longest value per
`no-layout-shift.md`.

**Film** is an icon button opening the film panel.

The rewritten transport keeps its measurement effect and goes on publishing
`--director-transport-reserve` as the distance from the bottom of the stage to
the top of the transport. The rail reads it through `bottomOffset` and would
overlap a one-row transport by the height it no longer occupies if the effect
were dropped along with the row.

## 6. The film panel

`_components/FilmDirectorFilmPanel.svelte`, opened from the transport's Film
button, built on `bits-ui`'s `Popover` — the same primitive `ViewerPopover`
wraps, used directly because `ViewerPopover` is bound to the viewer context's
`PopoverId` union and this panel is not a viewer control.

Contents:

- the current film's title and origin
- **Save** / **Save as new** (§7)
- **Scene JSON** — toggles the existing `FilmDirectorJsonEditor`
- **Restore previous version**, when one exists

**Back to the library** is *not* in this panel. It is its own control in the
stage's top-left, the corner the titleplate is vacating: persistently visible at
every width, a labeled button rather than a bare glyph or a hover reveal, per
`clickables-look-like-buttons.md`. The way out of a surface does not live inside
a popover.

### 6.1 Why not a rail tool

The first design put this in the shared `SceneControlRail` as a host-provided
tool. It does not work, and the reasons are worth recording so it is not
re-proposed:

- `activeTool` is typed to the closed `SceneControlTool` union, and
  `SceneControlInspector` dispatches on it with a final `else` that routes
  anything unrecognized to developer tools. An arbitrary host id has nowhere to
  land without widening a shared domain type that the sequence viewer consumes.
- `inspectorUsesDock` is derived from specific tool names, so a host tool would
  force overlay presentation even on a wide screen.
- Decisively: `resolveSceneControlLayout` returns `compact` at 960×412 and
  375×667, and compact swaps the rail *and* inspector out for
  `MobileSceneControls`. Film, Save, and JSON would silently disappear on every
  narrow layout.

The transport renders at every width. Putting the panel there costs no shared
component change and has no compact hole.

## 7. Save

The two saves on screen today are different artifacts:

- `SaveSceneModal` captures live viewer state — performers, props, environment,
  camera — into `scene3dCollectionState`. A **look**.
- `filmCollectionState` persists the authored document: scenes over time, camera
  track, transitions, durations. A **movie**.

On the Director only the movie is the artifact. A viewer snapshot taken here
records one instant of a film that is playing and has no relationship to the
document being authored. Save scene comes off this host.

### 7.1 Suppressing Save scene

Hiding the rail button is not enough: `SceneControlWorkspace` also forwards
`onOpenSaveScene` into `PresetsPanel` and mounts `SaveSceneModal`
unconditionally. The gate goes at the workspace.

`SceneControlWorkspace` gains `allowSaveScene?: boolean` defaulting `true`. When
false it does not pass `onOpenSaveScene` to the rail or inspector and does not
mount `SaveSceneModal`. `SceneControlRail`'s `onOpenSaveScene` becomes optional
and its Save scene button renders only when supplied.

`onOpenSaveScene` is already optional on `SceneControlInspector` and
`PresetsPanel`, so only the rail's signature changes. The workspace's other
three consumers — `ViewerMotionSurface`, `Viewer3DFullscreen`,
`OceanExperienceControls` — omit the new prop and are unchanged.

### 7.2 Save semantics

| Origin | Save | Save as new |
| --- | --- | --- |
| `library` | opens `SaveFilmModal`; origin becomes `saved` | same |
| `saved` | overwrites in place via `filmCollectionState.update` | opens `SaveFilmModal` |

Overwrite patches `film`, `poster`, `durationSeconds`, and `sceneCount`, keeping
the entry's `id`, `name`, and `createdAt` — the identity a link points at
survives an edit.

### 7.3 One prior version

Overwrite is destructive, so it retains exactly one. `CollectedFilm` gains:

```ts
/** The document this entry held before the last overwrite. One deep only:
 *  enough to undo a bad save, not a version history. */
previousFilm?: StoredFilmDocument;
```

`CollectedFilmSchema` gains `previousFilm: StoredFilmDocumentSchema.optional()`.
Optional, so existing stored entries parse unchanged and
`FILM_COLLECTION_SCHEMA_VERSION` does not move. Overwrite writes the outgoing
document into `previousFilm`. Restore swaps the two and loads the restored
document, so Restore is itself undoable.

The poster is not versioned. A restore keeps the current poster until the next
save, which is a wrong thumbnail rather than a wrong film.

## 8. Verification

Per `visual-verification-mandatory.md`, this is structural — screenshots at all
seven viewports for both surfaces, taken and read, not delegated.

Measurements that must hold, checked with `evaluate_script` before screenshots:

1. The rail clears the transport at 1920 and 3840, and the compact bar cluster
   clears it at 960×412 and 375×667. The current values are 13px and 12px; the
   transport is getting shorter, so the gap grows, and neither may go negative.
2. The transport is one row at every width above 375.
3. `FilmTimeline` segment widths sum to the track width and are proportional to
   `durationSeconds` within a pixel.
4. Exactly one save button is reachable on the stage.
5. The marquee's card grid never renders a row of one at 1920, 2560, or 3840,
   and the page does not dead-end in the top third at 3840.

Behavior:

6. `?film=star` and `?film=saved:<id>` still enter the stage directly; a bare
   URL shows the marquee and does not rewrite itself to `?film=sky`.
7. Dragging the timeline while playing pauses, seeks continuously, and resumes
   on release, with no scene transition retriggering mid-drag.
8. Overwrite preserves `id`, `name`, and `createdAt`; Restore returns the prior
   document and is itself undoable.

Unit tests: `film-origin` transitions, timeline seconds↔x conversion at the
segment boundaries, and `previousFilm` round-trip through the schema.

## 9. Follow-ons

- **Firestore rules are committed but not deployed.** `users/{uid}/film-collection`
  exists in `firestore.rules` and has not shipped, so signed-in saves fail with a
  permissions error while guest saves work off localStorage. Deploy before
  treating save as working for anyone signed in.
- **Into the app.** The marquee is the piece that makes a Films card on the
  Library Art shelf possible — it is the gallery that card would open, next to
  Tunnels, 3D Scenes, and Mandalas. Admin gating and the route move go with it.
- **Compact stage.** The rail's tools are unreachable in compact today, which
  this design does not change; it only ensures the Director's own controls are
  not among the casualties. If the Director is expected to be usable on a phone,
  that is its own piece of work.
