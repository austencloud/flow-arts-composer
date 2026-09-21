<script lang="ts">
  import { onMount } from "svelte";
  import { Canvas, T } from "@threlte/core";
  import { Vector3, type Object3D } from "three";
  import {
    STAGE,
    userProportionsState,
    type AvatarContactReport,
  } from "@austencloud/scene-3d";
  import {
    CHARACTER_DEFINITIONS,
    getCharacterModelPath,
    type CharacterDefinition,
    type CharacterId,
  } from "$lib/shared/3d/domain/character-model";
  import { setCharacterCatalogContext } from "$lib/shared/3d/context/character-catalog-context";
  import PerformerCharacterPicker from "$lib/shared/3d/components/controls/PerformerCharacterPicker.svelte";
  import ContactIsolationPerformer from "$lib/shared/3d/performers/ContactIsolationPerformer.svelte";
  import {
    ISOLATION_ENDPOINT,
    sampleStaffIsolation,
  } from "$lib/shared/3d/performers/staff-isolation";
  import { auditFireStaffProfile } from "$lib/shared/3d/diagnostics/contact-correct/fire-staff-mesh-audit";
  import OrbitControls from "$lib/shared/3d/components/OrbitControls.svelte";
  import type { CameraControls } from "$lib/shared/3d/camera/camera-controls-runtime";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "$lib/shared/foundation/ui/DrawerHeader.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import TransportControls from "$lib/shared/animation-engine/components/controls/TransportControls.svelte";
  import {
    solveInspectionShot,
    INSPECTION_FOV_DEG,
  } from "../_lab-kit/inspection-shot";
  import ContactDiagnostics from "./ContactDiagnostics.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { copyTextToClipboard } from "$lib/shared/share/services/link-share";
  import PoseHandles from "./PoseHandles.svelte";
  import PoseEditor from "./PoseEditor.svelte";
  import { allowedTipOffset, authoredBodyPose, TEACHING_ANCHOR_OFFSET, TRANSITIONS, type PoseHandle } from "./isolation-teaching";
  import {
    createContactInspectionState,
    type InspectionView,
  } from "./contact-inspection-state.svelte";

  const inspection = createContactInspectionState();
  const cardinals = [
    { value: "0", label: "South" },
    { value: "1", label: "East" },
    { value: "2", label: "North" },
    { value: "3", label: "West" },
  ];
  const hands = [
    { value: "right", label: "Right", tone: "red" },
    { value: "left", label: "Left", tone: "blue" },
  ] as const;
  const views = [
    { value: "front", label: "Front" },
    { value: "side", label: "Side" },
    { value: "hand", label: "Hand" },
  ] as const;
  let stageWidth = $state(960),
    stageHeight = $state(640),
    ready = $state(false),
    loadFailed = $state(false);
  let cameraControls = $state<CameraControls | null>(null);
  let characterDrawerOpen = $state(false),
    diagnosticsOpen = $state(false),
    auditSummary = $state<string | null>(null);
  let report = $state<AvatarContactReport | null>(null);
  let avatarRoot = $state.raw<Object3D | null>(null);
  let editing = $state(false);
  let dragging = $state(false);
  let selectedHandle = $state<PoseHandle>("chest");
  let copyStatus = $state("");
  const taughtPose = $derived(inspection.pose);
  const tipOffset = $derived(allowedTipOffset(taughtPose, inspection.tolerance));
  const staffOffset = $derived<[number, number, number]>([
    tipOffset[0] + TEACHING_ANCHOR_OFFSET[0],
    tipOffset[1] + TEACHING_ANCHOR_OFFSET[1],
    tipOffset[2] + TEACHING_ANCHOR_OFFSET[2],
  ]);
  const tipDrift = $derived(Math.hypot(...tipOffset));
  const bodyPose = $derived(authoredBodyPose(taughtPose));
  const reachGap = $derived((inspection.hand === "right" ? report?.right : report?.left)?.palmResidualM ?? 0);
  // A measurement belongs to one posed frame, never the next scrub position.
  $effect(() => {
    inspection.phase;
    inspection.hand;
    inspection.characterId;
    taughtPose;
    inspection.tolerance;
    auditSummary = null;
  });
  let catalog = $state<readonly CharacterDefinition[]>(
    CHARACTER_DEFINITIONS.filter(
      (character) => character.availability !== "local-evaluation"
    )
  );
  setCharacterCatalogContext(() => catalog);

  const groundOffset = $derived(-userProportionsState.groundY);
  const prop = $derived(sampleStaffIsolation(inspection.phase, staffOffset));
  const handCenter = $derived<[number, number, number]>([
    prop.worldPosition.x,
    prop.worldPosition.y + groundOffset,
    prop.worldPosition.z + STAGE.AVATAR_GRID_OFFSET,
  ]);
  const endpoint = $derived<[number, number, number]>([
    ISOLATION_ENDPOINT[0] + TEACHING_ANCHOR_OFFSET[0],
    ISOLATION_ENDPOINT[1] + groundOffset + TEACHING_ANCHOR_OFFSET[1],
    ISOLATION_ENDPOINT[2] + STAGE.AVATAR_GRID_OFFSET + TEACHING_ANCHOR_OFFSET[2],
  ]);
  const actualEndpoint = $derived<[number, number, number]>([
    endpoint[0] + tipOffset[0], endpoint[1] + tipOffset[1], endpoint[2] + tipOffset[2],
  ]);
  const shot = $derived.by(() => {
    const view: InspectionView = inspection.view;
    const subject =
      view === "hand"
        ? {
            center: handCenter,
            halfWidth: 0.17,
            halfHeight: 0.17,
            halfDepth: 0.17,
          }
        : {
            center: [0, 1.15, 0.12] as [number, number, number],
            halfWidth: 0.85,
            halfHeight: 1.17,
            halfDepth: 0.4,
          };
    return solveInspectionShot(subject, {
      aspectRatio: Math.max(0.3, stageWidth / Math.max(1, stageHeight)),
      azimuthDeg: view === "side" ? 90 : view === "hand" ? 35 : 0,
      elevationDeg: view === "hand" ? 10 : 4,
    });
  });

  // A hand shot follows the authored grip, and a resize changes the framing
  // distance. Keep the controls' internal target aligned with the shot.
  $effect(() => {
    if (stageWidth > 0 && stageHeight > 0 && cameraControls) {
      void cameraControls.setLookAt(...shot.position, ...shot.target, false);
    }
  });

  let timeout: ReturnType<typeof setTimeout> | null = null;
  let animation: number | null = null;
  let previousTimestamp = 0;
  function startTimeout() {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      if (!ready) loadFailed = true;
    }, 15000);
  }
  function markReady() {
    ready = true;
    loadFailed = false;
    if (timeout) clearTimeout(timeout);
  }
  function frame(timestamp: number) {
    if (!previousTimestamp) previousTimestamp = timestamp;
    const elapsed = Math.min(100, timestamp - previousTimestamp);
    previousTimestamp = timestamp;
    if (inspection.playing && ready)
      inspection.tick(elapsed / 3000);
    animation = requestAnimationFrame(frame);
  }
  function beginPoseEdit() {
    dragging = true;
    inspection.beginEdit();
  }
  function endPoseEdit() {
    dragging = false;
    inspection.endEdit();
  }
  async function copyPose() {
    try {
      await copyTextToClipboard(inspection.poseLink());
      copyStatus = "Pose link copied";
    } catch {
      copyStatus = "Copy failed — use the address bar";
    }
  }
  function checkFrame() {
    if (!report) {
      auditSummary = "No report is available for this frame.";
      return;
    }
    const a =
      inspection.hand === "right"
        ? report.renderedRedEndpointA
        : report.renderedBlueEndpointA;
    const b =
      inspection.hand === "right"
        ? report.renderedRedEndpointB
        : report.renderedBlueEndpointB;
    if (!a || !b) {
      auditSummary =
        "The performer did not expose finite staff geometry for this frame.";
      return;
    }
    const audit = auditFireStaffProfile(
      avatarRoot,
      new Vector3(a.x, a.y, a.z),
      new Vector3(b.x, b.y, b.z)
    );
    auditSummary =
      audit.maximumPenetrationM == null
        ? `Mesh audit unavailable (${audit.reason ?? "no geometry"}).`
        : `${audit.status}: maximum penetration ${(audit.maximumPenetrationM * 1000).toFixed(2)} mm; skin nearest ${audit.worstIntersection?.boneNames.join(", ") || audit.affectedRegions.join(", ") || "none"}. Interior containment: ${audit.interiorContainment}.`;
  }
  async function checkPersonalCharacter() {
    const personal = CHARACTER_DEFINITIONS.find(
      (character) => character.id === "personal-metaperson"
    );
    if (!personal) return;
    try {
      if (
        (
          await fetch(getCharacterModelPath(personal.id as CharacterId), {
            method: "HEAD",
          })
        ).ok
      )
        catalog = [...catalog, personal];
    } catch {
      /* Unavailable local assets do not become selectable. */
    }
  }
  onMount(() => {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
      inspection.playing
    ) {
      inspection.setPlaying(false);
    }
    startTimeout();
    void checkPersonalCharacter();
    animation = requestAnimationFrame(frame);
    return () => {
      if (timeout) clearTimeout(timeout);
      if (animation) cancelAnimationFrame(animation);
    };
  });
</script>

<svelte:head><title>Staff isolation · TKA</title></svelte:head>
<main class="inspection">
  <header class="page-header">
    <div>
      <h1>Staff isolation</h1>
    </div>
    <div class="header-actions">
      <PanelButton ariaPressed={editing} onclick={() => {
        editing = !editing;
        inspection.setPlaying(false);
      }}>Edit pose</PanelButton>
      <PanelButton onclick={copyPose}>Copy pose link</PanelButton>
      <button
        type="button"
        aria-label="Character"
        onclick={() => (characterDrawerOpen = true)}
        ><i class="fas fa-user" aria-hidden="true"></i>
        <span>Character</span></button
      ><button
        type="button"
        aria-label="Diagnostics"
        onclick={() => (diagnosticsOpen = true)}
        ><i class="fas fa-wave-square" aria-hidden="true"></i>
        <span>Diagnostics</span></button
      >
    </div>
  </header>
  <section
    class="stage"
    class:editing
    aria-label="Staff isolation performer"
    aria-busy={!ready}
  >
    <div class="scene" bind:clientWidth={stageWidth} bind:clientHeight={stageHeight}>
    <Canvas shadows>
      {#key inspection.view}<T.PerspectiveCamera
          makeDefault
          position={shot.position}
          fov={INSPECTION_FOV_DEG}
          ><OrbitControls
            bind:ref={cameraControls}
            enabled={!dragging}
            enablePan={false}
            rightDragAction="rotate"
            target={shot.target}
            minDistance={0.25}
            maxDistance={10}
            maxPolarAngle={Math.PI}
          /></T.PerspectiveCamera
        >{/key}
      <T.AmbientLight args={["#dbe5ef", 1.4]} /><T.DirectionalLight
        position={[3, 5, 4]}
        intensity={2.2}
        castShadow
      /><T.DirectionalLight position={[-3, 2, -2]} intensity={0.8} />
      <T.Mesh
        position={[0, -0.005, STAGE.AVATAR_GRID_OFFSET]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        ><T.CircleGeometry args={[2.8, 64]} /><T.MeshStandardMaterial
          color="#18212a"
          roughness={0.9}
        /></T.Mesh
      >
      <T.Mesh position={endpoint}
        ><T.SphereGeometry args={[0.018, 16, 16]} /><T.MeshStandardMaterial
          color="#f3c46e"
          emissive="#6d4a1e"
        /></T.Mesh
      >
      <ContactIsolationPerformer
        characterId={inspection.characterId}
        phase={inspection.phase}
        hand={inspection.hand}
        {bodyPose}
        tipOffset={staffOffset}
        onReady={markReady}
        onReport={(next) => (report = { ...next })}
        onGeometry={(root, next) => {
          avatarRoot = root;
          report = { ...next };
        }}
      />
      <PoseHandles root={avatarRoot} pose={taughtPose} selected={selectedHandle}
        visible={editing && !inspection.playing && ready}
        hand={inspection.hand} tipPosition={actualEndpoint} tipOrigin={endpoint}
        onBegin={beginPoseEdit} onChange={(changes) => inspection.editPose(changes)} onEnd={endPoseEdit} />
    </Canvas>
    {#if inspection.view === "front"}
      <div class="stage-directions" aria-label="Audience view directions">
        <span>Stage right · House left</span><span>Stage left · House right</span>
      </div>
    {/if}
    {#if ready && reachGap > 0.003}
      <p class="reach-warning" role="status">Hand is {(reachGap * 100).toFixed(1)} cm short — adjust the body or tip.</p>
    {/if}
    {#if !ready}<p class="stage-status" role="status">
        {loadFailed
          ? "The performer did not finish loading. Choose another available character or reload this inspection."
          : "Loading performer…"}
      </p>{/if}
    </div>
    {#if editing}
      <aside class="pose-panel" aria-label="Teach this pose">
        <div class="pose-heading"><strong>Pose {inspection.phase.toFixed(3)}</strong>
          <span>{inspection.keys.length} saved poses</span></div>
        <PoseEditor pose={taughtPose} selected={selectedHandle} onSelect={(value) => selectedHandle = value}
          onBegin={() => inspection.beginEdit()} onChange={(changes) => inspection.editPose(changes)}
          onEnd={() => inspection.endEdit()} tolerance={inspection.tolerance}
          onTolerance={(value) => inspection.setTolerance(value)} {tipDrift} />
        <div class="pose-actions">
          <PanelButton disabled={!inspection.canUndo} onclick={() => inspection.undo()}>Undo pose</PanelButton>
          <PanelButton onclick={() => inspection.resetPose()}>Reset poses</PanelButton>
        </div>
        <div class="keyframes" aria-label="Saved poses">
          {#each inspection.keys as key (key.phase)}
            <PanelButton ariaPressed={Math.abs(key.phase - (inspection.phase % 4)) < 0.005}
              onclick={() => { inspection.setTransition("all"); inspection.setPhase(key.phase); }}>
              {key.phase.toFixed(2)}
            </PanelButton>
          {/each}
        </div>
        <PanelButton disabled={inspection.keys.length <= 1 || !inspection.keys.some((key) => Math.abs(key.phase - (inspection.phase % 4)) < 0.005)}
          onclick={() => inspection.removeKey()}>Remove this pose</PanelButton>
      </aside>
    {/if}
  </section>
  <section class="controls" aria-label="Isolation controls">
    <SegmentedControl options={TRANSITIONS} value={inspection.transition}
      onchange={(value) => inspection.setTransition(value)} ariaLabel="Isolation transition" />
    <div class="playback-row">
      <div class="transport-row">
        <TransportControls
          isPlaying={inspection.playing}
          disabled={!ready}
          onPlaybackToggle={() =>
            ready && inspection.setPlaying(!inspection.playing)}
          onRestartToStart={() => inspection.reset()}
        />
      </div>
      <label class="scrubber"
        ><span>Position {inspection.phase.toFixed(3)}</span><input
          aria-label="Isolation position"
          type="range"
          min={inspection.range[0]}
          max={inspection.range[1]}
          step=".001"
          value={inspection.phase}
          oninput={(event) =>
            inspection.setPhase(Number(event.currentTarget.value))}
        /></label
      >
    </div>
    <div class="control-grid">
      <SegmentedControl
        options={cardinals}
        value={Number.isInteger(inspection.phase)
          ? String(inspection.phase % 4)
          : ""}
        onchange={(value) => { inspection.setTransition("all"); inspection.setPhase(Number(value)); }}
        ariaLabel="Cardinal isolation position"
      /><SegmentedControl
        options={hands}
        value={inspection.hand}
        onchange={(value) => inspection.setHand(value)}
        ariaLabel="Active hand"
        color="red"
      /><SegmentedControl
        options={views}
        value={inspection.view}
        onchange={(value) => inspection.setView(value)}
        ariaLabel="Inspection camera"
      />
    </div>
    {#if copyStatus}<p class="copy-status" role="status">{copyStatus}</p>{/if}
  </section>
</main>
<Drawer
  bind:isOpen={characterDrawerOpen}
  title="Choose character"
  placement="right"
  respectLayoutMode
  ><DrawerHeader
    title="Choose character"
    onClose={() => (characterDrawerOpen = false)}
  />
  <div class="drawer-content">
    <PerformerCharacterPicker
      selectedCharacterId={inspection.characterId}
      pendingCharacterId={null}
      previewPerformer={null}
      onSelect={(id) => {
        inspection.setCharacter(id);
        characterDrawerOpen = false;
        ready = false;
        loadFailed = false;
        report = null;
        avatarRoot = null;
        startTimeout();
      }}
      onIntent={() => {}}
      onCancelIntent={() => {}}
    />
  </div></Drawer
>
<Drawer
  bind:isOpen={diagnosticsOpen}
  title="Contact diagnostics"
  placement="right"
  respectLayoutMode
  ><DrawerHeader
    title="Contact diagnostics"
    onClose={() => (diagnosticsOpen = false)}
  /><ContactDiagnostics
    {report}
    audit={auditSummary}
    onAudit={checkFrame}
  /></Drawer
>

<style>
  .inspection {
    --settings-page-max: 76rem;
    height: 100dvh;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: clamp(0.75rem, 2cqw, 1.25rem);
    max-width: var(--settings-page-max);
    margin: 0 auto;
    padding: clamp(0.5rem, 1.5vw, 1rem);
    color: var(--theme-text);
    container-type: inline-size;
  }
  .page-header,
  .header-actions,
  .transport-row,
  .control-grid {
    display: flex;
    align-items: center;
  }
  .page-header {
    justify-content: space-between;
    gap: 1rem;
  }
  h1 {
    margin: 0;
    font-size: clamp(1.5rem, 4cqw, 2.25rem);
    line-height: 1.1;
  }
  .header-actions {
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  button {
    min-height: var(--min-touch-target, 44px);
    padding: 0.55rem 0.8rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.7rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    cursor: pointer;
  }
  button:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }
  .stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    position: relative;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 1rem;
    background: radial-gradient(
      circle at 50% 35%,
      color-mix(in srgb, var(--theme-card-bg) 85%, #304353),
      var(--theme-panel-bg)
    );
  }
  .stage.editing { grid-template-columns: minmax(0, 1fr) 19rem; }
  .scene { position: relative; min-width: 0; min-height: 0; overflow: hidden; }
  .pose-panel { overflow-y: auto; min-height: 0; padding: 0.85rem; background: var(--theme-panel-bg); display: flex; flex-direction: column; gap: 0.9rem; }
  .pose-panel :global(> *) { flex-shrink: 0; }
  .pose-heading { display: flex; justify-content: space-between; align-items: baseline; font-size: var(--font-size-min, 14px); gap: 0.5rem; }
  .pose-heading span { color: var(--theme-text-dim); font-size: var(--font-size-compact, 12px); }
  .pose-actions, .keyframes { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .keyframes { max-height: 6.5rem; overflow: auto; }
  .stage-directions { position: absolute; inset: auto 0.65rem 0.6rem; display: flex; justify-content: space-between; gap: 1rem; pointer-events: none; font-size: var(--font-size-compact, 12px); color: var(--theme-text-dim); }
  .reach-warning { position: absolute; inset: 0.6rem 0.6rem auto; width: fit-content; max-width: calc(100% - 1.2rem); margin: 0; padding: 0.5rem 0.7rem; box-sizing: border-box; border-radius: 0.5rem; background: var(--theme-panel-bg); color: var(--semantic-warning, #ffbf69); font-size: var(--font-size-min, 14px); }
  .copy-status { margin: 0; font-size: var(--font-size-min, 14px); }
  .stage :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .stage-status {
    position: absolute;
    inset: auto 1rem 1rem;
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: 0.6rem;
    background: color-mix(in srgb, var(--theme-panel-bg) 85%, transparent);
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
  }
  .controls {
    display: grid;
    gap: 0.45rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 1rem;
    background: var(--theme-panel-bg);
  }
  .transport-row {
    justify-content: flex-start;
  }
  .playback-row {
    display: grid;
    grid-template-columns: auto minmax(16rem, 1fr);
    align-items: center;
    gap: 0.75rem;
  }
  .scrubber {
    display: grid;
    grid-template-columns: minmax(7rem, auto) 1fr;
    align-items: center;
    gap: 0.75rem;
    min-height: var(--min-touch-target, 44px);
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
  }
  input {
    width: 100%;
    accent-color: var(--theme-accent);
  }
  .control-grid {
    display: grid;
    grid-template-columns: minmax(18rem, 1fr) auto auto;
    align-items: center;
    gap: 0.5rem;
  }
  .drawer-content {
    padding: 0 1.25rem 1.5rem;
  }
  @media (max-width: 700px) {
    .stage.editing { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto; }
    .stage.editing .scene { height: clamp(16rem, 55dvh, 26rem); }
    .inspection:has(.stage.editing) { min-height: 48rem; height: auto; }
    .pose-panel { padding: 0.65rem; max-height: 26rem; }
    .stage-directions span { max-width: 8rem; }
    .inspection {
      min-height: 30rem;
      grid-template-rows: auto minmax(8rem, 1fr) auto;
      padding: 0.5rem;
      gap: 0.5rem;
    }
    .page-header {
      align-items: center;
      gap: 0.5rem;
    }
    .header-actions button {
      min-width: 44px;
      padding: 0.5rem;
    }
    .header-actions span {
      display: none;
    }
    .playback-row {
      grid-template-columns: auto minmax(0, 1fr);
      gap: 0.5rem;
    }
    .scrubber {
      grid-template-columns: 1fr;
    }
    .scrubber span {
      display: none;
    }
    .transport-row {
      justify-content: center;
    }
    .control-grid {
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
      gap: 0.375rem;
    }
    .control-grid :global(> :first-child) {
      grid-column: 1 / -1;
    }
  }
  @media (min-width: 701px) and (max-height: 560px) and (orientation: landscape) {
    .stage.editing { grid-template-columns: minmax(0, 1fr); grid-template-rows: 22rem auto; }
    .pose-panel { max-height: 24rem; }
    .controls { align-content: start; }
    .inspection:has(.stage.editing) { min-height: 42rem; height: auto; }
    .inspection {
      grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.55fr);
      grid-template-rows: auto minmax(15rem, 1fr);
    }
    .page-header {
      grid-column: 1 / -1;
    }
    .controls {
      grid-column: 2;
      grid-row: 2;
      overflow: auto;
    }
    .playback-row {
      grid-template-columns: 1fr;
      gap: 0.25rem;
    }
    .transport-row {
      justify-content: center;
    }
    .scrubber {
      grid-template-columns: 1fr;
    }
    .scrubber span {
      display: none;
    }
    .stage {
      grid-column: 1;
      grid-row: 2;
      min-height: 0;
    }
    .control-grid {
      display: flex;
      flex-direction: column;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
