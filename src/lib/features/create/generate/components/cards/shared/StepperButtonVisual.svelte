<!--
StepperButtonVisual.svelte - Re-exports from shared for backwards compatibility
-->
<script lang="ts">
  import SharedStepperButtonVisual from "#lib/shared/components/stepper-card/shared/StepperButtonVisual.svelte";

  let { type } = $props<{
    type: "increment" | "decrement";
  }>();
</script>

<SharedStepperButtonVisual {type} />
