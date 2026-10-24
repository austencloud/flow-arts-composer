<!--
  VillageVisitorFigure - The museum visitor's body while they teach.

  In third person the museum hands the player's own body over to this
  figure for the length of a lesson: it stands where the sim put the
  visitor and plays the teacher's side of the lesson pose, step for step
  (village-state's visitorRenderState). The parent owns the cross-fade; this
  draws at the opacity it is given and says when its motion is ready, so the
  swap never fades to an empty body.

  The body is one of the village's humans, always the same one, rather than
  the scene package's default see-through X Bot. Nothing in the room needs
  the visitor told apart by a ghostly body: the cross-fade reaches full
  opacity, the threads run to them, and their students' labels say
  "learning from you".
-->
<script lang="ts">
  import { useTask } from "@threlte/core";
  import {
    PerformerRig,
    PlaneMode,
    userProportionsState,
  } from "@austencloud/scene-3d";
  import type { AvatarId } from "@austencloud/scene-3d";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { toScenePropType } from "#lib/shared/3d/domain/scene-prop-type.js";
  import type { VisitorRenderState } from "../state/village-state.svelte.js";
  import { humanCharacterFor } from "#lib/shared/3d/performers/human-character-roster.js";
  import { VISITOR_ID } from "../domain/village-types";

  interface Props {
    renderState: VisitorRenderState;
    /** 0-1, set by the parent's cross-fade. */
    opacity: number;
    /** The visitor's character; a fixed human from the roster by default. */
    avatarId?: AvatarId;
    /** The ground the villagers stand on (VillageClearing's floorLift). */
    floorY?: number;
    onReady?: () => void;
  }

  const {
    renderState,
    opacity,
    avatarId = humanCharacterFor(VISITOR_ID) as AvatarId,
    floorY = 0,
    onReady,
  }: Props = $props();

  const STAGE_LIFT = $derived(-userProportionsState.groundY);
  const propType = toScenePropType(PropType.STAFF);

  let position = $state({ x: 0, z: 0 });
  let facingAngle = $state(0);

  useTask(() => {
    const inst = renderState.instanceState;
    if (position.x !== inst.position.x || position.z !== inst.position.z) {
      position = { x: inst.position.x, z: inst.position.z };
    }
    facingAngle = inst.facingAngle;
  });
</script>

<PerformerRig
  {position}
  {facingAngle}
  planeMode={PlaneMode.WALL}
  avatarState={renderState.instanceState}
  {avatarId}
  groundOffset={STAGE_LIFT + floorY}
  avatarOpacity={opacity}
  onAvatarMotionReady={() => onReady?.()}
  showGrid={false}
  showProps={opacity > 0.5}
  showEffects={false}
  enableLocomotion={true}
  isMoving={false}
  moveSpeed={0}
  bluePropType={propType}
  redPropType={propType}
/>
