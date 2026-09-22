<!--
  ArtifactTile — one profile tile, routed by medium.

  Every tile is a fixed-aspect stage that reserves its box before anything
  loads, so granting or revoking a live token never moves a neighbour
  (no-layout-shift.md). The poster/live swap goes through the shared
  `Crossfade` primitive in `fill` mode — the tile IS a sized stage, which is
  exactly the case the default content-sized mode gets wrong
  (crossfade-primitive.md).

  The remount on key flip is deliberate here, not a cost to avoid: revoking a
  token has to actually tear the animation stack down. `LazyMount` alone keeps
  its child mounted forever after first activation, so the AnimationLoop would
  keep running off screen and the budget would mean nothing.
-->
<script lang="ts">
  import { fade } from "svelte/transition";
  import { untrack } from "svelte";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import PropAwareThumbnail from "$lib/shared/browse/components/PropAwareThumbnail.svelte";
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { getTipPointsBaseline } from "$lib/shared/animation-engine/domain/types/prop-tip-points";
  import { engineAlignScale } from "$lib/shared/mandala/services/engine-align";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { createAnimationScope } from "$lib/shared/animation-engine/state/animation-scope.svelte";
  import { resolveRecordedPropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
  import { resolveViewingPresentation } from "$lib/shared/sequence-preview/services/viewing-presentation";
  import WordHeader from "$lib/shared/animation-engine/components/layers/WordHeader.svelte";
  import type { LiveSlots, Medium } from "./live-slots.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  let {
    slots,
    medium,
    title,
    sequence = null,
    poster = null,
    tunnel = null,
    scene = null,
    mandala = null,
    lightMode = false,
    size = "md",
    onopen,
  }: {
    slots: LiveSlots;
    medium: Medium;
    title: string;
    /** Sequence media: the notation to animate. */
    sequence?: SequenceData | null;
    /** Scene / tunnel media: the stored WebP poster. */
    poster?: string | null;
    /** Tunnel media: the saved entry, replayed live when the tile holds a token. */
    tunnel?: unknown | null;
    /** Scene media: the saved entry, rendered live when the tile holds a token.
     *  Only set when the scene carries a performance — a look-only save has no
     *  steps to animate, so it stays a poster (see scene3DHasSteps). */
    scene?: unknown | null;
    /** Mandala media: everything CollectedMandala carries. */
    mandala?: {
      steps: unknown[];
      variant: "left" | "right" | "both";
      leftPropType?: string;
      rightPropType?: string;
      pathShape?: "arc" | "linear" | "concave" | "hybrid";
    } | null;
    lightMode?: boolean;
    size?: "sm" | "md" | "lg";
    onopen?: () => void;
  } = $props();

  /** Ambient token from the coordinator (or a hover promotion). */
  let live = $state(false);

  /**
   * Hover shows you whatever you are NOT currently seeing.
   *
   * Autoplay is the default because motion is what distinguishes sequences that
   * look alike as stills. But autoplay also TAKES the choreo card away, and
   * once a tile was playing there was no route back to it — you could not look
   * up a sequence's letters, turns or QR without leaving the page. Hover is
   * that route: on a tile that is playing it holds the card up, and on a tile
   * that is resting it plays the animation (LiveSlots grants the token).
   *
   * One rule, both directions, no extra chrome on the tile.
   */
  let hovered = $state(false);
  let liveAtEnter = $state(false);

  /**
   * Hovering a PLAYING tile reveals its card. This never unmounts the player —
   * it raises the poster floor above the live layer in CSS. Unmounting would
   * tear down and rebuild the whole animation stack on every pointer pass,
   * which is the churn the rest gate exists to prevent; a z-index flip costs
   * nothing and the animation is still running when you move away.
   */
  const revealCard = $derived(hovered && liveAtEnter);

  /** What the user is actually watching, for media with no poster to raise. */
  const showLive = $derived(live && !revealCard);

  /**
   * The choreo card is up, so this tile's own header stands down.
   *
   * A choreo card is a self-contained print artifact: the word is rendered INTO
   * it, above the step grid, along with the difficulty badge and the QR. Leaving
   * the tile's header on meant hovering showed the same word twice, once in each
   * box. Austen (2026-07-29): "It's not very helpful to have the Choreo card
   * display both the title and have the title above the card container itself."
   *
   * The card wins because it is the thing being read — hover exists to hold the
   * card up for analysis, and it names itself. Suppressing the card's word
   * instead is not an option: `addWord: false` flips `usesDefaults` in
   * thumbnail-key-deriver, which drops the render out of the shared cloud cache
   * and would re-render a bespoke card on every pointer pass.
   */
  const cardUp = $derived(hovered && medium === "sequence" && !!sequence);

  /** Live playback position, fed to the step strip so its active cell rings in
   *  time with the animation. Rests at 1 when nothing is playing. */
  let playbackStep = $state(1);

  /**
   * The strip is only legible when the tile is big enough to give each
   * pictograph real estate. On archive tiles a 16-step strip would be 15px
   * cells — texture, not notation — and 120 of them is a rendering bill for
   * something nobody can read. Showcase-size tiles get it.
   */
  const showStrip = $derived(medium === "sequence" && size === "lg");

  /**
   * The overlay mandala traces THIS prop's real geometry, not the standardized
   * radius.
   *
   * Saved mandalas are drawn at MANDALA_STANDARD_TIP_DX (120) on purpose, so
   * that a mandala stays comparable across prop types — a deliberate product
   * decision, and changing it would reshape every saved mandala and every
   * printed card. But this overlay is a different job: it sits UNDER the
   * animation of a specific prop, so a standardized orbit is visibly not the
   * path the prop in front of it traces. Here, and only here, the real tip
   * distance is the correct one.
   *
   * `tipDx` and the prop types are existing SequenceMandala props — the
   * standalone collection tiles below simply don't pass them, so they keep the
   * standard. Two contexts, two correct answers, no migration.
   */
  // Both halves of the composite use the same reactive prop pair. The player
  // used to inherit the selected props while the mandala floor defaulted to a
  // saved intent or staff, so clubs could animate over a two-ended staff path.
  // Creator-recorded prop pair wins on the creator's own stage; the visitor's
  // props are only a fallback for legacy records with nothing recorded.
  const recordedPropConfig = $derived(resolveRecordedPropConfig(sequence));
  const seqPropTypes = $derived({
    left:
      recordedPropConfig?.leftPropType ??
      settingsService.settings.leftPropType ??
      "staff",
    right:
      recordedPropConfig?.rightPropType ??
      settingsService.settings.rightPropType ??
      "staff",
  });

  // Only sequence tiles play the animation player. `medium` is fixed per
  // mounted tile (the parent keys tiles by medium), so read it once.
  const tileAnimationScope = untrack(() =>
    medium === "sequence"
      ? createAnimationScope({ persistence: "ephemeral" })
      : null
  );
  const viewingPresentation = $derived(resolveViewingPresentation(sequence));
  $effect(() => {
    const look = viewingPresentation;
    if (!tileAnimationScope) return;
    untrack(() => {
      tileAnimationScope.settings.updateSettings({ trail: look.trail });
      tileAnimationScope.effects.replace(look.effects);
    });
  });

  /** Outermost tip distance for a prop, in the engine's prop-local units. */
  function tipReach(propType: string): number {
    const points = getTipPointsBaseline(propType).points;
    return points.reduce((max, p) => Math.max(max, Math.abs(p.dx)), 0);
  }

  // One radius for both hands: SequenceMandala takes a single axial `tipDx`.
  // Mixed-prop sequences are rare and the larger reach is the safer read — it
  // never draws an orbit TIGHTER than something the props actually trace.
  const overlayTipDx = $derived(
    Math.max(tipReach(seqPropTypes.left), tipReach(seqPropTypes.right))
  );

  /**
   * Sharing one box is necessary but NOT sufficient: the two renderers map that
   * box to different scales. SequenceMandala fits its own extent to the box, so
   * its hand circle floats with tipDx; the engine pins the hand orbit at a fixed
   * 150/950 of its viewBox. Left alone the overlay reads ~1.6x too wide for a
   * staff. Same correction the VTG lab's export overlay already applies.
   */
  const overlayAlign = $derived(engineAlignScale(overlayTipDx));

  function onEnter() {
    liveAtEnter = live;
    hovered = true;
  }
  function onLeave() {
    hovered = false;
  }

  // A LOOP word repeats by construction, so the raw field is routinely
  // FΨFΨFΨFΨ where the only correct display is FΨ
  // (.claude/rules/simplified-word-display.md).
  //
  // Saved collection entries predate that rule: real 3D-scene names in this
  // account read "FΨFΨFΨFΨ — 3D scene", so the repeated word is a TOKEN inside
  // a longer name and a whole-string simplify is a no-op. Simplify per token,
  // which fixes both the bare-word and the embedded-word case. The underlying
  // stored name is still wrong and wants a data repair.
  const label = $derived(
    (title || "")
      .split(/(\s+)/)
      .map((part) => (part.trim() ? simplifyRepeatedWord(part) || part : part))
      .join("") || "Untitled"
  );

  /**
   * WordHeader renders a TKA word as GLYPHS, so it must be fed a word and not
   * a decorated title. Saved scenes carry names like "FΨ — 3D scene"; handing
   * that in whole makes the header try to glyph " 3D scene" too, which both
   * mangles the head and makes it taller than its neighbours in the row.
   *
   * Take the part before an em/en dash. The trailing half is only ever the
   * medium restated, which the artwork itself already makes obvious.
   */
  const headerWord = $derived(label.split(/\s[—–-]\s/)[0]?.trim() || label);

</script>

<div
  class="tile size-{size}"
  class:is-live={showLive}
  class:reveal-card={revealCard}
  class:card-up={cardUp}
  use:slots.tile={{ medium, onChange: (next) => (live = next) }}
>
  <!-- One header, every medium, above the work — not a caption below it.
       The animation canvas already owned this treatment (AnimatorCanvas ->
       WordHeader); a mandala, a 3D scene and a tunnel had nothing, so the word
       fell to a footer caption and the sequence carried it twice. Lifting the
       SAME WordHeader out of the canvas and onto the tile gives all four media
       one identical head, and turns the tile portrait: header, then the work.
       (never-hand-roll.md — this is the existing component, not a new one.)

       `aria-hidden` while the card is up so a screen reader is not handed the
       word twice either — the card's alt text carries it. -->
  <header class="tile-head" aria-hidden={cardUp ? "true" : undefined}>
    <WordHeader word={headerWord} visible darkMode={!lightMode} />
  </header>

  <!-- Pointer + focus handlers live on the button, not the tile wrapper: it is
       the already-interactive element, so the gesture needs no invented ARIA
       role, and keyboard users get the same reveal by tabbing to it. -->
  <button
    class="stage"
    onclick={onopen}
    onpointerenter={onEnter}
    onpointerleave={onLeave}
    onfocusin={onEnter}
    onfocusout={onLeave}
    aria-label="Open {label}"
  >
    {#if medium === "sequence" && sequence}
      <!-- THE SEQUENCE PRESENTER — one composition, modelled on the landing
           hero (SequenceHeroDemo): mandala underneath, animation over it, step
           strip below.

           The mandala is the STILL layer, and that is what makes this work. It
           renders straight from steps with no cache and no warming, so a tile
           that holds no token is already identifiable — where a card-style
           thumbnail had to be rendered on demand and showed a word on black
           until it arrived. Resting and playing are now the same frame; the
           only difference is whether it moves. Nothing swaps.

           backgroundAlpha={0} makes the player request an alpha context so the
           mandala shows through — the same mechanism ShapeMatrixDrill uses to
           keep its mandala visible under the props. -->
      <div class="composite">
        <div class="canvas-zone">
          <div class="mandala-floor floor" style="--engine-align: {overlayAlign}">
            <SequenceMandala
              sequence={{ steps: (sequence.steps ?? []) as unknown[] }}
              mode="gallery"
              show="both"
              pathShape="arc"
              animate={false}
              darkMode={!lightMode}
              leftPropType={seqPropTypes.left}
              rightPropType={seqPropTypes.right}
              tipDx={overlayTipDx}
              size={320}
            />
          </div>
          {#if live}
            <div class="live-layer" transition:fade={{ duration: DURATION.normal }}>
              <LazyMount
                loader={() =>
                  import(
                    "$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte"
                  )}
                active
                props={{
                  sequence,
                  leftPropType: seqPropTypes.left,
                  rightPropType: seqPropTypes.right,
                  primaryPropColors: viewingPresentation.primaryPropColors,
                  visibilityManagerOverride: tileAnimationScope?.visibility,
                  effectsConfigState: tileAnimationScope?.effects,
                  trailSettingsOverride: tileAnimationScope?.settings.trail,
                  autoPlay: true,
                  showControls: false,
                  chrome: "minimal",
                  fill: true,
                  interactive: false,
                  disableContextMenu: true,
                  beatIndicators: false,
                  hideStepNumbers: true,
                  backgroundAlpha: 0,
                  onStepChange: (step: number) => (playbackStep = step),
                }}
              />
            </div>
          {/if}
        </div>

        {#if showStrip}
          <!-- The same StepStrip the landing hero and focused practice use.
               `currentStep` follows the player's onStepChange, so the active
               cell rings in time with the animation; at rest it sits on step 1
               and simply reads as the sequence's notation. -->
          <div class="strip-zone">
            <LazyMount
              loader={() => import("$lib/shared/timeline/StepStrip.svelte")}
              active
              props={{
                sequence,
                currentStep: playbackStep,
                bpm: 60,
                density: "compact",
                fillHeight: true,
                anchor: "center",
                orientation: "horizontal",
                loop: false,
                stepPulse: false,
              }}
            />
          </div>
        {/if}
      </div>

      <!-- Hover holds the choreo card up for analysis. It is the print
           artifact — QR, full step grid, turns — meant to be read deliberately,
           so it is a request, never the resting state. -->
      {#if hovered}
        <div class="card-overlay" transition:fade={{ duration: DURATION.fast }}>
          <PropAwareThumbnail {sequence} {lightMode} />
        </div>
      {/if}
    {:else if medium === "mandala" && mandala}
      <!-- No stored poster on CollectedMandala — it always renders from steps.
           `animate` is the only thing the token gates, so there is nothing to
           crossfade and nothing to remount. -->
      <div class="poster mandala-poster">
        <SequenceMandala
          sequence={{ steps: mandala.steps }}
          mode="gallery"
          show={mandala.variant}
          leftPropType={mandala.leftPropType}
          rightPropType={mandala.rightPropType}
          pathShape={mandala.pathShape ?? "arc"}
          animate={showLive}
          animateRotation={0}
          darkMode={!lightMode}
          size={320}
        />
      </div>
    {:else if medium === "tunnel" && tunnel}
      <!-- TunnelDetailPreview mounts the real kaleidoscope renderer with a
           fully per-instance seam (local controller, persist:false effects, and
           capture/restore around the three globals TunnelArtView reads). That
           sandbox is what makes it safe to mount N of them in a gallery — a
           preview must never mutate the user's live viewer state.

           The stored poster stays underneath for the whole tile lifetime (see
           the sequence branch), so the renderer's mount is never a black box. -->
      {#if poster}
        <img class="poster-img floor" src={poster} alt={label} loading="lazy" />
      {:else}
        <div class="poster floor empty">No preview</div>
      {/if}
      {#if live}
        <div class="live-layer" transition:fade={{ duration: DURATION.normal }}>
          <LazyMount
            loader={() =>
              import(
                "$lib/features/tunnel-collection/components/TunnelDetailPreview.svelte"
              )}
            active
            props={{ tunnel }}
          />
        </div>
      {/if}
    {:else if medium === "scene" && scene}
      <!-- Scene3DPreview mounts the real Viewer3DCanvas from a construction
           seed, so it reads and writes none of the user's global viewer state —
           the property that lets several of these coexist at all. Its camera
           orbits on its own, since a tile is watched rather than driven.

           Same permanent-floor shape as the tunnel branch, and it matters most
           here: a WebGL context plus a GLB environment is the slowest thing on
           the page to first paint, so this is the tile that would show black
           longest. Revoking still tears the canvas down — the floor is an
           image, not a retained renderer. -->
      {#if poster}
        <img class="poster-img floor" src={poster} alt={label} loading="lazy" />
      {:else}
        <div class="poster floor empty">No preview</div>
      {/if}
      {#if live}
        <div class="live-layer" transition:fade={{ duration: DURATION.normal }}>
          <LazyMount
            loader={() =>
              import(
                "$lib/features/scene-3d-collection/components/Scene3DPreview.svelte"
              )}
            active
            props={{ scene }}
          />
        </div>
      {/if}
    {:else if poster}
      <img class="poster-img" src={poster} alt={label} loading="lazy" />
    {:else}
      <div class="poster empty">No preview</div>
    {/if}
  </button>

</div>

<style>
  /* Every measure here is `em`, not `rem`: the stage rides a container-query
     font ramp (the same one CreatorsPanel's roster uses), so one declaration
     on the ancestor scales type, gaps and radii together. A `rem` here would
     freeze at 1080p proportions while its neighbours grew — the exact 4K
     failure 4k-native-layout.md describes. */
  .tile {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    min-width: 0;
  }

  .stage {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    display: block;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75em;
    background: var(--theme-card-bg);
    cursor: pointer;
    transition:
      border-color var(--duration-normal) ease,
      transform var(--duration-normal) ease;
  }

  .stage:hover {
    border-color: var(--theme-stroke-strong);
    transform: translateY(-2px);
  }

  .tile.is-live .stage {
    border-color: color-mix(in srgb, var(--theme-accent) 55%, transparent);
  }

  .poster,
  .poster-img {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* The floor fills the stage and never leaves. The live layer sits directly
     on top of it, so there is no moment where the tile has nothing in it. */
  .floor {
    position: absolute;
    inset: 0;
  }

  .live-layer {
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  /* Hover on a playing tile lifts the card back over the animation. The player
     keeps running underneath — no remount, and letting go returns you to the
     motion mid-stride. */
  .tile.reveal-card .floor {
    z-index: 2;
  }

  /* The presenter: canvas takes the room, strip takes what it needs. Both are
     inside the stage's fixed box, so adding or removing the strip cannot
     change the tile's height (no-layout-shift.md). */
  .composite {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .canvas-zone {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
  }

  /* The mandala and the animation depict the SAME motion, so they have to share
     one box or the traced path cannot line up with the drawing beneath it.
     SequenceMandala sizes its own element from its `size` prop (measured: 320px
     square inside a 595x464 zone, while the player filled the zone), so the two
     coordinate spaces mapped to different pixels-per-unit and the mandala read
     as a different, larger orbit than the prop actually traces.

     Stretching the canvas past `size` is supported by the component — it
     re-reads its true on-screen box via getBoundingClientRect and re-resolves
     the backing store, so this does not render soft. */
  /* --engine-align cancels SequenceMandala's self-fitting so its hand circle
     sits on the engine's hand orbit. Transform, not a smaller `size`: size feeds
     the backing-store resolution, so shrinking it would render the mandala soft
     as well as small. Scaling about the centre keeps both origins coincident. */
  .mandala-floor {
    display: block;
    transform: scale(var(--engine-align, 1));
    transform-origin: center center;
  }

  .mandala-floor :global(.mandala-container),
  .mandala-floor :global(canvas),
  .mandala-floor :global(svg) {
    width: 100% !important;
    height: 100% !important;
  }

  .strip-zone {
    flex: 0 0 auto;
    height: 22%;
    min-height: 2.5em;
    padding: 0.25em;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    overflow: hidden;
  }

  /* The card is an overlay on request, not a layer in the composition — it
     covers the whole stage so it can be read as the artifact it is. */
  .card-overlay {
    position: absolute;
    inset: 0;
    z-index: 3;
    background: var(--theme-card-bg, #000);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .poster-img {
    object-fit: cover;
  }

  /* A collection mandala must fill its square stage, at whatever size that
     stage actually is.

     Two bugs lived here. `size={320}` is a fixed pixel count, so on an archive
     or collection tile (~165px at high column counts) the mandala rendered
     bigger than its box and `overflow: hidden` cropped it — it looked like it
     was escaping the container because it WAS. And `animate` switches
     SequenceMandala from SVG to canvas: the SVG holds its aspect through its
     viewBox, the canvas simply stretches to its CSS box, so a mandala turned
     oval the moment it started animating and snapped round again on hover
     (hover reveals the still card). Pinning both elements to a square box that
     is 100% of the square stage fixes the crop and the squish together. */
  /* No rotation on a tile (animateRotation={0}). SequenceMandala rotates 90deg
     per undulation cycle by default, and a rotating square's bounding box grows
     by |cos|+|sin| — up to 1.41x — so the mandala grew past the square stage
     and got clipped on the diagonal the moment it began animating, then snapped
     back to round on hover because hover stops it. Undulation alone animates
     without ever leaving the box, which keeps the mandala as big as Austen
     wants it AND inside its container. */
  .mandala-poster {
    width: 100%;
    height: 100%;
  }

  .mandala-poster :global(.mandala-container),
  .mandala-poster :global(canvas),
  .mandala-poster :global(svg) {
    width: 100% !important;
    height: 100% !important;
  }

  .poster.empty {
    color: var(--theme-text-dim);
    font-size: 0.8125em;
  }

  /* Header sits ON the tile, above the work. Reserved height (not intrinsic)
     so a one-glyph word and a long one give every tile in a row the same head
     and the grid baseline never jitters (no-layout-shift.md). */
  /* Header sits ON the tile, above the work, CENTRED on the box it labels.
     It briefly carried a medium tag on the right, which pushed the word off
     that centre — and the tag was telling you what the artwork underneath
     already shows. Removed: the word centres, and a mandala reads as a mandala
     without being told.

     Reserved height (not intrinsic) so a one-glyph word and a four-glyph word
     give every tile in a row the same head (no-layout-shift.md). */
  .tile-head {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    height: 2.75em;
    overflow: hidden;
  }

  .tile-head > :global(*) {
    min-width: 0;
    max-width: 100%;
  }

  /* The box KEEPS its height — only its contents fade. Collapsing it would
     resize the tile under the pointer and shove every neighbour in the row on
     hover (no-layout-shift.md). Timed to the card's own fade so one word hands
     over to the other rather than both being visible mid-transition. */
  .tile.card-up .tile-head {
    opacity: 0;
  }

  .tile-head {
    transition: opacity var(--duration-fast, 150ms) ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .tile-head {
      transition: none;
    }
  }

  .size-sm .stage {
    border-radius: 0.5em;
  }

  /* Short-landscape (Z Fold folded, 960x412): a 1:1 tile is taller than the
     viewport, so one tile fills the screen and clips. Cap by viewport height
     instead — the stage stays a stage, it just stops being square. */
  @media (max-height: 560px) {
    .stage {
      aspect-ratio: auto;
      height: 46vh;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .stage,
    .stage:hover {
      transition: none;
      transform: none;
    }
  }
</style>
