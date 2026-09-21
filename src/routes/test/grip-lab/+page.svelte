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
  let avatarRoot: Object3D | null = null;
  // A measurement belongs to one posed frame, never the next scrub position.
  $effect(() => {
    inspection.phase;
    inspection.hand;
    inspection.characterId;
    auditSummary = null;
  });
  let catalog = $state<readonly CharacterDefinition[]>(
    CHARACTER_DEFINITIONS.filter(
      (character) => character.availability !== "local-evaluation"
    )
  );
  setCharacterCatalogContext(() => catalog);

  const groundOffset = $derived(-userProportionsState.groundY);
  const prop = $derived(sampleStaffIsolation(inspection.phase));
  const handCenter = $derived<[number, number, number]>([
    prop.worldPosition.x,
    prop.worldPosition.y + groundOffset,
    prop.worldPosition.z + STAGE.AVATAR_GRID_OFFSET,
  ]);
  const endpoint = $derived<[number, number, number]>([
    ISOLATION_ENDPOINT[0],
    ISOLATION_ENDPOINT[1] + groundOffset,
    ISOLATION_ENDPOINT[2] + STAGE.AVATAR_GRID_OFFSET,
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
      inspection.advancePhase((inspection.phase + elapsed / 3000) % 4);
    animation = requestAnimationFrame(frame);
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
      <p class="eyebrow">Contact inspection</p>
      <h1>Staff isolation</h1>
    </div>
    <div class="header-actions">
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
    bind:clientWidth={stageWidth}
    bind:clientHeight={stageHeight}
    aria-label="Staff isolation performer"
    aria-busy={!ready}
  >
    <Canvas shadows>
      {#key inspection.view}<T.PerspectiveCamera
          makeDefault
          position={shot.position}
          fov={INSPECTION_FOV_DEG}
          ><OrbitControls
            bind:ref={cameraControls}
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
        onReady={markReady}
        onReport={(next) => (report = { ...next })}
        onGeometry={(root, next) => {
          avatarRoot = root;
          report = { ...next };
        }}
      />
    </Canvas>
    {#if !ready}<p class="stage-status" role="status">
        {loadFailed
          ? "The performer did not finish loading. Choose another available character or reload this inspection."
          : "Loading performer…"}
      </p>{/if}
  </section>
  <section class="controls" aria-label="Isolation controls">
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
        ><span>Loop position</span><input
          aria-label="Loop position"
          type="range"
          min="0"
          max="4"
          step=".01"
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
        onchange={(value) => inspection.setPhase(Number(value))}
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
  .eyebrow {
    margin: 0 0 0.2rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    letter-spacing: 0.08em;
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
    .header-actions span,
    .eyebrow {
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
  @media (max-height: 560px) and (orientation: landscape) {
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
