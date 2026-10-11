<script lang="ts">
  import { Canvas, T } from "@threlte/core";

  import CanvasLifecycle from "#lib/shared/3d/components/CanvasLifecycle.svelte";

  import type { FormationPresetId } from "../domain/stage-types";
  import { PERFORMER_COLORS } from "../domain/stage-types";
  import type { StudioPerformerCount } from "../domain/studio-project";
  import { stageToWorld } from "../domain/stage-performance-sampler";
  import { generatePresetPositions } from "../state/formation-presets";
  import StudioPreviewPerformer from "./StudioPreviewPerformer.svelte";

  interface Props {
    performerCount: StudioPerformerCount | null;
    formation: FormationPresetId | null;
    formationLabel?: string | null;
  }

  let { performerCount, formation, formationLabel = null }: Props = $props();

  const PREVIEW_STAGE = { stageWidth: 6, stageDepth: 4 } as const;
  const canvasDpr =
    typeof window === "undefined"
      ? 1
      : Math.min(window.devicePixelRatio || 1, 1.25);

  let mountedCapacity = $state(0);
  $effect(() => {
    if (performerCount !== null && performerCount > mountedCapacity) {
      mountedCapacity = performerCount;
    }
  });

  const previewFormation = $derived<FormationPresetId>(
    formation ?? (performerCount === 1 ? "solo" : "line")
  );
  const positions = $derived.by(() => {
    if (performerCount === null) return [];
    return generatePresetPositions(
      previewFormation,
      performerCount,
      PREVIEW_STAGE.stageWidth,
      PREVIEW_STAGE.stageDepth
    ).map((position) => ({
      ...stageToWorld(position, PREVIEW_STAGE),
      facingAngle: position.facingAngle ?? 0,
    }));
  });
  const summary = $derived(
    performerCount === null
      ? "Choose a cast to bring the stage to life."
      : `${performerCount} ${performerCount === 1 ? "performer" : "performers"}${formationLabel ? ` · ${formationLabel}` : ""}`
  );
</script>

<div class="cast-preview">
  <div class="canvas-shell" aria-hidden="true">
    <Canvas dpr={canvasDpr}>
      <CanvasLifecycle />
      <T.PerspectiveCamera
        makeDefault
        position={[0, 4.8, 6.7]}
        rotation.x={-0.54}
        fov={36}
      />
      <T.AmbientLight intensity={0.92} />
      <T.DirectionalLight position={[3.5, 6, 4]} intensity={1.7} />
      <T.DirectionalLight position={[-4, 2.5, -3]} intensity={0.55} />

      {#each Array.from({ length: mountedCapacity }) as _, index (index)}
        {@const position = positions[index]}
        <StudioPreviewPerformer
          {index}
          color={PERFORMER_COLORS[index] ?? PERFORMER_COLORS[0]}
          visible={performerCount !== null && index < performerCount}
          x={position?.x}
          z={position?.z}
          facingAngle={position?.facingAngle}
        />
      {/each}

      <T.GridHelper args={[6, 12, "#7667df", "#28314a"]} position.y={0.006} />
      <T.Mesh rotation.x={-Math.PI / 2} position.y={-0.015}>
        <T.CircleGeometry args={[3.35, 64]} />
        <T.MeshStandardMaterial color="#111522" roughness={0.9} />
      </T.Mesh>
    </Canvas>
  </div>

  <div class="preview-summary" aria-live="polite">
    <span class="preview-kicker">Live stage preview</span>
    <strong>{summary}</strong>
  </div>
</div>

<style>
  .cast-preview {
    display: grid;
    min-width: 0;
    overflow: hidden;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent) 26%, var(--theme-stroke));
    border-radius: 1rem;
    background: var(--surface-inset-deep);
    box-shadow: inset 0 1px 0 color-mix(in srgb, white 8%, transparent);
  }

  .canvas-shell {
    position: relative;
    min-height: 13rem;
    background:
      radial-gradient(
        circle at 50% 62%,
        color-mix(in srgb, var(--theme-accent) 20%, transparent),
        transparent 58%
      ),
      var(--surface-inset-deep);
  }

  .canvas-shell :global(canvas) {
    display: block;
    width: 100% !important;
    height: 100% !important;
  }

  .preview-summary {
    display: grid;
    gap: 0.2rem;
    min-height: 4.5rem;
    padding: 0.75rem 0.875rem;
    border-top: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-panel-bg) 92%, transparent);
  }

  .preview-kicker {
    color: var(--theme-accent);
    font-size: var(--font-size-compact, 12px);
    font-weight: 750;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .preview-summary strong {
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    line-height: 1.35;
  }

  @container (max-width: 42rem) {
    .canvas-shell {
      min-height: 9rem;
    }

    .preview-summary {
      min-height: 0;
    }
  }
</style>
