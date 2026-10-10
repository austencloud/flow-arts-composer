<script lang="ts">
  // Stands in for StepStrip: fills the rail like the real fillHeight strip.
  let { ..._props }: Record<string, unknown> = $props();
</script>

<div class="strip-stub"></div>

<style>
  .strip-stub {
    width: 100%;
    height: 100%;
  }
</style>
