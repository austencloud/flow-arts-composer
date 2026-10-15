# Create draft recovery

## Interface brief

Audience: people composing an unfinished sequence. They need to recognize their
work, continue the right version, and know whether the browser saved an edit.
Success means restoring the sequence and its own undo history, preserving both
versions when tabs diverge, and retrying a failed save without losing newer edits.

UI review: VR-1; evidence ledger checked 2026-09-21; calibration not calibrated.

Two compositions considered before implementation:

1. An inline recovery panel above the workspace, containing version previews and
   actions. It keeps the decision beside the editor but takes most of the editing
   area on a phone, especially when two versions need comparison.
2. A compact, reserved save-status row and a modal containing version previews.
   The row keeps save state accessible during editing; the modal gives the recovery
   decision enough space without permanently shrinking the sequence grid.

Use the second composition with the existing BaseModal and StepGrid. Keep each
version's word, step count, date, pictographs, and Continue action together. Keep
the editor mounted during errors and recovery. Closing the dialog leaves a visible
Review action; it does not discard the drafts or resolve a conflict.

## Acceptance evidence

Implementation and browser verification are in progress. This document will record
the actual results and any limitations before delivery.
