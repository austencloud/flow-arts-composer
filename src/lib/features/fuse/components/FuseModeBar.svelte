<!--
  FuseModeBar — top-of-tab Fuse mode switch.

  A single-select SegmentedControl toggling the whole tab between `shuffle` (two
  independent paths) and `symmetry` (one driver path, the follower derived from
  it). The mode is owned + persisted by fuse-state; this bar just drives it.
-->
<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { getFuseContext } from "../context/fuse-context";
  import type { FuseMode } from "../state/fuse-state.svelte";

  const { state: fuseState } = getFuseContext();
  let {
    selectedMode,
    onSelect,
    compact = false,
  }: {
    selectedMode?: FuseMode;
    onSelect?: (mode: FuseMode) => void;
    compact?: boolean;
  } = $props();
  const value = $derived(selectedMode ?? fuseState.mode);

  // No icons: SegmentedControl renders the icon in place of the label, and the
  // two mode words carry the meaning here.
  const modeOptions: {
    value: FuseMode;
    label: string;
    ariaLabel: string;
  }[] = [
    {
      value: "shuffle",
      label: "Separate",
      ariaLabel: "Separate paths: edit Left and Right independently",
    },
    {
      value: "symmetry",
      label: "Linked",
      ariaLabel: "Linked paths: one path rebuilds the other",
    },
  ];

  // Mode swaps rebuild the preview; keep it inert mid-load so a switch can't race
  // an in-flight length load or fuse.
  const disabled = $derived(fuseState.isLoadingLength || fuseState.isFusing);

  const options = $derived(
    modeOptions.map((option) => ({ ...option, disabled }))
  );

  function handleSelect(value: FuseMode): void {
    if (onSelect) onSelect(value);
    else fuseState.setMode(value);
  }
</script>

<div class="fuse-mode-bar" class:compact role="group" aria-label="Pairing mode">
  <SegmentedControl
    {options}
    {value}
    onchange={handleSelect}
    color="accent"
    size="md"
  />
</div>

<style>
  .fuse-mode-bar {
    display: flex;
    flex: 0 0 auto;
    width: min(100%, 28rem);
    min-width: 0;
  }

  .fuse-mode-bar :global(.segmented-control) {
    width: 100%;
  }

  .fuse-mode-bar.compact {
    width: min(100%, 22rem);
  }
</style>
