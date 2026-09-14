# Construct inline playback

Play in the real Construct workspace replaces the card with an animation of the
current draft. Stop returns to the same mounted card. An expand control beside
Play opens the existing Sequence Viewer.

## Design decision

The earlier continuous prototype lives at `/test/construct-continuous-workspace`
and extends the public `ConstructSection` demo (commits `a301901d77` and
`904b25e4bb`). That demo owns a separate document, restricts construction to eight
steps, pins prop and turn choices, and implements its own editing history. It
demonstrates the benefit of nearby playback, but cannot replace the full workspace
without losing capabilities. This implementation leaves that prototype alone.

The laptop's `2026-09-08-astra-audit-handoff.md` arrived during final integration.
It confirms that continuous Construct was a study, with saving disconnected and
hold-to-preview unavailable without CreateModule context. Its proposed direction
keeps editing, selected-step context, valid choices, and motion feedback together.
This workspace implementation follows Austen's revised Play/Stop interaction and
uses the full editor's existing owners rather than promoting the isolated demo.

The workspace keeps its card, selection, option picker, levels, turn choices,
hold-to-preview, undo/redo, sequence actions, Save, Share, and existing viewer.
Playback is an explicit temporary mode, with no persistent layout preference.
The picker stays visible and becomes inert until Stop. The preview uses a snapshot
of the draft; a document revision or tab change ends it. Stop restores a previously
open step editor. Opening another panel ends playback through panel coordination.

The animation fits a square above the existing pictograph carousel on spacious
workspaces. Compact or short workspaces use the square alone. The carousel can seek
to a step. Tapping the canvas pauses/resumes; Stop or Escape returns to construction.

## Existing owners

Searches: inline playback, animation player, carousel, notation strip, option
audition, workspace button layout, retained crossfade.

- Compose `InlineAnimationPlayer` with `StepStrip`, also paired by
  `SequenceHeroDemo`. Keep the player’s independent playback controller and the
  carousel’s existing virtualization, sizing, keyboard, and seek behavior.
- Extend `panel-coordination-state.svelte.ts` with temporary playback ownership.
- Use `DualSourceCrossfade` to retain the card and freeze the outgoing player
  during the return transition. Load the player only on playback intent.
- Extend the existing workspace viewer button with Play, Stop, and Expand
  presentations, retaining the existing viewer callback.

## Verification

The three focused playback and audition suites pass all 13 tests, covering
snapshot isolation, repeated Play, editor restoration, competing panels, held
auditions, and an empty document. All nine affected Svelte components compile
without warnings after TypeScript preprocessing.

Chrome DevTools inspection on `/create/construct` covers 375×667, 820×1180,
960×412, 1440×900, 1920×1080, 2560×1440, and 3840×2160. The canvas stays square;
the carousel appears where space permits, without horizontal page overflow.
Play advances the animation and carousel. Stop preserves the mounted card and
document, restores an open step editor, and re-enables construction. An attempted
programmatic option click during playback leaves the draft unchanged. Escape
stops playback, and Expand opens the existing Sequence Viewer. The inspected
page reports no console errors.

Responsive inspection caught title crowding from an initial header placement;
Expand now sits beside Play. A real editor-return check also caught the drawer's
external-close callback clearing selection. The step editor coordinator now
preserves that selection while playback temporarily hides its drawer.

## Visual correction after review

Austen rejected the detached notice beneath the option picker, the mismatched
Expand control, and the off-center Stop glyph. The notice is removed. Expand now
uses the existing workspace viewer button with a blue gradient and matching
secondary-button dimensions and icon size. The triangular Play glyph's optical
offset no longer applies to the square Stop glyph. Compact controls align on
their centers; the wide layout retains its shared bottom edge.

Focused Chrome inspection covers phone, short landscape, desktop, and the wide
labeled controls. The icon-only Stop glyph measures zero horizontal and vertical
offset from its button center. The affected components compile without warnings.
