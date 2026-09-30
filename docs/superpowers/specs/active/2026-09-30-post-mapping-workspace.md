# Post mapping workspace

## Brief and evidence

Mapping needs a visible next action while the performance stays large. Austen's
September 30 screenshots show full-width take buttons with 12px labels, an orphan
alignment button, and unrelated controls with equal emphasis. Live inspection
measured each take button at about 815px. Mapping's painted preview also bypasses
the scoped animation renderer and cannot open its normal settings.

Read: visual-design-canon, styling-guide, visual-review, the September 26 Post
tool-row decision, shared PanelButton, SegmentedControl, TypeableValue, Drawer,
DrawerHeader, motion helpers, and scoped Post animation appearance controls.
The research ledger is current (September 21); aesthetic calibration is explicitly
not calibrated. This review makes no AI-authorship claim.

## Composition alternatives (same content)

**A — inspector beside the performance (chosen)**

```text
Back to editing   [Take v]                         Save status
             PERFORMANCE  | Map landings
                    [PiP] | [Tap a landing]
                          | Fit/status
                          | > Align sequence
                          | > Animation
                          | > Tempo & fine timing
                          | > Parts & end
                          | [Looks right]
Transport / landing timeline / view options
```

On a phone: compact toolbar, performance, transport/timeline, Tap + Settings.
Settings opens the existing modal drawer; clicking PiP opens Animation there.

**B — horizontal tool shelf below the performance**

```text
Back to editing   [Take v]
                    PERFORMANCE [PiP]
Transport / landing timeline
[Tap] [Align] [Animation] [Tempo] [Parts] [Looks right]
             selected settings below
```

B reduces the desktop side column but competes with the landing timeline and
creates another shelf of small choices on phones. A follows the existing Post
inspector decision and keeps detailed edits close to the preview. Its cost is
inspector scrolling when animation controls are open; the stage stays fixed.

## Implementation contract

- Back is first at top left. The take selector has a bounded, readable width.
- Primary tapping is distinct. Alignment, animation, tempo and parts are
  progressive disclosures with 44px targets and at least 14px essential text.
- Earlier/value/later controls form a deliberate row; no orphan actions.
- The preview and inspector form one centered working area on large screens.
- Phone detail controls use shared Drawer focus, Escape, scroll and return-focus.
- PiP is a labelled keyboard-accessible button opening Animation settings.
- Appearance uses the same scoped renderer and controls as Post animation layers,
  stored per take through editor history/draft persistence. No global settings or
  unrelated timeline layers are changed. Review playback mode is session-local.
- Continuous/step playback keeps the video and animation on one mapping clock.
- No changes to fitted timing algorithms, source media, or export composition.

## Acceptance

Inspect actual route at 375x667, 960x412, 820x1180, 1440x900, 1920x1080,
2560x1440 and 3840x2160; also 200% zoom. Check overflow, essential text/targets,
keyboard focus, PiP opening, take changes, long labels, empty/missing media,
reduced motion, persistence and undo. Use disposable fixtures for edits.
Separate aesthetic review follows real frames, with at most two correction rounds.

## Verification — September 30, 2026

- Browser inspection covered all seven viewport sizes above using the disposable
  woods fixture. The 960×412 correction gives the video a full-height left column
  and places the timeline and tapping controls on the right. No editor overflow
  remained. At 4K the toolbar uses 18px text and the mapping heading uses 20px.
- Reflow at the equivalent of 200% on a 1440×900 display was checked with a
  720×450 CSS viewport and 2× device scale. This was viewport emulation, not an
  operating-system magnifier. The video, timeline and tapping controls fit.
- Phone settings have no horizontal overflow and all visible button/radio targets
  meet 44px. Reduced-motion emulation removes the drawer transition. Escape
  closes settings and restores focus to either the PiP or Settings opener.
- PiP opens Animation in the desktop inspector or phone drawer. Props, Effects,
  Efforts and Display reuse Post's existing controls. Punch, light canvas and
  Trails survived draft reload; changing takes retained independent appearance.
  Ctrl+Z/Ctrl+Y restored the previous/next effort without changing the timeline.
- A long take name stayed inside the bounded selector on the phone. Empty and
  missing-media fallback branches were preserved and reviewed in source; they
  were not forced in the browser fixture.
- Focused regressions cover per-take history, actual mapped landing selection,
  step playback's 300ms dwell and trailing footage, teardown, reactive effects
  restored from JSON, and native-dialog focus return: 16 tests passed.
- The final Svelte check reported zero errors and zero warnings.
- The separate visual reviewer used rubric VR-1 and the September 21 research
  ledger. One correction round resolved the short-landscape clipping. The
  supplied landing frames have no remaining material aesthetic concern.
  Calibration remains **not calibrated**; no AI-authorship claim is made.

The fixture uses its own browser draft ID and does not edit the creator's videos.
Local evidence is in `tmp/mapping-review/`, including seven viewport frames,
the independent review, enlarged reflow, long-label capture and final geometry.
