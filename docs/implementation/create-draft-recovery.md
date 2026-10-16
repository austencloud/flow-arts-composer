# Create draft recovery

## Interface brief

Audience: people composing an unfinished sequence. They need to recognize their
work, continue the right version, and know whether the browser saved an edit.
Success means restoring the sequence, preserving versions when tabs diverge,
and retrying a failed save without losing newer edits. Construct and Generate
restore their draft's undo history; Assemble restores its sequence and clears
the old builder command history.

UI review: VR-1; evidence ledger checked 2026-09-21; calibration not calibrated.

The first recovery interface considered two compositions:

1. An inline recovery panel above the workspace, containing version previews and
   actions. It keeps the decision beside the editor but takes most of the editing
   area on a phone, especially when two versions need comparison.
2. A compact, reserved save-status row and a modal containing version previews.
   The row keeps save state accessible during editing; the modal gives the recovery
   decision enough space without permanently shrinking the sequence grid.

The initial reserved status row took too much editing space. Moving its button
beside Save also left draft browsing in the wrong place. After user review on
2026-10-15, draft browsing moved to **You → Drafts** at `/browse/you/drafts`.
The editor has no permanent Drafts button or normal-save status row. Only a failed
save or unresolved recovery/conflict shows the inline warning.

For You, two compositions were considered: a lead Resume panel above the saved
library, and a Drafts shelf alongside Saved, Visuals, and Videos. The shelf keeps
unfinished work in You without adding another permanent band above other work.
Each draft has a real sequence preview, last-edited time, and Resume action;
earlier versions expand within that draft. The mobile You overview has a compact
Drafts link. Guests can access local drafts without an account. The shelf says
“On this device” because these recovery copies do not sync between devices.

Drafts are grouped by editor mode and session, not by their sequence contents.
Each session retains its latest and previous distinct saved versions; existing
recovery and conflict copies remain available. Leaving Create flushes pending
edits before the shelf reads them. Resume preserves the current editor before
restoring the chosen version, and consumes its URL request after initialization.
Resume links use full app navigation because client navigation between the
catchall routes alone does not switch the app's active module.
The selected version is held in memory before editor initialization, so an
initial autosave cannot rotate its stored ID before Resume reads it. Recovery
still checks the draft revision before replacing the active version.

The chooser uses the existing BaseModal and StepGrid. Keep each version's word,
step count, date, pictographs, and Continue action together. Keep the editor
mounted during errors and recovery. Closing the dialog leaves a visible Review
action; it does not discard the drafts or resolve a conflict.

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

### Earlier compact controls follow-up (superseded)

Verified the corrected controls on 2026-10-15 at 1440×900, 375×667,
960×412, and Assemble's narrow 350px/360px breakpoint. Normal saving creates
no status row. Drafts opens the chooser from both the workspace controls and
Assemble's compact rail, and remains available in empty Construct and Generate.
A simulated primary-storage failure showed Retry; a successful retry removed
the warning. Moving Drafts beside Clear in compact Assemble resolved a 5px
overlap between Play and Actions at 360px. The final rail has 44px action targets
and a 50px Play target without overlap. Captures are `13-compact-desktop.png`,
`14-compact-phone.png`, `16-compact-empty-phone.png`, and
`22-compact-assemble-fixed.png` in the evidence directory above.

### You → Drafts follow-up

Verified on 2026-10-15 against the task worktree at `https://localhost:5187`:

- You lists Construct and Assemble drafts with their real sequence previews.
  Saved and Drafts switch correctly, and the mobile “Drafts · On this device”
  link opens the same shelf. A fresh guest browser can access the empty shelf
  and use Start a sequence without signing in.
- Resume opened the seven-step Construct draft; Undo restored six steps and
  Redo restored seven. Choosing an earlier version restored its five steps.
  The consumed URL request was removed after loading.
- Assemble Resume restored its selected one-step sequence after fixing an
  initialization autosave race. A regression test reproduces the selected
  version's stored ID being rotated away before recovery.
- The editor has no Drafts button or normal save-status row. Failed-save and
  recovery controls remain available.
- Populated layouts passed 375×667, 960×412, 820×1180, 1440×900, 1920×1080,
  2560×1440, and 3840×2160 without horizontal overflow. Resume and version
  controls are 44px tall. In short landscape, the shelf scrolls to expose the
  final Resume action fully. Keyboard Enter expands versions and Tab reaches
  the earlier version's Resume link. No page errors were recorded.
- Independent review found no remaining blocker in the resume race fix,
  revision checks, or desktop/mobile navigation. Visual review remains
  uncalibrated, as recorded above.

Focused coverage includes draft grouping, canonical routes, independent session
retention through repeated autosaves, Resume preservation, and the initialization
race. Browser captures are in the evidence directory's `you-drafts` subfolder;
`final-1440.png`, `final-375.png`, `final-phone-versions.png`,
`resumed-construct.png`, and `resumed-assemble.png` show the working surfaces.

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
