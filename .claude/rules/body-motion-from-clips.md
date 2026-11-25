---
paths:
  - "src/lib/shared/3d/**/*"
  - "src/lib/features/stage/**/*"
  - "src/routes/test/**/*"
  - "static/animations/**/*"
  - "scripts/gait/**/*"
---

# Body Motion Comes From Clips (ENFORCED)

Austen, 2026-11-23, after a walk built on Mixamo clips replaced months of
hand-made gait: "Why did we ever attempt to hand-roll anything? Please make it
so future agents don't screw around and waste their time trying to do this
unless they're absolutely sure they're capable of doing a kick-ass job like
Mixamo already has."

This covers how a 3D person moves apart from a prop in hand: standing, walking,
running, stopping, turning, jumping, falling, landing, crouching, sliding,
rolling, climbing, sitting, gestures and crowd motion. Prop spinning follows the
notation and is not covered.

## The rule

1. Start from a Mixamo clip. The archive is
   `huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters`
   (`animation_motion/`, about 2,300 clips). Raw FBX stays outside the
   repository in `E:/tka-studio/walk-sources/`; the baked clip goes in
   `static/animations/` with a README naming source, checksum and terms.
2. Play it through the clip animator in `src/lib/shared/3d/locomotion/gait/`.
   Extend that animator. Do not write another.
3. Code may choose a clip, blend clips, match speed, hold a planted foot, and
   ease between poses. Code does not invent a pose, a joint curve, a gait, or a
   rule that bends a joint the clip did not bend.
4. Look at the bare clip on the product's body before adding anything to it,
   from the side and from the front, hands included. If the bare clip looks
   better than what the app draws, the fault is in the app.

## Hand-making motion anyway

Only when no clip in the archive does the job, and only if you are sure yours
will look as good. Before any of it is wired in, film it beside the nearest
Mixamo clip on the same body, side and front, at full and half speed, and get
Austen's yes on that film. Numbers do not stand in for it: three passes of
hand-made gait met their numbers and looked wrong.

Walking work has an owner: Kojo, desk `E:/tka-walking`.
