<script lang="ts">
  /**
   * One live fire-court performer composed from the canonical character, prop,
   * sequence-playback, and 3D effect owners.
   */
  import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import LiveSequencePerformer3D from "#lib/shared/3d/performers/LiveSequencePerformer3D.svelte";

  interface Props {
    stationId: string;
    worldX: number;
    worldZ: number;
    facingAngle: number;
    surfaceElevation: number;
    characterId: CharacterId;
    propType: PropType;
    sequence: SequenceData;
    onReady?: () => void;
  }

  const props: Props = $props();
</script>

<LiveSequencePerformer3D
  id={`winter-fire-court-${props.stationId}`}
  position={{
    x: props.worldX,
    y: props.surfaceElevation,
    z: props.worldZ,
  }}
  facingAngle={props.facingAngle}
  characterId={props.characterId}
  propType={props.propType}
  sequence={props.sequence}
  effectId="fire"
  onReady={props.onReady}
/>
