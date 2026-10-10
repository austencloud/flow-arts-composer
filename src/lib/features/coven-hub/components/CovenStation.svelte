<script lang="ts">
  // propInterpolator and sequenceConverter are now module-level functions
  /**
   * CovenStation
   *
   * A ritual scene where 6 acolytes stand in a circle around a center point,
   * arms dynamically reaching toward floating staffs that trace the same
   * sequence on all three primary planes simultaneously.
   *
   * Center: 6 PerformerRigs (3 planes × original/mirror) - props visible,
   * no character, grid visible. Perimeter: 6 acolytes - character visible, no
   * props, no grid. Each acolyte's IK targets track the actual center prop
   * positions every frame, creating a dynamic "telekinetic control" effect
   * where arms subtly shift as the floating staffs move through the sequence.
   *
   * Parameterized from TelekineticFormation3D: takes ANY sequence, ANY effect,
   * an optional GLB stage, and a level-of-detail band.
   */
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { onDestroy, untrack } from "svelte";
  import { T } from "@threlte/core";
  import { Vector3, Quaternion, Color } from "three";
  import { PerformerRig } from "@austencloud/scene-3d";
  import type { PropState3D } from "@austencloud/scene-3d";
  import { Plane } from "@austencloud/scene-3d";
  import { PlaneMode } from "@austencloud/scene-3d";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    createCharacterInstanceState,
    makeStandaloneDeps,
  } from "#lib/shared/3d/state/character-instance-state.svelte.js";
  import { userProportionsState } from "@austencloud/scene-3d";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { buildTipEffectMap } from "#lib/features/coven-hub/domain/coven-effect-map.js";
  import type { LodBand } from "#lib/features/coven-hub/domain/coven-lod.js";
  import { useGltf } from "@threlte/extras";
  import EffectOrchestrator3D from "#lib/shared/3d/effects/EffectOrchestrator3D.svelte";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { toScenePropType } from "#lib/shared/3d/domain/scene-prop-type.js";
  import type { TipEffectMap } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";

  interface Props {
    stationId: string;
    worldX: number;
    worldZ: number;
    sequence: SequenceData | null;
    effectId?: string | null;
    /** Override the wildcard effect with an authored per-tip assignment. */
    tipEffectMap?: TipEffectMap;
    stageModel?: string | null;
    lod?: LodBand;
    autoPlay?: boolean;
    /** Ritual renders the platform and acolytes; sculpture isolates the kinetic core. */
    presentation?: "ritual" | "sculpture";
    /** Uniform scale for installation-sized presentations. */
    scale?: number;
    /**
     * Render the centre staffs. Turning this off leaves the effect trace alone
     * in space — still driven by the real prop motion, with nothing visible
     * making it. That is the "elemental motif" configuration: the modality
     * draws itself. Characters are already off on the centre rigs.
     */
    showProps?: boolean;
    /**
     * Cap the overlaid centre rigs (default: all six — three planes, each with
     * its mirror). Lower it when many stations share one canvas: six rigs per
     * station is six EffectOrchestrator3D mounts, and a grid of sixteen
     * stations is ninety-six of them.
     */
    centerPlanes?: number;
  }
  const props: Props = $props();
  const stationId = props.stationId;
  const worldX = props.worldX;
  const worldZ = props.worldZ;
  const autoPlay = $derived(props.autoPlay ?? true);
  const lod = $derived(props.lod ?? "hero");
  const presentation = props.presentation ?? "ritual";
  const formationScale = props.scale ?? 1;
  const showCenterProps = $derived(props.showProps ?? true);

  // Ritual platform
  const PLATFORM_RADIUS = 3.5;
  const PLATFORM_HEIGHT = 0.3;
  const platformColor = new Color(0x2a1f18);
  const platformRingColor = new Color(0x4a3828);

  // Character3D in "stage mode" positions feet at groundY (≈ -1.4m below rig origin).
  // In the museum the floor is at y=0, so we offset by -groundY + PLATFORM_HEIGHT.
  // Both center rigs AND acolyte rigs use this so grids/props align with shoulder height.
  const presentationFloorOffset =
    presentation === "ritual" ? PLATFORM_HEIGHT : 0;
  const museumGroundOffset = $derived(
    -userProportionsState.groundY + presentationFloorOffset
  );

  // 6 acolytes evenly spaced around a circle at 60° intervals.
  // Each faces inward toward center.
  const ACOLYTE_DISTANCE = 2.5;
  const NUM_ACOLYTES = 6;
  const ACOLYTE_POSITIONS = Array.from({ length: NUM_ACOLYTES }, (_, i) => {
    // Angle around circle: 0 = +Z, going clockwise when viewed from above
    const angle = (i / NUM_ACOLYTES) * Math.PI * 2;
    const x = Math.sin(angle) * ACOLYTE_DISTANCE;
    const z = Math.cos(angle) * ACOLYTE_DISTANCE;
    // Face toward center: rotate 180° from the outward angle
    const facing = angle + Math.PI;
    return { x, z, facing };
  });

  // 6 center rigs: each primary plane × 2 (original + mirrored).
  // The mirror swaps blue/red props on the same plane, creating a
  // symmetric pattern - where the original has blue going N, the
  // mirror has red going N and blue going where red was.
  interface CenterConfig {
    plane: Plane;
    left: Plane;
    right: Plane;
    mirror: boolean;
  }
  const CENTER_PLANES: CenterConfig[] = [
    { plane: Plane.WALL, left: Plane.WALL, right: Plane.WALL, mirror: false },
    { plane: Plane.WALL, left: Plane.WALL, right: Plane.WALL, mirror: true },
    { plane: Plane.WHEEL, left: Plane.WHEEL, right: Plane.WHEEL, mirror: false },
    { plane: Plane.WHEEL, left: Plane.WHEEL, right: Plane.WHEEL, mirror: true },
    { plane: Plane.FLOOR, left: Plane.FLOOR, right: Plane.FLOOR, mirror: false },
    { plane: Plane.FLOOR, left: Plane.FLOOR, right: Plane.FLOOR, mirror: true },
  ];

  // Shared identity quaternion for prop state overrides
  const IDENTITY_QUAT = new Quaternion();

  // WALL mode grid offset (how far forward the hand anchor sits from rig center)
  const GRID_OFFSET = 0.3;

  // Most installations paint every tip. Comparison stages can isolate one
  // physical endpoint so overlapping props do not masquerade as one creature.
  const tipEffectMap = $derived(
    props.tipEffectMap ?? buildTipEffectMap(props.effectId ?? null)
  );

  type CharacterInstance = ReturnType<typeof createCharacterInstanceState>;

  // Create character instances: 6 for center planes + 6 for acolytes
  let centerInstances = $state<CharacterInstance[]>([]);
  let acolyteInstances = $state<CharacterInstance[]>([]);
  // True when character-instance construction threw — the scene falls back to a
  // visible marker (below) instead of rendering nothing, and we surface a toast.
  let initFailed = $state(false);

  try {
    centerInstances = CENTER_PLANES.map((cfg, i) =>
      createCharacterInstanceState(
        {
          id: `formation-${stationId}-center-${cfg.plane}-${cfg.mirror ? "mirror" : "orig"}`,
          positionX: 0,
          positionZ: 0,
        },
        makeStandaloneDeps()
      )
    );

    acolyteInstances =
      presentation === "ritual"
        ? ACOLYTE_POSITIONS.map((_, i) =>
            createCharacterInstanceState(
              {
                id: `formation-${stationId}-acolyte-${i}`,
                positionX: 0,
                positionZ: 0,
              },
              makeStandaloneDeps()
            )
          )
        : [];
  } catch (err) {
    console.warn(`[CovenStation] Failed to init ${stationId}:`, err);
    initFailed = true;
    toast.error("Couldn't load the coven performers for this station.");
  }

  // hero: all 6 center + 6 acolytes. idle/frozen: only the first center rig.
  const visibleCenter = $derived(
    (presentation === "sculpture" || lod === "hero"
      ? centerInstances
      : centerInstances.slice(0, 1)
    ).slice(0, props.centerPlanes ?? CENTER_PLANES.length)
  );
  const showAcolytes = $derived(presentation === "ritual" && lod === "hero");
  const stationPlaying = $derived(lod !== "frozen");
  const stageGltf = $derived(
    props.stageModel ? useGltf(props.stageModel) : null
  );

  // Load sequence into center instances and set planes
  $effect(() => {
    const seq = props.sequence;
    untrack(() => {
      if (!seq || centerInstances.length === 0) return;
      for (let i = 0; i < centerInstances.length; i++) {
        const instance = centerInstances[i];
        const planeCfg = CENTER_PLANES[i];
        if (!instance || !planeCfg) continue;
        instance.loadSequence(seq);
        instance.loop = true;
        if (planeCfg.plane === Plane.WALL) {
          instance.setPlaneMode(PlaneMode.WALL);
        } else {
          instance.setHandPlane("left", planeCfg.left);
          instance.setHandPlane("right", planeCfg.right);
        }
        if (autoPlay && stationPlaying) instance.play();
      }
    });
  });

  // A frozen station remains mounted as a static exhibit, but its playback
  // clocks must stop. Museum rooms can contain many stations, and one RAF loop
  // per hidden character otherwise keeps recomputing prop textures indefinitely.
  $effect(() => {
    const shouldPlay = autoPlay && stationPlaying;
    untrack(() => {
      for (const instance of [...centerInstances, ...acolyteInstances]) {
        if (shouldPlay) instance.play();
        else instance.pause();
      }
    });
  });

  onDestroy(() => {
    for (const instance of [...centerInstances, ...acolyteInstances]) {
      instance.destroy();
    }
  });

  // Dynamic arm tracking: each acolyte's IK targets follow the center props.
  // We use the WALL center instance as the tracking reference - its prop states
  // update every frame. We transform those positions from formation space into
  // each acolyte's rig-local hand-anchor space so their arms reach toward the
  // actual floating staffs.
  //
  // The math: PerformerRig applies position, then rotation, then hand anchor offset.
  // So prop world pos = rigPos + rotY(facing, handAnchor + propOverride.worldPosition).
  // We invert this chain to find the override that makes acolyte arms point at center props.
  const acolytePropOverrides = $derived.by(() => {
    const wallInstance = centerInstances[0];
    const wallLeft = wallInstance?.leftPropState;
    const wallRight = wallInstance?.rightPropState;

    if (!wallLeft || !wallRight) {
      // No sequence playing yet - arms reach forward at rest
      return ACOLYTE_POSITIONS.map(() => ({
        left: {
          centerPathAngle: 0,
          staffRotationAngle: 0,
          plane: Plane.WALL,
          worldPosition: new Vector3(0.15, -0.1, 0.5),
          worldRotation: IDENTITY_QUAT,
        } as PropState3D,
        right: {
          centerPathAngle: 0,
          staffRotationAngle: 0,
          plane: Plane.WALL,
          worldPosition: new Vector3(-0.15, -0.1, 0.5),
          worldRotation: IDENTITY_QUAT,
        } as PropState3D,
      }));
    }

    // Center prop positions in formation space.
    // Center rig is at origin with facingAngle=0, WALL mode gridOffset=0.3.
    // So prop formation-space position = (prop.worldPos.x, prop.worldPos.y, 0.3 + prop.worldPos.z)
    const leftFormX = wallLeft.worldPosition.x;
    const leftFormZ = GRID_OFFSET + wallLeft.worldPosition.z;
    const rightFormX = wallRight.worldPosition.x;
    const rightFormZ = GRID_OFFSET + wallRight.worldPosition.z;

    return ACOLYTE_POSITIONS.map((acolyte) => {
      const cosF = Math.cos(acolyte.facing);
      const sinF = Math.sin(acolyte.facing);

      // Target vector: center prop relative to acolyte rig origin (formation space)
      const leftTx = leftFormX - acolyte.x;
      const leftTz = leftFormZ - acolyte.z;
      const rightTx = rightFormX - acolyte.x;
      const rightTz = rightFormZ - acolyte.z;

      // Inverse rotation by facingAngle to get rig-local coordinates,
      // then subtract hand anchor offset (0, 0, GRID_OFFSET)
      const leftLocalX = cosF * leftTx - sinF * leftTz;
      const leftLocalZ = sinF * leftTx + cosF * leftTz - GRID_OFFSET;
      const rightLocalX = cosF * rightTx - sinF * rightTz;
      const rightLocalZ = sinF * rightTx + cosF * rightTz - GRID_OFFSET;

      return {
        left: {
          centerPathAngle: 0,
          staffRotationAngle: 0,
          plane: Plane.WALL,
          worldPosition: new Vector3(
            leftLocalX,
            wallLeft.worldPosition.y,
            leftLocalZ
          ),
          worldRotation: IDENTITY_QUAT,
        } as PropState3D,
        right: {
          centerPathAngle: 0,
          staffRotationAngle: 0,
          plane: Plane.WALL,
          worldPosition: new Vector3(
            rightLocalX,
            wallRight.worldPosition.y,
            rightLocalZ
          ),
          worldRotation: IDENTITY_QUAT,
        } as PropState3D,
      };
    });
  });

  // Prop type from sequence or global settings
  const leftPropType = $derived.by((): PropType => {
    try {
      return settingsService.settings.leftPropType ?? PropType.STAFF;
    } catch {
      return PropType.STAFF;
    }
  });
  const rightPropType = $derived.by((): PropType => {
    try {
      return settingsService.settings.rightPropType ?? PropType.STAFF;
    } catch {
      return PropType.STAFF;
    }
  });
</script>

<!-- Formation root - positioned at world coords -->
<T.Group
  name={`performer-station-${stationId}`}
  position.x={worldX}
  position.z={worldZ}
  scale={formationScale}
>
  <!-- Ritual platform: bespoke GLB stage when stageModel is set, otherwise the
       original stone disc (keeps the museum exhibit identical until GLBs land). -->
  {#if presentation === "ritual"}
    {#if stageGltf}
      {#await stageGltf}
        <!-- GLB stage still streaming in: show a dim placeholder disc so the slot
             isn't visually empty while the model resolves. -->
        <T.Mesh position.y={PLATFORM_HEIGHT / 2} receiveShadow>
          <T.CylinderGeometry
            args={[PLATFORM_RADIUS, PLATFORM_RADIUS + 0.1, PLATFORM_HEIGHT, 32]}
          />
          <T.MeshStandardMaterial
            color={platformColor}
            roughness={0.95}
            transparent
            opacity={0.35}
          />
        </T.Mesh>
      {:then gltf}
        <T is={gltf.scene} position.y={PLATFORM_HEIGHT} />
      {/await}
    {:else}
      <T.Mesh position.y={PLATFORM_HEIGHT / 2} receiveShadow>
        <T.CylinderGeometry
          args={[PLATFORM_RADIUS, PLATFORM_RADIUS + 0.1, PLATFORM_HEIGHT, 32]}
        />
        <T.MeshStandardMaterial color={platformColor} roughness={0.9} />
      </T.Mesh>
    {/if}
  {/if}

  {#if initFailed}
    <!-- Degraded fallback: character instances failed to construct, so the rigs
         below render nothing. Show a clearly-broken marker pillar at center so
         the empty station is observable rather than silently blank. -->
    <T.Mesh position.y={presentationFloorOffset + 0.75}>
      <T.BoxGeometry args={[0.25, 1.5, 0.25]} />
      <T.MeshStandardMaterial
        color="#a01818"
        emissive="#5a0000"
        roughness={0.6}
      />
    </T.Mesh>
  {/if}
  <!-- Decorative ring at acolyte circle -->
  {#if presentation === "ritual"}
    <T.Mesh position.y={PLATFORM_HEIGHT + 0.005} rotation.x={-Math.PI / 2}>
      <T.RingGeometry
        args={[ACOLYTE_DISTANCE - 0.15, ACOLYTE_DISTANCE + 0.15, 48]}
      />
      <T.MeshStandardMaterial
        color={platformRingColor}
        roughness={0.7}
        transparent
        opacity={0.6}
      />
    </T.Mesh>
  {/if}

  <!-- Ambient point light for the formation -->
  <T.PointLight
    position.y={3}
    intensity={presentation === "sculpture" ? 1.2 : 0.8}
    distance={presentation === "sculpture" ? 6 : 8}
    color={presentation === "sculpture" ? "#dce8ff" : "#ffd4a0"}
    castShadow={false}
  />

  <!-- CENTER RIGS: 6 total (3 planes × original + mirror), props + grid visible, no character -->
  <!-- Mirrored rigs swap blue/red prop states for a symmetric pattern on each plane.
       Only the original (non-mirror) rigs show the grid to avoid visual clutter. -->
  <!--
    @austencloud/scene-3d still speaks its colour-named boundary: PerformerRig
    reads `avatarState.bluePropState` and renders the effects slot with blue/red
    names, while the app's instance state has been left/right since the
    performer-relative migration. Prop states are passed explicitly here, the
    way LiveSequencePerformer3D does; under the left/right names the rig saw no
    prop state, mounted no prop and left the acolytes' arms untracked.
  -->
  {#each visibleCenter as instance, i (instance.id)}
    {@const planeCfg = CENTER_PLANES[i]}
    {#if planeCfg}
      <PerformerRig
        position={{ x: 0, z: planeCfg.mirror ? 2 * GRID_OFFSET : 0 }}
        facingAngle={planeCfg.mirror ? Math.PI : 0}
        planeMode={planeCfg.plane === Plane.WALL
          ? PlaneMode.WALL
          : PlaneMode.CUSTOM}
        avatarState={instance}
        showAvatar={false}
        showGrid={!planeCfg.mirror}
        showProps={showCenterProps}
        showEffects={true}
        isPlaying={instance.isPlaying && stationPlaying}
        {tipEffectMap}
        visiblePlanes={new Set([planeCfg.plane])}
        gridMode={"diamond"}
        bluePropType={toScenePropType(leftPropType)}
        redPropType={toScenePropType(rightPropType)}
        bluePropState={instance.leftPropState}
        redPropState={instance.rightPropState}
        groundOffset={museumGroundOffset}
      >
        {#snippet effectsSlot({
          bluePropState: leftPropState,
          redPropState: rightPropState,
          blueHandPos: leftHandPos,
          redHandPos: rightHandPos,
          isPlaying: rigPlaying,
          staffHalfLength,
          effectsParentRef,
        })}
          <EffectOrchestrator3D
            {leftPropState}
            {rightPropState}
            leftPropType={toScenePropType(leftPropType)}
            rightPropType={toScenePropType(rightPropType)}
            isPlaying={rigPlaying}
            {staffHalfLength}
            {tipEffectMap}
            {leftHandPos}
            {rightHandPos}
            {effectsParentRef}
            currentStep={instance.currentStepIndex + instance.progress}
            totalSteps={instance.totalSteps}
            seamlesslyLoopable={instance.isCircular}
          />
        {/snippet}
      </PerformerRig>
    {/if}
  {/each}

  <!-- ACOLYTE RIGS: 6 characters with arms dynamically tracking center props -->
  {#if showAcolytes}
    {#each acolyteInstances as instance, i (instance.id)}
      {@const acolytePos = ACOLYTE_POSITIONS[i]}
      {@const propOverride = acolytePropOverrides[i]}
      {#if acolytePos && propOverride}
        <PerformerRig
          position={{ x: acolytePos.x, z: acolytePos.z }}
          facingAngle={acolytePos.facing}
          planeMode={PlaneMode.WALL}
          avatarState={instance}
          showAvatar={true}
          showGrid={false}
          showProps={false}
          showEffects={false}
          bluePropState={propOverride.left}
          redPropState={propOverride.right}
          bluePropType={toScenePropType(leftPropType)}
          redPropType={toScenePropType(rightPropType)}
          groundOffset={museumGroundOffset}
        />
      {/if}
    {/each}
  {/if}
</T.Group>
