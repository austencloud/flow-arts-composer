<script lang="ts">
  import LazyMount from "./LazyMount.svelte";

  let attempts = 0;
  let retryKey = $state(0);

  function loader() {
    attempts += 1;
    if (attempts === 1) return Promise.reject(new Error("test chunk failure"));
    return import("./LazyMountTestContent.svelte");
  }
</script>

<button type="button" onclick={() => retryKey++}>Start fresh playback</button>

<LazyMount {loader} active={true} {retryKey} debugName="retry-key component">
  {#snippet error(_error, _retry)}
    <p role="alert">Test component did not load.</p>
  {/snippet}
</LazyMount>
