<script lang="ts">
  import AnimatorCanvas from "#lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { AdditionalLayerProps } from "#lib/shared/animation-engine/domain/types/trail-capture-types.js";
  import { buildTunnelLayers } from "#lib/shared/sequence-viewer/tunnel/tunnel-layer-builder.js";
  import { sampleTunnelProps } from "#lib/shared/sequence-viewer/tunnel/tunnel-prop-sampling.js";
  import { copyModulators, propCount, type TunnelConfig } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";

  const {
    base,
    config,
    label,
    step,
    propType,
    spectrum,
    grid,
  }: {
    base: SequenceData;
    config: TunnelConfig;
    label: string;
    /** Shared 1-indexed fractional playhead from the page. */
    step: number;
    propType: string;
    spectrum: boolean;
    grid: boolean;
  } = $props();

  // Bake this config's spatial copies with the real engine whenever the base or
  // config changes. Token guards a stale async resolve.
  let layers = $state<SequenceData[]>([]);
  let token = 0;
  $effect(() => {
    const b = base;
    const c = config;
    const t = ++token;
    void buildTunnelLayers(b, c).then((ls) => {
      if (t === token) layers = ls;
    });
  });

  // Per-copy Stagger + Speed modulators, aligned index-for-index with the layers.
  const mods = $derived(copyModulators(config));
  const baseProps = $derived(sampleTunnelProps(base, step));
  const additionalLayers = $derived<AdditionalLayerProps[]>(
    layers.map((seq, i) => {
      const m = mods[i] ?? { staggerSteps: 0, speed: 1 };
      const p = sampleTunnelProps(seq, step, undefined, m.staggerSteps, m.speed);
      return { leftProp: p.left, rightProp: p.right };
    }),
  );
  const gridMode = $derived(base.gridMode);
</script>

<div class="cell">
  <div class="stage">
    <AnimatorCanvas
      leftProp={baseProps.left}
      rightProp={baseProps.right}
      {additionalLayers}
      tunnelSpectrum={spectrum}
      leftPropType={propType}
      rightPropType={propType}
      sequenceData={base}
      currentStep={step}
      isPlaying={true}
      {gridMode}
      gridVisible={grid}
      hideHeader={true}
      hideProgressBar={true}
      hideTkaGlyph={true}
      hideStepNumbers={true}
      hidePathLines={true}
      fillContainer={true}
      fireConfig={{ disableFrameCache: true }}
    />
  </div>
  <div class="meta">
    <span class="name">{label}</span>
    <span class="count">{propCount(config)} props</span>
  </div>
</div>

<style>
  .cell {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .stage {
    position: relative;
    aspect-ratio: 1 / 1;
    width: 100%;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid rgba(255 255 255 / 0.1);
    background: #07070b;
    box-shadow: 0 12px 40px rgba(0 0 0 / 0.45);
  }
  .stage :global(canvas) {
    max-width: 100%;
    max-height: 100%;
  }
  .meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .name {
    font-weight: 600;
    font-size: 0.82rem;
  }
  .count {
    font-size: 0.72rem;
    opacity: 0.55;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>
