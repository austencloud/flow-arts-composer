<!--
  VillageAvatar - Renders one village entity via PerformerRig with props and effects.

  The body stays invisible until its model and walk clips are ready
  (PerformerRig's onAvatarMotionReady), then fades in. A small name label
  shows only for the selected person or someone close to the camera. A
  passing avatar fades out over its last moments, after its glow
  (VillageLineageThreads) has gone out.

  An elder in a chair sits in it (VillageSeatedFigure: the same character
  playing sitting-idle-b, re-bent to the seat): it takes over from the
  standing rig once it is ready, and the rig fades out. Its loading starts
  as they walk to the chair, and if it never loads they stand by the chair
  as before.
  PerformerRig manages Avatar3D + Prop3D + EffectOrchestrator3D as a
  coordinated hierarchy. Every field comes from the avatar's latest snapshot
  entry; prop type and effect look are fixed identity picked at birth.
-->
<script lang="ts">
  import { T, useTask, useThrelte } from "@threlte/core";
  import { Vector3, type Group } from "three";
  import { HTML } from "@threlte/extras";
  import { PerformerRig } from "@austencloud/scene-3d";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { PlaneMode } from "@austencloud/scene-3d";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type {
    TipEffectMap,
    EffectType,
  } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
  import type { AvatarRenderState } from "../state/village-state.svelte.js";
  import { VISITOR_ID } from "../domain/village-types";
  import type { AvatarId } from "@austencloud/scene-3d";
  import { toScenePropType } from "#lib/shared/3d/domain/scene-prop-type.js";
  import { getVillageContext } from "../state/village-context";
  import { passingFade, passingWindowSeconds } from "../state/village-passing-fade";
  import VillageSeatedFigure from "./VillageSeatedFigure.svelte";
  import { planCampLayout } from "../domain/village-campfire";
  import { SEATED_AUDIENCE_ANIMATION_URLS } from "#lib/shared/3d/config/seated-audience-assets.js";
  import { getAvatarModelPath } from "@austencloud/scene-3d/worker";
  import { repairFadeLeftoverMaterials } from "#lib/shared/3d/performers/avatar-material-repair.js";

  interface Props {
    renderState: AvatarRenderState;
    isSelected?: boolean;
    /** Whether a name label may show at all. False where HTML labels would
     *  render through walls (the museum, from outside the room). */
    showLabel?: boolean;
    /** Called once, when the body has fully faded in (or a passing person's
     *  model is ready): the museum holds its loading view until then. */
    onShown?: () => void;
    /** The ground the chairs and the people stand on (VillageClearing's
     *  floorLift). */
    floorY?: number;
  }

  const {
    renderState,
    isSelected = false,
    showLabel = true,
    onShown,
    floorY = 0,
  }: Props = $props();

  const STAGE_LIFT = $derived(-userProportionsState.groundY);
  const avatar = $derived(renderState.avatar);
  const avatarModelId = $derived(avatar.modelId as AvatarId);
  const avatarName = $derived(avatar.name);
  const lifecyclePhase = $derived(avatar.phase);
  const socialState = $derived(avatar.state);
  // Taking a lesson from the museum visitor: the label says so, and shows
  // for the whole lesson so the visitor can see whom they are teaching.
  const learningFromVisitor = $derived(
    socialState === "learning" && avatar.partnerId === VISITOR_ID
  );

  // Visual aging: height scale varies by lifecycle phase
  const heightScale = $derived(
    lifecyclePhase === "youth" ? 0.7 : lifecyclePhase === "elder" ? 0.95 : 1.0
  );

  const isPassing = $derived(socialState === "passing");
  // In the chair, including passing there.
  const isSeated = $derived(
    socialState === "seated" || (isPassing && renderState.wasSeated)
  );
  // Load the seated figure while they walk to the chair, so it is ready.
  const mountSeated = $derived(isSeated || socialState === "retiring");
  const seatedModelUrl = $derived(getAvatarModelPath(avatarModelId));
  const SEATED_CLIP_URL = SEATED_AUDIENCE_ANIMATION_URLS[0]!;
  // The forest campsite's chair (scripts/forest_prop_assets.py,
  // create_modern_camp_chair): its seat slopes from 0.443 m at the front to
  // 0.483 m at the back, top of the fabric; where the hips rest it is 0.46 m.
  const CHAIR_SEAT_TOP = 0.46;
  // How near a chair's spot the sim must sit them for them to be in it. With
  // every chair taken it sits them where they stand, on the ground.
  const CHAIR_MATCH_METERS = 0.6;
  // Seconds for the rig and the seated figure to cross over.
  const SEAT_BLEND_SECONDS = 0.4;
  let seatedReady = $state(false);
  let seatBlend = $state(0);
  $effect(() => {
    if (!mountSeated) seatedReady = false;
  });

  const villageState = getVillageContext();
  const chairs = planCampLayout(villageState.rules).seats;
  // How long the sim keeps a passing avatar at the current speed; the glow
  // and then the body fade inside it (state/village-passing-fade).
  const passingWindow = $derived(
    passingWindowSeconds(
      villageState.rules.population.passingTicks,
      villageState.rules.ticksPerSecond,
      villageState.speed
    )
  );
  let passingSeconds = 0;

  // Seconds to fade the body in once ready.
  const REVEAL_SECONDS = 0.6;

  // Set by the rig once the model and its locomotion clips are ready (or
  // failed to load, so a broken asset never leaves a ghost).
  let motionReady = $state(false);
  let bodyOpacity = $state(0);
  let shownReported = false;

  let avatarPosition = $state({ x: 0, y: 0, z: 0 });
  let facingAngle = $state(0);
  let isMoving = $state(false);
  let moveSpeed = $state(0);
  let prevX = 0;
  let prevZ = 0;

  // Once the body is fully in, the scene package can leave some of its
  // materials in their fade state (avatar-material-repair.ts): the hips and
  // thighs then vanish behind the shirt. Repaired once the reveal ends, then
  // on a slow beat, since the package refades whenever the model changes.
  const REPAIR_EVERY_SECONDS = 2;
  let bodyRoot = $state.raw<Group | undefined>(undefined);
  let repairWait = 0;

  // The body counts as visible once it is mostly faded in; props, effects
  // and the label wait for it.
  const bodyVisible = $derived(bodyOpacity > 0.5);

  // Close enough to read a name without asking for it.
  const NEAR_LABEL_METERS = 4;
  const { camera } = useThrelte();
  const labelWorld = new Vector3();
  let labelAnchor = $state.raw<Group | undefined>(undefined);
  let isNear = $state(false);

  useTask((delta) => {
    const inst = renderState.instanceState;
    if (labelAnchor) {
      labelAnchor.getWorldPosition(labelWorld);
      const near = labelWorld.distanceTo(camera.current.position) < NEAR_LABEL_METERS;
      if (near !== isNear) isNear = near;
    }
    const posX = inst.position.x;
    const posZ = inst.position.z;

    // Movement detection for walk animation
    const dx = posX - prevX;
    const dz = posZ - prevZ;
    const frameDist = Math.sqrt(dx * dx + dz * dz);
    isMoving = frameDist > 0.001;
    moveSpeed = isMoving ? frameDist * 60 : 0;
    prevX = posX;
    prevZ = posZ;

    avatarPosition = { x: posX, y: STAGE_LIFT + floorY, z: posZ };
    facingAngle = inst.facingAngle;

    // Youth wobble: slight facing angle oscillation for youthful energy
    if (lifecyclePhase === "youth") {
      const wobbleAngle = Math.sin(performance.now() * 0.001 * Math.PI) * 0.05; // ~2.8 degrees
      facingAngle += wobbleAngle;
    }

    const seatTarget = isSeated && seatedReady ? 1 : 0;
    if (seatBlend !== seatTarget) {
      const step = delta / SEAT_BLEND_SECONDS;
      seatBlend =
        seatTarget > seatBlend
          ? Math.min(1, seatBlend + step)
          : Math.max(0, seatBlend - step);
    }

    if (isPassing) {
      passingSeconds += delta;
      bodyOpacity = Math.min(bodyOpacity, passingFade(passingSeconds, passingWindow).body);
    } else if (motionReady && bodyOpacity < 1) {
      bodyOpacity = Math.min(1, bodyOpacity + delta / REVEAL_SECONDS);
    }

    if (!shownReported && motionReady && (bodyOpacity >= 1 || isPassing)) {
      shownReported = true;
      onShown?.();
    }

    if (bodyRoot && bodyOpacity >= 1 && seatBlend === 0) {
      repairWait -= delta;
      if (repairWait <= 0) {
        repairWait = REPAIR_EVERY_SECONDS;
        repairFadeLeftoverMaterials(bodyRoot);
      }
    }
  });

  // The chair they sit in, or the ground where they are.
  const seat = $derived.by(() => {
    const at = avatarPosition;
    let nearest: (typeof chairs)[number] | null = null;
    let best = CHAIR_MATCH_METERS;
    for (const chair of chairs) {
      const d = Math.hypot(chair.x - at.x, chair.z - at.z);
      if (d < best) {
        best = d;
        nearest = chair;
      }
    }
    return nearest
      ? { x: nearest.x, z: nearest.z, facing: nearest.facing, chair: true }
      : { x: at.x, z: at.z, facing: avatar.facing, chair: false };
  });
  // Elders sharing a fire should not breathe in step.
  const seatedTimeOffset = $derived(
    [...renderState.entityId].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 7
  );

  // Effect rendering: only show during active performance states
  const isActiveForEffects = $derived(
    socialState === "performing" || socialState === "practicing"
  );

  // Map the avatar's effect look to TipEffectMap
  const lookToEffect: Record<string, EffectType> = {
    fire: "fire",
    led: "led",
    charcoal: "charcoal",
    trails: "trails",
    pure: "none",
  };

  const tipEffectMap = $derived<TipEffectMap>(
    isActiveForEffects
      ? {
          "*": {
            effect:
              lookToEffect[avatar.effectLook] ?? "none",
          },
        }
      : {}
  );

  // Map the avatar's prop type to PropType enum
  const propTypeMap: Record<string, PropType> = {
    staff: PropType.STAFF,
    fan: PropType.FAN,
    club: PropType.CLUB,
    poi: PropType.POI,
    torch: PropType.TORCH,
  };

  const propType = $derived(propTypeMap[avatar.propType] ?? PropType.STAFF);
</script>

<!-- Height scaling group. PerformerRig handles Y positioning internally. -->
<T.Group bind:ref={bodyRoot} scale.y={heightScale}>
  <PerformerRig
    position={{ x: avatarPosition.x, z: avatarPosition.z }}
    {facingAngle}
    planeMode={PlaneMode.WALL}
    avatarState={renderState.instanceState}
    avatarId={avatarModelId}
    groundOffset={avatarPosition.y}
    avatarOpacity={bodyOpacity * (1 - seatBlend)}
    onAvatarMotionReady={() => (motionReady = true)}
    showGrid={false}
    showProps={bodyVisible && seatBlend < 0.5}
    showEffects={bodyVisible && isActiveForEffects}
    enableLocomotion={true}
    {isMoving}
    {moveSpeed}
    {tipEffectMap}
    bluePropType={toScenePropType(propType)}
    redPropType={toScenePropType(propType)}
  />

  <T.Group
    bind:ref={labelAnchor}
    position.x={avatarPosition.x}
    position.y={avatarPosition.y + 0.6}
    position.z={avatarPosition.z}
  >
    {#if showLabel && motionReady && bodyOpacity > 0 && (isSelected || isNear || learningFromVisitor)}
      <HTML center sprite>
        <div class="name-label" style:opacity={bodyOpacity}>
          {avatarName}
          {#if learningFromVisitor}
            <span class="label-note">learning from you</span>
          {/if}
        </div>
      </HTML>
    {/if}
  </T.Group>
</T.Group>

<!-- Outside the height squash: a sitter is scaled evenly, so the seat fit
     holds. -->
{#if mountSeated}
  <VillageSeatedFigure
    modelUrl={seatedModelUrl}
    clipUrl={SEATED_CLIP_URL}
    {seat}
    {floorY}
    seatTop={CHAIR_SEAT_TOP}
    scale={heightScale}
    timeOffset={seatedTimeOffset}
    opacity={bodyOpacity * seatBlend}
    onReady={() => (seatedReady = true)}
  />
{/if}

<style>
  .name-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, #f3efe6);
    text-shadow: 0 0 6px rgba(0, 0, 0, 0.85);
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
    text-align: center;
  }

  .label-note {
    display: block;
    font-style: italic;
    opacity: 0.8;
  }
</style>
