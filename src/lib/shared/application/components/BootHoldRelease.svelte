<!--
  Releases a boot-screen hold once it has mounted and one tick has passed.
  Placed after the content the hold waits for, so that content (and any hold
  its own components register during init) is in the page first. Renders
  nothing. See shared/application/services/boot-screen.ts.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import { releaseBootHold } from "../services/boot-screen";

  let { name }: { name: string } = $props();

  onMount(() => {
    const held = name;
    void tick().then(() => releaseBootHold(held));
  });
</script>
