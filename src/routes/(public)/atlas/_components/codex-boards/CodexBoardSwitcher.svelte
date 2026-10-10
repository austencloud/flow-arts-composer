<!--
  The three-way layout choice, sized to its three short labels.

  fit-content on purpose: SegmentedControl fills whatever box it is given, and
  the header row it sits in is the full band, so without this the three labels
  stretch into a progress bar across the screen.
-->
<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { BOARDS, type BoardKey } from "./board-choice";

  let {
    board,
    onchange,
  }: { board: BoardKey; onchange: (next: BoardKey) => void } = $props();
</script>

<div class="switcher">
  <span class="switcher-label" id="codex-board-label">Layout</span>
  <SegmentedControl
    options={BOARDS}
    value={board}
    {onchange}
    size="sm"
    ariaLabelledby="codex-board-label"
  />
</div>

<style>
  .switcher {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: fit-content;
  }

  .switcher-label {
    font-size: 0.8rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--theme-text-muted, oklch(0.72 0.015 270));
  }
</style>
