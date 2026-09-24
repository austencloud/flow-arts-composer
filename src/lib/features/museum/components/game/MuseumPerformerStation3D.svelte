<script lang="ts">
  // propInterpolator and sequenceConverter are now module-level functions
  /**
   * MuseumPerformerStation3D
   *
   * A museum performer station that plays a TKA sequence with the shared live
   * avatar and prop rig. Uses PerformerRig for the unified transform hierarchy
   * - no manual STAGE_LIFT math, no sibling Avatar3D/Prop3D/Grid3D calls.
   */
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { onDestroy, untrack } from "svelte";
  import { T } from "@threlte/core";
  import { Color } from "three";
  import { PerformerRig } from "@austencloud/scene-3d";
  import { Plane } from "@austencloud/scene-3d";
  import { PlaneMode } from "@austencloud/scene-3d";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    createCharacterInstanceState,
    makeStandaloneDeps,
  } from "$lib/shared/3d/state/character-instance-state.svelte";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { GridMode } from "@austencloud/scene-3d";
  import {
    MUSEUM_EXHIBIT_SEQUENCES,
    type MuseumSequenceData,
  } from "../../data/museum-exhibit-sequences";
  import { toScenePropType } from "$lib/shared/3d/domain/scene-prop-type";
  import EffectOrchestrator3D from "$lib/shared/3d/effects/EffectOrchestrator3D.svelte";
  import { buildTipEffectMap } from "$lib/shared/animation-engine/domain/tip-effect-map";
  import { museumPropPair } from "$lib/features/museum/services/museum-prop-pair";
  import type { ActivePropSettings } from "$lib/shared/foundation/services/recorded-prop-intent";

  interface Props {
    stationId: string;
    worldX: number;
    worldZ: number;
    /** Floor elevation (world Y) for this station. Default 0 (museum datum). */
    worldY?: number;
    facingAngle: number;
    sequenceId?: string;
    autoPlay?: boolean;
    /** Animate only while the visitor is close enough to see this station. */
    active?: boolean;
    showGrid?: boolean;
    /** Render the station's default pedestal. Disable when the room owns it. */
    showPlatform?: boolean;
    /** Height from worldY to the authored standing surface. Default 0.3m. */
    standingSurfaceHeight?: number;
    /**
     * Optional injection map for resolving a sequenceId to a user's PRIVATE
     * library sequence. Checked BEFORE MUSEUM_EXHIBIT_SEQUENCES and the
     * Firestore fallback. Undefined in the official museum (default behavior).
     */
    userSequenceDataMap?: Map<string, SequenceData>;
    /**
     * A ready-made sequence to perform, taking precedence over `sequenceId`.
     *
     * An exhibit console hands its performer a TRANSFORM of the case's bound
     * sequence — reversed, hands swapped, a different prop in hand. That is a
     * new object, not a new id, so resolution by id cannot see the change.
     * This is the seam a room uses to drive its performer directly, and it
     * reloads whenever the object identity changes.
     */
    sequenceData?: SequenceData | null;
    /**
     * Registry effect id for this performer's props (charcoal, fire, zap, ...).
     * Omitted or null renders the rig with no effect layer, which is the
     * museum's existing behaviour.
     */
    effectId?: string | null;
  }

  const props: Props = $props();

  // Resolve defaults (plain consts for Three.js init; sequenceId is reactive via props access in $effect)
  const stationId = props.stationId;
  const worldX = props.worldX;
  const worldZ = props.worldZ;
  const worldY = props.worldY ?? 0;
  const facingAngle = props.facingAngle;
  const autoPlay = props.autoPlay ?? false;
  const showGrid = props.showGrid ?? false;
  const showPlatform = props.showPlatform ?? true;
  const standingSurfaceHeight = props.standingSurfaceHeight ?? 0.3;

  // Avatar3D "stage mode" positions feet at groundY (≈ -1.4m below rig origin),
  // designed for the viewer where the ground plane IS at that Y. In the museum,
  // the floor is at y=0, so we offset by -groundY to bring feet to floor level,
  // then add the room-owned standing surface height.
  const museumGroundOffset = $derived(
    -userProportionsState.groundY + standingSurfaceHeight
  );

  // Null means no effect layer at all, which is every existing museum station.
  const tipEffectMap = $derived(
    props.effectId ? buildTipEffectMap(props.effectId) : null
  );

  // Build a minimal SequenceData from the museum manifest
  function buildSequenceData(museumSeq: MuseumSequenceData): SequenceData {
    return {
      id: `museum-performer-${stationId}`,
      word: museumSeq.word,
      steps: museumSeq.steps as readonly StepData[],
      isCircular: true,
    } as SequenceData;
  }

  // Create the avatar instance once - it persists across sequence swaps.
  // loadSequence() is called reactively whenever sequenceId changes.
  let performerState = $state<ReturnType<
    typeof createCharacterInstanceState
  > | null>(null);

  // Resolved sequence data (from hardcoded exhibits or Firestore)
  let resolvedSequence = $state<SequenceData | null>(null);

  // One-time init: create the avatar instance
  try {
    performerState = createCharacterInstanceState(
      {
        id: `museum-station-${stationId}`,
        positionX: worldX,
        positionZ: worldZ,
      },
      makeStandaloneDeps()
    );
  } catch (err) {
    console.warn(`[MuseumPerformer] Failed to init ${stationId}:`, err);
  }

  // Resolve sequence whenever sequenceId changes - checks hardcoded
  // exhibits first, then falls back to loading from Firestore.
  // Mutations (loadSequence, play) are wrapped in untrack so the effect
  // only re-runs when sequenceId changes, not when internal state updates.
  /**
   * Room-driven sequence. Reloads on every new object, which is what makes a
   * console press visible in the performer's hands rather than only on the
   * pedestal underneath them.
   */
  $effect(() => {
    const data = props.sequenceData;
    untrack(() => {
      if (!data || !performerState) return;
      resolvedSequence = data;
      performerState.loadSequence(data);
      performerState.loop = true;
      if (autoPlay && props.active !== false) performerState.play();
    });
  });

  $effect(() => {
    const id = props.sequenceId; // subscribe to sequenceId reactively via props object
    const driven = props.sequenceData;
    untrack(() => {
      if (driven) return; // the room owns this performer's sequence
      if (!id || !performerState) return;

      // Injected branch: resolve from a user's private library map first.
      // Uses the SequenceData directly (no buildSequenceData), mirroring the
      // Firestore fallback. Only fires when the map actually has this id, so
      // the official museum (map undefined) is unaffected.
      const injected = props.userSequenceDataMap?.get(id);
      if (injected) {
        resolvedSequence = injected;
        performerState.loadSequence(injected);
        performerState.loop = true;
        if (autoPlay && props.active !== false) performerState.play();
        return;
      }

      const museumSeq = MUSEUM_EXHIBIT_SEQUENCES[id] ?? null;
      if (museumSeq) {
        resolvedSequence = buildSequenceData(museumSeq);
        performerState.loadSequence(resolvedSequence);
        performerState.loop = true;
        if (autoPlay && props.active !== false) performerState.play();
        return;
      }

      // Not a hardcoded exhibit - try loading from Firestore
      const loader = getBrowseLoader();
      if (!loader) return;

      loader
        .loadFullSequenceData(id, id)
        .then((seq: SequenceData | null) => {
          if (!seq || !performerState) return;
          resolvedSequence = seq;
          performerState.loadSequence(seq);
          performerState.loop = true;
          if (autoPlay && props.active !== false) performerState.play();
        })
        .catch((err: unknown) => {
          console.warn(`[MuseumPerformer] Failed to load sequence ${id}:`, err);
        });
    });
  });

  $effect(() => {
    const active = props.active !== false;
    untrack(() => {
      if (!performerState || !autoPlay) return;
      if (active) performerState.play();
      else performerState.pause();
    });
  });

  onDestroy(() => performerState?.destroy());

  // Prop pair: the sequence's recorded pair, else global settings, as a whole
  // (never mixed per hand). Shift+P still cycles performers whose sequence
  // recorded nothing.
  function activeSettings(): ActivePropSettings | null {
    try {
      return settingsService.settings;
    } catch {
      return null;
    }
  }
  const propPair = $derived(museumPropPair(resolvedSequence, activeSettings()));
  const leftPropType = $derived<PropType>(propPair.leftPropType);
  const rightPropType = $derived<PropType>(propPair.rightPropType);

  const platformColor = new Color(0x3a3028);
</script>

<!-- Station root group - positioned at world coords, children use local coords -->
<T.Group
  name={`performer-station-${stationId}`}
  position.x={worldX}
  position.y={worldY}
  position.z={worldZ}
>
  {#if showPlatform}
    <!-- Default pedestal. Room-specific stages can replace it without replacing the avatar owner. -->
    <T.Mesh position.y={0.15} castShadow receiveShadow>
      <T.CylinderGeometry args={[0.8, 0.9, 0.3, 24]} />
      <T.MeshStandardMaterial color={platformColor} roughness={0.85} />
    </T.Mesh>
  {/if}

  {#if performerState}
    <!--
      @austencloud/scene-3d still speaks its colour-named boundary: the rig
      reads `avatarState.bluePropState` and renders the effects slot with
      blue/red names, while the app's instance state has been left/right since
      the performer-relative migration. Pass the states explicitly, the way
      LiveSequencePerformer3D does, or the rig sees no prop state, mounts no
      prop, and the performer stands empty-handed with nothing driving the
      hands. That was every museum performer from 2026-08-31 until this.
    -->
    <PerformerRig
      position={{ x: 0, z: 0 }}
      {facingAngle}
      planeMode={PlaneMode.WALL}
      avatarState={performerState}
      {showGrid}
      visiblePlanes={new Set([Plane.WALL])}
      gridMode={(resolvedSequence?.gridMode ?? "diamond") as GridMode}
      bluePropType={toScenePropType(leftPropType)}
      redPropType={toScenePropType(rightPropType)}
      bluePropState={performerState.leftPropState}
      redPropState={performerState.rightPropState}
      groundOffset={museumGroundOffset}
      enableLocomotion={true}
      enableFootPlanting={true}
      showEffects={tipEffectMap !== null}
      tipEffectMap={tipEffectMap ?? undefined}
      isPlaying={performerState.isPlaying}
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
        {#if tipEffectMap}
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
            currentStep={performerState.currentStepIndex +
              performerState.progress}
            totalSteps={performerState.totalSteps}
            seamlesslyLoopable={performerState.isCircular}
          />
        {/if}
      {/snippet}
    </PerformerRig>
  {/if}
</T.Group>
