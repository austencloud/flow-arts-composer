<script lang="ts">
  import { tick } from "svelte";
  import InlineAnimationPlayer from "$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import DualSourceCrossfade from "$lib/shared/components/DualSourceCrossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { resolveMotionPathEntryStep } from "../_data/motion-path-entry-step";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { AnimationScope } from "$lib/shared/animation-engine/state/animation-scope.svelte";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { DEFAULT_TRAIL_SETTINGS } from "$lib/shared/animation-engine/domain/types/trail-types";

  type Source = "first" | "second";

  interface Layer {
    key: string;
    sequence: SequenceData;
    initialStep: number;
  }

  interface Props {
    sequence: SequenceData;
    /** Changes for every completed selection, including identical sequence IDs. */
    transitionKey: string;
    scope: AnimationScope;
    playing: boolean;
    leftPropType: PropType;
    rightPropType: PropType;
    onplayingchange: (playing: boolean) => void;
    onstepchange: (step: number) => void;
    onready: () => void;
    onloaderror: () => void;
  }

  let {
    sequence,
    transitionKey,
    scope,
    playing,
    leftPropType,
    rightPropType,
    onplayingchange,
    onstepchange,
    onready,
    onloaderror,
  }: Props = $props();

  let first = $state.raw<Layer | null>(null);
  let second = $state.raw<Layer | null>(null);
  let active = $state<Source | null>(null);
  let waiting = $state<Source | null>(null);
  let visibleStep = $state(0);
  let requestedKey: string | null = null;
  let fading = $state(false);
  let releasing = $state<Source | null>(null);
  let queued: { key: string; sequence: SequenceData } | null = null;
  let firstSeek: ((step: number) => void) | null = null;
  let secondSeek: ((step: number) => void) | null = null;
  let firstReadiness = $state({
    key: null as string | null,
    sequence: false,
    canvas: false,
  });
  let secondReadiness = $state({
    key: null as string | null,
    sequence: false,
    canvas: false,
  });

  function layerFor(source: Source): Layer | null {
    return source === "first" ? first : second;
  }

  function setLayer(source: Source, layer: Layer | null): void {
    if (source === "first") first = layer;
    else second = layer;
    const readiness = {
      key: layer?.key ?? null,
      sequence: false,
      canvas: false,
    };
    if (source === "first") firstReadiness = readiness;
    else secondReadiness = readiness;
  }

  function stage(key: string, nextSequence: SequenceData): void {
    const outgoing = active ? layerFor(active) : null;
    const incoming: Source = active === "first" ? "second" : "first";
    const step = resolveMotionPathEntryStep({
      outgoing: outgoing?.sequence ?? null,
      outgoingStep: outgoing ? visibleStep : 0,
      incoming: nextSequence,
      fallbackKey: key,
    });
    setLayer(incoming, { key, sequence: nextSequence, initialStep: step });
    waiting = incoming;
  }

  function stageNext(): void {
    const key = transitionKey;
    if (key === requestedKey) return;
    requestedKey = key;
    if (fading) {
      queued = { key, sequence };
      return;
    }
    stage(key, sequence);
  }

  // A relationship selection prepares its replacement behind the current
  // canvas. The outgoing player remains the time reference until its successor
  // has loaded, so a slow build never freezes the prop already in motion.
  $effect(() => {
    transitionKey;
    sequence;
    stageNext();
  });

  function readinessFor(source: Source) {
    return source === "first" ? firstReadiness : secondReadiness;
  }

  async function revealWhenReady(source: Source, key: string): Promise<void> {
    const layer = layerFor(source);
    const readiness = readinessFor(source);
    if (
      !layer ||
      layer.key !== key ||
      waiting !== source ||
      readiness.key !== key ||
      !readiness.sequence ||
      !readiness.canvas
    )
      return;
    // InlineAnimationPlayer intentionally routes its exposed seek through the
    // external-clock owner while externalStep is present. Release that clock,
    // wait for the player to expose its local controller again, then seek the
    // newest mapped phase before this canvas becomes visible.
    releasing = source;
    await tick();
    if (
      waiting !== source ||
      layerFor(source)?.key !== key ||
      readinessFor(source).key !== key
    ) {
      if (releasing === source) releasing = null;
      return;
    }
    const finalStep = handoffStep(layerFor(source)!) ?? layer.initialStep;
    (source === "first" ? firstSeek : secondSeek)?.(finalStep);
    releasing = null;
    fading = active !== null;
    active = source;
    waiting = null;
    onready();
  }

  function markSequenceReady(source: Source, key: string): void {
    const readiness = readinessFor(source);
    if (readiness.key !== key) return;
    readiness.sequence = true;
    void revealWhenReady(source, key);
  }

  function markCanvasReady(source: Source, key: string): void {
    const readiness = readinessFor(source);
    if (readiness.key !== key) return;
    readiness.canvas = true;
    void revealWhenReady(source, key);
  }

  function handleStep(source: Source, key: string, step: number): void {
    if (active !== source || layerFor(source)?.key !== key) return;
    visibleStep = step;
    onstepchange(step);
  }

  function handleSettled(source: Source): void {
    if (active !== source) return;
    const outgoing = source === "first" ? "second" : "first";
    // A newer selection can already be loading in the retiring source. Its
    // canvas stays parked at opacity zero until it is ready; deleting it here
    // would lose the latest request and make the old player flash back.
    if (waiting !== outgoing) setLayer(outgoing, null);
    fading = false;
    const next = queued;
    queued = null;
    if (next) stage(next.key, next.sequence);
  }

  function handleLoadError(source: Source, key: string): void {
    if (waiting !== source || layerFor(source)?.key !== key) return;
    setLayer(source, null);
    waiting = null;
    // A replacement failure must leave the visible player and its transport
    // usable. Only surface the full-stage error when there was no animation to
    // keep on screen in the first place.
    if (active === null) onloaderror();
  }

  function handoffStep(layer: Layer): number | null {
    const outgoing = active ? layerFor(active) : null;
    if (!outgoing || visibleStep <= 0) return null;
    return resolveMotionPathEntryStep({
      outgoing: outgoing.sequence,
      outgoingStep: visibleStep,
      incoming: layer.sequence,
      fallbackKey: layer.key,
    });
  }

  function playerCallbacks(source: Source, key: string) {
    // A player's teardown can run after its snippet's layer becomes null.
    // Capture its identity now so late callbacks cannot touch the replacement.
    return {
      onStepChange: (step: number) => handleStep(source, key, step),
      onSeekRef: (seek: ((step: number) => void) | null) => {
        if (layerFor(source)?.key !== key) return;
        if (source === "first") firstSeek = seek;
        else secondSeek = seek;
      },
      onReady: () => markSequenceReady(source, key),
      onCanvasInitialized: () => markCanvasReady(source, key),
      onLoadError: () => handleLoadError(source, key),
    };
  }
</script>

{#snippet player(source: Source, layer: Layer | null)}
  {#if layer}
    {#key layer.key}
      {@const callbacks = playerCallbacks(source, layer.key)}
      <InlineAnimationPlayer
        sequence={layer.sequence}
        visibilityManagerOverride={scope.visibility}
        effectsConfigState={scope.effects}
        trailSettingsOverride={DEFAULT_TRAIL_SETTINGS}
        tipEffectMap={{}}
        tipEffortMap={{}}
        {leftPropType}
        {rightPropType}
        chrome="minimal"
        fill
        autoPlay={false}
        externalPlaying={playing}
        externalStep={waiting === source && releasing !== source
          ? handoffStep(layer)
          : null}
        externalBpm={48}
        backgroundAlpha={0}
        onExternalPlayingChange={onplayingchange}
        {...callbacks}
        showControls={false}
        showPositionGlyph
        beatIndicators={false}
        disableContextMenu
        playbackAllowed
        resumeWhenPlaybackAllowed
        initialStep={layer.initialStep}
      />
    {/key}
  {/if}
{/snippet}

{#snippet firstPlayer()}
  {@render player("first", first)}
{/snippet}

{#snippet secondPlayer()}
  {@render player("second", second)}
{/snippet}

<DualSourceCrossfade
  {active}
  duration={DURATION.emphasis}
  first={firstPlayer}
  second={secondPlayer}
  onsettled={handleSettled}
/>
