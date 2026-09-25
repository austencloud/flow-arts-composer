<!--
  Mounts the real Crossfade in animateHeight mode inside a parent that can be
  switched to `display: none`, the way a closed dialog renders its content
  before it opens. The test drives `key` and visibility through exported
  setters so it can flush synchronously between steps.
-->
<script lang="ts">
  import Crossfade from "$lib/shared/components/Crossfade.svelte";

  let {
    mode = "crossfade",
    initiallyHidden = false,
  }: { mode?: "crossfade" | "swap"; initiallyHidden?: boolean } = $props();

  let key = $state<"tall" | "short">("tall");
  // svelte-ignore state_referenced_locally
  let hidden = $state(initiallyHidden);

  export function setKey(next: "tall" | "short"): void {
    key = next;
  }

  export function setHidden(next: boolean): void {
    hidden = next;
  }
</script>

<div style:display={hidden ? "none" : null}>
  <Crossfade {key} {mode} duration={200} animateHeight>
    {#if key === "tall"}
      <div data-content="tall" data-height="244">tall controls</div>
    {:else}
      <div data-content="short" data-height="52">short controls</div>
    {/if}
  </Crossfade>
</div>
