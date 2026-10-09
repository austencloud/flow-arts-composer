<!--
  PanelGroupMotionTestHarness.svelte

  Harness for PanelGroup.svelte.test.ts: a two-panel track whose second panel
  folds to nothing and back, the shape of Create's Play fold.
-->
<script lang="ts">
  import PanelGroup from "./PanelGroup.svelte";

  let { folded = false }: { folded?: boolean } = $props();
</script>

{#snippet main()}
  <div data-testid="main">Main</div>
{/snippet}

{#snippet tool()}
  <div data-testid="tool">Tool</div>
{/snippet}

<div style="display: flex; width: 600px; height: 300px;">
  <PanelGroup
    direction="horizontal"
    gap={0}
    panels={[
      {
        id: "main",
        content: main,
        defaultSize: 1,
        resizable: false,
        revealContent: true,
      },
      {
        id: "tool",
        content: tool,
        defaultSize: 1,
        fixedSize: folded ? "0px" : undefined,
        resizable: false,
        revealContent: true,
      },
    ]}
  />
</div>
