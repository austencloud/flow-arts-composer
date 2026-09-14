# Prop viewing and saving

Approved in conversation on September 8, 2026.

The visible viewing control explains which prop is active and where it came
from. A saved presentation does not change a visitor's personal prop selection.

## Viewing rules

- My props is the default. It uses the visitor's selected pair throughout Browse
  and the shared sequence viewer.
- As saved uses the collection prop first, then the sequence's recorded pair.
  Missing or invalid recordings fall back to My props.
- The control shows the resolved pair and its source: My props, Collection, or
  Saved with sequence. A gallery with differing saved pairs says Viewing: As saved.
- The mode is an app preference. Collection props remain overridable. Hand-path
  displays retain their own display semantics.
- URL prop choices stay on the local presentation; opening a link does not write
  the link's props into the visitor's settings.

## Save boundary

Create's save panel and recording save dialog offer Save with props. Viewer and
canvas quick saves open the same small prop-choice dialog. The choice starts
with the displayed or working pair and supports different props for each hand.
Cancelling performs no save. Saving stamps both creatorIntent.propConfig and
the legacy intendedProp field without modifying the source sequence's motion
data or the account's selected pair. Existing duplicate handling remains intact.
The library thumbnail explicitly uses that recorded pair.

## Owners

Search terms: collectionPropSettings, savedProp, creatorIntent, SaveToLibrary,
resolveRecordedPropConfig, and buildCardRenderOptions.

The implementation extends recorded-prop-intent with the pure prop-viewing
resolver, reuses the existing settings owner for preference persistence, and
composes PanelButton, BaseModal, SegmentedControl, and BentoPropGrid for controls.
BrowsePanel and SequenceViewerShell own the visible control placement. Both
virtual grid implementations forward collection context to the shared card.
LibraryActionHandler and the visual-save coordinator retain save lifecycle and
persistence ownership. Card render options own prop overrides for exports.

## Verification

Focused tests cover precedence, missing recordings, mixed pairs, cancellation,
the selected save pair, source immutability, variation context, and export props.
The local /test/prop-viewing route exercises production controls with in-memory
preferences and saves, without modifying an external library or account.
