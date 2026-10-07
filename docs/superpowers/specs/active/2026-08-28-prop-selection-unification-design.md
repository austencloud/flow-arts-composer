---
status: active
value: null
effort: null
work_state: unverified
remaining: Audit shared prop selection across picker, profile, and Viewer; run exact family-art and Buugeng chirality checks.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Prop Selection Unification

## Outcome

Every prop-selection surface uses one visual card language, and a selected prop
family shows the exact build the user chose. Choosing LED Baton therefore leaves
LED Baton visible on the Double Staff family tile instead of replacing its art
with the base Double Staff.

## Scope

- Extract the card presentation from `PropTypeButton` into a shared
  `PropSelectionButton` that can render registry-backed prop art or custom art.
- Keep Bento family actions keyed to their base family while resolving the
  displayed art from the exact selected variant.
- Compose the same card in profile prop families, Hoop size choices, and the
  featured-skill step.
- Reuse `DrawerHeader` for the profile prop editor and use the canonical motion
  helpers when its step or Hoop choices change the layout.
- Preserve the profile catalog, persistence model, premium gating, family
  selection behavior, and Buugeng chirality controls.
- Replace the 3D viewer's private prop-card grid and family selector with the
  canonical `BentoPropGrid`. `ScenePropPicker` remains as a narrow adapter for
  the scene-supported catalog, mixed All-Performers state, Bare Hands, and the
  fan/finish controls that exist only in 3D.
- Carry the canonical Buugeng chirality setting through `Viewer3DScene` into
  `PerformerRig`, so choosing A or B in the viewer changes the prop shown in
  the scene as well as the shared application preference.

## Ownership

`PropSelectionButton` owns the visual selection-card contract.
`PropTypeButton` remains the registry adapter for a concrete `PropType`.
`BentoPropGrid` owns family disclosure and Buugeng chirality.
`ScenePropPicker` composes those owners with scene-only build controls; it does
not own another prop grid or family picker.
`PerformerRig` owns the final per-hand mirror transform in the 3D scene.
The profile catalog remains the source of truth for profile skill taxonomy.

## Risks

- Headless popover trigger attributes must continue to reach the underlying
  button without changing outside-click or explicit-close behavior.
- Profile cards need enough density on mobile without shrinking labels below the
  project minimum.
- Showing exact family art must not change the base family used to open style
  choices.
- All-Performers mode may have no single selected prop. The canonical grid must
  represent that mixed state without inventing a selected tile.
- The performer inspector owns vertical scrolling. Embedding the grid must not
  create a clipped nested scroller or trap the family popover inside the panel.
- Short landscape sheets must give that inspector a usable content viewport;
  the sheet chrome cannot consume the entire height above the mobile controls.
- Chirality must be gated to Buugeng-family props before the 3D mirror reaches
  `PerformerRig`; a saved Buugeng preference must not mirror unrelated props.

## Verification

- Unit-test exact family-art resolution and the existing profile catalog.
- Run the Buugeng chirality contract suite unchanged.
- Compile every changed Svelte component and run the canonical project check.
- Exercise the main prop drawer and both profile editor steps at the required
  desktop, tablet, mobile, 4K, and 200% content-scale viewports. Verify focus,
  selection state, outside-click/close behavior, and a clean browser console.
- Exercise the 3D performer Prop tab at the same reachable viewport families.
  Verify a family popover, exact sub-prop selection, All-Performers mixed state,
  Bare Hands, Buugeng A/B controls, visible 3D mirroring, short-landscape
  scrolling, and a clean console.
