# Grip Lab keyframe timeline — 2026-09-21

Mode: plan and review. Rubric: VR-1. Research checked: 2026-09-21;
calibration: not calibrated. Independent rendered review supplemented the
implementation review; this is not a usability study.

The task is to teach one isolation by inspecting, editing, retiming, and
deleting whole-pose keyframes. Austen asked for visible keyframes and minimal
text, retaining the performer and existing controls. Two compositions were
considered: a frame list in the pose inspector, or a timeline under the
performer. The timeline keeps timing, interpolation, and deletion visible
when the inspector is closed; the list concealed those relationships.

## Evidence

- Route: `/test/grip-lab`, with Austen's eight-key URL including phases
  0.500 (15 degrees lean), 0.538 (zero lean), and 0.776 (6.3 degrees).
- Selection, deletion, undo, add, fine retiming, collision rejection, URL
  reload, and the phase-4/South wrap were exercised in the browser.
- Deleting 0.500 removed that lean peak; Undo restored the exact serialized
  keys. Retiming by 0.001 preserved pose values. Attempting to retime onto
  0.538 preserved both keys and explained the conflict.
- Observed CSS viewports: 375×667, 960×412, 820×1180, 1440×900,
  1920×1080, 2560×1440, and 3840×2160. No horizontal page overflow;
  close keyframes retained distinct 44×44 targets. Short landscape uses the
  existing scrollable control column; phone editing stacks below the scene.
- Enlarged-page reflow was inspected at 720×450 CSS pixels / DPR 2,
  equivalent to the layout space at 200% on a 1440×900 viewport. Actual
  browser-chrome zoom was not exercised. Browser screenshot emulation adds
  capture padding; CSS geometry was measured separately.
- Eight focused state/interpolation tests pass. Type checks report zero
  errors and warnings. Existing physical contact limitations are unchanged.

## Visual review

| Dimension | Finding |
| --- | --- |
| Project specificity | Supported: real performer, isolation stops, stage directions, and pose curve. |
| Hierarchy | Supported: performer above timing controls; selected key and its actions remain visible. |
| Grouping | Supported: timing and deletion are together; pose values stay in their existing inspector. |
| Real evidence | Supported: curve uses the actual shared sampler, not an illustrative easing graphic. |
| Craft | Supported for observed states: separate targets for adjacent keys, explicit between-key state, preserved pose links. |
| Product continuity | Supported: existing transport, panel buttons, numeric scrubbing, and motion helpers. |

Independent review found a small-performer tradeoff on desktop with the pose
inspector open. The scene retains full-body framing so extremities and the
staff remain inspectable; the layout now reserves at least 18rem of height.
Camera orbit/zoom remains available. Fine hand/contact quality is outside
this timeline change. Visual review supports the named scope; newcomer
comprehension and physical performance accuracy remain unassessed.
