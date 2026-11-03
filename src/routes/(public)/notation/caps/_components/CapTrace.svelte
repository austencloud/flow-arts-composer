<!--
  CapTrace: one CAP played live on /notation/caps, one club floating in space,
  drawing the pattern's trace as it plays, looping forever. The page shows
  three of them side by side (reverse after a quarter, a half, three quarters),
  so the sequence comes in as a prop and every instance shares the recipe,
  BPM and effort below, which keeps the three in step. Same recipe as the
  shape-matrix drill hero (InlineAnimationPlayer + transparent canvas + trail
  preset + tip-effect map + engine-aligned MandalaHeroLayer ghost underneath),
  so it reads as "a prop doing the pattern" with no letter/step chrome and no
  background box.

  This surface is LOCKED for visitors: effort/BPM/prop hardcoded, grid hidden,
  context menu suppressed: a public exhibit, not an editable canvas.
-->
<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import MandalaHeroLayer from "@tka/shape-engine/components/MandalaHeroLayer.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { setPerHand } from "#lib/shared/animation-engine/services/tip-effect-resolver.js";
  import { setTipPointOverrideProvider } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
  import { CLUB_TIP_DX, capTraceFit } from "./cap-trace-fit";
  import { calculate as calculateMandalaGeometry } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
  import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
  import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import {
    TrailMode,
    TrailEffect,
    DEFAULT_TRAIL_SETTINGS,
    type TrailSettings,
  } from "#lib/shared/animation-engine/domain/types/trail-types.js";

  let {
    sequence,
    artKey,
    poster,
  }: {
    sequence: SequenceData;
    /** Stable key for the ghost mandala art; one per setting on the page. */
    artKey: string;
    /** SSR still, only where a matching drawing exists (the Yuta CAP). */
    poster?: { src: string; alt: string };
  } = $props();

  // Austen's directive is no play/pause control on this exhibit, so the
  // accessibility accommodation is a static poster, not a pause button: under
  // reduced motion the live player is not mounted and the static ghost mandala
  // (which draws client-side either way) stands in as the still.
  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");

  // Poster = SSR / no-JS / pre-hydration first paint only. $effect runs client
  // side after mount, so on the server the poster renders (no blank square for
  // SEO / no-JS); once hydrated the client-drawn ghost and player own the frame
  // and the poster is removed so it never doubles the ghost curve.
  let mounted = $state(false);
  $effect(() => {
    mounted = true;
  });

  // The static mandala under the live trail: same alignment contract as the
  // shape-matrix drill: both layers fill the SAME square, and the geometry is
  // computed with the club's outer tip so the ghost sits exactly under the path
  // the prop traces. (Blue is invisible in this sequence, so only the red hand's
  // locus comes back.)
  //
  // Tip reach = the VISIBLE club tip, not the trail EMITTER. The emitter point
  // in prop-tip-points is dx=130, but the club's weighted bulb reaches farther
  // (measured ~150, i.e. one grid radius), and the eye follows that bulb tip.
  // Feeding the emitter's 130 drew the ghost ring ~7% inset, sitting inside the
  // very path the prop visibly traces (Austen, 2026-07-20: "make the mandala
  // match what the prop is currently doing"). 150 lands the ghost on the club
  // tip. Verified by pixel-measuring club reach vs ghost radius at 0.316·size.
  const clubTipDx = CLUB_TIP_DX;

  // Where the stage sits in the frame so the shape, not the hand circle, is
  // centred (cap-trace-fit.ts). The stage is resized in layout rather than
  // CSS-scaled, so the canvas redraws at its new size and stays sharp.
  // svelte-ignore state_referenced_locally
  const fit = capTraceFit(sequence);
  const fitStyle = [
    `left: ${fit.translateX * 100}%`,
    `top: ${fit.translateY * 100}%`,
    `width: ${fit.scale * 100}%`,
    `height: ${fit.scale * 100}%`,
  ].join("; ");
  // Each trace's sequence is fixed for its lifetime, so the geometry is
  // computed once.
  // svelte-ignore state_referenced_locally
  const mandalaPaths = calculateMandalaGeometry(
    sequence.steps,
    undefined,
    undefined,
    { tipEnds: 1, pathShape: "arc" },
    { dx: clubTipDx, dy: 0 }
  );

  // Trails on the red (solo) hand only: index 1 = red.
  const tipEffectMap = setPerHand({}, 1, "trails");

  // Emit the trail from the club's VISIBLE tip (dx 150), matching the ghost and
  // the club-graphic end. The default trail emitter is dx 130, which sits inside
  // the bulb, so the trace rendered ~inset from the club end (Austen, 2026-07-20:
  // "the trail is rendering inset from the tip of the club end"). The player
  // reads the club tip from the global tip-point override provider; scope the
  // override to this exhibit's lifetime. The LOOP demo beside it on the caps
  // page also plays clubs and takes the same visible-tip correction.
  $effect(() => {
    setTipPointOverrideProvider((propType) =>
      propType === "club" ? { points: [{ dx: 150, dy: 0 }] } : null
    );
    return () => setTipPointOverrideProvider(null);
  });

  // Per-instance ephemeral visibility manager. Without it the player's
  // orchestrator reads effort/path-shape from the GLOBAL singleton (a
  // visitor's (or Austen's) in-app glide leaks into this embed) and
  // setSpeed WRITES the embed's BPM back into that singleton. Ephemeral =
  // defaults, no localStorage, no DOM sync; fully isolated both directions.
  const visibilityManager = new AnimationVisibilityStateManager({
    ephemeral: true,
  });

  // The shipped look, tuned by Austen on 2026-07-19.
  const BPM = 80;
  const EFFORT: EffortId = "linear";

  $effect(() => {
    visibilityManager.setEffortPreset(EFFORT);
  });

  // Hero-visibility numbers from the landing hero preset, with LOOP_CLEAR so
  // the club redraws the full closed curve fresh on every cycle; the trace IS
  // the mandala, drawn live over its ghost.
  const trailSettings: TrailSettings = {
    ...DEFAULT_TRAIL_SETTINGS,
    mode: TrailMode.LOOP_CLEAR,
    effect: TrailEffect.GLOW,
    fadeDurationMs: 400,
    glowBlur: 6,
    tailLength: 36,
    lineWidth: 2,
    minOpacity: 0.55,
  };

  // svelte-ignore state_referenced_locally
  const playerProps = {
    sequence,
    autoPlay: true,
    externalBpm: BPM,
    tipEffortMap: { "*": { effort: EFFORT } },
    chrome: "minimal" as const,
    fill: true,
    beatIndicators: false,
    leftPropType: "club",
    rightPropType: "club",
    hideTkaGlyph: true,
    hideStepNumbers: true,
    gridVisible: false,
    disableContextMenu: true,
    interactive: false,
    visibilityManagerOverride: visibilityManager,
    trailSettingsOverride: trailSettings,
    tipEffectMap,
    backgroundAlpha: 0,
  };
</script>

<div class="yuta-demo">
  <div class="yuta-frame">
    <div class="yuta-stage" style={fitStyle}>
      {#if !mounted && poster}
        <img
          class="yuta-poster"
          src={poster.src}
          alt={poster.alt}
          width="500"
          height="500"
        />
      {/if}
      <MandalaHeroLayer
        paths={mandalaPaths}
        {artKey}
        tipDx={clubTipDx}
        opacity={1}
      />
      {#if !reduceMotion.current}
        <div class="player-layer">
          <LazyMount
            loader={() =>
              import("#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte")}
            active={true}
            props={playerProps}
          />
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* Square frame reserved up front (no-layout-shift). It clips the stage,
     which the fit moves and enlarges so the shape fills the frame. */
  .yuta-frame {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
  }

  /* Mandala ghost, poster and player all fill THIS box, so their coordinate
     frames coincide; that is the alignment contract (see ShapeMatrixDrill's
     .hero-square). Its left, top and size come from capTraceFit as
     percentages of the frame side. The player's canvas is transparent, so
     ghost and page background show through. */
  .yuta-stage {
    position: absolute;
  }

  .player-layer {
    position: absolute;
    inset: 0;
  }

  /* SSR / pre-hydration / no-JS floor. Removed once the client draws the ghost
     and player (see the mounted gate), so it never doubles the ghost curve. */
  .yuta-poster {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    z-index: 0;
    pointer-events: none;
  }
</style>
