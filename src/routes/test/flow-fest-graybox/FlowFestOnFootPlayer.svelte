<script lang="ts">
  /**
   * The walking player's visible body.
   *
   * The sim was first person on foot, so the player had no body at all: the
   * only rendered player was the electric-unicycle rider, and it disappeared
   * the moment you stepped off. Third person needs something behind the
   * camera at all times, so this is the on-foot half of that.
   *
   * It composes `Character3D` - the same owner `FlowFestFestivalCommunity`
   * already walks every spectator through, and the same one the mounted rider
   * uses. There is no second walking system here: gait, clip selection, foot
   * contacts, and IK all stay with the scene package's locomotion animator.
   * This component only converts the walk scene's body-centre physics
   * position into the character's foot position and reports movement.
   */
  import {
    Character3D,
    type CharacterId,
  } from "#lib/shared/3d/domain/character-model.js";

  interface Props {
    /** Physics body centre, which sits `bodyCentreAboveGroundMeters` up. */
    position: { x: number; y: number; z: number };
    /** Distance from the ground to that body centre. */
    bodyCentreAboveGroundMeters: number;
    facingAngle: number;
    isMoving: boolean;
    /** True metres per second, measured from the physics body. */
    moveSpeedMetersPerSecond: number;
    /** Movement relative to facing: +z forward, +x right. */
    moveDirection: { x: number; z: number };
    characterId: CharacterId;
    isCrouching?: boolean;
    isGrounded?: boolean;
    verticalVelocity?: number;
  }

  const props: Props = $props();
</script>

<!--
  `isActive` stays false on purpose. The scene package puts an active
  avatar on LAYER_PLAYER_BODY, which exists to hide your own body from a
  first-person camera - exactly the body a chase camera has to see. The
  mounted rider and every NPC render on LAYER_WORLD for the same reason.

  `avatarId` is the scene package's historical vocabulary. Passing it here
  is the one sanctioned boundary; everything above this line says character.
-->
<Character3D
  id="flow-fest-on-foot-player"
  avatarId={props.characterId}
  leftPropState={null}
  rightPropState={null}
  bluePropState={null}
  redPropState={null}
  visible={true}
  isActive={false}
  position={{
    x: props.position.x,
    y: props.position.y - props.bodyCentreAboveGroundMeters,
    z: props.position.z,
  }}
  facingAngle={props.facingAngle}
  isMoving={props.isMoving}
  moveSpeed={props.moveSpeedMetersPerSecond}
  moveDirection={props.moveDirection}
  isCrouching={props.isCrouching ?? false}
  isGrounded={props.isGrounded ?? true}
  verticalVelocity={props.verticalVelocity ?? 0}
  enableLocomotion={true}
  enableFootPlanting={true}
  enableRootMotion={false}
/>
