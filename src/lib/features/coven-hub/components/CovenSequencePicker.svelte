<script lang="ts">
  import { onMount } from "svelte";
  import BrowsePanel from "#lib/shared/browse/components/BrowsePanel.svelte";
  import { createBrowseEngine } from "#lib/shared/browse/engine/create-browse-engine.svelte.js";
  import { getBrowseLoader } from "#lib/shared/browse/get-browse-loader.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  interface Props {
    onSelect: (seq: SequenceData) => void;
  }
  const props: Props = $props();

  // Headless browse engine. Ephemeral (no persistKey) so the picker doesn't
  // remember filter/source state across visits. Source toggle stays available
  // so signed-in users can pick from their own library.
  const engine = createBrowseEngine({
    persistKey: null,
    initialSource: "community",
    minColumns: 2,
  });

  onMount(() => {
    engine.initialize();
    return () => engine.destroy();
  });

  // BrowsePanel emits a metadata-only SequenceData on select. The coven hub
  // performs the full step data, so hydrate via the loader before handing off.
  async function handleSelect(seq: SequenceData): Promise<void> {
    try {
      const full = await getBrowseLoader().loadFullSequenceData(seq.id, seq.id);
      props.onSelect(full ?? seq);
    } catch (err) {
      console.warn("[CovenSequencePicker] Failed to load full sequence:", err);
      props.onSelect(seq);
    }
  }
</script>

<div class="picker">
  <div class="picker-panel">
    <BrowsePanel
      {engine}
      layout="compact"
      showSourceToggle
      onSelect={(seq) => handleSelect(seq)}
      title="Choose a sequence"
    />
  </div>
</div>

<style>
  .picker {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    background: var(--theme-overlay-scrim, rgba(8, 8, 14, 0.78));
    backdrop-filter: blur(6px);
  }

  .picker-panel {
    width: min(92vw, 880px);
    height: min(86vh, 720px);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 14px;
    overflow: hidden;
    box-shadow: var(--shadow-modal, 0 16px 48px rgba(0, 0, 0, 0.5));
  }
</style>
