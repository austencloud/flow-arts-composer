# Creator Presentation Intent

Date: 2026-09-17
Status: approved for planning
Branch: `codex/creator-presentation-intent`

## Problem

Public sequence cards (Creators "Recent Work", inbox previews, artifact tiles,
timing-and-direction share pages) render a live 3D scene at view time. Today
that scene mixes three sources nobody chose on purpose:

- Trails are the hardcoded fade + glow defaults from an ephemeral animation
  scope. The saved sequence has no say.
- Prop colors fall through to the viewer's own Settings, so every card looks
  like the viewer's editor, not the creator's.
- Effects (fire, LED, sparkles, and so on) load from the viewer's
  `tka_effects_config` localStorage because `createAnimationScope` builds its
  effects state without `persist: false`, contradicting the scope's own
  "ephemeral" label.

The sequence document only records `creatorIntent.propConfig` and
`creatorIntent.effortTimeline`. Nothing about colors, trails, or effects is
saved, so there is nothing correct to show.

## Decisions

Made in brainstorming on 2026-09-16 and 2026-09-17.

1. Creator's presentation wins everywhere a sequence is shown as the creator's
   work. The viewer's own settings apply only inside their own editor.
2. Presentation is visual only: prop colors, trail settings, effects config.
   Playback mode (continuous vs step) stays a viewer preference and is out of
   scope.
3. Capture happens at save from the live scene. No presentation editor in the
   save dialog, just a summary line and a "use default look" switch.
4. Legacy sequences with no recorded presentation render with a fixed neutral
   default. No backfill.
5. Mode-free. No viewer toggle, in Settings or on cards. Public surfaces show
   the creator, the viewer's own editor shows the viewer, no state in between.
   This re-affirms the 2026-08-22 decision recorded in
   `2026-08-23-public-preview-presentation-intent-design.md`; a Settings
   toggle was proposed today and dropped for the same reason.
6. Storage is a pruned snapshot: exact for what is visible, defaults filled on
   read through the existing normalizers.

This spec extends the August contract. That document owns prop type
resolution and the capture policy; this one adds colors, trails, and effects
to the same `creatorIntent` annotation and changes the legacy fallback from
"visitor's props" to a fixed neutral look for the three visual settings only.
Prop type for legacy records still falls through to the visitor, as before.

Because `creatorIntent` participates in `publicProjectionDigest`, recording
or changing a presentation bumps the public revision. That is intended.

## Section 1: Data model and capture

### Schema

`CreatorIntent` gains an optional `presentation` member.

```ts
// src/lib/shared/foundation/domain/models/presentation-intent.ts
export interface PresentationIntent {
  /** Null follows the theme's blue/red defaults, same contract as AppSettings. */
  readonly primaryPropColors: ViewerCustomColorPair | null;
  readonly trail: PresentationTrailSettings;
  readonly effects: PresentationEffectsConfig;
}

/** TrailSettings minus workflow flags and the tunnel-only layer array. */
export type PresentationTrailSettings = Omit<
  TrailSettings,
  "usePathCache" | "previewMode" | "additionalLayerColors"
>;

/**
 * EffectsConfig with only the intent objects referenced by tipEffectMap.
 * version, tipEffectMap, and activePresets are always present.
 */
export type PresentationEffectsConfig = Pick<
  EffectsConfig,
  "version" | "tipEffectMap" | "activePresets"
> &
  Partial<Omit<EffectsConfig, "version" | "tipEffectMap" | "activePresets">>;
```

On `CreatorIntent`:

```ts
/**
 * Visual presentation the creator saved with. Three states:
 *   undefined  never recorded (legacy or private working save)
 *   null       creator chose the default look explicitly
 *   object     recorded snapshot
 * Absent and null both render neutral. Only absent triggers publish-moment
 * capture. Never substitute viewer settings here.
 */
readonly presentation?: PresentationIntent | null;
```

The undefined vs null distinction matches Firestore semantics: undefined
fields are dropped, null persists. Every normalizer and projection that copies
`creatorIntent` must preserve an explicit null on `presentation`. The public
projection already copies `creatorIntent` whole, so it needs no change, but the
plan must add a test proving null survives a save and read round trip.

### Pure module

`presentation-intent.ts` exports:

- `capturePresentation(input: { primaryPropColors, trail, effects }): PresentationIntent`
  Prunes: drops the three trail workflow fields, drops every effect intent
  whose key is not a value in `tipEffectMap`. Pure, no state reads.
- `resolvePresentation(intent: CreatorIntent | null | undefined): ResolvedPresentation`
  Returns `{ kind: "recorded", value }`, `{ kind: "neutral" }`, or
  `{ kind: "absent" }`. For recorded, `value` is fully populated:
  trail is `normalizeLegacyTrailSettings({ ...DEFAULT_TRAIL_SETTINGS, ...saved })`,
  effects is `normalizeEffectsConfig(migrateEffectsConfig({ ...DEFAULT_EFFECTS_CONFIG, ...saved }))`,
  colors pass through `resolveViewerCustomColorPair` when non-null.
- `neutralPresentation(): ResolvedPresentationValue`
  Default trail, default effects config, null colors. This is the single
  definition of what legacy and "default look" sequences show.
- `summarizePresentation(value): { colors, trailLabel, effectLabels }`
  Feeds the save dialog line. Colors as the two hex values or "theme
  default", trail as the mode name, effects as the distinct tip effect names
  or "none".

If `resolvePresentation` throws on malformed data it catches, warns once per
sequence id, and returns neutral. A card never fails to render because of a
bad presentation blob.

### Capture path 1: the save dialog

`VisualSequenceSaveIntent` gains `presentation?: PresentationIntent | null`.
`library-action-handler.handleSave` captures from the viewer's live scene
before opening the dialog: the active animation scope's `settings.trail` and
`effects.config`, plus `settingsService.settings.primaryPropColors`. The
handler's `deps` contract gains getters for the first two. The dialog's
resolved result carries the presentation through unchanged, or null when the
switch is on.

`VisualSequenceSaveCoordinator.withPresentationIntent` writes
`creatorIntent.presentation` from `intent.presentation` when the field is
present on the intent. When the intent omits it (callers that never captured),
the saved value is left as it was. A re-save from the dialog therefore
restamps presentation from the current scene, same as it restamps propConfig.

`SavePropDialog` gains, under the prop picker, one summary line from
`summarizePresentation` and a toggle switch labeled "Use default look". No
color pickers, no trail or effect controls. Switch on means the dialog resolves
with `presentation: null`. The switch state does not persist.

### Capture path 2: publish moment

`library-save-service` extends the existing publish-moment capture. Condition:
visibility is public and `resolvePresentation(sequence.creatorIntent).kind ===
"absent"`. Source: the global animation settings trail, the global effects
config state, and `settingsService.settings.primaryPropColors`. Private saves
and sequences that already carry a recorded or null presentation are never
restamped. This keeps the invariant that every newly published sequence has
either a snapshot or an explicit default.

### Firestore indexing

`creatorIntent.presentation.effects` is an opaque nested payload read only by
document id. Per the Firestore cost rule, add a field override in
`firestore.indexes.json` disabling automatic indexes on
`creatorIntent.presentation` after passing both gates (no `where` or `orderBy`
references it, no composite index references it). Record the gate output in
the plan's verification step.

## Section 2: Resolution and rendering

### Resolver for viewing

```ts
// src/lib/shared/sequence-preview/services/viewing-presentation.ts
export function resolveViewingPresentation(
  sequence: SequenceData | null
): ResolvedPresentationValue
```

Recorded returns the recorded value. Neutral, absent, or no sequence returns
`neutralPresentation()`. The viewer's own settings are never an input. One
function, one test file, no branching anywhere else.

### Wiring into SequenceShowcasePreview

The preview already owns an ephemeral animation scope. Changes:

- `createAnimationScope({ persistence: "ephemeral" })` must build its effects
  state with `{ persist: false }`. This is the leak fix and applies to every
  ephemeral scope, not just previews.
- On sequence load, the preview calls `resolveViewingPresentation` and applies
  the result: trail via the scope's `setTrailMode`, `setTrailEffect`, and
  `setTrailAppearance` (extending the settings state with a
  `replaceTrail(settings)` setter if the three do not cover every field),
  effects via the scope's effects state `replace(config)` (add if missing),
  and colors as the `primaryPropColors` player prop.
- `primaryPropColors` becomes explicit. Today `CanvasSurface` does
  `primaryPropColors ?? getSettings().primaryPropColors ?? null`, which
  collapses "not provided" and "theme default". Change to fall back to
  settings only when the prop is `undefined`; an explicit `null` means theme
  default. `SequenceShowcasePreview` always passes a defined value.
- The step strip thumbnails keep using `recordedPropConfig` for prop shape.
  They are static pictographs and do not render colors, trails, or effects,
  so they are unaffected.

Consumers of `SequenceShowcasePreview` (WorkTile, SequenceMessagePreview,
timing-and-direction page) get the behavior for free. The caller-supplied
`primaryPropColors` prop on the preview stays as an override for surfaces
that deliberately recolor (tunnel judges, landing demos), and when supplied it
wins over the resolver.

### ArtifactTile

Creator profile artifact tiles mount `InlineAnimationPlayer` directly. They
adopt the same pattern: an ephemeral scope, `resolveViewingPresentation`,
and explicit colors. The plan should check whether ArtifactTile can switch to
`SequenceShowcasePreview` instead and do that if it is a small change,
otherwise wire it by hand.

### Out of scope, named so nobody re-litigates

- Playback mode on cards. `InlineAnimationPlayer` still creates its panel
  state non-ephemerally, so the viewer's persisted continuous/step choice
  reaches public cards. Decision 2 keeps playback mode viewer-side. A follow-up
  can force continuous on ambient cards if step mode looks broken there.
- The full sequence viewer and editor. Opening a sequence there uses the
  viewer's own scope by design.
- Prop type resolution. Already handled by `resolveRecordedPropConfig`.
- Stored PNG thumbnails. They are generated at save time from the creator's
  scene and already reflect the creator's look.

## Section 3: Settings, errors, testing

### No viewer setting

Nothing is added to `AppSettings`. A viewer who wants to see a sequence in
their own look remixes it into Create, which is the adoption boundary the
August contract already defines.

### Error handling

- Malformed or partial saved presentation: normalizers fill and coerce;
  resolve never throws to the caller (see Section 1).
- Effects config version drift: `migrateEffectsConfig` runs on read, same as
  the localStorage path.
- Capture with no live scope (save from a surface without an animation
  scope): the handler passes no `presentation` field and the coordinator
  leaves the saved value untouched. Publish-moment capture then covers public
  saves.
- Firestore write of `undefined` inside nested objects: `capturePresentation`
  must produce no undefined values. Test it.

### Testing

Unit, under the nearest existing test directories:

- `capturePresentation` prunes the three trail fields, drops unreferenced
  effect intents, keeps referenced ones byte-for-byte, emits no undefined.
- `resolvePresentation` returns absent for undefined and legacy documents,
  neutral for null, recorded and fully populated for a pruned snapshot, and
  neutral with one warning for garbage input.
- `resolveViewingPresentation` returns recorded for a recorded sequence and
  neutral for null, absent, legacy, and no sequence.
- `summarizePresentation` labels for theme-default colors, custom colors,
  each trail mode, empty and mixed tip maps.
- Sequence normalization and public projection preserve `presentation: null`.
- `createAnimationScope({ persistence: "ephemeral" })` does not read or write
  `tka_effects_config`.
- `VisualSequenceSaveCoordinator` writes presentation when the intent carries
  it (object or null) and leaves it alone when the intent omits it.
- `library-save-service` stamps presentation only for public saves with an
  absent presentation.

Component, per `component-test-discipline.md`:

- `SequenceShowcasePreview` with a recorded sequence applies the recorded
  trail mode, effects tip map, and colors to the player props and scope.
  Legacy sequence applies neutral. Changing the viewer's own settings or
  localStorage effects config changes nothing on the card.
- `SavePropDialog` renders the summary line and resolves with `null` when the
  switch is on.

Visual, per `visual-verification-mandatory.md`:

- `/creators` Recent Work with two sequences saved under different colors and
  effects by two accounts shows each in its own look while the viewer's
  settings differ from both. Screenshot before and after.
- Change the viewer's own prop colors and effects in Settings and confirm
  neither card changes. Open one sequence in Create and confirm it renders
  with the viewer's look there.

## Migration

None. Legacy sequences render neutral until re-saved. No script, no backfill,
no schema version bump on `SequenceData`.
