<script lang="ts">
  import LiveExportCard from "$lib/shared/share/components/LiveExportCard.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";

  interface Props {
    sequence: SequenceData;
    options: Partial<SequenceExportOptions>;
    width: number;
    height: number;
    automaticLayout?: boolean;
    autoLayoutOverride?: ResolvedAutoLayout | null;
    qrUrl?: string;
    onReady: () => void;
    onAutoLayoutResolved?: (
      layout: ResolvedAutoLayout | null,
      width: number,
      height: number
    ) => void;
  }

  const {
    sequence,
    options,
    width,
    height,
    automaticLayout = false,
    autoLayoutOverride = null,
    qrUrl,
    onReady,
    onAutoLayoutResolved,
  }: Props = $props();
</script>

<div
  data-testid="live-card-parity-stage"
  style:width={`${width}px`}
  style:height={`${height}px`}
>
  <LiveExportCard
    {sequence}
    {options}
    {automaticLayout}
    {autoLayoutOverride}
    {qrUrl}
    {onReady}
    {onAutoLayoutResolved}
  />
</div>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
  }

  [data-testid="live-card-parity-stage"] {
    position: relative;
    overflow: hidden;
    background: white;
  }
</style>
