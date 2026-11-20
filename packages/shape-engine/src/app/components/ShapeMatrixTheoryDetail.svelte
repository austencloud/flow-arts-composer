<!-- packages/shape-engine/src/app/components/ShapeMatrixTheoryDetail.svelte
  The Theory surface's detail pane: the cell you picked in the grid, playing.

  It is the counterpart of the Matrix drill and it is built like one, on
  purpose: the six timing-and-direction elements across the top, the animation
  under them, the shared control dock along the bottom. The grid says which
  pair; this says what that pair DOES.

  The dock is the same component the drill mounts, reading the same animation
  scope, so Effects, Props, Effort, Playback and Display are one set of choices
  that follow you across the surface switch rather than two sets that drift. The
  ratio pair is the thing the switch changes; how the ratio is played is not.

  A ratio is chosen by picking a cell, which is how the Matrix has always
  worked. There were sliders here for a while and they answered a different
  question: they let you scrub the open values BETWEEN ratios, which is a real
  thing to look at, a meaningless thing to link to, and a second way to do what
  the grid already does. -->
<script lang="ts">
  import { untrack } from "svelte";
  import { s as t } from "../../strings.svelte.js";
  import { spinRatioKey } from "@vtg/domain";
  import { MANDALA_STANDARD_TIP_DX } from "#lib/shared/mandala/domain/mandala-constants.js";
  import { traceScaledPath } from "@tka/shape-domain";
  import {
    propReachInHandRadii,
    theoryStageExtentBoxRatio,
    theoryStagePaths,
  } from "../../services/theory-matrix-artwork.js";
  import { claimedViewTransitionName } from "#lib/shared/transitions/claimed-view-transition-name.js";
  import {
    SHAPE_MATRIX_ACTIVE_STAGE_NAME,
    SHAPE_MATRIX_CONTROLS_NAME,
    SHAPE_MATRIX_FIGURE_NAME,
    SHAPE_MATRIX_MODES_NAME,
    SHAPE_MATRIX_STAGE_HEAD_NAME,
    SHAPE_MATRIX_STAGE_TRANSPORT_NAME,
    SHAPE_MATRIX_STRIP_NAME,
  } from "../../services/shape-matrix-artwork.js";
  import MandalaHeroLayer from "../../components/MandalaHeroLayer.svelte";
  import { shapeMatrixTipPoint } from "../../services/shape-matrix-flowers.js";
  import {
    foldUntraceablePropPair,
    shapeMatrixPickerProps,
  } from "../../services/prop-pair.js";
  import {
    isStationaryRatio,
    theoryKnobs,
    theorySoloKnobs,
    type TheoryFlower,
  } from "@tka/shape-domain";
  import { tryGetViewerVisibilityContext } from "#lib/shared/sequence-viewer/context/viewer-visibility-context.js";
  import type { VtgMode } from "../../services/shape-matrix-realizations.js";
  import { theoryPropRelationship } from "@tka/shape-domain";
  import { theoryRatioLabel } from "@tka/shape-domain";
  import {
    FAMILY_BY_MODE,
    propModeOf,
  } from "../../services/build-mode-realizations.js";
  import { TND_BY_FAMILY } from "#lib/features/choreo-card/domain/tnd-element.js";
  import ElementChipRow from "../../components/ElementChipRow.svelte";
  import PropRelationshipChipRow, {
    type RelationshipBridgeEntry,
  } from "../../components/PropRelationshipChipRow.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import AnimationPanel from "#lib/shared/animation-panel/components/AnimationPanel.svelte";
  import ShapeMatrixStageActions from "../../components/ShapeMatrixStageActions.svelte";
  import UnifiedTimeline from "#lib/shared/timeline/UnifiedTimeline.svelte";
  import type { UnifiedPlaybackContext } from "#lib/shared/timeline/unified-playback-context.js";
  import { registerShapeMatrixPlaybackShortcut } from "../services/shape-matrix-playback-shortcut";
  import { growFade } from "@austencloud/motion";
  import { flightGrowFade } from "../../services/flight-grow-fade";
  import { CANVAS2D_HOSTED_EFFECTS } from "#lib/shared/effects/services/canvas2d-effect-host.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import { getShapeMatrixAnimationContext } from "../context/shape-matrix-animation-context";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import ShapeMatrixLiveRatioStage, {
    type LiveHand,
  } from "./ShapeMatrixLiveRatioStage.svelte";
  import {
    engineOwnsPropPicker,
    getShapeEngineHostContext,
  } from "../context/shape-engine-host-context";

  const app = getShapeMatrixAppContext();
  // Inside the Composer the bottom bar picks props; no Props pill here.
  const picksProps = $derived(
    engineOwnsPropPicker(getShapeEngineHostContext().variant)
  );
  /*
   * Set once by the app shell and shared with the Matrix drill. Both surfaces
   * hold the same object, which is what makes a prop chosen on one the prop
   * playing on the other.
   */
  const animationState = getShapeMatrixAnimationContext();
  const BLUE = "var(--dm-motion-blue, #3575e2)";
  const RED = "var(--dm-motion-red, #ed1c24)";
  /*
   * The two inks. The account's saved hand colours where it has them, the
   * theme's motion colours otherwise: the same choice the Matrix drill's
   * canvas and the grid tiles on both surfaces make, so a green left prop in
   * the grid is a green left prop on this stage.
   */
  const propColors = $derived(getSettings().primaryPropColors ?? null);
  const leftInk = $derived(propColors?.left ?? BLUE);
  const rightInk = $derived(propColors?.right ?? RED);

  /*
   * What this stage can actually draw, plus trails. The effects roster is the
   * whole product's, and most of it needs a WebGL pass or a realized sequence
   * that a bare ratio does not have. Offering a tile that lights up and changes
   * nothing is worse than not offering it.
   */
  const THEORY_EFFECTS = ["trails", ...CANVAS2D_HOSTED_EFFECTS] as const;

  /*
   * Each hand's reach, in hand-orbit radii. The tiles in the grid are already
   * drawn at it, and drawing the animation at a flat one prop length gave the
   * same flower different proportions in the two places. Theory paths come from
   * the model rather than from a realized sequence, so the grid can render
   * before the pictograph data lands; the standard staff covers that wait,
   * exactly as it does for the tiles.
   */
  const propReach = $derived({
    left: propReachInHandRadii(app.data?.reach.left ?? MANDALA_STANDARD_TIP_DX),
    right: propReachInHandRadii(
      app.data?.reach.right ?? MANDALA_STANDARD_TIP_DX
    ),
  });

  /*
   * What the stage actually draws, as opposed to what the picker is aimed at.
   * A pair reload is in flight between the moment a prop is chosen and the
   * moment `app.data` catches up, and during that gap the state's hand
   * getters already name the new prop while the loaded geometry (and its
   * sprites) is still the old one. Falling back to the state only covers the
   * first load, before any pair has landed at all, and that fallback is
   * folded: the state's own props are the user's raw pick and can name a
   * prop the engine cannot trace a path for (a bare hand, a single contact
   * ball), which would ask this stage for a sprite that does not exist.
   */
  const drawnProps = $derived(
    app.data?.props ??
      foldUntraceablePropPair({
        left: app.leftPropType,
        right: app.rightPropType,
      })
  );

  /*
   * Where each hand's tracked tip sits inside its own prop's artwork. The
   * trail follows one point per prop and the drawing has to point AT that
   * point, which is a different bearing on a staff than on a fan. This reads
   * `drawnProps` rather than `data.tips`: under `trace: "hands"` the tip pair
   * is zero, and the sprite still needs its real bearing regardless of what
   * the trace is tracking.
   */
  function tipAngleFor(prop: PropType): number {
    const tip = shapeMatrixTipPoint(prop);
    return tip ? Math.atan2(tip.dy, tip.dx) : 0;
  }
  const tipAngle = $derived({
    left: tipAngleFor(drawnProps.left),
    right: tipAngleFor(drawnProps.right),
  });

  /*
   * One hand cycle is four beats, the four cardinal points, so the tempo the
   * transport sets is the tempo the hands travel at. 60 BPM is a second a beat.
   */
  const handPeriod = $derived((4 * 60000) / Math.max(1, animationState.bpm));
  let cycleProgress = $state(0);
  let seekCycle: ((progress: number) => void) | null = null;
  function handleCycleProgress(progress: number): void {
    cycleProgress = progress;
  }
  function handleSeekRef(seek: ((progress: number) => void) | null): void {
    seekCycle = seek;
  }
  const playbackAdapter: UnifiedPlaybackContext = {
    get overallProgress() {
      return cycleProgress;
    },
    get currentStep() {
      return Math.min(4, Math.floor(cycleProgress * 4) + 1);
    },
    get totalSteps() {
      return 4;
    },
    get isPlaying() {
      return animationState.playing;
    },
    get isLooping() {
      return undefined;
    },
    get duration() {
      return handPeriod / 1000;
    },
    get elapsed() {
      return (cycleProgress * handPeriod) / 1000;
    },
    get beatMarkerPositions() {
      return [0.25, 0.5, 0.75];
    },
    get bpm() {
      return animationState.bpm;
    },
    get playbackMode() {
      return animationState.playbackMode;
    },
    seek(progress) {
      seekCycle?.(progress);
    },
    togglePlay: animationState.togglePlaying,
    toggleLoop() {},
    onBpmChange: animationState.setBpm,
    onPlaybackModeChange: animationState.setPlaybackMode,
  };

  let alignToken = $state(0);
  let boundaryOpen = $state(false);

  const pair = $derived(app.theoryPair);
  /* A header choice: one ratio on stage, the other hand's prop quiet. The
     pair underneath is whole, so the heading, the pickers and the second
     hand are what a solo takes away, not the selection. */
  const solo = $derived(app.theorySoloHand);
  /* The shell scopes the animator's per-hand motion visibility and points it
     at the solo, and the Display page can change it afterwards; the stage
     draws whichever hands that owner says are on. */
  const motionVisibility = tryGetViewerVisibilityContext();

  const cellKey = $derived(
    pair
      ? `${spinRatioKey(pair.left.ratio)}|${spinRatioKey(pair.right.ratio)}`
      : ""
  );

  /*
   * What a restart is FOR.
   *
   * A trail drawn half at the old ratio and half at the new one is neither
   * flower, so the shape on the canvas would stop matching the tile that was
   * picked. Every choice that changes the shape — the pairing, either exact
   * ratio, each hand's spin and start — clears the trail and returns the hands
   * to their start. Playback, tempo, effort, prop and layer choices deliberately
   * do NOT: they change how the same shape is drawn, and interrupting it to say
   * so would be noise.
   */
  const alignKey = $derived(
    pair
      ? `${app.theoryMode}|${cellKey}|${solo ?? "pair"}` +
          `|${pair.left.style}${pair.left.ori}|${pair.right.style}${pair.right.ori}`
      : app.theoryMode
  );
  let appliedAlign = $state("");
  $effect(() => {
    if (alignKey === appliedAlign) return;
    appliedAlign = alignKey;
    alignToken += 1;
  });

  function rateOf(flower: TheoryFlower): number {
    return isStationaryRatio(flower.ratio)
      ? flower.ratio.propRotations
      : flower.ratio.propRotations / flower.ratio.handCycles;
  }

  /*
   * One closed path of this hand's own, in hand cycles: the denominator of its
   * ratio, which is how many hand circles 1:9 needs before it lands back where
   * it started. That is exactly what the tile in the grid draws, so it is
   * exactly what the trail should keep. A stationary hand closes after one prop
   * rotation, which the stage counts on the same clock.
   */
  function closureCycles(flower: TheoryFlower): number {
    if (isStationaryRatio(flower.ratio)) return 1;
    return Math.max(1, flower.ratio.handCycles);
  }

  function liveHand(
    flower: TheoryFlower,
    hand: "left" | "right",
    color: string
  ): LiveHand {
    /* A soloed hand is in its own frame, home bearing and clockwise: the
       tile's own shape, with no pairing to be offset from. */
    const knobs = solo
      ? theorySoloKnobs(flower)
      : theoryKnobs(flower, hand, app.theoryMode);
    /*
     * The mandala under the animation, from the first frame.
     *
     * It comes from the SAME knobs the stage evaluates — the paired ones, with
     * this hand's timing offset and direction in them — so the curve lies
     * exactly under the prop rather than near it. The tile beside it is the
     * unpaired shape, which is the Matrix's rule for a tile and the reason this
     * cannot just reuse the tile's geometry.
     */
    return {
      id: hand,
      rate: rateOf(flower),
      spinSign: knobs.spin === "inspin" ? 1 : -1,
      radius: knobs.radius,
      color,
      handPhase: knobs.handPhase ?? 8,
      handSign: knobs.handDirection ?? 1,
      propPhase: knobs.phase ?? 0,
      trailCycles: closureCycles(flower),
      side: hand,
      guide: traceScaledPath(knobs, { hand: 1, prop: propReach[hand] }),
    };
  }

  const leftOn = $derived(
    motionVisibility ? motionVisibility.leftMotion : solo !== "right"
  );
  const rightOn = $derived(
    motionVisibility ? motionVisibility.rightMotion : solo !== "left"
  );
  const hands = $derived<LiveHand[]>(
    pair
      ? [
          ...(leftOn ? [liveHand(pair.left, "left", leftInk)] : []),
          ...(rightOn ? [liveHand(pair.right, "right", rightInk)] : []),
        ]
      : []
  );

  /*
   * The flight between a tile and this stage, the same one the Level Matrix
   * flies between a tile and its drill, with the same names.
   *
   * The drill is mounted behind this pane, so every name here is held only
   * while this surface is the one showing, and the stage rectangle and the
   * flower only while the compact layout shows this pane. The frames around
   * the stage take their names only while a flight is running, as the drill's
   * do: arriving they settle in, leaving they sink out.
   */
  const stageShowing = $derived(
    app.compact && app.surface === "theory" && app.activeView === "detail"
  );
  const morphingFrames = $derived(stageShowing && app.mandalaHandoff);
  // The live stage draws only while it can be seen: this surface is in front,
  // and a compact layout is showing the stage rather than the grid.
  const stageVisible = $derived(
    app.surface === "theory" && (!app.compact || app.activeView === "detail")
  );
  // A flight snapshots the frame the panes change in, so a frame growing in
  // or out at that moment would be caught half size.
  const frameMotion = () =>
    app.mandalaHandoff
      ? { axis: "y" as const, duration: 0 }
      : { axis: "y" as const };

  /*
   * The still under the canvas: the picture the flight lands on and leaves
   * from. A canvas cannot travel, so this owns the flower's name while the
   * stage is showing.
   *
   * It is painted from the stage's own guides, the paired shapes with the
   * timing offset and direction in them, not from the tile, whose shapes are
   * unpaired; and at the stage's own fit, so the canvas blooms over exactly
   * these lines. The tile hands over to it in the first moments of the
   * flight, while the flower is small. A solo carries the one hand it shows.
   */
  const floorPaths = $derived(theoryStagePaths(hands));
  // The tiles take their extent fit at the pair's larger reach. The still's
  // box cancels the fit out, but painting at the same one keeps its raster
  // the tile's picture at a larger size, which is what the swap relies on.
  const floorTipDx = $derived(app.data?.clubTipDx ?? MANDALA_STANDARD_TIP_DX);
  const floorBoxRatio = $derived(
    theoryStageExtentBoxRatio(floorPaths, floorTipDx)
  );
  const floorKey = $derived(
    `${alignKey}|${leftOn ? "L" : ""}${rightOn ? "R" : ""}`
  );
  // A flight that lands here stands the still at full strength until it has
  // landed, then lets it fade: the snapshot shows it at full strength, so a
  // still resting at zero vanished in one frame at the landing. A flight that
  // leaves starts with the stage already showing, and lighting the still then
  // would flash it over the live drawing before the flight begins.
  let floorLanding = $state(false);
  $effect.pre(() => {
    floorLanding = app.mandalaHandoff && !untrack(() => stageShowing);
  });

  /*
   * The other half of the VTG reading, which the drill has always carried and
   * this pane was missing.
   *
   * The element row above names what the two HANDS are in. These props are in
   * a timing and a direction of their own, and on this surface the props are
   * the thing being drawn, so the same bridge component names both. One entry,
   * never a choice: the drill branches when several realizations share a hand
   * mode, and a theory pairing has exactly one prop relationship because the
   * two ratios and the pairing determine it.
   */
  const handElement = $derived(TND_BY_FAMILY[FAMILY_BY_MODE[app.theoryMode]]);

  const propRelationship = $derived(
    pair ? theoryPropRelationship(pair, app.theoryMode) : null
  );

  const bridgeEntries = $derived<RelationshipBridgeEntry[]>(
    handElement && propRelationship
      ? [
          {
            mode: app.theoryMode,
            propMode: propModeOf(propRelationship),
            element: handElement,
            propRelationship,
          },
        ]
      : []
  );

  /* The two accents the backdrop is lit by: hands from one, props from the
     other. A pairing whose props have no element to name lights both from the
     hands rather than dropping the backdrop to grey. */
  const handAccent = $derived(handElement?.accentColor ?? "transparent");
  const propAccent = $derived(
    propRelationship?.element?.accentColor ?? handAccent
  );

  /* Space is the stage's click, reached without a mouse. Through the app's
     shortcut registry, so it stands aside for text fields and dialogs. The
     Level Matrix drill is mounted beside this one and binds the same key, so
     the surface check is what decides which of the two a press reaches. */
  $effect(() =>
    registerShapeMatrixPlaybackShortcut(
      "theory",
      () => animationState.togglePlaying(),
      () =>
        app.surface === "theory" &&
        Boolean(pair) &&
        !document.activeElement?.closest("[data-shape-matrix-transport]")
    )
  );

  /*
   * An open control panel takes the room the reading rows were using, the same
   * trade the drill makes. The stage stays: it is what the controls are being
   * pointed at.
   */
  const controlsOpen = $derived(animationState.activeSection !== null);
</script>

<aside class="theory-detail" aria-label={t("shape_engine_selected_pair_aria")}>
  <!-- The pane owns the container; this body owns the composition, the same
       split the Matrix drill uses between its stage and its dock. A size
       container cannot answer its own query. -->
  <div class="detail-body">
    <!-- The same row, in the same place, as the Matrix drill's. On Theory it
         also repaints nothing in the grid: a tile is the two hands' shapes, and
         the pairing is what those two hands do to each other, which is a thing
         you watch rather than a thing you look at. -->
    <!-- A solo is one hand, and a pairing is between two, so the pickers
         leave with the other hand rather than staying inert. -->
    {#if !solo}
      <div
        class="mode-picker"
        data-focus-mode-chrome
        use:claimedViewTransitionName={{
          name: SHAPE_MATRIX_MODES_NAME,
          enabled: morphingFrames,
        }}
        transition:flightGrowFade={frameMotion()}
      >
        <ElementChipRow
          selected={app.theoryMode}
          onpick={(mode: VtgMode | null) => {
            // The row clears on a second click, which the Matrix wants and
            // Theory cannot use: the two hands are always in some pairing.
            // Re-picking the chosen element keeps it.
            if (mode) app.setTheoryMode(mode);
          }}
        />
        <PropRelationshipChipRow
          realizations={bridgeEntries}
          selectedMode={app.theoryMode}
          selectedPropMode={null}
          activePropMode={null}
          disabled={!pair}
          ontarget={() => {
            /* One entry per pairing, so the branching chips never render and
               there is no second phase to target. */
          }}
        />
      </div>
    {/if}

    <div class="media-stage">
      <div class="detail-flow">
        {#if !pair}
          <div class="empty">
            <strong>{t("shape_engine_pick_cell")}</strong>
            <small>{t("shape_engine_theory_hint")}</small>
          </div>
        {:else}
          <header
            class="pair-heading"
            data-focus-mode-chrome
            use:claimedViewTransitionName={{
              name: SHAPE_MATRIX_STAGE_HEAD_NAME,
              enabled: morphingFrames,
            }}
          >
            <div class="pair-keys">
              {#if solo === "right"}
                <strong style={`color: ${rightInk};`}>
                  {theoryRatioLabel(pair.right.ratio)}
                </strong>
              {:else if solo === "left"}
                <strong style={`color: ${leftInk};`}>
                  {theoryRatioLabel(pair.left.ratio)}
                </strong>
              {:else}
                <strong style={`color: ${leftInk};`}>
                  {theoryRatioLabel(pair.left.ratio)}
                </strong>
                <span class="against">{t("shape_engine_against")}</span>
                <strong style={`color: ${rightInk};`}>
                  {theoryRatioLabel(pair.right.ratio)}
                </strong>
              {/if}
            </div>
          </header>

          <!-- The stage is a button, so the gear is its sibling in a shared
               frame rather than a control nested inside a control. -->
          <div class="stage-frame" data-focus-layout="theory-canvas">
            {#if !app.compact}
              <ShapeMatrixStageActions />
            {/if}
            <!-- The stage's surface is the selected tile's box, arrived: it
                 holds the shared stage name, so the rectangle grows out of
                 the tile with the flower riding it. The flower and the live
                 figure carry names of their own, so the surface flies clean. -->
            <button
              type="button"
              class="stage-window"
              use:claimedViewTransitionName={{
                name: SHAPE_MATRIX_ACTIVE_STAGE_NAME,
                enabled: stageShowing,
              }}
              aria-label={animationState.playing
                ? t("shape_engine_pause_theory_animation")
                : t("shape_engine_play_theory_animation")}
              onclick={animationState.togglePlaying}
            >
              <!-- The stage toggles playback on a click; this is how a mouse
                 finds that out. Hover-gated to fine pointers, and inert to
                 pointer events so it never eats the click it advertises. The
                 drill's canvas gets the same affordance from AnimatorCanvas
                 (hoverHint), which this stage is not. -->
              <span class="stage-hint" aria-hidden="true">
                <span class="stage-hint-disc">
                  <i
                    class="fas {animationState.playing
                      ? 'fa-pause'
                      : 'fa-play'}"
                  ></i>
                </span>
                <span class="stage-hint-word">
                  {animationState.playing
                    ? t("shape_engine_pause")
                    : t("shape_engine_play")}
                </span>
              </span>
              <!-- The elemental backdrop from the drill, lit by the two elements
                 the bridge above names. It is what tied the animation to the
                 relationship being read instead of leaving it a canvas that
                 happens to sit under one. -->
              <div
                class="stage-atmosphere"
                style={`--atmosphere-hand: ${handAccent}; --atmosphere-prop: ${propAccent}`}
                aria-hidden="true"
              ></div>
              <!-- Over the backdrop, under the canvas, in the canvas's own
                   box: the drill's floor, sized to this stage's fit. The
                   canvas paints its guide on its first frame, with nothing
                   to load first (the drill's player waits on a built
                   sequence), so the still rests at zero under it. Through a
                   flight it stands at full strength, which is what the
                   snapshot shows anyway, and it fades off once the flight
                   has landed: resting at zero throughout made the landed
                   flower vanish in one frame. -->
              <MandalaHeroLayer
                paths={floorPaths}
                artKey={floorKey}
                tipDx={floorTipDx}
                boxRatio={floorBoxRatio}
                opacity={floorLanding ? 1 : 0}
                claim={stageShowing}
                handoff={app.mandalaHandoff}
              />
              <!-- The figure: the grid and the live drawing. It blooms in
                   place around the landed flower and clears first on the
                   way back, as the drill's does. -->
              <div
                class="stage-figure"
                use:claimedViewTransitionName={{
                  name: SHAPE_MATRIX_FIGURE_NAME,
                  enabled: morphingFrames,
                }}
              >
                <ShapeMatrixLiveRatioStage
                  {hands}
                  {handPeriod}
                  {alignToken}
                  onCycleProgress={handleCycleProgress}
                  onSeekRef={handleSeekRef}
                  {propReach}
                  {tipAngle}
                  paused={!animationState.playing}
                  playbackMode={animationState.playbackMode}
                  leftPropType={drawnProps.left}
                  rightPropType={drawnProps.right}
                  {propColors}
                  active={stageVisible}
                />
              </div>
            </button>
            <div
              class="canvas-transport"
              data-shape-matrix-transport
              use:claimedViewTransitionName={{
                name: SHAPE_MATRIX_STAGE_TRANSPORT_NAME,
                enabled: morphingFrames,
              }}
            >
              <UnifiedTimeline
                playback={playbackAdapter}
                compact={app.compact}
              />
            </div>
          </div>
        {/if}

        <!-- Outside the branch on purpose: it is true of the whole surface.
             The short question stays visible; the explanation waits until
             someone asks for it so this pane still feels like a toy. -->
        <!-- It sits where the drill's carousel sits, below the stage, so in a
             flight it takes the carousel's name and rises in after it. -->
        <div
          class="boundary-disclosure"
          data-focus-mode-chrome
          use:claimedViewTransitionName={{
            name: SHAPE_MATRIX_STRIP_NAME,
            enabled: morphingFrames,
          }}
          transition:growFade={{ axis: "y" }}
        >
          <PanelButton
            fullWidth
            ariaExpanded={boundaryOpen}
            onclick={() => (boundaryOpen = !boundaryOpen)}
          >
            <span>
              <i class="fas fa-circle-question" aria-hidden="true"></i>
              {t("shape_engine_why_no_letter_or_level")}
            </span>
            <i
              class="fas fa-chevron-down boundary-toggle-icon"
              class:open={boundaryOpen}
              aria-hidden="true"
            ></i>
          </PanelButton>
          {#if boundaryOpen}
            <p class="boundary-note" transition:growFade={{ axis: "y" }}>
              {t("shape_engine_boundary_explanation")}
            </p>
          {/if}
        </div>
      </div>
    </div>

    <!-- Compact hosts only. A wide host reaches Customize from the gear in
         the stage's corner and playback from the stage itself, so it needs no
         band here. `sequence` is null because a spin ratio is not one: it has
         no letter, no steps and no word, and the panel's sequence-shaped
         affordances are turned off rather than pointed at nothing. -->
    {#if app.compact}
      <div
        class="animation-controls"
        data-focus-mode-chrome
        data-focus-layout={app.surface === "theory" ? "picker" : undefined}
        data-shape-matrix-dock
        use:claimedViewTransitionName={{
          name: SHAPE_MATRIX_CONTROLS_NAME,
          enabled: morphingFrames,
        }}
      >
        <AnimationPanel
          isExporting={false}
          layout="bottom"
          presentation="navigation"
          controlledSection={animationState.activeSection}
          isPlaying={animationState.playing}
          bpm={animationState.bpm}
          playbackMode={animationState.playbackMode}
          onPlaybackToggle={animationState.togglePlaying}
          onBpmChange={animationState.setBpm}
          showTempoControls={false}
          showEffectsPlayback={false}
          selectedPropType={app.addressedPropType}
          onPropChange={picksProps
            ? (next: PropType) => void app.setPropType(next)
            : undefined}
          handProps={app.handProps}
          allowedProps={shapeMatrixPickerProps()}
          onPropPickerRequest={picksProps ? app.togglePropPicker : undefined}
          propPickerActive={app.propPickerOpen}
          sequence={null}
          showPathShape={false}
          showMotionVisibility={true}
          showSequenceMarks={false}
          availableEffects={THEORY_EFFECTS}
          onActiveSectionChange={animationState.setActiveSection}
          closeRequest={animationState.closeRequest}
          regionLabel={t("shape_engine_shape_animation_controls")}
        />
      </div>
    {/if}
  </div>
</aside>

<style>
  .theory-detail {
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding: 0.85rem;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    border-radius: 16px;
    background: var(--theme-panel-bg, rgb(16 23 33 / 0.82));
    color: var(--theme-text, #fff);
    /* The element row's own responsive rules are written against the drill's
       container, so this pane answers to the same name and the six chips
       recompose here exactly as they do there. */
    container: shape-matrix-drill / size;
  }

  /* The drill's composition: modes, then the animation, then the dock. */
  .detail-body {
    position: relative;
    display: grid;
    height: 100%;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas:
      "modes"
      "media"
      "controls";
    gap: 0.7rem;
  }

  .mode-picker {
    grid-area: modes;
    display: grid;
    gap: 0.45rem;
    min-width: 0;
  }

  /* The prop catalogue opens over the grid pane, never here, so the stage is
     the animation and nothing else. */
  .media-stage {
    grid-area: media;
    display: grid;
    min-width: 0;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr);
    grid-template-areas: "flow";
  }

  .detail-flow {
    grid-area: flow;
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    gap: 0.7rem;
    /* Vertical only. The selected chip's marker paints a pixel past its own
       box, and an `auto` horizontal axis turns that into a scrollbar. */
    overflow: hidden auto;
  }

  /* The same shape the Matrix drill's empty state has: a title and one line
     under it, centred in the pane, so switching surfaces does not switch the
     way the app talks. */
  .empty {
    display: grid;
    flex: 1 1 auto;
    min-height: 0;
    align-content: center;
    justify-items: center;
    gap: 0.35rem;
    text-align: center;
  }

  .empty strong {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-base, 1rem);
    font-weight: 700;
  }

  .empty small {
    max-width: 26rem;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.58));
    font-size: var(--font-size-sm, 0.875rem);
  }

  .pair-heading {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .pair-keys {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: var(--font-size-lg, 1.125rem);
    font-variant-numeric: tabular-nums;
  }

  .against {
    color: var(--theme-text-dim, rgb(255 255 255 / 0.55));
    font-size: var(--font-size-compact, 0.75rem);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  /* The canvas fits the SHORTER side of this box and centres, so a fixed 22rem
     cap drew a small mandala in a wide letterbox on a tall pane and left the
     column dead below it. Growing into the free height instead spends
     that room on the artwork. The box is sized by the flex column before the
     canvas paints, so nothing below it moves when the stage mounts or the pair
     changes. */
  .stage-window {
    position: relative;
    flex: 1 1 0;
    width: 100%;
    /* Set this floor too high on a short pane and the box cannot shrink to the
       room it was given, and the note below it is pushed out of the flow. */
    min-height: 9rem;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.09));
    border-radius: 14px;
    background: color-mix(in srgb, #000 34%, var(--theme-panel-bg, #0a0f14));
    color: inherit;
    cursor: pointer;
  }

  .stage-window:focus-visible {
    outline: 2px solid var(--theme-accent, #f4b54c);
    outline-offset: 2px;
  }

  /* Under the drawing, over the window's own ground. The stage clears its
     canvas to transparent every frame, so a plain child in the same box shows
     through without needing a stacking context of its own. */
  .stage-atmosphere {
    position: absolute;
    inset: 0;
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

  /* The canvas's own box, so the live stage inside measures the same square
     it did as the window's direct child, and the still beside it shares it. */
  .stage-figure {
    position: absolute;
    inset: 0;
  }

  /* Taken out of flow on purpose. In flow, the canvas reports its own pixel
     buffer as an intrinsic height, that height becomes the box's minimum, and
     the box the canvas was just sized from can never shrink again. */
  .stage-window :global(canvas) {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
  }

  .boundary-disclosure {
    display: grid;
    flex: 0 0 auto;
    gap: 0.45rem;
  }

  .boundary-disclosure :global(.panel-btn) {
    justify-content: space-between;
    padding-inline: 0.75rem;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
  }

  .boundary-disclosure :global(.panel-btn > span) {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .boundary-toggle-icon {
    transition: transform var(--duration-fast) var(--ease-standard);
  }

  .boundary-toggle-icon.open {
    transform: rotate(180deg);
  }

  .boundary-note {
    margin: 0;
    padding: 0 0.25rem 0.2rem;
    flex: 0 0 auto;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.68));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.55;
  }

  .animation-controls {
    grid-area: controls;
    min-width: 0;
    min-height: 0;
  }

  /* The frame takes the available height while its transport reserves a row
     below the drawing. The gear still anchors to its top-right corner. */
  .stage-frame {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 0;
    min-width: 0;
    min-height: 13.125rem;
  }

  .canvas-transport {
    position: relative;
    z-index: 5;
    flex: 0 0 auto;
    width: 100%;
  }

  .stage-window {
    position: relative;
  }

  .stage-hint {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-standard);
  }

  .stage-hint-disc {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.42);
    color: #fff;
    font-size: 1.15rem;
  }

  .stage-hint-word {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    color: #fff;
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.55);
  }

  /* Mouse only: a touch host has no hover, and showing this permanently would
     put a scrim over the mandala it is describing. */
  @media (hover: hover) and (pointer: fine) {
    .stage-window:hover .stage-hint,
    .stage-window:focus-visible .stage-hint {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .stage-hint {
      transition: none;
    }
  }

  @container shape-matrix-app (max-width: 74.99rem) or (max-height: 41.99rem) {
    /* Same second name as the Matrix drill, so the side composition below
       and the chip rows switch on compact hosts only. */
    .theory-detail {
      border: 0;
      border-radius: 0;
      container-name: shape-matrix-drill shape-matrix-drill-compact;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .boundary-toggle-icon {
      transition: none;
    }
  }

  /* The drill's side composition, for the same reason and at the same
     breakpoint: a compact host at least as wide as it is tall (the unfolded
     Z Fold either way up, a short landscape phone) is height-bound, so the
     element rail and the dock move beside the animation instead of eating
     the top third of the screen. The row is already two columns wide here on
     its own, which is what the rail was sized for. */
  @container shape-matrix-drill-compact (min-width: 42rem) and (min-aspect-ratio: 5 / 6) {
    .detail-body {
      grid-template-columns: clamp(15rem, 33%, 18rem) minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto;
      grid-template-areas:
        "modes media"
        ". media"
        "controls media";
      gap: 0.8rem;
    }

    /* The stage floor is the only fixed height left in the flow, so on a pane
       this short it is what has to give. Prose running past a scrollbar reads
       correctly; a boxed row sliced through the middle reads as broken. */
    .stage-window {
      min-height: 8rem;
    }
  }

  /* At this height ElementChipRow turns into a size container that fills the
     height its host gives it (same query, in its own file). The drill gives
     its modes row the column's spare height; an auto row here gave the chip
     row none, so it collapsed to zero and all six chips drew on one spot.
     Give the rail the same share the drill does: chips fill the column down
     to the dock. */
  @container shape-matrix-drill-compact (min-width: 42rem) and (min-aspect-ratio: 5 / 6) and (min-height: 26.01rem) {
    .detail-body {
      grid-template-rows: minmax(0, 1fr) auto;
      grid-template-areas:
        "modes media"
        "controls media";
    }

    .mode-picker {
      grid-template-rows: minmax(0, 1fr) auto;
      min-height: 0;
    }
  }

  /* A short landscape phone has no height for a stacked side column: the
     modes keep it and the dock goes under the animation. */
  /* In the side column the dock is too narrow for its one-row labels, so
     ControlDock drops them and leaves four bare icons, with empty column above
     them in portrait. The column has the height for a 2x2 grid of labeled
     buttons instead. Only this tier: the short-wide tier puts the dock under
     the hero, and phone and desktop never answer to the compact name. The
     root class lifts these over ControlDock's own .compact label rule. */
  @container shape-matrix-drill-compact (min-width: 42rem) and (min-aspect-ratio: 5 / 6) and (min-height: 24.01rem) {
    .theory-detail .animation-controls :global(.dock .cat-bar) {
      padding: 0;
      background: none;
      backdrop-filter: none;
      border-top: none;
    }
    .theory-detail .animation-controls :global(.dock .cat-scroll) {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.4rem;
      overflow: visible;
    }
    .theory-detail .animation-controls :global(.dock .dock-btn.cat) {
      flex-direction: row;
      justify-content: flex-start;
      gap: 0.5rem;
      min-height: var(--min-touch-target, 44px);
      padding: 0 0.7rem;
    }
    .theory-detail .animation-controls :global(.dock .cat-label) {
      display: block;
      font-size: 0.8rem;
    }
  }

  @container shape-matrix-drill-compact (min-width: 42rem) and (max-height: 24rem) {
    .detail-body {
      grid-template-columns: clamp(13rem, 30%, 17rem) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
      grid-template-areas:
        "modes media"
        "modes controls";
    }

    .mode-picker {
      align-self: center;
    }
  }
</style>
