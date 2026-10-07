---
status: backlog
value: 2
effort: L
remaining: Inspect current Collision Lab mesh collision, leg, and costume models against the future-work acceptance before implementing.
depends_on: ''
plan_path: docs/superpowers/plans/shipped/2026-04-10-collision-lab.md
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# Collision Lab — Future Work

> Follow-ups from the 2026-04-11 state-of-the-art audit. The stance optimizer
> and kinematic simulator from that session solve the biggest blocker (human
> sliding knobs when a computer could seed them), but several upgrades would
> push the lab closer to frontier-lab territory.

Each section is an independent sub-project. They can be executed in any order
and do not depend on each other.

---

## Change 2 — BVH mesh collision

**Problem.** Both the live `CollisionDetector` and the new `StanceSimulator`
use sphere + line-segment primitives for body-vs-prop and body-vs-body
collision. Those primitives miss:

- Forearm clipping the ribcage at cross-body angles (torso sphere is 12 cm
  but the ribcage front-to-back is shallower; a 10-cm-radius arm can pass
  "through" the sphere's edge but actually clip the sternum)
- Upper arm grazing the side of the skull during overhead reach (head
  sphere is 9 cm; the temple is inside that)
- Prop shaft clipping the clavicle or scapula, which aren't modeled at all
- Leg vs arm (we don't model legs)
- Hair, costume, and anything else outside the strict bone rig

**Fix.** Use `three-mesh-bvh` (already a dependency) to build a bounding
volume hierarchy over the skinned avatar mesh, and query segment-vs-mesh
for prop shafts and mesh-vs-mesh for body-on-body.

### Architecture

Add two new services:

- `IAvatarMeshBVH` — holds a `MeshBVH` built from the avatar's `SkinnedMesh`
  after the skeleton has been posed. Rebuilds when the skeleton changes
  (not every frame — amortize over ~4 frames).
- `MeshBVHCollisionDetector implements ICollisionDetector` — the new
  mesh-aware detector. Parallel implementation alongside the current
  sphere-based `CollisionDetector`; a DI container switch selects which
  runs in the live rig.

### Per-frame flow

```
1. Avatar3D updates bones + IK (existing).
2. AvatarMeshBVH.refreshIfStale(skeletonService)
   - For cost control: only rebuild if the bone checksum changed AND
     at least 4 frames have passed since the last build.
   - Build the deformed mesh once, hand it to new MeshBVH(mesh.geometry).
3. For each prop:
   - shaftLine = Line3(segA, segB)
   - hits = bvh.shapecast(mesh => intersectsLine(shaftLine))
   - Report as prop-through-body if hits.length > 0.
   - Include triangle indices so we can attribute to head / torso / arm
     regions via skin weight lookup.
4. For body-vs-body, query arm capsule vs mesh rather than arm vs arm.
```

### Region attribution

`MeshBVH` returns triangle indices; we need to map those back to body
regions so the collision readout still shows `prop-through-head` etc.
Two options:

1. **Skin weight lookup** — for a hit triangle, read the vertices' skin
   weights. The bone with the highest average weight determines the
   region. Requires `BufferGeometry.getAttribute("skinIndex")` and a
   bone-to-region lookup table.
2. **Pre-partition triangles** — at load time, build a triangle-index →
   region map by walking every triangle once and assigning to whichever
   bone has the highest weight on its vertices. Stored as an Int8Array.
   Faster per-query (no skin-weight math), ~40 KB per avatar.

Go with (2). The one-time cost pays for itself in live performance.

### Performance budget

- BVH rebuild: target < 4 ms per rebuild, amortized to 1 ms/frame at 60 fps.
- Shapecast per prop: target < 0.5 ms per prop, so two props is 1 ms.
- Total overhead: ~2 ms/frame, leaves 14.6 ms for everything else.

If we blow the budget, fall back to sphere primitives for distant rigs
(exhibit performers in the museum) and keep BVH only for the player's
avatar.

### Migration strategy

1. Build `IAvatarMeshBVH` and `MeshBVHCollisionDetector`.
2. Add a DI flag `useBVHCollision` (default false) selecting which detector
   runs in the live rig.
3. Verify the BVH detector agrees with the sphere detector on a suite of
   known-good and known-bad stances. Log discrepancies for review.
4. Once confident, flip the default to true and deprecate the sphere
   detector in production. Keep the sphere detector around for the
   simulator (fast, no mesh needed).

### Out of scope

- Modeling hair or costume collision — these deform differently and need
  their own proxies.
- Multi-avatar collision — queueing multiple BVHs and checking pairwise
  is ~n² and doesn't scale. Defer to Phase 3 when we support duets.

---

## Change 5 — Learned naturalness prior

**Problem.** The optimizer finds collision-free, reachable stances, but it
has no concept of what looks *natural*. With a 4-DoF search space and loose
joint comfort penalties, it will happily converge on a stance where the
performer is bent awkwardly sideways — geometrically valid, visually
uncanny.

**Fix.** Train a small MLP on AMASS + Motion-X pose data to produce a
scalar "naturalness" score for any stance. Add it as an extra loss term
in `StanceOptimizer.lossFrom`.

### Why this is research-grade

Unlike Changes 2–4, this isn't a straight engineering task. It requires:

- A dataset of human poses with a clear "natural vs unnatural" signal
- A training pipeline (PyTorch or TensorFlow.js)
- A way to export the trained model for in-browser inference
- A definition of "natural" that's specific to TKA spin, not generic
  standing-around poses

The spec below is skeletal — fill in details when the other changes land
and we have more signal on what kinds of unnatural poses the optimizer
actually produces.

### Architecture sketch

1. **Data collection**
   - Download AMASS (100 k+ human motion clips).
   - Filter to upper-body poses with arms above horizontal (TKA-relevant).
   - Augment with Motion-X "object manipulation" clips where available.
   - Extract (root orientation, hip position, spine pose, shoulder pose,
     elbow angles) as feature vectors.

2. **Labeling signal**
   - Natural poses: AMASS/Motion-X ground truth (weight 1).
   - Unnatural poses: synthetic — randomly perturb AMASS poses by 2–3σ in
     joint space and label as unnatural (weight 0).
   - This gives ~200 k training examples for a modest MLP.

3. **Model**
   - 3-layer MLP: 32 → 64 → 32 → 1 sigmoid.
   - ~3 k parameters. Inference in microseconds per eval.
   - Export to ONNX, then to JavaScript via `onnxruntime-web`.

4. **Integration**
   - New service `INaturalnessPrior.score(stance) → number in [0,1]`.
   - `StanceOptimizer` multiplies by `W_NATURALNESS = 5` and adds to loss.
   - When prior is unavailable (model not loaded), skip the term so the
     optimizer still works.

5. **Validation**
   - Hand-label 50 known-natural and 50 known-unnatural poses.
   - Check prior ranks them correctly with > 90% accuracy.
   - Run optimizer with and without the prior term on the 576-pose catalog.
   - Compare labels: fewer "needs-adjustment" with the prior = win.

### Alternative: retrieval-based prior

If training is too much work, use a nearest-neighbor lookup: at evaluate
time, find the closest AMASS pose to the candidate stance and use its
distance as the prior score. Slower but no training needed. Requires
~50 MB of reference pose embeddings in the browser.

### Out of scope

- Physics-based animation (PhysDiff, MotionVAE). Overkill for static stance
  selection; worth considering for Phase 3 sequence transitions.
- Reinforcement learning. The problem isn't sequential decision-making;
  it's one-shot stance selection.

---

## Dependencies and ordering

```
Change 1 (optimizer)  ──┐
                        ├──> Change 3 (balance, DONE)
                        ├──> Change 4 (joint limits, DONE)
                        ├──> Change 2 (BVH) ──┐
                        │                     ├──> full lab V2
                        └──> Change 5 (prior) ┘
```

Changes 3 and 4 landed with Change 1 (balance margin and joint violations
are already in `SimResult`). Changes 2 and 5 are independent and can be
worked in parallel by different contributors.

---

## Open questions

1. Should the optimizer's loss weights be user-tunable, or fixed? Fixed for
   Phase 1. When we have data on reviewer disagreements with AI seeds, we
   can revisit.

2. Should we store per-label "AI seed confidence" so later retraining can
   weight the dataset? Yes — add `aiSeedConfidence?: number` to `PoseLabel`
   before the first labeling session.

3. Should the optimizer try multiple blue↔hand assignments (blue-as-left
   vs blue-as-right) and pick the better? Not for diamond mode — the
   assignment is fixed by the `bluePropState → leftArmIK` wiring in
   `AvatarAnimator`. Revisit when prop variety (fans, clubs) lands.
