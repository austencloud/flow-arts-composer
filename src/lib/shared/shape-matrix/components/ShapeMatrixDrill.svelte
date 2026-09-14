<!--
  ShapeMatrixDrill.svelte

  The elemental drill for a clicked shape-matrix cell: six element-styled VTG
  mode chips (water/earth/sun/fire/air/moon) over a hero stage where the cell's
  mandala renders big and still, then gets traced live by the selected props
  when an element is picked. One stable screen — no sub-navigation, no card
  thumbnails, no back button. Spec:
  docs/superpowers/specs/2026-07-19-shape-matrix-elemental-drill-design.md

  The still MandalaHeroLayer is a cold-load floor. Once ready, the canonical
  InlineAnimationPlayer is the only path rendering owner, including its
  disassembled view. Two complete realization layers stay alive during a swap:
  the old one keeps moving while the incoming one starts behind it, then the
  shared dual-source crossfader hands over the stage. Three props make the
  layering actually work — all three are load-bearing:
  - backgroundAlpha: 0 — the player's canvas is TRANSPARENT (alpha context +
    CanvasSurface data-transparent), so the host's atmosphere stays visible.
  - trailSettingsOverride: HERO_TRAIL_PRESET — vivid trail, per-instance,
    never by mutating the global animationSettings singleton.
  - tipEffectMap: HERO_TIP_EFFECT_MAP — the render loop's hasTrailTips gate
    draws ZERO trails without a "trails" tip assignment, whatever the trail
    settings say. Preset and map ship as a pair (see HomeHero).

  Element selection is sticky across cell changes. Once a cell is open, one
  realization always plays; re-clicking its chip does not elevate a still start
  position into a special state.

  InlineAnimationPlayer lives under features/browse/sequences/display/... .
  Importing a features/browse component from a shared component already has
  precedent: SequenceHeroDemo.svelte (src/lib/shared/landing/components/) does
  exactly this via the same LazyMount + dynamic-import idiom. Only a hidden
  source is keyed when assigned a different sequence. The visible player is
  never remounted before its replacement is moving.

  The drill owns its own empty state now (pair is nullable): chips disabled,
  "Pick a cell" hint in the hero. The relationship workspace above the stage
  owns the hands-to-props explanation, so the animation area does not repeat it.
-->
<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import DualSourceCrossfade from "$lib/shared/components/DualSourceCrossfade.svelte";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import MandalaHeroLayer from "./MandalaHeroLayer.svelte";
  import WordHeader from "$lib/shared/animation-engine/components/layers/WordHeader.svelte";
  import { levelForTurns } from "$lib/shared/create/services/level-turn-values";
  import { tryGetLoopDisplayResolver } from "$lib/shared/loop-labeler/get-loop-display-resolver";
  import { MANDALA_GUIDE_FLOOR_OPACITY } from "$lib/shared/mandala/domain/mandala-overlay-types";
  import ElementChipRow from "./ElementChipRow.svelte";
  import PropRelationshipChipRow from "./PropRelationshipChipRow.svelte";
  import {
    buildModeRealizationCandidates,
    type ModeRealization,
  } from "../services/build-mode-realizations";
  import { flowerKey, type Flower } from "../domain/flower-signature";
  import type { ShapeMatrixData } from "../services/shape-matrix-flowers";
  import {
    MODE_ORDER,
    type VtgMode,
  } from "../services/shape-matrix-realizations";
  import type { MandalaPaths } from "$lib/shared/mandala/domain/mandala-types";
  import { HERO_TRAIL_PRESET } from "$lib/shared/landing/data/hero-trail-preset";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { growFade } from "$lib/shared/transitions/motion";
  import { claimedViewTransitionName } from "$lib/shared/transitions/claimed-view-transition-name";
  import {
    SHAPE_MATRIX_ACTIVE_STAGE_NAME,
    SHAPE_MATRIX_CONTROLS_NAME,
    SHAPE_MATRIX_MODES_NAME,
    SHAPE_MATRIX_STRIP_NAME,
  } from "../services/shape-matrix-artwork";
  import { getShapeMatrixTransitionRecorder } from "../debug/shape-matrix-transition-recorder";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { TrackingMode } from "$lib/shared/animation-engine/domain/types/trail-types";
  import { QualityTier } from "$lib/shared/animation-engine/domain/types/quality-types";
  import { resolveRealizationEntryStep } from "../services/realization-phase-handoff";
  import type { ElementalType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import AnimationPanel from "$lib/shared/animation-panel/components/AnimationPanel.svelte";
  import type { ControlDockAction } from "$lib/shared/sequence-viewer/components/ControlDock.svelte";
  import { getShapeMatrixAnimationContext } from "../app/context/shape-matrix-animation-context";
  import { getOptionalShapeMatrixAppContext } from "../app/context/shape-matrix-app-context";
  import ShapeMatrixStageActions from "./ShapeMatrixStageActions.svelte";
  import { registerShapeMatrixPlaybackShortcut } from "../app/services/shape-matrix-playback-shortcut";
  import { foldTrailIntentIntoSettings } from "$lib/shared/effects/translators/canvas2d-translator";

  interface Props {
    /** Nullable: the drill renders its own "Pick a cell" state before any click. */
    pair: { left: Flower; right: Flower } | null;
    /**
     * One hand on stage, chosen from its own axis header. The other prop is
     * not drawn (the shell hides it through the viewer's motion visibility),
     * and the two relationship rows go with it: a mode is an agreement
     * between two hands, and there is only one here.
     */
    solo?: "left" | "right" | null;
    data: ShapeMatrixData;
    /** Optional composing surface action. The public archive remains a viewer;
     *  pickers can receive the exact realization this drill already built. */
    onselectRealization?: (realization: ModeRealization) => void;
    selectLabel?: string;
    /** Optional externally-owned mode for URL-restored app state. */
    selectedMode?: VtgMode | null;
    selectedPropMode?: VtgMode | null;
    onmodechange?: (mode: VtgMode | null) => void;
    onpropmodechange?: (mode: VtgMode | null) => void;
    propType?: PropType;
    onproptypechange?: (propType: PropType) => void;
    /**
     * The prop catalogue lives over the grid pane (a sheet on compact hosts),
     * never on this stage: the animation, the element relationships and the
     * carousel all stay put while a prop is chosen against the shape it
     * traces. The drill only shows the open state on its Props pill.
     */
    propPickerOpen?: boolean;
    onproppickertoggle?: () => void;
    /**
     * Shared tile-to-hero transition seam. `claim` makes the cold floor the
     * owner of the shared view-transition name (the host's compact layout is
     * showing this pane); `handoff` forces the floor visible while a
     * shared-element transition captures its snapshot.
     */
    mandalaTransition?: { claim: boolean; handoff: boolean };
  }
  let {
    pair,
    solo = null,
    data,
    onselectRealization,
    selectLabel = "Use this realization",
    selectedMode = $bindable(null),
    selectedPropMode = $bindable(null),
    onmodechange,
    onpropmodechange,
    propType = PropType.STAFF,
    onproptypechange,
    propPickerOpen = false,
    onproppickertoggle,
    mandalaTransition = { claim: false, handoff: false },
  }: Props = $props();

  const animationState = getShapeMatrixAnimationContext();
  const appState = getOptionalShapeMatrixAppContext();
  let animationPlayerModule: ReturnType<typeof importAnimationPlayer> | null =
    null;

  function importAnimationPlayer() {
    return import("$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte");
  }

  function loadAnimationPlayer() {
    animationPlayerModule ??= importAnimationPlayer();
    return animationPlayerModule;
  }

  const SHAPE_MATRIX_TRAIL_PRESET = {
    ...HERO_TRAIL_PRESET,
    trackingMode: TrackingMode.RIGHT_END,
    // The matrix stage is viewed much closer than the landing-page hero. Keep
    // its glow and stroke one tuning step quieter without changing that shared
    // attract-mode preset.
    glowBlur: HERO_TRAIL_PRESET.glowBlur - 2,
    lineWidth: HERO_TRAIL_PRESET.lineWidth - 2,
    // The generic player precomputes a full path cache whenever a sequence
    // changes. That is useful for long-lived editors but creates a 150–230 ms
    // main-thread task during rapid matrix exploration. Live capture is the
    // correct owner here: the player is already running continuously.
    usePathCache: false,
  };

  const effectiveTrailSettings = $derived.by(() => {
    const intent = animationState.scope.effects.trails;
    void intent.thickness;
    void intent.brightness;
    void intent.leftColor;
    void intent.rightColor;
    return foldTrailIntentIntoSettings(SHAPE_MATRIX_TRAIL_PRESET, intent);
  });

  /* Space is the same toggle the canvas offers a mouse, reached without one.
     It goes through the app's shortcut registry rather than a listener of our
     own, so it stands aside for text fields and open dialogs. The theory
     detail is mounted beside this one and binds the same key, so the surface
     check is what decides which of the two a press reaches. */
  $effect(() =>
    registerShapeMatrixPlaybackShortcut(
      "matrix",
      () => animationState.togglePlaying(),
      () => (!appState || appState.surface === "matrix") && Boolean(pair)
    )
  );

  const playbackAction = $derived<ControlDockAction>({
    icon: animationState.playing ? "fa-pause" : "fa-play",
    label: animationState.playing ? "Pause" : "Play",
    onClick: animationState.togglePlaying,
  });

  // Sticky across pair changes by design (spec: "Selection persistence").
  // Realizations are immutable payloads replaced as a unit. Raw state keeps
  // Svelte from proxying every nested beat and motion merely to hand a new
  // sequence to the standby player.
  let realizations = $state.raw<ModeRealization[]>([]);
  let activeBuiltRealization = $state.raw<ModeRealization | null>(null);
  let activeBuildTransitionId = 0;
  let building = $state(false);
  let buildError = $state(false);

  type PlayerSource = "first" | "second";
  interface PlayerLayer {
    key: string;
    /** The pair this layer plays; a layer for another pair is stale. */
    pairKey: string;
    realization: ModeRealization;
    paths: MandalaPaths;
    clubTipDx: number;
    propType: PropType;
    transitionId: number;
    initialStep: number;
  }

  interface PlayerReadiness {
    key: string | null;
    canvasReady: boolean;
    sequenceReady: boolean;
    motionReady: boolean;
  }

  let firstLayer = $state.raw<PlayerLayer | null>(null);
  let secondLayer = $state.raw<PlayerLayer | null>(null);
  let firstStep = $state(0);
  let secondStep = $state(0);
  let visibleSource = $state<PlayerSource | null>(null);
  let waitingSource = $state<PlayerSource | null>(null);
  let visibleRealization = $state.raw<ModeRealization | null>(null);
  let railRealization = $state.raw<ModeRealization | null>(null);
  let queuedLayer: PlayerLayer | null = null;
  let crossfadeOutgoing = $state<PlayerSource | null>(null);
  let activeTransitionId: number | null = null;
  let stageScheduled = false;
  let railUpdateFrame: number | null = null;
  let railSequenceUpdateFrame: number | null = null;
  let readinessTimer: ReturnType<typeof setTimeout> | null = null;
  // These live at the drill level rather than inside a keyed player snippet.
  // A canvas may report initialization after its retiring snippet is gone; a
  // root-owned derived remains valid for that final callback.
  const firstPlaybackAllowed = $derived(
    visibleSource === "first" ||
      waitingSource === "first" ||
      crossfadeOutgoing === "first"
  );
  const secondPlaybackAllowed = $derived(
    visibleSource === "second" ||
      waitingSource === "second" ||
      crossfadeOutgoing === "second"
  );
  const transitionRecorder = getShapeMatrixTransitionRecorder();
  const playerReadiness: Record<PlayerSource, PlayerReadiness> = {
    first: {
      key: null,
      canvasReady: false,
      sequenceReady: false,
      motionReady: false,
    },
    second: {
      key: null,
      canvasReady: false,
      sequenceReady: false,
      motionReady: false,
    },
  };
  const playerCanvasInitialized: Record<PlayerSource, boolean> = {
    first: false,
    second: false,
  };

  const pairKey = $derived(
    pair ? `${propType}|${flowerKey(pair.left)}|${flowerKey(pair.right)}` : null
  );

  // The live canvas that is visible plays THIS pair. Until then the still
  // floor is the mandala on stage: a canvas still playing the previous pair
  // is hidden rather than left under the arriving picture.
  const livePlayerShowsPair = $derived(
    visibleSource !== null && getLayer(visibleSource)?.pairKey === pairKey
  );
  /**
   * The frames around the stage take a shared-element name only while a morph
   * is in flight, and only on the side that owns the detail view: arriving,
   * they are new-only and settle in; leaving, they are old-only and sink out.
   * A name held permanently would make each frame a containing block for its
   * own popovers for no gain.
   */
  const morphingFrames = $derived(
    mandalaTransition.claim && mandalaTransition.handoff
  );

  // The cell's mandala: left hand's flower merged with right hand's flower — the
  // exact merge renderCell uses for the grid tiles, so the hero IS the cell.
  const heroPaths = $derived.by<MandalaPaths | null>(() => {
    if (!pair) return null;
    return {
      // A solo draws the header's own mandala: the other hand's paths are
      // left out, so the hero is the artwork that was pressed.
      left:
        solo === "right"
          ? []
          : (data.left.get(flowerKey(pair.left))?.left ?? []),
      right:
        solo === "left"
          ? []
          : (data.right.get(flowerKey(pair.right))?.right ?? []),
      purple: [],
    };
  });

  // Build the selected relationship first, then fill the remaining five one
  // frame at a time. Prop-first phase searches are cheap, but yielding between
  // hand paths keeps rapid selection from competing with the moving canvas.
  const realizationCache = new Map<string, ModeRealization[]>();
  let realizationChoicesKey: string | null = null;
  let pendingRealizationChoices: {
    cacheKey: string;
    layerKey: string;
    values: ModeRealization[];
  } | null = null;

  interface PlayerLoadFailure {
    key: string;
    source: PlayerSource;
    retry: () => void;
  }
  let playerLoadFailure = $state<PlayerLoadFailure | null>(null);

  function realizationKey(
    realization: ModeRealization,
    shapeKey: string
  ): string {
    return `${realization.mode}|${realization.propMode ?? "auto"}|${shapeKey}`;
  }

  function nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function realizationForSelection(
    candidates: ModeRealization[],
    requestedMode: VtgMode,
    requestedPropMode: VtgMode | null,
    allowFallback: boolean
  ): ModeRealization | null {
    const handCandidates = candidates.filter(
      (candidate) => candidate.mode === requestedMode
    );
    if (requestedPropMode) {
      const requested = handCandidates.find(
        (candidate) => candidate.propMode === requestedPropMode
      );
      if (requested) return requested;
      return allowFallback
        ? (handCandidates[0] ?? candidates[0] ?? null)
        : (handCandidates[0] ?? null);
    }
    return handCandidates[0] ?? (allowFallback ? candidates[0] : null) ?? null;
  }

  function syncSelection(
    realization: ModeRealization,
    requestedMode: VtgMode,
    requestedPropMode: VtgMode | null
  ): void {
    if (realization.mode !== requestedMode) {
      selectedMode = realization.mode;
      onmodechange?.(realization.mode);
    }
    if (realization.propMode !== requestedPropMode) {
      selectedPropMode = realization.propMode;
      onpropmodechange?.(realization.propMode);
    }
  }

  $effect(() => {
    const p = pair;
    const key = pairKey;
    const requestedMode = selectedMode;
    const requestedPropMode = selectedPropMode;
    if (!p || !key || !requestedMode) {
      realizations = [];
      activeBuiltRealization = null;
      return;
    }
    const cacheKey = key;
    const layerKey = `${requestedMode}|${requestedPropMode ?? "auto"}|${key}`;
    const transitionId = transitionRecorder.claimLatest(layerKey);
    transitionRecorder.buildStarted(transitionId);
    const cached = realizationCache.get(cacheKey);
    if (cached) {
      activeBuildTransitionId = transitionId;
      transitionRecorder.buildReady(transitionId);
      const selectedRealization = realizationForSelection(
        cached,
        requestedMode,
        requestedPropMode,
        true
      );
      activeBuiltRealization = selectedRealization;
      if (selectedRealization)
        syncSelection(selectedRealization, requestedMode, requestedPropMode);
      if (!selectedRealization) transitionRecorder.superseded(transitionId);
      if (realizationChoicesKey === cacheKey) {
        realizations = cached;
        pendingRealizationChoices = null;
        building = false;
      } else if (selectedRealization) {
        // The full picker payload does not affect the selected frame. Keep it
        // out of the canvas sequence-swap window and publish it only after the
        // canonical crossfade reports that the new source has settled.
        pendingRealizationChoices = {
          cacheKey,
          layerKey,
          values: cached,
        };
        building = true;
      } else {
        pendingRealizationChoices = null;
        building = false;
      }
      buildError = false;
      return;
    }
    building = true;
    buildError = false;
    activeBuiltRealization = null;
    const overlay = {
      left: data.left.get(flowerKey(p.left))?.left ?? [],
      right: data.right.get(flowerKey(p.right))?.right ?? [],
      tipPoint: data.tipPoint,
      clubTipDx: data.clubTipDx,
    };
    let cancelled = false;
    (async () => {
      try {
        const primaryCandidates = await buildModeRealizationCandidates(
          p,
          overlay,
          requestedMode
        );
        const primary = realizationForSelection(
          primaryCandidates,
          requestedMode,
          requestedPropMode,
          false
        );
        if (cancelled) return;
        activeBuildTransitionId = transitionId;
        activeBuiltRealization = primary;
        if (primary) transitionRecorder.buildReady(transitionId);

        const built = [...primaryCandidates];
        // Once a realization is already visible, the selected relationship gets
        // the frame budget until its replacement has finished fading in. The
        // other five relationships only populate picker choices, so building
        // them inside the handoff steals frames without changing what is shown.
        if (visibleSource !== null) {
          await nextFrame();
          while (
            !cancelled &&
            (stageScheduled ||
              waitingSource !== null ||
              activeTransitionId !== null)
          ) {
            await nextFrame();
          }
        }
        for (const mode of MODE_ORDER) {
          if (mode === requestedMode) continue;
          await nextFrame();
          if (cancelled) return;
          const candidates = await buildModeRealizationCandidates(
            p,
            overlay,
            mode
          );
          if (cancelled) return;
          built.push(...candidates);
        }
        built.sort(
          (left, right) =>
            MODE_ORDER.indexOf(left.mode) - MODE_ORDER.indexOf(right.mode)
        );
        if (!cancelled) {
          realizationCache.set(cacheKey, built);
          realizations = built;
          realizationChoicesKey = cacheKey;
          pendingRealizationChoices = null;
          const selectedRealization = realizationForSelection(
            built,
            requestedMode,
            requestedPropMode,
            true
          );
          activeBuiltRealization = selectedRealization;
          if (!primary && selectedRealization) {
            transitionRecorder.buildReady(transitionId);
          }
          if (selectedRealization)
            syncSelection(
              selectedRealization,
              requestedMode,
              requestedPropMode
            );
          if (!selectedRealization) transitionRecorder.superseded(transitionId);
          building = false;
        }
      } catch (err) {
        // Without this, a rejected build leaves the chips pointing at nothing
        // with no signal — surface it on the caption line, keep chips usable.
        console.error("shape-matrix elemental drill build failed", err);
        if (!cancelled) {
          transitionRecorder.superseded(transitionId);
          buildError = true;
          building = false;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  const activeReal = $derived(activeBuiltRealization);
  function propElementalTypeOf(
    realization: ModeRealization | null
  ): ElementalType | null {
    return realization?.propRelationship.kind === "full"
      ? (realization.propRelationship.element.element as ElementalType)
      : null;
  }

  const railPropElementalType = $derived(propElementalTypeOf(railRealization));
  const availableHandModes = $derived(
    MODE_ORDER.filter((mode) =>
      realizations.some((realization) => realization.mode === mode)
    )
  );
  // Mode picked but absent from a completed build (a dropped mode is never
  // substituted) → same caption-line error as a failed build.
  const modeMissing = $derived(
    selectedMode !== null &&
      pair !== null &&
      !building &&
      !buildError &&
      !activeReal
  );
  const captionRealization = $derived(visibleRealization ?? activeReal);

  // The word header lives in a drill-owned band ABOVE the square, not inside
  // the player. Inside the player it sits over the top of the frame and the
  // live canvas letterboxes beneath it, so the still floor's centered square
  // and the canvas's square disagree by half the header's height. With the
  // band outside, `.hero-frame` IS the canvas region and MandalaHeroLayer's
  // inscribed square is the canvas's inscribed square. The band reserves its
  // height with a ghost header so the frame's geometry is identical before a
  // realization exists (the shared-element morph snapshots that moment).
  let wordHeaderVisible = $state(true);
  let headerDarkMode = $state(true);
  $effect(() => {
    const visibility = animationState.scope.visibility;
    const sync = () => {
      wordHeaderVisible = visibility.getVisibility("wordHeader");
      headerDarkMode = visibility.isDarkMode();
    };
    sync();
    visibility.registerObserver(sync);
    return () => visibility.unregisterObserver(sync);
  });
  const headerSequence = $derived(captionRealization?.seq ?? null);
  $effect(() => {
    if (appState) animationState.setPreviewSequence(headerSequence);
  });
  /* The badge names the level the pair sits on in this engine, one to four.
     The browse calculator knows three levels and read every quarter-turn pair
     as level 3. */
  const headerDifficulty = $derived(
    headerSequence?.steps?.length && pair
      ? levelForTurns(pair.left.turns, pair.right.turns)
      : null
  );
  const headerLoopDisplay = $derived.by(() => {
    if (!headerSequence) return null;
    const resolver = tryGetLoopDisplayResolver();
    return resolver ? resolver(headerSequence) : null;
  });
  const headerStepNumber = $derived(
    headerSequence?.steps?.length &&
      visibleStep >= 1 &&
      visibleStep < headerSequence.steps.length + 0.99
      ? Math.floor(visibleStep)
      : null
  );
  const visibleStep = $derived(
    visibleSource === "first"
      ? firstStep
      : visibleSource === "second"
        ? secondStep
        : 0
  );
  function pictographArrowsApproved(flower: Flower): boolean {
    return flower.turns === "fl" || Number.isInteger(flower.turns * 2);
  }
  const pictographRailReady = $derived(
    pair !== null &&
      pictographArrowsApproved(pair.left) &&
      pictographArrowsApproved(pair.right)
  );

  function getLayer(source: PlayerSource | null): PlayerLayer | null {
    if (source === "first") return firstLayer;
    if (source === "second") return secondLayer;
    return null;
  }

  function clearReadinessTimer(): void {
    if (readinessTimer !== null) clearTimeout(readinessTimer);
    readinessTimer = null;
  }

  function armReadinessTimer(
    callback: () => void,
    delay = DURATION.dramatic * 4
  ): void {
    clearReadinessTimer();
    readinessTimer = setTimeout(callback, delay);
  }

  function setLayer(source: PlayerSource, layer: PlayerLayer | null): void {
    clearReadinessTimer();
    if (playerLoadFailure?.source === source) playerLoadFailure = null;
    playerReadiness[source] = {
      key: layer?.key ?? null,
      canvasReady: playerCanvasInitialized[source],
      sequenceReady: false,
      motionReady: false,
    };
    if (source === "first") {
      firstLayer = layer;
      firstStep = 0;
    } else {
      secondLayer = layer;
      secondStep = 0;
    }
  }

  function setSourceStep(source: PlayerSource, step: number): void {
    if (source === "first") firstStep = step;
    else secondStep = step;
  }

  function stageLayer(layer: PlayerLayer): void {
    if (getLayer(visibleSource)?.key === layer.key) {
      transitionRecorder.superseded(layer.transitionId);
      if (queuedLayer) transitionRecorder.superseded(queuedLayer.transitionId);
      queuedLayer = null;
      if (waitingSource) {
        const waitingLayer = getLayer(waitingSource);
        if (waitingLayer)
          transitionRecorder.superseded(waitingLayer.transitionId);
        setLayer(waitingSource, null);
        waitingSource = null;
      }
      commitPendingRealizationChoices(layer.key);
      return;
    }

    if (activeTransitionId !== null) {
      if (queuedLayer) transitionRecorder.superseded(queuedLayer.transitionId);
      queuedLayer = layer;
      return;
    }

    const incoming = visibleSource === "first" ? "second" : "first";
    const replacedLayer = getLayer(incoming);
    if (replacedLayer)
      transitionRecorder.superseded(replacedLayer.transitionId);
    setLayer(incoming, layer);
    waitingSource = incoming;
    const expectedKey = layer.key;
    let coldStartExtensionUsed = false;
    const expireWaitingLayer = () => {
      readinessTimer = null;
      if (waitingSource !== incoming || getLayer(incoming)?.key !== expectedKey)
        return;
      // A first visit may still be parsing the animation engine when the
      // ordinary handoff deadline arrives. There is no outgoing player to
      // protect, so keep the mandala floor visible and give the cold module one
      // extended window instead of permanently deleting the canvas.
      if (visibleSource === null && !coldStartExtensionUsed) {
        coldStartExtensionUsed = true;
        armReadinessTimer(expireWaitingLayer, DURATION.dramatic * 16);
        return;
      }
      transitionRecorder.superseded(layer.transitionId);
      commitPendingRealizationChoices(expectedKey);
      setLayer(incoming, null);
      waitingSource = null;
      const queued = queuedLayer;
      queuedLayer = null;
      if (queued) stageLayer(queued);
    };
    // Retargeting owns exactly one readiness deadline. Arming the replacement
    // always cancels the superseded layer's pending timeout first.
    armReadinessTimer(expireWaitingLayer);
  }

  function finishCrossfade(active: PlayerSource): void {
    if (visibleSource !== active || activeTransitionId === null) return;

    const settledLayer = getLayer(active);
    transitionRecorder.settled(activeTransitionId);
    activeTransitionId = null;
    crossfadeOutgoing = null;
    if (railUpdateFrame !== null) cancelAnimationFrame(railUpdateFrame);
    if (railSequenceUpdateFrame !== null)
      cancelAnimationFrame(railSequenceUpdateFrame);
    if (settledLayer) {
      commitPendingRealizationChoices(settledLayer.key);
      const settledKey = settledLayer.key;
      railUpdateFrame = requestAnimationFrame(() => {
        railUpdateFrame = null;
        if (visibleSource !== active || getLayer(active)?.key !== settledKey)
          return;
        visibleRealization = settledLayer.realization;
        railSequenceUpdateFrame = requestAnimationFrame(() => {
          railSequenceUpdateFrame = null;
          if (visibleSource !== active || getLayer(active)?.key !== settledKey)
            return;
          railRealization = settledLayer.realization;
        });
      });
    }
    const queued = queuedLayer;
    queuedLayer = null;
    if (queued) {
      stageLayer(queued);
      return;
    }

    // The first cell initially needs only one player, but the first subsequent
    // shape change must not pay to construct a second animation engine inside
    // the handoff. Mount its hidden twin after the opening fade has settled.
    // Sequence loading still happens while playbackAllowed is false, so later
    // swaps reuse an initialized canvas and only replace its sequence.
    const standby: PlayerSource = active === "first" ? "second" : "first";
    if (!getLayer(standby) && settledLayer) {
      setLayer(standby, {
        ...settledLayer,
        transitionId: 0,
      });
    }
  }

  function revealReadyPlayer(source: PlayerSource, key: string): void {
    if (waitingSource !== source) return;
    const layer = getLayer(source);
    const readiness = playerReadiness[source];
    if (
      !layer ||
      layer.key !== key ||
      readiness.key !== key ||
      !readiness.canvasReady ||
      !readiness.sequenceReady ||
      !readiness.motionReady
    )
      return;

    waitingSource = null;
    clearReadinessTimer();
    crossfadeOutgoing = visibleSource;
    activeTransitionId = layer.transitionId;
    visibleSource = source;
    transitionRecorder.fadeStarted(layer.transitionId);
  }

  function commitPendingRealizationChoices(layerKey: string): void {
    const pending = pendingRealizationChoices;
    if (!pending || pending.layerKey !== layerKey) return;
    realizations = pending.values;
    realizationChoicesKey = pending.cacheKey;
    pendingRealizationChoices = null;
    building = false;
  }

  function registerPlayerRetry(
    _node: HTMLElement,
    initial: PlayerLoadFailure
  ): { update: (failure: PlayerLoadFailure) => void; destroy: () => void } {
    let current = initial;
    const register = (failure: PlayerLoadFailure) => {
      current = failure;
      playerLoadFailure = failure;
      commitPendingRealizationChoices(failure.key);
      if (waitingSource === failure.source) clearReadinessTimer();
    };
    register(initial);
    return {
      update: register,
      destroy: () => {
        if (playerLoadFailure?.retry === current.retry) {
          playerLoadFailure = null;
        }
      },
    };
  }

  function retryPlayerLoad(failure: PlayerLoadFailure): void {
    playerLoadFailure = null;
    const layer = getLayer(failure.source);
    if (layer?.key === failure.key && waitingSource === failure.source) {
      armReadinessTimer(() => {
        if (
          waitingSource !== failure.source ||
          getLayer(failure.source)?.key !== failure.key
        )
          return;
        transitionRecorder.superseded(layer.transitionId);
        commitPendingRealizationChoices(failure.key);
        setLayer(failure.source, null);
        waitingSource = null;
        const queued = queuedLayer;
        queuedLayer = null;
        if (queued) stageLayer(queued);
      });
    }
    failure.retry();
  }

  function handlePlayerCanvasInitialized(
    source: PlayerSource,
    key: string
  ): void {
    playerCanvasInitialized[source] = true;
    const layer = getLayer(source);
    const readiness = playerReadiness[source];
    if (!layer || layer.key !== key || readiness.key !== key) return;
    readiness.canvasReady = true;
    transitionRecorder.canvasReady(layer.transitionId);
    revealReadyPlayer(source, key);
  }

  function handlePlayerSequenceReady(
    source: PlayerSource,
    key: string,
    sequenceId: string
  ): void {
    const layer = getLayer(source);
    const readiness = playerReadiness[source];
    if (
      !layer ||
      layer.key !== key ||
      layer.realization.seq.id !== sequenceId ||
      readiness.key !== key
    )
      return;
    readiness.sequenceReady = true;
    revealReadyPlayer(source, key);
  }

  function handlePlayerMotion(
    source: PlayerSource,
    key: string,
    expectedSequenceId: string,
    currentStep: number,
    sequenceId: string | null
  ): void {
    if (getLayer(source)?.key !== key || sequenceId !== expectedSequenceId)
      return;
    const readiness = playerReadiness[source];
    // Reused players do not emit their mount-only ready callback again. A
    // matching playback event is stronger evidence that the replacement
    // sequence is loaded, and prevents a rapid axis change waiting forever.
    readiness.sequenceReady = true;
    setSourceStep(source, currentStep);
    if (waitingSource !== source || currentStep <= 1.001) return;

    const layer = getLayer(source);
    if (!layer || readiness.key !== key) return;
    if (!readiness.motionReady) {
      readiness.motionReady = true;
      transitionRecorder.motionReady(layer.transitionId);
    }
    revealReadyPlayer(source, key);
  }

  function createPlayerCallbacks(source: PlayerSource) {
    return {
      onReady: () => {
        const layer = getLayer(source);
        if (!layer) return;
        handlePlayerSequenceReady(source, layer.key, layer.realization.seq.id);
      },
      onCanvasInitialized: () => {
        const layer = getLayer(source);
        if (!layer) return;
        handlePlayerCanvasInitialized(source, layer.key);
      },
      onStepChange: (step: number, sequenceId: string | null) => {
        const layer = getLayer(source);
        if (!layer) return;
        handlePlayerMotion(
          source,
          layer.key,
          layer.realization.seq.id,
          step,
          sequenceId
        );
      },
    };
  }

  // CanvasSurface treats callback changes as engine-configuration changes.
  // These wrappers stay stable while reading each source's current layer, so a
  // cell change reloads the existing player instead of rebuilding its engine.
  const playerCallbacks = {
    first: createPlayerCallbacks("first"),
    second: createPlayerCallbacks("second"),
  } satisfies Record<PlayerSource, ReturnType<typeof createPlayerCallbacks>>;

  function clearPlayers(): void {
    transitionRecorder.clearOpen();
    firstLayer = null;
    secondLayer = null;
    firstStep = 0;
    secondStep = 0;
    visibleSource = null;
    waitingSource = null;
    visibleRealization = null;
    railRealization = null;
    realizationChoicesKey = null;
    pendingRealizationChoices = null;
    queuedLayer = null;
    crossfadeOutgoing = null;
    activeTransitionId = null;
    clearReadinessTimer();
    playerReadiness.first = {
      key: null,
      canvasReady: false,
      sequenceReady: false,
      motionReady: false,
    };
    playerReadiness.second = {
      key: null,
      canvasReady: false,
      sequenceReady: false,
      motionReady: false,
    };
    playerCanvasInitialized.first = false;
    playerCanvasInitialized.second = false;
  }

  $effect(() => {
    if (!pair) return;
    // Start the one heavy module request while the matrix realization is being
    // built. When the player layer mounts, LazyMount receives the same promise
    // and does not begin a second request on the critical path.
    void loadAnimationPlayer().catch(() => {
      animationPlayerModule = null;
    });
  });

  $effect(() => {
    const realization = activeReal;
    const paths = heroPaths;
    const key = pairKey;

    if (!pair) {
      untrack(clearPlayers);
      return;
    }
    if (!realization || !paths || !key) return;

    stageScheduled = true;
    const frame = requestAnimationFrame(() => {
      stageScheduled = false;
      untrack(() => {
        const layerKey = realizationKey(realization, key);
        stageLayer({
          key: layerKey,
          pairKey: key,
          realization,
          paths,
          clubTipDx: data.clubTipDx,
          propType,
          transitionId:
            activeBuildTransitionId || transitionRecorder.claimLatest(layerKey),
          initialStep: entryStepFor(realization, layerKey),
        });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      stageScheduled = false;
    };
  });

  onDestroy(() => {
    if (railUpdateFrame !== null) cancelAnimationFrame(railUpdateFrame);
    if (railSequenceUpdateFrame !== null)
      cancelAnimationFrame(railSequenceUpdateFrame);
    clearPlayers();
    transitionRecorder.destroy();
  });

  function entryStepFor(realization: ModeRealization, key: string): number {
    const outgoingLayer = visibleSource ? getLayer(visibleSource) : null;
    return resolveRealizationEntryStep({
      outgoingStep: outgoingLayer ? visibleStep : 0,
      outgoingStepCount: outgoingLayer?.realization.seq.steps.length ?? 0,
      incomingStepCount: realization.seq.steps.length,
      fallbackKey: key,
    });
  }

  function selectMode(mode: VtgMode | null): void {
    if (pair && mode === null) return;
    if (pair && mode && mode !== selectedMode) {
      transitionRecorder.requested(
        `mode:${mode}:props:${selectedPropMode ?? "auto"}:${pairKey ?? "unknown"}`
      );
    }
    selectedMode = mode;
    onmodechange?.(mode);
  }

  function selectHandMode(mode: VtgMode | null): void {
    selectMode(mode);
  }

  function selectPropMode(mode: VtgMode): void {
    if (!pair || mode === selectedPropMode) return;
    transitionRecorder.requested(
      `props:${mode}:hand:${selectedMode ?? "none"}:${pairKey ?? "unknown"}`
    );
    selectedPropMode = mode;
    onpropmodechange?.(mode);
  }
</script>

{#snippet playerPlaceholder()}
  <div class="lazy-region-state player-placeholder" role="status">
    <span>Loading animation…</span>
  </div>
{/snippet}

{#snippet playerLoadError(
  _loadError: unknown,
  retry: () => void,
  source: PlayerSource,
  key: string
)}
  <div
    class="lazy-region-state player-load-error"
    use:registerPlayerRetry={{ source, key, retry }}
  >
    <p>Animation didn’t load.</p>
  </div>
{/snippet}

{#snippet firstPlayerLoadError(loadError: unknown, retry: () => void)}
  {#if firstLayer}
    {@render playerLoadError(loadError, retry, "first", firstLayer.key)}
  {/if}
{/snippet}

{#snippet secondPlayerLoadError(loadError: unknown, retry: () => void)}
  {#if secondLayer}
    {@render playerLoadError(loadError, retry, "second", secondLayer.key)}
  {/if}
{/snippet}

{#snippet railPlaceholder()}
  <div class="lazy-region-state rail-placeholder" role="status">
    <span>Loading pictographs…</span>
  </div>
{/snippet}

{#snippet railLoadError(_loadError: unknown, retry: () => void)}
  <div class="lazy-region-state rail-load-error" role="alert">
    <p>Pictographs didn’t load.</p>
    <PanelButton onclick={retry}>Try again</PanelButton>
  </div>
{/snippet}

{#snippet player(layer: PlayerLayer | null, source: PlayerSource)}
  {#if layer}
    <div class="realization-layer">
      <div
        class="realization-atmosphere"
        style={`--atmosphere-hand: ${layer.realization.element.accentColor}; --atmosphere-prop: ${layer.realization.propRelationship.element?.accentColor ?? layer.realization.element.accentColor}`}
        aria-hidden="true"
      ></div>
      <!-- Hidden while it still plays the previous pair, and while a
           shared-element capture is in flight: the still floor is the one
           mandala on stage until the live canvas for this pair is ready. -->
      <div
        class="player-layer"
        class:offstage={layer.pairKey !== pairKey}
        class:settling={!livePlayerShowsPair}
      >
        <!-- The first mount waits for the tile-to-hero morph to finish. The
             still floor is the picture that travels; loading the player and
             building its engine before the new-state capture only delays the
             morph. Once mounted, keep-alive holds the player through later
             handoffs. -->
        <LazyMount
          loader={loadAnimationPlayer}
          active={!mandalaTransition.handoff}
          debugName="shape matrix animation player"
          placeholder={playerPlaceholder}
          error={source === "first"
            ? firstPlayerLoadError
            : secondPlayerLoadError}
          props={{
            sequence: layer.realization.seq,
            autoPlay: true,
            autoPlayDelay: 0,
            chrome: "minimal",
            fill: true,
            disassemblyLayout: "auto",
            disassemblyTarget: animationState.disassembled,
            onDisassemblyTargetChange: animationState.requestDisassembled,
            // The drill owns the word header band above the square; the
            // player's own header would push its canvas below the floor.
            showWordHeader: false,
            beatIndicators: false,
            leftPropType: layer.propType,
            rightPropType: layer.propType,
            trailSettingsOverride: effectiveTrailSettings,
            tipEffectMap: animationState.scope.effects.tipEffectMap,
            effectsConfigState: animationState.scope.effects,
            visibilityManagerOverride: animationState.scope.visibility,
            externalBpm: animationState.bpm,
            externalPlaying: animationState.playing,
            externalPlaybackMode: animationState.playbackMode,
            onExternalPlayingChange: animationState.setPlaying,
            backgroundAlpha: 0,
            interactive: true,
            /* The stage is the play button. It toggles on a click, and the
               badge is how a mouse learns that -- it is hover-gated to fine
               pointers, so a touch host is unaffected. This replaced a
               dedicated button in a row below the canvas. */
            hoverHint: "badge",
            // This is a full TKA animation surface. Its canonical canvas menu
            // supplies Disassemble/Reassemble and the shared display controls.
            disableContextMenu: false,
            playbackAllowed:
              source === "first" ? firstPlaybackAllowed : secondPlaybackAllowed,
            resumeWhenPlaybackAllowed: true,
            initialStep: layer.initialStep,
            propElementalType: propElementalTypeOf(layer.realization),
            glyphFrame: "stage",
            onReady: playerCallbacks[source].onReady,
            onCanvasInitialized: playerCallbacks[source].onCanvasInitialized,
            onStepChange: playerCallbacks[source].onStepChange,
            // A handoff briefly runs two canvases. Start both at the existing
            // low tier so glow and dense subdivision work cannot block input.
            initialQualityTier: QualityTier.LOW,
          }}
        />
      </div>
    </div>
  {/if}
{/snippet}

{#snippet firstPlayer()}
  {@render player(firstLayer, "first")}
{/snippet}

{#snippet secondPlayer()}
  {@render player(secondLayer, "second")}
{/snippet}

<section
  class="drill"
  aria-label="Shape matrix realizations"
  style={captionRealization
    ? `--hand-el: ${captionRealization.element.accentColor}; --hand-dark: ${captionRealization.element.darkComplement}; --prop-el: ${captionRealization.propRelationship.element?.accentColor ?? captionRealization.element.accentColor}`
    : undefined}
>
  {#if !solo}
    <div
      class="mode-picker"
      data-focus-mode-chrome
      data-drill-region="modes"
      use:claimedViewTransitionName={{
        name: SHAPE_MATRIX_MODES_NAME,
        enabled: morphingFrames,
      }}
      transition:growFade={{ axis: "y" }}
    >
      <ElementChipRow
        selected={selectedMode}
        available={availableHandModes}
        availabilityReady={!building}
        disabled={!pair}
        onpick={selectHandMode}
      />
      <PropRelationshipChipRow
        {realizations}
        {selectedMode}
        {selectedPropMode}
        activePropMode={activeReal?.propMode ?? null}
        disabled={!pair}
        {building}
        ontarget={selectPropMode}
      />
    </div>
  {/if}

  <div class="media-stage">
    <!-- The stage rectangle is the selected matrix tile's box, arrived. It
         carries the shared stage name so the whole stage flies between the
         tile and the detail view; the mandala inside carries its own. -->
    <div
      class="hero-stage"
      data-focus-layout="matrix-canvas"
      data-drill-region="hero"
      use:claimedViewTransitionName={{
        name: SHAPE_MATRIX_ACTIVE_STAGE_NAME,
        enabled: mandalaTransition.claim,
      }}
    >
      {#if appState && !appState.compact}
        <ShapeMatrixStageActions />
      {/if}
      <div class="hero-header" data-focus-mode-chrome>
        <div class="hero-header-ghost" aria-hidden="true">
          <WordHeader word="A" visible={true} darkMode={headerDarkMode} />
        </div>
        {#if headerSequence}
          <div class="hero-header-live">
            <WordHeader
              word={headerSequence.word}
              visible={wordHeaderVisible}
              darkMode={headerDarkMode}
              activeStepNumber={headerStepNumber}
              difficultyLevel={headerDifficulty}
              loopComponents={headerLoopDisplay &&
              headerLoopDisplay.components.size > 0
                ? headerLoopDisplay.components
                : null}
              rotationPeriod={headerLoopDisplay?.rotationPeriod}
              inversionPeriod={headerLoopDisplay?.inversionPeriod}
              reflectionAxis={headerLoopDisplay?.reflectionAxis}
              overlayComponents={headerLoopDisplay?.overlayComponents}
            />
          </div>
        {/if}
      </div>
      <div class="hero-frame">
        {#if pair && heroPaths}
          <!-- The still mandala is a cold-load floor only. Once the canonical
               animation canvas has painted, its own trail is the sole path
               rendering owner, including while that canvas is disassembled. -->
          <MandalaHeroLayer
            paths={heroPaths}
            artKey={pairKey ?? ""}
            tipDx={data.clubTipDx}
            opacity={livePlayerShowsPair ? 0 : MANDALA_GUIDE_FLOOR_OPACITY}
            claim={mandalaTransition.claim}
            handoff={mandalaTransition.handoff}
          />
          <DualSourceCrossfade
            active={visibleSource}
            duration={DURATION.emphasis}
            profile="soft-dissolve"
            first={firstPlayer}
            second={secondPlayer}
            onsettled={finishCrossfade}
          />
          {#if playerLoadFailure}
            <div class="player-load-notice" role="alert">
              <p>Animation didn’t load.</p>
              <PanelButton onclick={() => retryPlayerLoad(playerLoadFailure)}
                >Try again</PanelButton
              >
            </div>
          {/if}
        {:else}
          <div class="hero-hint">
            <p class="hint-lead">Pick a cell</p>
            <p class="hint-sub">
              Its shape opens here. Each element traces it live.
            </p>
          </div>
        {/if}
      </div>
    </div>

    <!-- The carousel is its own card below the canvas box, never part of
           the rectangle that flies. During the morph it carries its own
           name and rises in once the stage has landed. -->
    <div
      class="strip-zone"
      data-focus-mode-chrome
      data-drill-region="strip"
      role="group"
      aria-label="Pictograph timeline"
      use:claimedViewTransitionName={{
        name: SHAPE_MATRIX_STRIP_NAME,
        enabled: morphingFrames,
      }}
      transition:growFade={{ axis: "y" }}
    >
      {#if railRealization && pictographRailReady}
        <LazyMount
          loader={() => import("$lib/shared/timeline/StepStrip.svelte")}
          active={true}
          keepAlive={false}
          debugName="shape matrix pictograph carousel"
          placeholder={railPlaceholder}
          error={railLoadError}
          props={{
            sequence: railRealization.seq,
            includeStartPosition: false,
            currentStep: visibleStep,
            bpm: animationState.bpm,
            density: "compact",
            fillHeight: true,
            anchor: "center",
            orientation: "horizontal",
            loop: true,
            leftPropType: propType,
            rightPropType: propType,
            propElementalType: railPropElementalType,
            stepPulse: false,
            staggerCellUpdates: true,
          }}
        />
      {:else if railRealization}
        <p class="quarter-status">
          Level 4 pictograph are in visual calibration.
        </p>
      {/if}
    </div>
  </div>

  <!-- The control bar is below the stage, not inside it. It settles in as the
       last frame of the wave rather than arriving complete under the flight.
       A wide host keeps every ability in the customize workspace over the
       grid, so its bar is one Customize button and the transport. Compact
       hosts keep the pill dock: each pill opens its sheet there, and Props
       routes to the canonical prop sheet. -->
  <!-- Compact hosts only. A wide host has no control band at all now: the
       canvas is the play button and the gear sits in its corner, which gave
       back a row that was carrying one button at each end of a wide gap. -->
  {#if !appState || appState.compact}
    <div
      class="animation-controls"
      data-focus-mode-chrome
      data-focus-layout={appState?.surface === "matrix" ? "picker" : undefined}
      data-drill-region="controls"
      data-shape-matrix-dock
      use:claimedViewTransitionName={{
        name: SHAPE_MATRIX_CONTROLS_NAME,
        enabled: morphingFrames,
      }}
    >
      <AnimationPanel
        isExporting={false}
        layout="bottom"
        presentation={appState ? "navigation" : "full"}
        controlledSection={appState ? animationState.activeSection : undefined}
        isPlaying={animationState.playing}
        bpm={animationState.bpm}
        playbackMode={animationState.playbackMode}
        onPlaybackToggle={animationState.togglePlaying}
        onPlaybackModeChange={animationState.setPlaybackMode}
        onBpmChange={animationState.setBpm}
        showEffectsPlayback={false}
        selectedPropType={propType}
        onPropChange={onproptypechange}
        onPropPickerRequest={onproppickertoggle}
        propPickerActive={propPickerOpen}
        sequence={captionRealization?.seq ?? null}
        dockTrailingAction={playbackAction}
        showPathShape={false}
        showMotionVisibility={true}
        onActiveSectionChange={animationState.setActiveSection}
        closeRequest={animationState.closeRequest}
        regionLabel="Shape animation controls"
      />
    </div>
  {/if}

  {#if onselectRealization}
    <div class="select-action" class:available={visibleRealization !== null}>
      <PanelButton
        variant="primary"
        disabled={!visibleRealization}
        onclick={() =>
          visibleRealization && onselectRealization(visibleRealization)}
      >
        <i class="fas fa-person-running" aria-hidden="true"></i>
        {selectLabel}
      </PanelButton>
    </div>
  {/if}
</section>

<style>
  /* Fills whatever height its host gives it: the route's .drill-pane is a
     fixed-height flex box (matched to the matrix stage on wide screens). */
  .drill {
    position: relative;
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    grid-template-areas:
      "modes"
      "media"
      "controls"
      "action";
    min-height: 0;
    gap: 0.8rem;
    background:
      radial-gradient(
        circle at 10% 8%,
        color-mix(in srgb, var(--hand-el, transparent) 5%, transparent),
        transparent 34%
      ),
      radial-gradient(
        circle at 92% 92%,
        color-mix(in srgb, var(--prop-el, transparent) 5%, transparent),
        transparent 38%
      );
  }

  .mode-picker {
    grid-area: modes;
    display: grid;
    gap: 0.45rem;
    min-width: 0;
    min-height: 0;
  }

  /* Two containers, not one frame: the canvas box the tile flies into, and
     the carousel card under it. Chrome on this wrapper would make the strip
     read as part of the travelling rectangle. */
  .media-stage {
    grid-area: media;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas:
      "hero"
      "strip";
  }

  /* container-type: size makes cqw/cqh resolve against the animation region,
     so the square can take min(height, width) without measuring in JS. */
  .hero-stage {
    grid-area: hero;
    position: relative;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    place-items: center;
    container-type: size;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    border-radius: 16px;
    background:
      radial-gradient(
        circle at 32% 42%,
        color-mix(in srgb, var(--hand-el, transparent) 9%, transparent),
        transparent 54%
      ),
      radial-gradient(
        circle at 68% 58%,
        color-mix(in srgb, var(--prop-el, transparent) 9%, transparent),
        transparent 54%
      ),
      var(--theme-card-bg, #0a0f14);
  }

  .strip-zone {
    grid-area: strip;
    height: clamp(4.25rem, 13cqh, 6.5rem);
    min-width: 0;
    min-height: 0;
    /* Its own gap, so a tier that hides the strip leaves no empty track. */
    margin-top: 0.5rem;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    border-radius: 12px;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #101721) 74%,
      var(--theme-card-bg, #0a0f14)
    );
  }
  .quarter-status {
    display: grid;
    place-content: center;
    height: 100%;
    margin: 0;
    padding: 0.75rem;
    color: var(--theme-text-dim, oklch(0.68 0.02 270));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
    text-align: center;
  }

  /* The stage frame owns all available geometry. MandalaHeroLayer and the
     animation renderer independently keep their motion planes square while
     the word and four corner annotations can use the rectangular edges. */
  .hero-frame {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  /* Ghost-sizer: the live header and a hidden one-letter header share one
     grid cell, so the band keeps its height while no realization exists and
     the square below never moves when the word arrives. */
  .hero-header {
    width: 100%;
    display: grid;
    align-items: center;
  }
  /* Both wrappers are drill-owned elements, so the scoped child selector
     matches them (a child component's root would not carry this scope). */
  .hero-header-ghost,
  .hero-header-live {
    grid-area: 1 / 1;
    min-width: 0;
  }
  .hero-header-ghost {
    visibility: hidden;
    pointer-events: none;
  }

  .player-layer {
    position: absolute;
    inset: 0;
  }
  .player-layer.offstage {
    visibility: hidden;
  }
  /* This layer is empty while the stage flies and for as long as the engine
     takes to build. It holds at zero and fades up the frame the live player
     actually shows this pair, so the stage glyph and the step number arrive
     as the closing beat of the settle wave instead of appearing at once. */
  .player-layer.settling {
    opacity: 0;
  }
  .player-layer:not(.settling) {
    transition: opacity var(--duration-emphasis) var(--ease-out);
  }

  .lazy-region-state {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.55rem;
    padding: 0.75rem;
    text-align: center;
    color: var(--theme-text-dim, oklch(0.68 0.02 270));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
  }

  .lazy-region-state p,
  .player-load-notice p {
    margin: 0;
  }

  .player-placeholder {
    background: color-mix(
      in srgb,
      var(--theme-card-bg, #0a0f14) 88%,
      transparent
    );
  }

  .player-load-error,
  .rail-load-error {
    color: var(--semantic-error, #fb8a8a);
  }

  .player-load-notice {
    position: absolute;
    z-index: 3;
    left: 50%;
    bottom: 1rem;
    translate: -50% 0;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    max-width: calc(100% - 2rem);
    padding: 0.55rem 0.7rem 0.55rem 0.9rem;
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #fb8a8a) 45%, transparent);
    border-radius: 999px;
    background: var(--theme-panel-bg, #101721);
    color: var(--semantic-error, #fb8a8a);
    box-shadow: 0 0.5rem 1.5rem var(--theme-shadow, rgb(0 0 0 / 0.4));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
  }

  .realization-layer {
    position: absolute;
    inset: 0;
    isolation: isolate;
  }

  .realization-atmosphere {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background:
      radial-gradient(
        circle at 36% 42%,
        color-mix(in srgb, var(--atmosphere-hand) 13%, transparent),
        transparent 58%
      ),
      radial-gradient(
        circle at 64% 58%,
        color-mix(in srgb, var(--atmosphere-prop) 13%, transparent),
        transparent 58%
      );
  }

  .hero-hint {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    text-align: center;
    gap: 0.3rem;
    padding: 1.5rem;
  }
  .hint-lead {
    margin: 0;
    font-size: clamp(1.05rem, 1rem + 0.2vw, 1.3rem);
    font-weight: 700;
    color: var(--theme-text, oklch(0.92 0.02 270));
  }
  .hint-sub {
    margin: 0;
    font-size: clamp(var(--font-size-min, 0.875rem), 0.82rem + 0.12vw, 0.95rem);
    line-height: 1.55;
    color: var(--theme-text-dim, oklch(0.68 0.02 270));
  }

  .animation-controls {
    grid-area: controls;
    min-width: 0;
    min-height: 0;
  }
  .select-action {
    grid-area: action;
    min-height: var(--min-touch-target, 44px);
    visibility: hidden;
  }
  .select-action.available {
    visibility: visible;
  }
  .select-action :global(.panel-btn) {
    width: 100%;
  }
  /* Phone-height realizations keep the live animation legible. The dedicated
     rail returns as soon as the host has enough width to show it without
     reducing the hero to a thumbnail. */
  @container shape-matrix-drill (max-width: 25rem) {
    .drill {
      grid-template-rows: auto minmax(0, 1fr) auto auto;
      grid-template-areas:
        "modes"
        "media"
        "controls"
        "action";
    }

    .strip-zone {
      display: none;
    }
  }

  /* A short-wide host is height-bound, not width-bound. Put the element picker
     beside the hero and let the animation take the full available height. The
     carousel is deliberately omitted in this one composition because even a
     compact rail would make the primary visual smaller. */
  @container shape-matrix-drill (min-width: 42rem) and (max-height: 24rem) {
    .drill {
      display: grid;
      grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
      grid-template-areas:
        "modes media"
        "action controls";
      column-gap: 0.8rem;
      row-gap: 0.55rem;
    }

    .mode-picker {
      grid-area: modes;
      align-self: center;
    }

    .strip-zone {
      display: none;
    }

    .select-action {
      grid-area: action;
    }
  }
</style>
