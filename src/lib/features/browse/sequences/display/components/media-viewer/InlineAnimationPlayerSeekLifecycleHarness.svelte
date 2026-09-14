<script lang="ts">
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";

  const sequence = createSequenceData({
    id: "seek-lifecycle",
    word: "",
    steps: [createStepData()],
  });

  let frame = $state(0);
  let registrations = $state(0);

  const onSeekRef = (seek: ((step: number) => void) | null) => {
    if (seek) registrations += 1;
  };

  const playerProps = $derived({
    sequence,
    autoPlay: false,
    initialStep: frame,
    onSeekRef,
  });
</script>

<button type="button" onclick={() => (frame += 1)}>Advance host frame</button>
<output aria-label="Seek registrations">{registrations}</output>

<LazyMount
  loader={() => import("./InlineAnimationPlayer.svelte")}
  active={true}
  props={playerProps}
/>
