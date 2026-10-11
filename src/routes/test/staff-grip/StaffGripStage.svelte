<script lang="ts">
  import { T } from "@threlte/core";
  import { Plane, PlaneMode, STAGE } from "@austencloud/scene-3d";
  import type {
    AvatarGripDiagnostics,
    AvatarPoseDiagnostics,
    CollisionEvent,
  } from "@austencloud/scene-3d";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import Grid3D from "#lib/shared/3d/components/Grid3D.svelte";
  import LiveSequencePerformer3D from "#lib/shared/3d/performers/LiveSequencePerformer3D.svelte";
  import type { StanceYawTrack } from "#lib/shared/3d/collision/stance-yaw-track.js";
  import type { BodyClearanceTrack } from "#lib/shared/3d/collision/body-clearance.js";
  import type { PerformerHandDistance } from "#lib/shared/3d/domain/performer-hand-distance.js";

  interface Props {
    id: string;
    phase: number;
    sequence: SequenceData;
    /** Catalog or locally staged character to pose. */
    characterId: CharacterId;
    /** Any prop the shared 3D catalog supports. */
    propType: PropType;
    /**
     * Null asks the renderer for the length this body can hold inside its own
     * hug — the product's own behaviour. A number pins the prop so one
     * variable can be held still while the other sweeps.
     */
    propLengthCm?: number | null;
    /**
     * Where the hands sit from the grid center. Null keeps the performer's
     * fixed distance.
     */
    handDistance?: PerformerHandDistance | null;
    /**
     * Move the body off the staffs: the hips with the feet planted, or a
     * step. Null keeps today's performer.
     */
    bodyClearance?: "shift" | "step" | null;
    /**
     * The drawn hand and outer rings in metres, for hands that sit somewhere
     * other than the fixed distance. Undefined sizes them from the global
     * staff length, as every other scene does.
     */
    handPointRadius?: number;
    outerPointRadius?: number;
    /**
     * The grid stays centred on the performer in every pane, because that is
     * the corrected anchoring. What changes is how much of it is drawn: the
     * wide reference pane names its points, and the close panes keep only the
     * rings so nothing labelled sits on top of a hand.
     */
    gridEmphasis?: "reference" | "muted";
    /** Lab override that silences the reference pane's point labels. */
    showGridLabels?: boolean;
    /**
     * The planned turn, handed up so the lab can draw it. Every pane is seeked
     * from the page's own clock rather than running one of its own, so four
     * cameras stay on the same frame of the same turn and only one of them
     * needs to report the curve.
     */
    onStanceTrack?: (track: StanceYawTrack | null) => void;
    /** The body's planned move, for the pane that reports it. */
    onBodyClearanceTrack?: (track: BodyClearanceTrack | null) => void;
    onCollisionEvents?: (
      events: CollisionEvent[],
      diagnostics: AvatarPoseDiagnostics,
      gripDiagnostics: AvatarGripDiagnostics
    ) => void;
  }

  let {
    id,
    phase,
    sequence,
    characterId,
    propType,
    propLengthCm = null,
    handDistance = null,
    bodyClearance = null,
    handPointRadius,
    outerPointRadius,
    gridEmphasis = "reference",
    showGridLabels = true,
    onStanceTrack,
    onBodyClearanceTrack,
    onCollisionEvents,
  }: Props = $props();

  /**
   * The translucent plane surface is what washed across the close panes and
   * flattened the contrast the grips need to read, and in the wide pane it drew
   * an arbitrary lit rectangle behind the performer. The rings, their points and
   * the centre marker already say where the plane is, so the surface itself is
   * off everywhere and the rings carry the grid.
   */
  const PLANE_SURFACE_OPACITY = 0;
  const showLabels = $derived(gridEmphasis === "reference" && showGridLabels);

  const WALL_PLANE = new Set([Plane.WALL]);
</script>

<T.AmbientLight intensity={1.15} />
<T.DirectionalLight position={[2.4, 4.5, 3.8]} intensity={1.7} castShadow />
<T.DirectionalLight position={[-3, 2.2, 1]} intensity={0.65} color="#99c7ff" />

<LiveSequencePerformer3D
  {id}
  position={{ x: 0, y: 0, z: 0 }}
  facingAngle={0}
  {characterId}
  {propType}
  {propLengthCm}
  {handDistance}
  {bodyClearance}
  {sequence}
  effectId="led"
  phaseOffsetSteps={phase}
  active={false}
  weldGrip={true}
  showEffects={false}
  enableLocomotion={false}
  enableFootPlanting={false}
  {onStanceTrack}
  {onBodyClearanceTrack}
  {onCollisionEvents}
>
  {#snippet gridSlot()}
    <T.Group position.z={STAGE.AVATAR_GRID_OFFSET}>
      <Grid3D
        visiblePlanes={WALL_PLANE}
        gridMode="diamond"
        planeMode={PlaneMode.WALL}
        planeOpacity={PLANE_SURFACE_OPACITY}
        {handPointRadius}
        {outerPointRadius}
        {showLabels}
        showOrientationHelpers={false}
      />
    </T.Group>
  {/snippet}
</LiveSequencePerformer3D>
