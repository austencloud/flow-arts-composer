# Prop versions: V1 and V2 instead of a global 3D look

Approved by Austen on 2026-10-06 in conversation.

## Problem

The prop picker's "3D" tiles (Double Staff 3D, LED Baton 3D, ...) do not pick a
prop. They flip `settings.propArtwork` (`PropLook`: `"pictograph" | "model"`),
one switch every prop shares. After one 3D pick, every prop with a captured
model sprite draws as its capture: main-grid tiles, presets, other pickers,
voice and shortcut picks. Austen reads that as the app getting stuck in 3D.

The Double Staff family also shows duplicate 3D tiles. `Prop3D` in
`@austencloud/scene-3d` draws `STAFF`, `SIMPLESTAFF` and `STAFF2` with the same
`Staff3D`, so Simple Staff 3D and Staff V2 3D are captures of the plain staff.
Fire Staff's notation SVG is generated from the same measurements as its 3D
model, so Fire Staff and Fire Staff 3D look the same at tile size.

## Decisions

1. **A version belongs to the pick.** Any prop change that brings a new prop
   into the hands, and does not name a version, sets Version 1
   (`propArtwork: "pictograph"`). A V2 tile, or Version 2 on a prop's details
   page, sets Version 2. Both hands still share one version in Cat Dog mode.
   Changes that bring no new prop in (Cat Dog off mirroring the left hand,
   re-picking the current prop) keep the version. Two refinements from review:
   a size change (Standard to Big and back) is the same prop, so it keeps the
   version; and only a newly held prop that has a Version 2 resets it, so
   Double Staff V2 in the left hand survives picking Fan for the right.
2. **Main grid shows V1** for every tile except the selected prop's own tile or
   family tile, which shows the current version.
3. **Presets carry their version.** Saving stores `propArtwork`; applying
   restores it; presets saved before this change apply as V1. Preset matching
   compares the version (missing = V1), and a preset label gains " V2" when it
   holds V2 of a prop that has a V2.
4. **Labels.** A prop with two versions shows "LED Baton V1" and "LED Baton V2"
   on its tiles. A prop with one version keeps its plain name. The details-page
   chooser and the rail chip say "Version 1" / "Version 2" in place of
   "Realistic", "3D model" and "Pictograph". All 11 locales.
5. **Duplicates removed.** Simple Staff, Staff V2 and Fire Staff lose their
   model sprites (generated module, `manifest.json`, the six SVGs) and the
   capture page skips them. The 3D viewer is unchanged.
6. **Rename.** "Staff V2" displays as "Capped Staff" in every locale. The enum
   value `staff_v2` is unchanged, so sequences and URLs keep working.

## Where the rules live

- Settings writes: a pure `withPickVersion(current, patch)` in
  `src/lib/shared/settings/domain/`, applied in `SettingsState.updateSettings`
  right after `normalizePropPatch`. Every prop writer (picker hosts, presets,
  Alt+N shortcuts, voice, randomize, step editor) already funnels through
  `updateSettings`, so they all inherit the rule.
- Picker hosts that own a local look (Post Studio's animation appearance tool,
  Composer) apply the same rule in their own `onSelect` through one shared
  helper in `prop-look.ts`: a versionless pick of a different prop means
  Version 1. `PropGrid` itself does not reset the version, because hosts such
  as the deck releaser and tunnel art settings fall back to the global look
  writer while picking a prop for a local purpose.
- The Shape Engine writes the prop pair only after its matrix loads, so a
  version written before that would be reset by the late pair write. Its
  `setPropType` carries the picked version and the host writes it in the same
  settings write as the pair.
- Preset chips draw their own version, and settings checkpoints (Undo after
  opening a tunnel or 3D scene) save and restore it.

## Known limit

The deck releaser, tunnel art settings, Arena drawer and Guide codex pick a
prop for their own use but still write the version through the global writer.
They behave as before this change and need a local version of their own to
stop sharing it.

## Verification

- Unit: `withPickVersion` cases; presets store, apply, match and label the
  version; sprite list no longer has the three props; cache-key test updated.
- Component: V1/V2 labels; Double Staff family shows V2 tiles only for Double
  Staff and LED Baton; a versionless pick of a new prop reports Version 1;
  non-selected main-grid tiles render V1 art; "Capped Staff" label.
- Browser, desktop and phone width, on the real Props picker: pick LED Baton
  V2, switch to Club, return to Double Staff: lands on V1 and the grid shows
  V1 art.
