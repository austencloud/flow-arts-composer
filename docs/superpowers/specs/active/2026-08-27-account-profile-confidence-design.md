---
status: active
value: null
effort: null
work_state: unverified
remaining: Verify Account prop-preference flow for zero, one, and multiple saved props, including Profile display precedence and persistence.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Account Profile Confidence

**Status:** Approved for implementation
**Date:** 2026-08-27

## Outcome

Account setup must tell people what is unfinished, why each choice matters, and
when setup is complete. Prop preferences are part of a person's public flow
identity, not an unexplained favorite-setting exercise.

## Prop preference flow

The required setup task is **Props you spin**. It is complete as soon as at
least one prop family is saved.

The editor is a real two-step flow:

1. **Which props do you spin?** Select every applicable prop family and the
   versions of that prop the creator actually uses. This is required because
   the choices describe the creator and support prop-based discovery.
2. **Which prop should represent you?** This step appears when two or more
   props are selected. The choice is optional and is described as the prop
   shown on creator cards and the public profile. **No preference** is a valid
   choice.

When exactly one prop is selected, that prop represents the creator without
requiring a second decision. When several props are selected with no profile
prop, the product must not invent a favorite.

### Family and variation model

The first step presents one primary card per eligible spinning-prop family.
Selecting a family reveals its registered variations and allows more than one
variation in that family to be selected. The persisted values remain the
existing `PropType` values, so no Firestore schema migration is required.

The account-specific catalog derives labels, images, and variant relationships
from `prop-type-display-registry`; it owns only profile eligibility and grouping:

- Torch and Big Torch are Club variants, never separate top-level choices.
- Trigeng is a Triad variant.
- Staff, Club, Fan, Hoop, Buugeng, Triad, Triquetra, Sword, Double Star, and
  Eight Rings are eligible profile families.
- Chicken and Guitar remain supported rendering novelties but are not offered
  as ordinary profile-setup choices.
- Hand, deactivated Contact Ball variants, internal Quiad, Poi, and paid
  cosmetics are not offered in profile setup.

Previously saved values outside this curated catalog are displayed as legacy
choices and preserved until the person explicitly removes them. An existing
legacy Profile prop remains valid while it remains in `propsISpinWith`.

The persisted Firestore field remains `favoriteProp` for backward
compatibility. User-facing copy calls it **Profile prop**. No migration is
required.

## Display precedence

The canonical displayed-prop resolver uses this order:

1. explicit `favoriteProp`;
2. the only entry in `propsISpinWith`;
3. no single prop when `propsISpinWith` contains multiple entries;
4. legacy `activeProp` only when no curated prop preference exists.

This prevents an unrelated active editor setting from silently overriding a
deliberate multi-prop identity.

## Account page

The Account page includes a persistent **Flow identity** summary with:

- the selected props;
- the effective Profile prop or **No preference**;
- concise copy stating that this information appears on the public creator
  profile and supports prop-based discovery;
- a bounded **Change** button that opens the prop editor.

When the final setup task completes during the current Account-page session,
the unfinished checklist is replaced by a persistent success confirmation.
The confirmation is not timer-based and remains until dismissed or navigation
away. If setup status cannot be loaded, the Account page shows a retryable,
non-blocking status instead of silently hiding the setup surface.

## Reliability

Prop tiles edit a modal-local draft immediately and never make a Firestore call.
Done/Save submits one complete preference snapshot. The shared preference state
applies that snapshot optimistically and serializes concurrent submissions so
Firestore can never finish an older snapshot after a newer one. A failed write
restores the last confirmed shared state, while the modal keeps the person's
draft intact and leaves the editor open with actionable Retry feedback. Closing
the editor never claims success for an unpersisted selection.

Choosing the theme that is already visually active must still record the theme
setup task. The theme selection control distinguishes an applied-and-recorded
choice from a merely active default.

## Existing owners

- `createPropPreferenceState`: selection state, persistence coordination, and
  rollback.
- `prop-preference-persister`: Firestore schema and backward-compatible field
  writes.
- `createAccountSetupState`: setup task completion and retryable progress.
- `getEffectiveProp`: displayed creator-prop precedence.
- `BaseModal`, `PanelButton`, and the canonical prop display registry: modal,
  action, label, image, and variation primitives.
- `profile-prop-catalog`: account-specific eligibility and family grouping only.

The rejected in-grid favorite mode is removed. The existing favorite picker is
replaced by a Profile prop presentation step; it does not own persistence.

## Acceptance and verification

- zero props cannot complete the required task;
- one saved prop completes it without a favorite prompt;
- multiple saved props complete it and allow an optional Profile prop or No
  preference;
- failed selection and Profile prop writes roll back visibly;
- rapid family and variation taps never disable the chooser or trigger writes;
- one atomic write persists the completed draft;
- Torch appears only within Club and toggles independently from Club;
- Chicken and Guitar are absent from ordinary setup choices while legacy saved
  values survive a round trip;
- reloading restores selected props and Profile prop;
- creator display follows the documented precedence;
- accepting the active default theme records the theme task;
- focused Vitest suites cover setup state, persistence, rollback, and creator
  precedence;
- the Account page and both prop-flow steps are visually checked at the
  project-required phone, tablet, desktop, and 4K viewports.
