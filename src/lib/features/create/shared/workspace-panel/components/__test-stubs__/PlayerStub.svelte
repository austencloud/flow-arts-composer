<script lang="ts">
  // Stands in for InlineAnimationPlayer so layout tests skip the WebGL engine.
  let { ..._props }: Record<string, unknown> = $props();
</script>

<div class="player-stub"></div>

<style>
  .player-stub {
    width: 100%;
    height: 100%;
  }
</style>
