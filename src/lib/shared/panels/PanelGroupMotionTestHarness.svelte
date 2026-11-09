<!--
  PanelGroupMotionTestHarness.svelte

  Harness for PanelGroup.svelte.test.ts: a two-panel track whose second panel
  folds to nothing and back, the shape of Create's Play fold. With `shown`,
  the panels instead trade the whole track, the shape of a compact app's two
  panes.
-->
<script lang="ts">
  import PanelGroup from "./PanelGroup.svelte";

  let { folded = false, shown }: { folded?: boolean; shown?: "main" | "tool" } =
    $props();
</script>

{#snippet main()}
  <div data-testid="main">Main</div>
{/snippet}

{#snippet tool()}
  <div data-testid="tool">Tool</div>
{/snippet}

<!-- The app's motion token, so the track really slides here too. -->
<div
  style="display: flex; width: 600px; height: 300px; --transition-emphasis: 280ms ease-in-out;"
>
  <PanelGroup
    direction="horizontal"
    gap={0}
    panels={[
      {
        id: "main",
        content: main,
        defaultSize: 1,
        fixedSize: shown ? (shown === "main" ? "100%" : "0px") : undefined,
        resizable: false,
        revealContent: !shown,
      },
      {
        id: "tool",
        content: tool,
        defaultSize: 1,
        fixedSize: shown
          ? shown === "tool"
            ? "100%"
            : "0px"
          : folded
            ? "0px"
            : undefined,
        resizable: false,
        revealContent: !shown,
      },
    ]}
  />
</div>
