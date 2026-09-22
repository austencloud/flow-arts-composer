<!--
  Mounts the real Crossfade in animateHeight mode with two layers of known
  natural height. The test drives `key` through the exported setter so it can
  flush synchronously between steps and catch the box mid-transition.
-->
<script lang="ts">
  import Crossfade from "$lib/shared/components/Crossfade.svelte";

  let key = $state<"tall" | "short">("tall");

  export function setKey(next: "tall" | "short"): void {
    key = next;
  }
</script>

<Crossfade {key} duration={200} animateHeight>
  {#if key === "tall"}
    <div data-content="tall" data-height="244">tall controls</div>
  {:else}
    <div data-content="short" data-height="52">short controls</div>
  {/if}
</Crossfade>
