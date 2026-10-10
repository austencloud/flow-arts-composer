<script lang="ts">
  import SectionIndexSidebar from "#lib/shared/browse/components/SectionIndexSidebar.svelte";
  import type { BrowseEngine } from "../engine/types";

  interface Props {
    engine: BrowseEngine;
    activeSection?: string;
    onScrollToSection: (title: string) => void;
  }

  const { engine, activeSection, onScrollToSection }: Props = $props();
</script>

{#if engine.sections.length > 1}
  <SectionIndexSidebar
    sections={engine.sections as import("#lib/shared/browse/domain/models/browse-models.js").SequenceSection[]}
    {onScrollToSection}
    {activeSection}
  />
{/if}
