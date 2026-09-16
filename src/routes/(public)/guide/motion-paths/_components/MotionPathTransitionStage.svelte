<script lang="ts">
  import { tick } from "svelte";
  import InlineAnimationPlayer from "$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import DualSourceCrossfade from "$lib/shared/components/DualSourceCrossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { resolveMotionPathEntryStep } from "../_data/motion-path-entry-step";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { AnimationScope } from "$lib/shared/animation-engine/state/animation-scope.svelte";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    DEFAULT_TRAIL_SETTINGS,
    TrackingMode,
  } from "$lib/shared/animation-engine/domain/types/trail-types";

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
    trace: "hands" | "tips";
    leftPropType: PropType;
    rightPropType: PropType;
    onplayingchange: (playing: boolean) => void;
    onstepchange: (step: number) => void;
    /** Publishes a safe seek target for the canvas currently shown by the stage. */
    onseekref?: (seek: ((step: number) => void) | null) => void;
    /** Lets an external step rail keep its cells aligned to the visible canvas. */
    ondisplayedsequencechange?: (sequence: SequenceData | null) => void;
    onready: () => void;
    onloaderror: () => void;
  }

  let {
    sequence,
    transitionKey,
    scope,
    playing,
    trace,
    leftPropType,
    rightPropType,
    onplayingchange,
    onstepchange,
    onseekref = undefined,
    ondisplayedsequencechange = undefined,
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
  let firstCanvasInitialized = false;
  let secondCanvasInitialized = false;
  // This stage has no trail-tip assignments. Disabling path-cache construction
  // avoids deriving invisible trails before a replacement can crossfade.
  const motionPathTrailSettings = $derived({
    ...DEFAULT_TRAIL_SETTINGS,
    usePathCache: false,
    trackingMode:
      trace === "hands" ? TrackingMode.HAND : TrackingMode.RIGHT_END,
  });

  function layerFor(source: Source): Layer | null {
    return source === "first" ? first : second;
  }

  function setLayer(source: Source, layer: Layer | null): void {
    if (source === "first") first = layer;
    else second = layer;
    if (!layer) {
      if (source === "first") firstCanvasInitialized = false;
      else secondCanvasInitialized = false;
    }
    const readiness = {
      key: layer?.key ?? null,
      sequence: false,
      // Once a source has painted, later sequence reloads retain its canvas.
      // They only wait for the replacement sequence, not a second engine boot.
      canvas: layer
        ? source === "first"
          ? firstCanvasInitialized
          : secondCanvasInitialized
        : false,
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

  function markSequenceReady(
    source: Source,
    key: string,
    loadedIdentity: string | null
  ): void {
    const readiness = readinessFor(source);
    const layer = layerFor(source);
    if (readiness.key !== key || layer?.key !== key || key !== loadedIdentity)
      return;
    readiness.sequence = true;
    void revealWhenReady(source, key);
  }

  function markCanvasReady(source: Source, key: string): void {
    const readiness = readinessFor(source);
    if (readiness.key !== key) return;
    if (source === "first") firstCanvasInitialized = true;
    else secondCanvasInitialized = true;
    readiness.canvas = true;
    void revealWhenReady(source, key);
  }

  function handleStep(
    source: Source,
    key: string,
    step: number,
    sequenceId: string | null
  ): void {
    const layer = layerFor(source);
    if (
      active !== source ||
      layer?.key !== key ||
      (sequenceId !== null && sequenceId !== layer.sequence.id)
    )
      return;
    visibleStep = step;
    onstepchange(step);
  }

  function seekDisplayed(step: number): void {
    if (!active) return;
    (active === "first" ? firstSeek : secondSeek)?.(step);
  }

  $effect(() => {
    const publishSeek = onseekref;
    if (!publishSeek) return;
    // The parent keeps this reference for a step rail. While a replacement is
    // loading, `active` still names the displayed player, so a click never
    // scrubs an invisible or half-initialized canvas.
    publishSeek(seekDisplayed);
    return () => publishSeek(null);
  });

  $effect(() => {
    ondisplayedsequencechange?.(
      active ? (layerFor(active)?.sequence ?? null) : null
    );
  });

  function handleSettled(source: Source): void {
    if (active !== source) return;
    // Keep both players mounted after a handoff. The next selection reloads
    // this parked source in place, preserving its engine and canvas instead of
    // paying a second cold initialization before the next fade.
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
      onStepChange: (step: number, sequenceId: string | null) =>
        handleStep(source, key, step, sequenceId),
      onSeekRef: (seek: ((step: number) => void) | null) => {
        if (layerFor(source)?.key !== key) return;
        if (source === "first") firstSeek = seek;
        else secondSeek = seek;
      },
      onReady: (loadIdentity) => markSequenceReady(source, key, loadIdentity),
      onCanvasInitialized: () => markCanvasReady(source, key),
      onLoadError: () => handleLoadError(source, key),
    };
  }
</script>

{#snippet player(source: Source, layer: Layer | null)}
  {#if layer}
    {@const callbacks = playerCallbacks(source, layer.key)}
    <InlineAnimationPlayer
      sequence={layer.sequence}
      sequenceLoadKey={layer.key}
      visibilityManagerOverride={scope.visibility}
      effectsConfigState={scope.effects}
      trailSettingsOverride={motionPathTrailSettings}
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
      showPlacementGlyph
      beatIndicators={false}
      disableContextMenu
      playbackAllowed={active === source || waiting === source || fading}
      resumeWhenPlaybackAllowed
      initialStep={layer.initialStep}
    />
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
