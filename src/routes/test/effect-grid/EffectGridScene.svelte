<script lang="ts">
  /**
   * Scene contents for the effect grid: every registry effect as one station in
   * a 4x4 arrangement, each running the same sequence with the same overlaid
   * rigs, so the effect is the only variable.
   */
  import { T } from "@threlte/core";
  import { onMount } from "svelte";
  import CellLabel3D from "./CellLabel3D.svelte";
  import TelekineticFormation3D from "#lib/features/museum/components/game/TelekineticFormation3D.svelte";
  import { EFFECT_CELLS } from "./effect-grid";
  import SceneEffectsCoordinator3D from "#lib/shared/3d/effects/scene-effects/SceneEffectsCoordinator3D.svelte";
  import { SceneEffectsManager3D } from "#lib/shared/3d/effects/scene-effects/scene-effects-manager-3d.js";
  import { setSceneEffectsContext } from "#lib/shared/3d/effects/scene-effects/scene-effects-context.js";
  import { InfiniteSequenceGenerator } from "#lib/features/landing/services/infinite-sequence-generator.js";
  import { SpinnerMetricsRepository } from "#lib/features/landing/services/spinner-metrics-repository.js";
  import { getGenerationOrchestrator } from "#lib/features/create/generate/shared/get-generation-orchestrator.js";
  import { orientationCycleExtender } from "#lib/features/create/generate/circular/services/orientation-cycle-extender.js";
  import { isEffectPreviewLoop } from "#lib/shared/effects/domain/effect-preview-loop-policy.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { GeneratedSequenceInfo } from "#lib/features/landing/domain/models/spinner-models.js";

  const GENERATED_EFFECT_PREVIEW_SEQUENCE_ID = "generated-effect-preview-loop";

  interface Props {
    showProps: boolean;
    playing: boolean;
    showLabels: boolean;
    /** Overlaid centre rigs per station. The cost dial for this page. */
    centerPlanes: number;
    /** Optional single-effect hero mode used for close visual verification. */
    focusEffect?: string | null;
    /** Test-only selection override for timing one live scene across effects. */
    effectOverride?: string | null;
    /** Multiple identical formations let activation tests reach an exact rig count. */
    formationCount?: number;
    /** Review routes can supply a sequence chosen for a specific effect. */
    sequenceId?: string;
    /** The grid locator is useful in the grid and visual noise in hero mode. */
    showStageMarker?: boolean;
    /** Reports the generated LOOP so review pages can show its real count. */
    onPreviewReady?: (preview: GeneratedSequenceInfo) => void;
    /** Lets the host render a retry state instead of leaving an empty stage. */
    onPreviewError?: (message: string) => void;
    /** Signals that scene-scoped renderers and rig-local warm pools exist. */
    onEffectsReadyChange?: (ready: boolean) => void;
  }
  const props: Props = $props();
  const sceneEffectsManager = setSceneEffectsContext(
    new SceneEffectsManager3D()
  );
  const focusedCell = $derived(
    EFFECT_CELLS.find((cell) => cell.id === props.focusEffect) ?? null
  );
  const visibleCells = $derived(focusedCell ? [focusedCell] : EFFECT_CELLS);
  const formationCopies = $derived(
    Array.from({ length: Math.max(1, props.formationCount ?? 1) }, (_, i) => i)
  );
  let generatedSequence = $state<SequenceData | null>(null);
  const resolvedSequenceId = $derived(
    props.sequenceId ?? GENERATED_EFFECT_PREVIEW_SEQUENCE_ID
  );
  const injectedSequenceMap = $derived(
    generatedSequence
      ? new Map([[GENERATED_EFFECT_PREVIEW_SEQUENCE_ID, generatedSequence]])
      : undefined
  );
  const sequenceReady = $derived(
    Boolean(props.sequenceId || generatedSequence)
  );

  onMount(() => {
    if (props.sequenceId) return;

    let active = true;
    const generator = new InfiniteSequenceGenerator(
      getGenerationOrchestrator(),
      new SpinnerMetricsRepository(),
      orientationCycleExtender
    );

    void generator
      .generateInitial()
      .then((preview) => {
        if (!active) return;
        if (!preview || !isEffectPreviewLoop(preview.sequence)) {
          throw new Error(
            "The generated sequence did not meet the effect preview LOOP contract."
          );
        }
        generatedSequence = preview.sequence;
        props.onPreviewReady?.(preview);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : "LOOP generation failed.";
        props.onPreviewError?.(message);
      });

    return () => {
      active = false;
    };
  });
</script>

<SceneEffectsCoordinator3D
  manager={sceneEffectsManager}
  onReadyChange={props.onEffectsReadyChange}
/>

<!-- Dim key: the effects carry the frame, lighting stays out of their way. -->
<T.AmbientLight intensity={0.18} color="#0e1420" />
<T.DirectionalLight position={[8, 16, 10]} intensity={0.32} color="#c8d4ff" />

{#if sequenceReady}
  {#each visibleCells as cell (cell.id)}
    {@const cellX = cell.x - (focusedCell?.x ?? 0)}
    {@const cellZ = cell.z - (focusedCell?.z ?? 0)}
    {#if props.showStageMarker !== false}
      <T.Mesh
        position.x={cellX}
        position.y={0.01}
        position.z={cellZ}
        rotation.x={-Math.PI / 2}
      >
        <T.RingGeometry args={[2.0, 2.15, 48]} />
        <T.MeshBasicMaterial color={cell.color} transparent opacity={0.3} />
      </T.Mesh>
    {/if}

    {#if props.showLabels}
      <CellLabel3D
        text={cell.label}
        color={cell.color}
        position={[cellX, 0.35, cellZ + 2.5]}
      />
    {/if}

    {#each formationCopies as copyIndex (copyIndex)}
      <TelekineticFormation3D
        stationId={`grid-${cell.id}-${copyIndex}`}
        worldX={cellX}
        worldZ={cellZ}
        sequenceId={resolvedSequenceId}
        userSequenceDataMap={injectedSequenceMap}
        presentation="sculpture"
        effectId={props.effectOverride ?? cell.id}
        showProps={props.showProps}
        autoPlay={props.playing}
        centerPlanes={props.centerPlanes}
      />
    {/each}
  {/each}
{/if}
