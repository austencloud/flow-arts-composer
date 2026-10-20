<script lang="ts">
  /**
   * Markerless Mocap Clip Harness
   *
   * Plays a MetaHuman Animator markerless body solve, retargeted onto the
   * Mixamo X Bot, beside the source video. The video is the clock: each frame
   * the character is posed at the video's time, so pausing or scrubbing the
   * video moves both. Reuses the self-loaded rig binding for loading and
   * stateless pose sampling.
   *
   * Clip: Austen's woods staff take, 25 s from 0:15 of woods-full.mp4, solved
   * 2026-10-19 and retargeted by E:/mocap-metahuman/retarget/retarget_to_mixamo.py.
   * The source video is a local-only file (excluded from git), so this page
   * only shows it on Austen's machine.
   *
   * Staffs: tracked in the video with SAM 2 and lifted to 3D against the solve's
   * hands by E:/mocap-metahuman/prop/lift.py. Each frame stores both staff ends
   * as offsets from the grip (the solve's palm slid onto the tracked staff), so
   * here the staff passes through X Bot's palm at real size.
   */
  import { Canvas, T } from "@threlte/core";
  import {
    CylinderGeometry,
    Group,
    Mesh,
    MeshStandardMaterial,
    Quaternion,
    SphereGeometry,
    Vector3,
    type Object3D,
  } from "three";
  import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
  import { createSelfLoadedRigBinding } from "#lib/features/stage/locomotion/motion-matching/self-loaded-rig-binding.js";
  import type { RigBinding } from "#lib/features/stage/locomotion/motion-matching/rig-binding.js";
  import MocapDriver from "./MocapDriver.svelte";

  const CLIP_ID = "woods-staffs";
  const VIDEO_URL = "/word-videos/inshot-recovery/woods-full.mp4";
  const VIDEO_START_SEC = 15;
  const PROPS_URL = "/animations/mocap/woods-staffs-props.json";

  type Vec3 = [number, number, number];
  interface StaffTrack {
    fps: number;
    lengthM: number;
    frames: { L: [Vec3, Vec3] | null; R: [Vec3, Vec3] | null }[];
  }

  function makeStaff(tipA: string, tipB: string) {
    const group = new Group();
    const shaft = new Mesh(
      new CylinderGeometry(0.012, 0.012, 1, 10),
      new MeshStandardMaterial({ color: "#e8e4dc", roughness: 0.6 })
    );
    const tips = [tipA, tipB].map((color) => {
      const tip = new Mesh(
        new SphereGeometry(0.03, 12, 8),
        new MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.6,
        })
      );
      group.add(tip);
      return tip;
    });
    group.add(shaft);
    group.visible = false;
    return { group, shaft, tips };
  }

  const staffs = new Group();
  const staffBySide = {
    L: makeStaff("#ff8a3d", "#9b5cff"),
    R: makeStaff("#ff6fae", "#f4f0ff"),
  };
  staffs.add(staffBySide.L.group, staffBySide.R.group);
  let track: StaffTrack | null = null;
  const UP = new Vector3(0, 1, 0);
  const tmpA = new Vector3();
  const tmpB = new Vector3();
  const tmpPalm = new Vector3();
  const tmpQ = new Quaternion();

  let rigRoot = $state<Object3D | null>(null);
  let rig: RigBinding | null = null;
  let clipSec = 0;
  let status = $state("Loading character and clip…");
  let video = $state<HTMLVideoElement | null>(null);

  let didSetup = false;

  async function setup() {
    try {
      const binding = await createSelfLoadedRigBinding(
        "/animations/locomotion-pack/X%20Bot.glb",
        [{ clipId: CLIP_ID, url: "/animations/mocap/woods-staffs.glb" }]
      );
      clipSec = binding.clipSpecs()[0]?.durationSec ?? 0;
      binding.applyClip(CLIP_ID, 0);
      track = (await (await fetch(PROPS_URL)).json()) as StaffTrack;
      rig = binding;
      rigRoot = binding.root;
      status = `Ready: ${clipSec.toFixed(1)} s clip`;
      if (typeof window !== "undefined") {
        (window as unknown as { __mocapRig?: RigBinding }).__mocapRig = binding;
      }
    } catch (err) {
      status = `Setup failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error("[mocap-clip] setup failed", err);
    }
  }

  $effect(() => {
    if (didSetup) return;
    didSetup = true;
    void setup();
  });

  function onVideoReady() {
    if (video && video.currentTime < VIDEO_START_SEC)
      video.currentTime = VIDEO_START_SEC;
  }

  function tick() {
    if (!rig || !video) return;
    const t = video.currentTime - VIDEO_START_SEC;
    // Keep the video inside the solved window so the two never drift apart.
    if (t > clipSec || t < 0) {
      video.currentTime = VIDEO_START_SEC;
      return;
    }
    rig.applyClip(CLIP_ID, t);
    placeStaffs(t);
  }

  function placeStaffs(t: number) {
    if (!rig || !track) return;
    const frame =
      track.frames[
        Math.min(track.frames.length - 1, Math.round(t * track.fps))
      ];
    rig.root.updateMatrixWorld(true);
    for (const side of ["L", "R"] as const) {
      const staff = staffBySide[side];
      const ends = frame?.[side];
      const hand = rig.getBone(side === "L" ? "LeftHand" : "RightHand");
      const middle = rig.getBone(
        side === "L" ? "LeftHandMiddle1" : "RightHandMiddle1"
      );
      if (!ends || !hand || !middle) {
        staff.group.visible = false;
        continue;
      }
      hand
        .getWorldPosition(tmpPalm)
        .add(middle.getWorldPosition(tmpA))
        .multiplyScalar(0.5);
      // A staff never changes length: scale the stored ends about the grip so
      // the drawn staff is always the track's measured length.
      tmpA.fromArray(ends[0]);
      tmpB.fromArray(ends[1]);
      const fit = track.lengthM / tmpA.distanceTo(tmpB);
      tmpA.multiplyScalar(fit).add(tmpPalm);
      tmpB.multiplyScalar(fit).add(tmpPalm);
      staff.tips[0].position.copy(tmpA);
      staff.tips[1].position.copy(tmpB);
      staff.shaft.position.copy(tmpA).add(tmpB).multiplyScalar(0.5);
      const length = track.lengthM;
      staff.shaft.scale.set(1, length, 1);
      tmpQ.setFromUnitVectors(UP, tmpB.sub(tmpA).divideScalar(length));
      staff.shaft.quaternion.copy(tmpQ);
      staff.group.visible = true;
    }
  }
</script>

<svelte:head>
  <title>Mocap Clip Harness</title>
</svelte:head>

<div class="page">
  <div class="video-pane">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={video}
      src={VIDEO_URL}
      controls
      loop
      muted
      playsinline
      preload="auto"
      onloadedmetadata={onVideoReady}
    ></video>
  </div>

  <div class="stage-pane">
    <Canvas>
      <T.PerspectiveCamera makeDefault position={[0, 1.2, 4.2]} fov={45}>
        <OrbitControls
          enableDamping
          target={[0, 0.95, 0]}
          maxPolarAngle={Math.PI / 2}
        />
      </T.PerspectiveCamera>

      <T.AmbientLight intensity={0.6} />
      <T.DirectionalLight position={[5, 10, 5]} intensity={1.1} />
      <T.DirectionalLight position={[-5, 5, -5]} intensity={0.3} />

      <T.Mesh rotation.x={-Math.PI / 2}>
        <T.PlaneGeometry args={[20, 20]} />
        <T.MeshStandardMaterial color="#2a2a33" />
      </T.Mesh>

      {#if rigRoot}
        <T is={rigRoot} />
        <T is={staffs} />
      {/if}

      <MocapDriver {tick} />
    </Canvas>

    <div class="panel">
      <h1>Markerless mocap: woods staffs</h1>
      <p class="status">{status}</p>
      <p class="note">Play or scrub the video; the character follows it.</p>
    </div>
  </div>
</div>

<style>
  .page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    width: 100%;
    height: 100vh;
    overflow: hidden;
    background: #14141c;
  }

  .video-pane {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    background: #000;
  }

  .video-pane video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .stage-pane {
    position: relative;
    min-height: 0;
  }

  .panel {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    max-width: calc(100% - 2rem);
    padding: 0.8rem 1rem;
    border-radius: 12px;
    background: rgba(18, 18, 26, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #e8e8f0;
  }

  .panel h1 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .status,
  .note {
    margin: 0;
    font-size: 0.8rem;
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 760px) {
    .page {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
    }
  }
</style>
