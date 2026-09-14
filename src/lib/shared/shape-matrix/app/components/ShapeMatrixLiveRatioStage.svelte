<!--
  The Theory surface's player. It is to Theory what the canonical animation
  canvas is to the Matrix: the same layers, the same controls, the same words
  for them, drawn from a spin ratio instead of from a realized sequence.

  That is the whole reason this file exists rather than mounting the engine.
  The engine animates a sequence: steps, letters, orientations, a word. A
  rational ratio like 4:9 has none of those, and no amount of adapting invents
  them. So the kinematics are local and everything AROUND them is shared. The
  visibility manager decides which layers draw, the effects config decides what
  the tips emit, the effort preset decides how the beat is paced, the tempo
  decides how long a hand cycle lasts. Change any of them on the Matrix and this
  stage has already changed too, because there is one scope behind both.

  Position is EVALUATED from a cycle count, not integrated from a rate. An
  effort curve is not monotonic: elastic and anticipation travel backwards
  before they arrive, so there is no rate to integrate that would reproduce
  them. Evaluating an eased clock gets all eight efforts for free and cannot
  drift.

  The trail keeps exactly one of the hand's own closed paths, and ages in hand
  cycles rather than seconds. A wall clock cannot do that job: the same fourteen
  seconds is a whole 1:2 flower and three fifths of a 1:9 one, and it becomes a
  different fraction again on a 144Hz display. It ages against the RAW clock,
  which is monotonic; only the drawn positions are eased, so a bounce cannot age
  the tail backwards.

  Canvas rather than SVG: the trail is a live ring buffer redrawn every frame
  with a per-segment fade, which is thousands of DOM attribute writes a second
  as SVG and a few hundred cheap strokes as canvas.
-->
<script module lang="ts">
  export interface LiveHand {
    id: string;
    /** Prop rotations per hand cycle. */
    rate: number;
    /** +1 pro (prop turns with the hand), -1 anti. */
    spinSign: 1 | -1;
    /** Hand radius in prop lengths. Zero parks the hand at the origin. */
    radius: number;
    color: string;
    /** Compass eighths the hand starts at, so two hands can be offset. */
    handPhase: number;
    /**
     * Which way the hand travels: +1 clockwise, -1 counter. This is the
     * direction half of a VTG mode, and no amount of phase can express it.
     */
    handSign?: 1 | -1;
    /**
     * Prop offset from the hand's own bearing, in eighths. Zero points the prop
     * out along the hand; 4 points it back in.
     */
    propPhase?: number;
    /**
     * Hand cycles this hand takes to return to its start, the denominator of
     * its ratio. The trail keeps exactly this much, so what is drawn is the
     * whole closed path and nothing older.
     */
    trailCycles: number;
    /** Which side this hand is, so its prop sprite is the right colour. */
    side: "left" | "right";
    /**
     * The whole closed path, in stage units, drawn under the animation from the
     * first frame.
     */
    guide?: ReadonlyArray<{ x: number; y: number }> | null;
  }
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import { angleOf, PROP_LENGTH } from "$lib/shared/notation/qft/qft-model";
  import { ENGINE_GRID_RADIUS } from "$lib/shared/mandala/domain/mandala-constants";
  import { MANDALA_GUIDE_FLOOR_OPACITY } from "$lib/shared/mandala/domain/mandala-overlay-types";
  import GridSvg from "$lib/shared/pictograph/grid/components/GridSvg.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { getAnimationScopeContext } from "$lib/shared/animation-engine/state/animation-scope-context";
  import { resolveEffectivePropsVisibility } from "$lib/shared/animation-engine/state/effective-prop-visibility";
  import {
    generateLeftPropSvg,
    generateRightPropSvg,
  } from "$lib/shared/animation-engine/services/svg-generator";
  import { applyEffort } from "$lib/shared/effort/domain/effort-easing-unified";
  import {
    createCanvas2DEffectHost,
    isCanvas2DHostedEffect,
  } from "$lib/shared/effects/services/canvas2d-effect-host";
  import type { EmitterTip } from "$lib/shared/effects/renderers/emitter-tip";
  import type { PlaybackMode } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import { resolveTheoryPlaybackTick } from "$lib/shared/shape-matrix/services/theory-playback-clock";

  interface Props {
    hands: LiveHand[];
    /** Milliseconds for one hand circle. */
    handPeriod?: number;
    paused?: boolean;
    playbackMode?: PlaybackMode;
    /** Bumping this returns every phase to its start and clears the trails. */
    alignToken?: number;
    /** Prop reach in hand-orbit radii, so the stick matches the real prop. */
    propReach?: number;
    /**
     * Bearing of the tracked tip inside the prop's own artwork, in radians from
     * its +x axis. The sprite is rotated by the difference, so the tip the trail
     * follows is the tip the drawing points at.
     */
    tipAngle?: number;
    /** Which prop to draw. Its sprite is loaded once per type per side. */
    propType?: string;
  }

  let {
    hands,
    handPeriod = 4000,
    paused = false,
    playbackMode = "continuous",
    alignToken = 0,
    propReach = PROP_LENGTH,
    tipAngle = 0,
    propType = "staff",
  }: Props = $props();

  /*
   * The whole Shape Matrix shares one animation scope, so the Display, Effects,
   * Effort and Playback controls the Matrix drill mounts are the same objects
   * this stage reads. Read per frame inside the loop rather than mirrored into
   * runes: the canvas repaints every frame anyway, and a mirror is one more
   * thing that can be a frame stale.
   */
  const scope = getAnimationScopeContext();

  const VIEW = 2.45;

  /*
   * The pictograph grid, at the scale the hands are already drawn at.
   *
   * One stage unit is one hand-orbit radius, and the engine puts a hand point at
   * ENGINE_GRID_RADIUS inside a 950-unit box. That fixes the grid square against
   * the canvas exactly, with nothing measured: the two agree because they are
   * the same number, not because a layout pass made them agree. Container units
   * rather than JS, so it is right in the frame the canvas is first sized in.
   */
  const GRID_VIEWBOX = 950;
  const GRID_SPAN = GRID_VIEWBOX / ENGINE_GRID_RADIUS / (VIEW * 2);
  const TRAIL_CAPACITY = 1100;
  const TRAIL_BUCKETS = 26;
  /*
   * Points spent on one closed path. Sampling per closure rather than per frame
   * is what keeps a nine-cycle flower inside the ring: a 144Hz display would
   * otherwise store two and a half times as many points for the same shape and
   * start dropping its own tail.
   */
  const TRAIL_SAMPLES = 900;
  /*
   * head x, head y, tail x, tail y, raw cycles. The hand is the midpoint of the
   * two ends, so every tracking mode reads off these five.
   */
  const TRAIL_STRIDE = 5;
  /** A hand cycle is the four cardinal steps, so a beat is a quarter of it. */
  const BEATS_PER_CYCLE = 4;
  /** The trail look this stage was tuned at, in TrailsIntent units. */
  const TUNED_THICKNESS = 3;

  interface HandRuntime {
    /** Hand cycles since the last restart, unaffected by the effort curve. */
    cycles: number;
    trail: Float32Array;
    head: number;
    length: number;
    lastSample: number;
  }

  let canvas = $state<HTMLCanvasElement | null>(null);
  const runtimes = new Map<string, HandRuntime>();
  const effectHost = createCanvas2DEffectHost();
  const STEP_PAUSE_MS = 300;
  let stepClockMs = 0;
  let previousPlaybackMode: PlaybackMode = playbackMode;

  function runtimeFor(hand: LiveHand): HandRuntime {
    let runtime = runtimes.get(hand.id);
    if (!runtime) {
      runtime = {
        cycles: 0,
        trail: new Float32Array(TRAIL_CAPACITY * TRAIL_STRIDE),
        head: 0,
        length: 0,
        lastSample: 0,
      };
      runtimes.set(hand.id, runtime);
    }
    return runtime;
  }

  function resetRuntime(runtime: HandRuntime): void {
    runtime.cycles = 0;
    runtime.head = 0;
    runtime.length = 0;
    runtime.lastSample = 0;
  }

  /*
   * The grid layer is DOM, so unlike every canvas layer it needs the toggle as a
   * rune. The visibility manager publishes changes to observers rather than
   * through reactive state, which is the same bridge DisplayPanel builds.
   */
  let gridVisible = $state(scope?.visibility.isGridVisible() ?? true);
  onMount(() => {
    const vm = scope?.visibility;
    if (!vm) return;
    const sync = () => {
      gridVisible = vm.isGridVisible();
    };
    vm.registerObserver(sync);
    sync();
    return () => vm.unregisterObserver(sync);
  });

  /*
   * The real prop, in the real colours, at the real proportions.
   *
   * Scale is exactly 1/ENGINE_GRID_RADIUS and never per-prop: `propReach` is
   * this prop's own tracked tip measured in the same units the artwork is
   * authored in, so drawing the artwork at grid scale lands its tip on the curve
   * the guide and the grid tile already drew. Choosing a longer prop opens the
   * whole figure rather than sliding the drawing off it.
   */
  interface PropSprite {
    image: HTMLImageElement;
    width: number;
    height: number;
  }
  const sprites = $state<{ left: PropSprite | null; right: PropSprite | null }>(
    {
      left: null,
      right: null,
    }
  );

  function decodeSvg(
    svg: string,
    width: number,
    height: number
  ): Promise<PropSprite> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      // Explicit intrinsic size: a bare `new Image()` on an SVG carrying only a
      // viewBox reports 0 in some engines, and forcing a square would letterbox
      // every prop that is not one.
      image.width = width;
      image.height = height;
      image.onload = () => resolve({ image, width, height });
      image.onerror = () => reject(new Error("prop sprite failed to decode"));
      image.src = `data:image/svg+xml;base64,${btoa(
        unescape(encodeURIComponent(svg))
      )}`;
    });
  }

  $effect(() => {
    const wanted = propType;
    let cancelled = false;
    void (async () => {
      try {
        const [left, right] = await Promise.all([
          generateLeftPropSvg(wanted, true),
          generateRightPropSvg(wanted, true),
        ]);
        const [leftSprite, rightSprite] = await Promise.all([
          decodeSvg(left.svg, left.width, left.height),
          decodeSvg(right.svg, right.width, right.height),
        ]);
        if (cancelled) return;
        sprites.left = leftSprite;
        sprites.right = rightSprite;
      } catch {
        // The stick fallback below is a complete drawing on its own, so a
        // prop that will not decode costs the artwork nothing.
        if (!cancelled) {
          sprites.left = null;
          sprites.right = null;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  /*
   * Canvas cannot read CSS custom properties. Handing `strokeStyle` a
   * `var(--dm-motion-blue, ...)` string is not an error either: the assignment
   * is silently ignored and the previous colour stays, which is how both hands
   * drew white. The values are theme-scoped, so resolve them at runtime rather
   * than hardcoding hexes, and re-read on a slow cadence so a theme change
   * reaches the canvas without a style read every frame.
   */
  const VAR_PATTERN = /^var\(\s*(--[\w-]+)\s*(?:,\s*([^]*?)\s*)?\)$/;
  const colorCache = new Map<string, string>();
  let colorsResolvedAt = 0;

  function resolveColor(element: HTMLElement, color: string): string {
    const cached = colorCache.get(color);
    if (cached) return cached;
    const match = VAR_PATTERN.exec(color.trim());
    if (!match) {
      colorCache.set(color, color);
      return color;
    }
    const declared = getComputedStyle(element)
      .getPropertyValue(match[1])
      .trim();
    const resolved = declared || match[2]?.trim() || "#ffffff";
    colorCache.set(color, resolved);
    return resolved;
  }

  function pushPoint(
    runtime: HandRuntime,
    headX: number,
    headY: number,
    tailX: number,
    tailY: number
  ): void {
    const at = runtime.head * TRAIL_STRIDE;
    runtime.trail[at] = headX;
    runtime.trail[at + 1] = headY;
    runtime.trail[at + 2] = tailX;
    runtime.trail[at + 3] = tailY;
    runtime.trail[at + 4] = runtime.cycles;
    runtime.head = (runtime.head + 1) % TRAIL_CAPACITY;
    runtime.length = Math.min(runtime.length + 1, TRAIL_CAPACITY);
    runtime.lastSample = runtime.cycles;
  }

  /*
   * How much of the ring is still inside this hand's own closed path. Walking
   * back from the head is the same order of work as the stroke that follows, and
   * ages stored in cycles mean a pause does not age the trail.
   */
  function keptPoints(runtime: HandRuntime, closure: number): number {
    let kept = 0;
    while (kept < runtime.length) {
      const at = (runtime.head - 1 - kept + TRAIL_CAPACITY) % TRAIL_CAPACITY;
      if (runtime.cycles - runtime.trail[at * TRAIL_STRIDE + 4] > closure)
        break;
      kept += 1;
    }
    return kept;
  }

  onMount(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let last = performance.now();
    let appliedAlign = alignToken;
    const tips: EmitterTip[] = [];

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const element = canvas;
      const context = element?.getContext("2d");
      if (!element || !context) return;

      const dt = Math.min(now - last, 64);
      last = now;

      if (playbackMode !== previousPlaybackMode) {
        previousPlaybackMode = playbackMode;
        stepClockMs = 0;
      }

      if (now - colorsResolvedAt > 1000) {
        colorsResolvedAt = now;
        colorCache.clear();
      }

      if (appliedAlign !== alignToken) {
        appliedAlign = alignToken;
        for (const hand of hands) resetRuntime(runtimeFor(hand));
      }

      /*
       * Reduced motion holds the shape still rather than skipping the draw, so
       * whatever is already on screen stays readable.
       */
      let advance = paused || media.matches ? 0 : dt;
      if (advance > 0 && playbackMode === "step") {
        const beatDuration = handPeriod / BEATS_PER_CYCLE;
        const tick = resolveTheoryPlaybackTick(
          stepClockMs,
          dt,
          beatDuration,
          STEP_PAUSE_MS,
          playbackMode
        );
        advance = tick.advanceMs;
        stepClockMs = tick.clockMs;
      }
      const handTurns = advance / handPeriod;

      const vm = scope?.visibility;
      const effort = vm?.getEffortPreset() ?? "linear";
      const showGuide = vm?.getVisibility("mandala") ?? true;
      const showProps = resolveEffectivePropsVisibility(
        vm?.getVisibility("props") ?? true,
        scope?.settings.trail.hideProps ?? false
      );
      const activeEffect = scope?.effects.activeEffect ?? "trails";
      const trails = scope?.effects.trails;
      const showTrail = activeEffect === "trails";
      const overlayEffect =
        activeEffect && isCanvas2DHostedEffect(activeEffect)
          ? activeEffect
          : null;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssWidth = element.clientWidth;
      const cssHeight = element.clientHeight;
      if (cssWidth === 0 || cssHeight === 0) return;
      const pixelWidth = Math.round(cssWidth * dpr);
      const pixelHeight = Math.round(cssHeight * dpr);
      if (element.width !== pixelWidth || element.height !== pixelHeight) {
        element.width = pixelWidth;
        element.height = pixelHeight;
      }

      const scale = Math.min(cssWidth, cssHeight) / (VIEW * 2);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, cssWidth, cssHeight);
      context.save();
      context.translate(cssWidth / 2, cssHeight / 2);
      context.scale(scale, scale);

      /*
       * The mandala first, whole, under everything else: the same floor the
       * Matrix drill lays under its live player, at the same opacity. Both hands
       * before either trail, so one hand's guide never lands on top of the other
       * hand's motion.
       */
      if (showGuide) {
        context.globalCompositeOperation = "lighter";
        context.globalAlpha = MANDALA_GUIDE_FLOOR_OPACITY;
        context.lineWidth = 0.013;
        context.lineJoin = "round";
        for (const hand of hands) {
          const guide = hand.guide;
          if (!guide || guide.length < 2) continue;
          context.strokeStyle = resolveColor(element, hand.color);
          context.beginPath();
          context.moveTo(guide[0].x, guide[0].y);
          for (let i = 1; i < guide.length; i += 1) {
            context.lineTo(guide[i].x, guide[i].y);
          }
          context.stroke();
        }
        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
      }

      tips.length = 0;

      for (const hand of hands) {
        const runtime = runtimeFor(hand);
        const color = resolveColor(element, hand.color);
        runtime.cycles += handTurns;

        /*
         * The effort curve paces each BEAT, which is what it paces in the
         * engine: a step there is a quarter hand cycle here, the same four
         * cardinal points. Whole beats are fixed points of every curve, so the
         * figure drawn is identical under all eight efforts and only the travel
         * between landings changes.
         */
        const beats = runtime.cycles * BEATS_PER_CYCLE;
        const landed = Math.floor(beats);
        const easedCycles =
          (landed + applyEffort(effort, beats - landed)) / BEATS_PER_CYCLE;

        /*
         * `spin` is relative to the hand, so a hand running counter-clockwise
         * carries its prospin prop counter-clockwise too. Without the hand's
         * sign on both terms, reversing one hand would silently convert its
         * prospin flower into an antispin one.
         */
        const handSign = hand.handSign ?? 1;
        const turning = hand.radius > 0 ? 1 : 0;
        const handAngle =
          angleOf(hand.handPhase) +
          easedCycles * Math.PI * 2 * handSign * turning;
        const propAngle =
          angleOf(hand.handPhase + (hand.propPhase ?? 0)) +
          easedCycles * Math.PI * 2 * hand.rate * hand.spinSign * handSign;

        /*
         * The model measures angles clockwise from straight up into a
         * y-grows-down frame, so a settled shape here is the same object the
         * index thumbnails draw. Standard-math cos/sin would silently mirror and
         * quarter-turn every path.
         */
        const handX = Math.sin(handAngle) * hand.radius;
        const handY = -Math.cos(handAngle) * hand.radius;
        const reachX = Math.sin(propAngle) * propReach;
        const reachY = -Math.cos(propAngle) * propReach;
        const headX = handX + reachX;
        const headY = handY + reachY;
        const tailX = handX - reachX;
        const tailY = handY - reachY;

        const spacing = hand.trailCycles / TRAIL_SAMPLES;
        if (
          runtime.length === 0 ||
          (advance > 0 && runtime.cycles - runtime.lastSample >= spacing)
        ) {
          pushPoint(runtime, headX, headY, tailX, tailY);
        }

        /* Both ends emit, the way a real double-ended prop does. */
        tips.push(
          {
            x: cssWidth / 2 + headX * scale,
            y: cssHeight / 2 + headY * scale,
            propIndex: hand.side === "left" ? 0 : 1,
            tipIndex: 0,
            end: "A",
            color,
          },
          {
            x: cssWidth / 2 + tailX * scale,
            y: cssHeight / 2 + tailY * scale,
            propIndex: hand.side === "left" ? 0 : 1,
            tipIndex: 1,
            end: "B",
            color,
          }
        );

        /*
         * The hand's own circle. This is the "Hand paths" layer by the name the
         * Display panel gives it, and on this stage a hand path is literally a
         * circle: the hand holds one radius for the whole figure.
         */
        const showPath =
          vm?.getVisibility(
            hand.side === "left" ? "leftPathLines" : "rightPathLines"
          ) ?? false;
        if (showPath && hand.radius > 0) {
          context.beginPath();
          context.arc(0, 0, hand.radius, 0, Math.PI * 2);
          context.strokeStyle = color;
          context.globalAlpha = 0.32;
          context.lineWidth = 0.01;
          context.stroke();
          context.globalAlpha = 1;
        }

        if (showTrail) {
          const kept = keptPoints(runtime, hand.trailCycles);
          /*
           * Butt caps on the buckets. A round cap juts half a line-width past
           * the shared vertex, so two adjacent buckets double-cover it and
           * additive blending turns every seam into a bright bead. Butt ends
           * meet exactly at the vertex: no overlap, no gap.
           */
          context.lineCap = "butt";
          context.lineJoin = "round";
          /*
           * Two hands at alpha are 180 degrees apart, so any even-petal ratio
           * puts them on the SAME locus and the hand drawn second hides the
           * first entirely. Additive blending keeps that truthful: a path only
           * one hand walks stays blue or red, and a path they share lights up as
           * both at once instead of erasing one of them.
           */
          context.globalCompositeOperation = "lighter";
          context.strokeStyle = color;
          const weight =
            (trails?.thickness ?? TUNED_THICKNESS) / TUNED_THICKNESS;
          const brightness = trails?.brightness ?? 1;
          /*
           * The Shape Matrix is built on ONE tracked point per prop, the tip the
           * tiles, the guide and the flower geometry all come from, so "right
           * end" is the locus this surface actually knows. The other modes are
           * drawn off the same stored pose: the far end is the prop
           * point-reflected through the hand, and the hand track is the midpoint
           * of the two.
           */
          const mode = trails?.trackingMode ?? "right_end";
          const lanes: Array<0 | 1 | 2> =
            mode === "left_end"
              ? [1]
              : mode === "both_ends"
                ? [0, 1]
                : mode === "hand"
                  ? [2]
                  : [0];
          /*
           * Stroked in age buckets rather than one segment at a time. Under
           * additive blending a per-segment stroke doubles up wherever two round
           * caps meet, which beads a continuous path into a dotted line. A
           * bucket is a single polyline with real joins, so only the handful of
           * bucket seams overlap at all and the fade still reads as a gradient.
           */
          const buckets = Math.min(TRAIL_BUCKETS, Math.max(1, kept - 1));
          for (const lane of lanes) {
            for (let b = 0; b < buckets; b += 1) {
              const start = Math.floor((b * (kept - 1)) / buckets);
              const end = Math.floor(((b + 1) * (kept - 1)) / buckets);
              if (end <= start) continue;
              const age = (b + 1) / buckets;
              context.beginPath();
              for (let i = start; i <= end; i += 1) {
                const at =
                  ((runtime.head - kept + i + TRAIL_CAPACITY) %
                    TRAIL_CAPACITY) *
                  TRAIL_STRIDE;
                const px =
                  lane === 2
                    ? (runtime.trail[at] + runtime.trail[at + 2]) / 2
                    : runtime.trail[at + lane * 2];
                const py =
                  lane === 2
                    ? (runtime.trail[at + 1] + runtime.trail[at + 3]) / 2
                    : runtime.trail[at + lane * 2 + 1];
                if (i === start) context.moveTo(px, py);
                else context.lineTo(px, py);
              }
              /*
               * A low floor, because the guide beneath it already holds the
               * whole flower. Without one the trail has to be the shape AND the
               * recency, and the two fight. With one it is free to read as a
               * bright head walking a drawing that is already there.
               */
              context.globalAlpha = (0.12 + age * 0.84) * brightness;
              context.lineWidth = (0.016 + age * 0.026) * weight;
              context.stroke();
            }
          }
          context.globalAlpha = 1;
          context.globalCompositeOperation = "source-over";
          context.lineCap = "round";
        }

        if (!showProps) continue;

        const sprite = hand.side === "left" ? sprites.left : sprites.right;
        if (sprite) {
          const spriteWidth = sprite.width / ENGINE_GRID_RADIUS;
          const spriteHeight = sprite.height / ENGINE_GRID_RADIUS;
          context.save();
          context.translate(handX, handY);
          // The artwork's +x axis carries the tracked tip at `tipAngle`, and the
          // tip has to land on the head bearing, which is a quarter turn behind
          // the model's straight-up-is-zero angle.
          context.rotate(propAngle - Math.PI / 2 - tipAngle);
          context.drawImage(
            sprite.image,
            -spriteWidth / 2,
            -spriteHeight / 2,
            spriteWidth,
            spriteHeight
          );
          context.restore();
        } else {
          context.beginPath();
          context.moveTo(tailX, tailY);
          context.lineTo(headX, headY);
          context.lineWidth = 0.042;
          context.strokeStyle = "rgba(255, 255, 255, 0.92)";
          context.stroke();
        }
        // No marks on the hand or on the tracked tip: the Matrix stage draws
        // the prop alone, and the trail already shows which end it follows.
      }

      context.restore();

      /*
       * Overlay effects last, in the canvas's own pixel space. Every renderer in
       * the shared host measures in pixels against `computeEffectScale`, so
       * handing them the stage's unit transform would draw a sparkle five
       * thousandths of a hand radius across.
       */
      if (overlayEffect && scope) {
        const lead = hands[0] ? runtimeFor(hands[0]).cycles : 0;
        effectHost.render(
          context,
          overlayEffect,
          scope.effects.config,
          tips,
          advance / 1000,
          cssWidth,
          cssHeight,
          lead * BEATS_PER_CYCLE
        );
      }
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  });
</script>

<div class="live-frame" style={`--grid-span: ${GRID_SPAN};`} aria-hidden="true">
  {#if gridVisible}
    <svg class="tka-grid" viewBox="0 0 {GRID_VIEWBOX} {GRID_VIEWBOX}">
      <!--
        Every hand start lands on north, south, east or west, and every prop
        bearing with it, so diamond is the grid these paths are actually drawn
        on. `darkMode` is not about export here: it inlines the light grid
        colour, which is what this stage needs on its dark card whatever the page
        theme is doing.
      -->
      <GridSvg gridMode={GridMode.DIAMOND} darkMode={true} />
    </svg>
  {/if}
  <canvas bind:this={canvas} class="live-stage"></canvas>
</div>

<style>
  .live-frame {
    position: absolute;
    inset: 0;
    /* The grid square is a fixed multiple of the canvas's shorter side, which is
       the side the canvas scales itself from. */
    container-type: size;
  }

  .tka-grid {
    position: absolute;
    top: 50%;
    left: 50%;
    width: calc(min(100cqw, 100cqh) * var(--grid-span));
    aspect-ratio: 1;
    translate: -50% -50%;
    /* Scaffolding, not the subject. */
    opacity: 0.3;
  }

  .live-stage {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
