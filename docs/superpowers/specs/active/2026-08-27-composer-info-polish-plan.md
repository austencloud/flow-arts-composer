---
status: active
value: null
effort: null
work_state: unverified
remaining: Inspect /composer at the specified viewports and run focused Composer, route morph, and SEO checks against this plan.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Composer Information Page Polish Plan

**Status:** Approved for implementation

**Scope:** Correct the live public `/composer` page so a newcomer can understand
what Composer does, how one sequence moves between editing, Tunnel, and 3D, and
where to go next.

## Evidence

- At 1440 CSS pixels, Tunnel measured 318px wide at the far edge of a 1440px
  content band; the related heading and explanation were left across an empty
  field.
- At 2560 and 3840 CSS pixels, the same layout widened the separation rather
  than adding useful composition.
- `Composer3DViewerDemo` caps its stage by viewport height at 1680px and above,
  which leaves the parent frame visibly wider than the stage at the 2560 tier.
- The public generator asks for `turnIntensity: 3`, while the per-visit demo
  already uses the intended 1.5 ceiling.
- The current footer repeats the header's Composer action and leaves a large
  empty band before the shared navigation.

## Changes

1. Keep the existing real editing, player, Tunnel, 3D, and gallery owners.
   Recompose them in the page; no replacement interaction is introduced.
2. Restore only the useful former framing: Composer writes notation while it
   plays motion, and it offers valid next moves. Keep that explanation concise.
3. Center the Tunnel and its explanation as one composition at wide widths;
   let the 3D stage use its full product frame and remove redundant 3D caption
   copy.
4. Tighten the gallery handoff and leave one contextual action, Browse the
   Gallery. Use the compact shared footer on `/composer` so the header action
   is not repeated at the bottom.
5. Cap all public Composer demo turns at 1.5.

## Verification

- Focused Composer, route morph, SEO/analytics, and state tests.
- Formatting and page CSS checks.
- Live `/composer` visual inspection at 375×667, 960×412, 820×1180,
  1440×900, 1920×1080, 2560×1440, and 3840×2160, plus 200%-equivalent
  reflow. Verify overflow, console output, and the Tunnel/3D/gallery handoff.
