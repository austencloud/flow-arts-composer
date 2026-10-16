<script lang="ts">
  import type { Snippet } from "svelte";
  import GuideShell from "../_components/GuideShell.svelte";
  import GuideFontPreload from "../_components/GuideFontPreload.svelte";
  import { setActiveSectionContext } from "../level-1/_data/guide-data-context";

  let { children }: { children: Snippet } = $props();

  let activeSectionId = $state("");

  setActiveSectionContext((id: string) => {
    activeSectionId = id;
  });
</script>

<GuideFontPreload />

<GuideShell bind:activeSectionId>
  {@render children()}
</GuideShell>
