<!--
  RetroDefrag - DEFRAG.EXE disk defragmentation viewer for TKA-OS v1.0

  Renders a grid of colored blocks representing disk clusters.
  Start begins an animation that "defragments" by swapping fragmented
  blocks toward the front. Never actually completes.

  Domain: Retro Easter Eggs
-->
<script lang="ts">
  import RetroButton from "../primitives/RetroButton.svelte";
  import RetroStatusBar from "../primitives/RetroStatusBar.svelte";
  import RetroProgressBar from "../primitives/RetroProgressBar.svelte";

  /* Props                                                               */

  let {
    onclose,
  }: {
    onclose?: () => void;
  } = $props();

  /* Constants                                                           */

  const COLS = 20;
  const ROWS = 12;
  const TOTAL_CLUSTERS = COLS * ROWS;
  const ANIMATION_INTERVAL_MS = 150;

  /** TKA letter labels sprinkled onto some blocks */
  const TKA_LABELS: string[] = [
    "A",
    "B",
    "\u03A3",
    "\u03A6",
    "W",
    "\u03C4",
    "\u0393",
    "\u0398",
    "\u039B",
    "\u03A8",
    "\u03A0",
    "\u03A9",
  ];

  const STATUS_MESSAGES: string[] = [
    "Defragmenting GAMMA sector...",
    "Moving cluster 0x4F2A...",
    "Optimizing ALPHA region...",
    "Consolidating free space...",
    "Reorganizing BETA sector...",
    "Analyzing SIGMA blocks...",
    "Relocating PHI partition...",
    "Compacting TAU clusters...",
  ];

  /* Block types                                                         */

  type BlockType = "used" | "free" | "bad" | "system" | "moving" | "optimized";

  interface DiskBlock {
    type: BlockType;
    label: string;
  }

  /* Color map                                                           */

  const BLOCK_COLORS: Record<BlockType, string> = {
    used: "#000080",
    free: "#FFFFFF",
    bad: "#FF0000",
    system: "#808080",
    moving: "#FFFF00",
    optimized: "#008000",
  };

  const LEGEND_ENTRIES: { type: BlockType; label: string }[] = [
    { type: "used", label: "Used" },
    { type: "free", label: "Free" },
    { type: "moving", label: "Being moved" },
    { type: "optimized", label: "Optimized" },
    { type: "bad", label: "Bad sector" },
    { type: "system", label: "System" },
  ];

  /* State                                                               */

  let blocks = $state<DiskBlock[]>(initializeBlocks());
  let running = $state(false);
  let showLegend = $state(false);
  let statusMessage = $state("Ready");
  let defragPercent = $state(0);
  let currentCluster = $state(0);
  let statusMessageIndex = $state(0);

  /* Initialize disk blocks                                              */

  function initializeBlocks(): DiskBlock[] {
    const result: DiskBlock[] = [];

    for (let i = 0; i < TOTAL_CLUSTERS; i++) {
      let type: BlockType;
      const rand = Math.random();

      /* First 8 blocks are system (unmovable) */
      if (i < 8) {
        type = "system";
      } else if (rand < 0.03) {
        type = "bad";
      } else if (rand < 0.3) {
        type = "free";
      } else {
        type = "used";
      }

      /* Sprinkle TKA labels on some used blocks */
      let label = "";
      if (type === "used" && Math.random() < 0.08) {
        label = TKA_LABELS[Math.floor(Math.random() * TKA_LABELS.length)] ?? "";
      }

      result.push({ type, label });
    }

    return result;
  }

  /* Defrag animation                                                    */

  $effect(() => {
    if (!running) return;

    const id = setInterval(() => {
      performDefragStep();
    }, ANIMATION_INTERVAL_MS);

    return () => clearInterval(id);
  });

  function performDefragStep() {
    /* Find the first free block */
    const freeIndex = blocks.findIndex(
      (b, i) => b.type === "free" && i >= 8 /* skip system blocks */
    );

    /* Find a used block AFTER the free block to move forward */
    const usedIndex = blocks.findIndex(
      (b, i) => i > freeIndex && (b.type === "used" || b.type === "optimized")
    );

    if (freeIndex === -1 || usedIndex === -1) {
      /* No more moves possible - shuffle some blocks to keep it going */
      reshuffleBlocks();
      return;
    }

    /* Mark the moving block */
    const sourceBlock = blocks[usedIndex]!;
    blocks[usedIndex] = { type: "moving", label: sourceBlock.label };

    /* After a brief visual flash, complete the swap */
    setTimeout(() => {
      const movingBlock = blocks[usedIndex]!;
      blocks[usedIndex] = { type: "free", label: "" };
      blocks[freeIndex] = { type: "optimized", label: movingBlock.label };
    }, 80);

    /* Update status */
    currentCluster++;
    statusMessageIndex = (statusMessageIndex + 1) % STATUS_MESSAGES.length;
    statusMessage = STATUS_MESSAGES[statusMessageIndex] ?? "Working...";

    /* Progress creeps up but stalls around 60-80% */
    const maxPercent = 78;
    const rawPercent = (currentCluster / (TOTAL_CLUSTERS * 0.6)) * 100;
    defragPercent = Math.min(maxPercent, rawPercent);

    /* Occasionally stall the progress bar */
    if (Math.random() < 0.1 && defragPercent > 30) {
      defragPercent = defragPercent - Math.random() * 3;
    }
  }

  function reshuffleBlocks() {
    /* Move some optimized blocks to random positions to keep the illusion going */
    const optimizedIndices = blocks
      .map((b, i) => (b.type === "optimized" ? i : -1))
      .filter((i) => i !== -1);

    if (optimizedIndices.length > 10) {
      /* Convert some back to "used" and scatter them */
      for (let n = 0; n < 5; n++) {
        const idx =
          optimizedIndices[Math.floor(Math.random() * optimizedIndices.length)];
        if (idx !== undefined && idx >= 8) {
          blocks[idx] = { type: "used", label: blocks[idx]!.label };
        }
      }

      /* Add a few new free spots */
      for (let n = 0; n < 3; n++) {
        const idx = Math.floor(Math.random() * (TOTAL_CLUSTERS - 8)) + 8;
        const block = blocks[idx];
        if (block && block.type === "used") {
          blocks[idx] = { type: "free", label: "" };
        }
      }
    }
  }

  /* Controls                                                            */

  function handleStart() {
    running = true;
    statusMessage = STATUS_MESSAGES[0] ?? "Working...";
  }

  function handleStop() {
    running = false;
    statusMessage = "Paused";
  }

  function handleLegend() {
    showLegend = !showLegend;
  }

  /* Status bar                                                          */

  const statusPanels = $derived([
    {
      text: `Drive C: \u2014 ${Math.floor(defragPercent)}% defragmented \u2014 Cluster ${currentCluster} of ${TOTAL_CLUSTERS}`,
    },
  ]);
</script>

<div class="defrag-shell">
  <!-- Toolbar -->
  <div class="defrag-toolbar">
    <RetroButton label="Start" onclick={handleStart} disabled={running} />
    <RetroButton label="Stop" onclick={handleStop} disabled={!running} />
    <RetroButton label="Legend" onclick={handleLegend} />
  </div>

  <!-- Main content area -->
  <div class="defrag-content">
    <!-- Disk grid -->
    <div class="defrag-grid-wrapper sunken-panel">
      <div
        class="defrag-grid"
        style="grid-template-columns: repeat({COLS}, 1fr);"
        role="img"
        aria-label="Disk cluster map showing {TOTAL_CLUSTERS} clusters"
      >
        {#each blocks as block, i (i)}
          <div
            class="defrag-block"
            class:defrag-block-moving={block.type === "moving"}
            style="background: {BLOCK_COLORS[block.type]};"
            title="Cluster {i}: {block.type}{block.label
              ? ` [${block.label}]`
              : ''}"
          >
            {#if block.label}
              <span class="defrag-label">{block.label}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Legend panel (toggled) -->
    {#if showLegend}
      <div class="defrag-legend sunken-panel">
        <div class="defrag-legend-title">Legend</div>
        {#each LEGEND_ENTRIES as entry (entry.type)}
          <div class="defrag-legend-row">
            <div
              class="defrag-legend-swatch"
              style="background: {BLOCK_COLORS[entry.type]};"
            ></div>
            <span class="defrag-legend-label">{entry.label}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Progress bar -->
  <div class="defrag-progress">
    <RetroProgressBar value={defragPercent} segmented />
  </div>

  <!-- Status bar -->
  <div class="defrag-statusbar">
    <RetroStatusBar panels={statusPanels} />
  </div>
</div>

<style>
  /* Shell layout                                                        */
  .defrag-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--retro-button-face, #c0c0c0);
    font-family: var(
      --retro-font-family,
      "Microsoft Sans Serif",
      Arial,
      sans-serif
    );
    font-size: var(--retro-font-size, 11px);
    color: var(--retro-black, #000);
  }

  /* Toolbar                                                             */
  .defrag-toolbar {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-bottom: 1px solid var(--retro-button-shadow, #808080);
  }

  /* Content area                                                        */
  .defrag-content {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 4px;
    padding: 4px;
    overflow: hidden;
  }

  /* Disk grid                                                           */
  .defrag-grid-wrapper {
    flex: 1;
    min-width: 0;
    padding: 4px;
    overflow: hidden;
  }

  .defrag-grid {
    display: grid;
    gap: 1px;
    width: 100%;
    height: 100%;
  }

  .defrag-block {
    position: relative;
    border: 1px solid rgba(0, 0, 0, 0.2);
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .defrag-block-moving {
    animation: defrag-flash var(--duration-fast) var(--ease-standard);
  }

  @keyframes defrag-flash {
    0% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
    100% {
      opacity: 1;
    }
  }

  .defrag-label {
    font-size: 7px;
    font-weight: bold;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1;
    pointer-events: none;
    user-select: none;
  }

  /* Legend panel                                                        */
  .defrag-legend {
    flex-shrink: 0;
    width: 100px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .defrag-legend-title {
    font-weight: bold;
    margin-bottom: 2px;
    text-align: center;
    border-bottom: 1px solid var(--retro-button-shadow, #808080);
    padding-bottom: 2px;
  }

  .defrag-legend-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .defrag-legend-swatch {
    width: 12px;
    height: 12px;
    border: 1px solid #000;
    flex-shrink: 0;
  }

  .defrag-legend-label {
    white-space: nowrap;
  }

  /* Progress bar                                                        */
  .defrag-progress {
    padding: 2px 4px;
    flex-shrink: 0;
  }

  /* Status bar                                                          */
  .defrag-statusbar {
    flex-shrink: 0;
  }
</style>
