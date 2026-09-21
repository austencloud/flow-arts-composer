<script lang="ts">
  import { onDestroy } from "svelte";
  import {
    PerformerRig,
    PlaneMode,
    userProportionsState,
    type AvatarContactReport,
    type AvatarContactGeometryCallback,
    type AuthoredContactPose,
  } from "@austencloud/scene-3d";
  import type { CharacterId } from "../domain/character-model";
  import {
    createCharacterInstanceState,
    makeStandaloneDeps,
  } from "../state/character-instance-state.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { toScenePropType } from "../domain/scene-prop-type";
  import {
    sampleStaffIsolation,
    ISOLATION_STAFF_CONTACT,
    type IsolationHand,
  } from "./staff-isolation";

  let {
    characterId,
    phase,
    hand = "right",
    bodyPose = null,
    tipOffset = [0, 0, 0],
    onReady,
    onReport,
    onGeometry,
  }: {
    characterId: CharacterId;
    phase: number;
    hand?: IsolationHand;
    bodyPose?: AuthoredContactPose | null;
    tipOffset?: readonly [number, number, number];
    onReady?: () => void;
    onReport?: (report: AvatarContactReport) => void;
    onGeometry?: AvatarContactGeometryCallback;
  } = $props();
  const avatarState = createCharacterInstanceState(
    {
      id: "contact-isolation",
      characterId,
      positionX: 0,
      positionZ: 0,
      persistent: false,
    },
    makeStandaloneDeps()
  );
  const prop = $derived(sampleStaffIsolation(phase, tipOffset));
  onDestroy(() => avatarState.destroy());
</script>

<PerformerRig
  position={{ x: 0, z: 0 }}
  facingAngle={0}
  planeMode={PlaneMode.WALL}
  groundOffset={-userProportionsState.groundY}
  {avatarState}
  avatarId={characterId}
  bluePropState={hand === "left" ? prop : null}
  redPropState={hand === "right" ? prop : null}
  bluePropType={toScenePropType(PropType.FIRE_DOUBLE_STAFF)}
  redPropType={toScenePropType(PropType.FIRE_DOUBLE_STAFF)}
  propLength={ISOLATION_STAFF_CONTACT.lengthM}
  contactMode="prop-authoritative"
  staffContact={ISOLATION_STAFF_CONTACT}
  authoredContactPose={bodyPose}
  onContactReport={onReport}
  onContactGeometry={onGeometry}
  onAvatarSwapped={onReady}
  showGrid={false}
  showEffects={false}
  enableLocomotion={false}
  headDodge={true}
/>
