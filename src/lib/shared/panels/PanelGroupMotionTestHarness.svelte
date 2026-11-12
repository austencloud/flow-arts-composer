<!--
  PanelGroupMotionTestHarness.svelte

  Harness for PanelGroup.svelte.test.ts: a two-panel track whose second panel
  folds to nothing and back, the shape of Create's Play fold. With `shown`,
  the panels instead trade the whole track, the shape of a compact app's two
  panes. With `compositorEdge`, the fold opts into the compositor edge, and the
  main panel carries a rider pinned to the edge, the shape of Create's button
  row. `foldMain` folds the first panel instead, which the mode does not take.
-->
<script lang="ts">
  import PanelGroup from "./PanelGroup.svelte";

  let {
    folded = false,
    foldMain = false,
    shown,
    compositorEdge = false,
  }: {
    folded?: boolean;
    foldMain?: boolean;
    shown?: "main" | "tool";
    compositorEdge?: boolean;
  } = $props();
</script>

{#snippet main()}
  <div data-testid="main" style="position: relative; height: 100%;">
    Main
    <div
      data-testid="rider"
      data-panel-flip="rider"
      style="position: absolute; right: 0; top: 0; width: 40px; height: 20px;"
    ></div>
  </div>
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
    compositorEdge={() => compositorEdge}
    panels={[
      {
        id: "main",
        content: main,
        defaultSize: 1,
        fixedSize: shown
          ? shown === "main"
            ? "100%"
            : "0px"
          : foldMain
            ? "0px"
            : undefined,
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
