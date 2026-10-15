<script lang="ts">
  import { resolveThrelteScene } from "../../scene-boot/threlte-handles";
  /**
   * GaitProbe
   *
   * Drop this inside any Threlte scene that has rigged avatars in it and it
   * records what their legs are actually doing. It renders nothing.
   *
   * It samples in the RENDER stage, not the main stage. The main stage is
   * where LocomotionAnimator writes clip rotations, FootPlanter overwrites
   * some of them with IK, and AvatarAnimator solves the arms — sampling
   * anywhere inside that ordering measures a pose halfway through being
   * built. By the render stage the frame is settled, which is the pose the
   * eye is complaining about.
   *
   * The scene is re-scanned on a slow interval rather than every frame: bone
   * lookups walk the whole subtree, and a cast does not gain legs mid-stride.
   */

  import { useTask, useThrelte, useScheduler } from "@threlte/core";
  import type { Object3D } from "three";

  import {
    analyzeGait,
    DEFAULT_THRESHOLDS,
    latestArrivalFrames,
    latestTravelFrames,
    travelSpans,
    type GaitReport,
    type GaitThresholds,
  } from "./gait-analysis";
  import { gaitProbeState } from "./gait-probe-state.svelte.js";
  import {
    collectRiggedAvatars,
    GaitRecorder,
    sampleRig,
    type RiggedAvatar,
  } from "./gait-rig-sampler";

  interface Props {
    /** Stop recording without unmounting, so a paused scene keeps its buffer. */
    recording?: boolean;
    /** How many frames to keep per avatar. 900 is 15 seconds at 60fps. */
    capacity?: number;
    /** How often the report is recomputed, in seconds. */
    reportInterval?: number;
    /** How often the scene is re-scanned for rigs, in seconds. */
    rescanInterval?: number;
    thresholds?: GaitThresholds;
    /** Clear the recording when this identity changes. */
    resetKey?: unknown;
    /** Publish the latest moving segment instead of the whole rolling buffer. */
    reportMode?: "buffer" | "latest-travel";
    /** Keep this much of the stop transition after recording turns off. */
    arrivalWindowSeconds?: number;
    /** Called with a fresh report per avatar every reportInterval. */
    onReport?: (reports: Map<string, GaitReport>) => void;
    /**
     * Publish the live recorder on `window.__gaitProbe` so a measurement pass
     * can pull the raw frames out of the page without a UI.
     */
    exposeOnWindow?: boolean;
  }

  let {
    recording = true,
    capacity = 900,
    reportInterval = 0.5,
    rescanInterval = 2,
    thresholds = DEFAULT_THRESHOLDS,
    resetKey,
    reportMode = "buffer",
    arrivalWindowSeconds = 0,
    onReport,
    exposeOnWindow = true,
  }: Props = $props();

  // In Threlte 8, useThrelte() returns `scene` as the Scene object itself —
  // only camera/dpr/size are `.current` stores — so it is usable everywhere,
  // including inside useTask callbacks.
  const { scene: sceneValue } = useThrelte();
  const { renderStage } = useScheduler();
  const scene = resolveThrelteScene(sceneValue);

  const recorder = new GaitRecorder(capacity);
  let avatars: RiggedAvatar[] = [];
  let elapsed = 0;
  let sinceRescan = Infinity;
  let sinceReport = 0;
  let postRollRemaining = 0;
  let wasRecording = recording;

  $effect(() => {
    void resetKey;
    recorder.clear();
    gaitProbeState.reset();
    elapsed = 0;
    sinceReport = 0;
    postRollRemaining = 0;
  });

  $effect(() => {
    const active = recording;
    if (wasRecording && !active) postRollRemaining = arrivalWindowSeconds;
    if (active) postRollRemaining = 0;
    wasRecording = active;
  });

  function rescan(): void {
    avatars = collectRiggedAvatars(scene);
    recorder.retain(avatars.map((avatar) => avatar.id));
  }

  function buildReports(): Map<string, GaitReport> {
    const reports = new Map<string, GaitReport>();
    for (const avatar of avatars) {
      const frames = recorder.frames(avatar.id);
      reports.set(
        avatar.id,
        analyzeGait(
          reportMode === "latest-travel" ? latestTravelFrames(frames) : frames,
          thresholds
        )
      );
    }
    return reports;
  }

  function buildArrivalReports(): Map<string, GaitReport> {
    const reports = new Map<string, GaitReport>();
    if (arrivalWindowSeconds <= 0) return reports;
    for (const avatar of avatars) {
      const frames = latestArrivalFrames(
        recorder.frames(avatar.id),
        0.1,
        arrivalWindowSeconds
      );
      if (frames.length >= 3) {
        reports.set(avatar.id, analyzeGait(frames, thresholds));
      }
    }
    return reports;
  }

  if (exposeOnWindow && typeof window !== "undefined") {
    const probe = {
      frames: (id: string) => recorder.frames(id),
      ids: () => recorder.ids(),
      report: () => Object.fromEntries(buildReports()),
      // A buffer that spans a stand and a walk averages the two together, and
      // the stand wins on frame count. Windowing is how you ask about the walk.
      reportWindow: (from: number, to: number) =>
        Object.fromEntries(
          avatars.map((avatar) => [
            avatar.id,
            analyzeGait(
              recorder
                .frames(avatar.id)
                .filter((f) => f.t >= from && f.t <= to),
              thresholds
            ),
          ])
        ),
      // Where the character was actually moving, so a window can be chosen
      // without guessing at the transport's timing.
      travelSpans: (id: string, minSpeed = 0.15) =>
        travelSpans(recorder.frames(id), minSpeed),
      // Answers "why did it find nothing" without a rebuild: an empty scene, a
      // scene with no bones, and a rig whose bones are named something the
      // alias table has never heard of are three different problems.
      debug: () => {
        const root = scene;
        let objects = 0;
        let bones = 0;
        const boneNames: string[] = [];
        root.traverse((node) => {
          objects += 1;
          if (!(node as { isBone?: boolean }).isBone) return;
          bones += 1;
          if (boneNames.length < 40) boneNames.push(node.name);
        });
        const chains = avatars.map((avatar) => {
          const chain: {
            name: string;
            type: string;
            performerIndex: unknown;
            localPos: [number, number, number];
            worldPos: [number, number, number];
          }[] = [];
          for (
            let node: Object3D | null = avatar.hips;
            node;
            node = node.parent
          ) {
            node.updateWorldMatrix(true, false);
            chain.push({
              name: node.name || "(unnamed)",
              type: node.type,
              performerIndex: node.userData?.performerIndex,
              localPos: [node.position.x, node.position.y, node.position.z],
              worldPos: [
                node.matrixWorld.elements[12]!,
                node.matrixWorld.elements[13]!,
                node.matrixWorld.elements[14]!,
              ],
            });
          }
          return {
            id: avatar.id,
            rootIs: avatar.root.name || avatar.root.type,
            chain,
          };
        });
        return { objects, bones, boneNames, avatars: avatars.length, chains };
      },
    };
    Object.assign(window, { __gaitProbe: probe });
  }

  useTask(
    (delta) => {
      const postRolling = !recording && postRollRemaining > 0;
      if (!recording && !postRolling) return;

      sinceRescan += delta;
      if (sinceRescan >= rescanInterval) {
        sinceRescan = 0;
        rescan();
      }
      if (avatars.length === 0) return;

      // A frame long enough to have been a stall says nothing about gait, and
      // dividing by it manufactures jerk that nobody saw.
      if (delta > 0.2) return;
      elapsed += delta;
      const finishedPostRoll = postRolling && postRollRemaining <= delta;
      if (postRolling)
        postRollRemaining = Math.max(0, postRollRemaining - delta);

      for (const avatar of avatars) {
        const frame = sampleRig(avatar, { t: elapsed, dt: delta });
        recorder.push(avatar.id, frame);
        gaitProbeState.pushTrail(avatar.id, frame.root);
      }

      sinceReport += delta;
      if (sinceReport >= reportInterval || finishedPostRoll) {
        sinceReport = 0;
        const reports = buildReports();
        gaitProbeState.publish(reports);
        gaitProbeState.publishArrival(buildArrivalReports());
        onReport?.(reports);
      }
    },
    { stage: renderStage }
  );
</script>
