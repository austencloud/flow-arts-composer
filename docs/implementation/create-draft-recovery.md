# Create draft recovery

## Interface brief

Audience: people composing an unfinished sequence. They need to recognize their
work, continue the right version, and know whether the browser saved an edit.
Success means restoring the sequence, preserving versions when tabs diverge,
and retrying a failed save without losing newer edits. Construct and Generate
restore their draft's undo history; Assemble restores its sequence and clears
the old builder command history.

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

Verified on 2026-10-15 in the actual Create route, using an isolated browser
profile and the task worktree's HTTPS preview:

- Built a sequence through Construct's controls, removed only its primary
  localStorage draft, and reloaded. The chooser displayed saved pictographs,
  words, step counts, and dates without creating a spurious empty draft.
- Continued the eight-step draft. Undo restored seven steps and Redo restored
  eight; the persisted workspace reflected each result.
- Opened the same draft in two tabs and made different edits. The chooser kept
  both versions. Further edits made after the conflict remained selectable after
  continuing the other version.
- Injected a quota failure for the primary draft key, continued editing, then
  restored storage and used Retry. All eight steps were saved. The editor stayed
  usable and no global error overlay covered Retry.
- Identical retry snapshots are deduplicated while versions with different
  undo histories remain available.
- Checked 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440,
  and 3840×2160. The modal remained within the viewport, all action targets
  were at least 44px tall, and Close / Start a new draft remained visible.
  A 720×450 CSS viewport also passed the same reflow checks.
- Keyboard focus visits each Continue action, then Close and Start a new draft;
  preview pictographs do not create inert button stops. The dialog has a title
  and description, previews have accessible summaries, and status changes are
  announced. Recovery was also exercised with reduced motion enabled.

Focused unit coverage includes damaged, missing, and expired primary drafts;
mode/session isolation; stale async history writes; cross-tab revision conflicts;
preservation of edits queued immediately before recovery or starting fresh;
save failure and retry; import session boundaries; and Assemble history clearing.

Independent visual review: two correction rounds, with the final review finding
no remaining visual blocker. The reviewer was not calibrated; this is a bounded
visual review, not an authorship judgment. The first review led to clearer version
labels and a fixed modal footer. Independent persistence review found no concrete
data-loss or mode-isolation blocker.

Evidence was retained outside the disposable worktree in
`C:/Users/Austen/AppData/Local/Temp/draft-recovery-evidence/`. Final recovery and
restored-editor captures are `08-recovery-final.png` and `09-restored-final.png`.

## Limits

- Draft backups live on this device. Clearing all browser site data also removes
  the IndexedDB recovery copies.
- Assemble's existing Undo commands contain closures and are not serialized.
  Recovery clears that stack so Undo cannot jump into a different draft; edits
  made after recovery have normal new Undo history.
- d2 could not create the check worktree because its disk was full. The local
  full Svelte check reported 629 errors and 68 warnings. Its two diagnostics in
  the changed Create component were fixed; the other diagnostics were outside
  this feature. A clean repository-wide full check is not claimed. Focused tests,
  explicit component compilation, and the guarded integration gate are recorded
  separately in the task delivery.
