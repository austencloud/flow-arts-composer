<!--
  The Shape Engine's loading drawing. On the grid side the 4x4 shows up as
  empty frames and its flowers draw themselves in, edge flowers first; on the
  stage side two hands trace a flower the way the live stage does. The flowers
  are real Level 2 shapes (shape-loader-flowers.ts).

  The drawing is the progress indicator: it creeps while the matrix builds and
  closes only once it is ready (shape-loader-progress.ts), then hands over
  through `onfinished`. It is server-rendered SVG whose CSS keyframes start
  moving before the page's script arrives; on mount the script picks up from
  wherever the keyframes got to (shape-loader-motion.ts).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { s as t } from "../../strings.svelte.js";
  import { loaderFinished, loaderProgress } from "../../services/shape-loader-progress.js";
  import { LOADER_HAND_RING } from "../../services/shape-loader-flowers.js";
  import {
    STAGE_FLOWERS,
    flowerLengthAt,
    flowerPathD,
    flowerTipAt,
    gridCellStart,
    gridKeyframesCss,
    gridLocal,
    handAt,
    loaderAnimation,
    stageKeyframesCss,
    stageUpTo,
  } from "../../services/shape-loader-motion.js";
  import { SHAPE_MATRIX_GUIDE_COLORS } from "../../services/shape-matrix-render.js";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";

  interface Props {
    variant: "grid" | "stage";
    /** The matrix has finished building. */
    ready: boolean;
    /** The closing stroke has played out; the real content can take over. */
    onfinished?: () => void;
  }
  let { variant, ready, onfinished }: Props = $props();

  let svg = $state<SVGSVGElement | null>(null);
  let driven = $state(false);
  let readyAt: number | null = null;
  let startedAt = 0;

  /* The player's own prop colours when they picked some, as the grid uses. */
  const chosen = $derived(getSettings().primaryPropColors);
  const blue = $derived(chosen?.left ?? SHAPE_MATRIX_GUIDE_COLORS.left);
  const red = $derived(chosen?.right ?? SHAPE_MATRIX_GUIDE_COLORS.right);

  const FLOWER_SCALE = 0.43;
  const gridCells: { row: number; col: number; start: number; diagonal: number }[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (row === 0 && col === 0) continue;
      gridCells.push({ row, col, start: gridCellStart(row, col), diagonal: row + col - 1 });
    }
  }
  const stageTrails = STAGE_FLOWERS.map((index, hand) => ({
    index,
    hand: hand as 0 | 1,
    mirror: hand === 1,
    d: flowerPathD(index, 0, 0, 1, hand === 1),
  }));
  // svelte-ignore state_referenced_locally
  const styleTag = `<style>${variant === "grid" ? gridKeyframesCss() : stageKeyframesCss()}</style>`;

  $effect(() => {
    if (ready && readyAt === null) readyAt = performance.now() - startedAt;
  });

  onMount(() => {
    const element = svg;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /* Pick up the keyframes' clock so the drawing carries on without a jump. */
    const clock = element.getAnimations({ subtree: true })[0]?.currentTime;
    startedAt = performance.now() - (typeof clock === "number" ? clock : 0);
    if (ready) readyAt = performance.now() - startedAt;
    driven = true;

    const grid = [...element.querySelectorAll<SVGPathElement>("path[data-start]")];
    const trails = [...element.querySelectorAll<SVGPathElement>("path[data-hand]")];
    const tips = [...element.querySelectorAll<SVGCircleElement>("circle[data-tip]")];
    const hands = [...element.querySelectorAll<SVGCircleElement>("circle[data-hand-dot]")];
    const strings = [...element.querySelectorAll<SVGLineElement>("line[data-string]")];
    const place = (node: SVGElement, [x, y]: [number, number]) => {
      node.style.transform = `translate(${x}px, ${y}px)`;
    };

    const paint = (p: number) => {
      for (const path of grid) {
        path.style.strokeDashoffset = String(1 - gridLocal(p, Number(path.dataset.start)));
      }
      for (const { index, hand, mirror } of stageTrails) {
        if (!trails[hand]) continue;
        const u = stageUpTo(p, hand);
        trails[hand].style.strokeDashoffset = String(1 - flowerLengthAt(index, u));
        const tip = flowerTipAt(index, u, mirror);
        const at = handAt(u, mirror);
        if (tips[hand]) place(tips[hand], tip);
        if (hands[hand]) place(hands[hand], at);
        const line = strings[hand];
        if (line) {
          line.setAttribute("x1", String(at[0]));
          line.setAttribute("y1", String(at[1]));
          line.setAttribute("x2", String(tip[0]));
          line.setAttribute("y2", String(tip[1]));
        }
      }
    };

    let frame = 0;
    let handedOver = false;
    const draw = () => {
      const elapsed = performance.now() - startedAt;
      paint(reduced ? 1 : loaderProgress(elapsed, readyAt));
      const finished = reduced ? readyAt !== null : loaderFinished(elapsed, readyAt);
      if (finished && !handedOver) {
        handedOver = true;
        onfinished?.();
        return;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  });
</script>

<div
  class="loader"
  class:driven
  style:--loader-blue={blue}
  style:--loader-red={red}
>
  {@html styleTag}
  {#if variant === "grid"}
    <svg bind:this={svg} viewBox="0 0 5 5" aria-hidden="true">
      {#each gridCells as cell (`${cell.row}-${cell.col}`)}
        {#if cell.row > 0 && cell.col > 0}
          <rect class="frame" x={cell.col + 0.01} y={cell.row + 0.01} width="0.98" height="0.98" />
        {/if}
        {#if cell.col > 0}
          <path
            class="trail red"
            d={flowerPathD(cell.col - 1, cell.col + 0.5, cell.row + 0.5, FLOWER_SCALE, true)}
            pathLength="1"
            data-start={cell.start}
            style:animation={loaderAnimation(`shape-loader-g${cell.diagonal}`)}
          />
        {/if}
        {#if cell.row > 0}
          <path
            class="trail blue"
            d={flowerPathD(cell.row - 1, cell.col + 0.5, cell.row + 0.5, FLOWER_SCALE, false)}
            pathLength="1"
            data-start={cell.start}
            style:animation={loaderAnimation(`shape-loader-g${cell.diagonal}`)}
          />
        {/if}
      {/each}
    </svg>
  {:else}
    <svg bind:this={svg} viewBox="-1.06 -1.06 2.12 2.12" aria-hidden="true">
      <defs>
        <filter id="shape-loader-glow" x="-0.2" y="-0.2" width="1.4" height="1.4">
          <feGaussianBlur stdDeviation="0.018" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle class="ring" r={LOADER_HAND_RING} />
      {#each stageTrails as trail (trail.hand)}
        <path
          class="trail glow"
          class:blue={trail.hand === 0}
          class:red={trail.hand === 1}
          d={trail.d}
          pathLength="1"
          data-hand={trail.hand}
          filter="url(#shape-loader-glow)"
          style:animation={loaderAnimation(`shape-loader-s${trail.hand}`)}
        />
      {/each}
      {#each stageTrails as trail (trail.hand)}
        <line class="string" data-string={trail.hand} />
        <circle
          class="hand-dot"
          r="0.022"
          data-hand-dot={trail.hand}
          style:animation={loaderAnimation(`shape-loader-h${trail.hand}`)}
        />
        <circle
          class="tip"
          class:blue={trail.hand === 0}
          class:red={trail.hand === 1}
          r="0.034"
          data-tip={trail.hand}
          filter="url(#shape-loader-glow)"
          style:animation={loaderAnimation(`shape-loader-t${trail.hand}`)}
        />
      {/each}
    </svg>
  {/if}
  <p class="caption" aria-live="polite">{t("shape_engine_building_matrix")}</p>
</div>

<style>
  .loader {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 0.5rem;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 0.75rem 0.75rem 1rem;
    box-sizing: border-box;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: visible;
  }

  .frame {
    fill: none;
    stroke: rgb(255 255 255 / 0.07);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
    animation: shape-loader-frames 400ms ease-out both;
  }

  .ring {
    fill: none;
    stroke: rgb(255 255 255 / 0.08);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }

  /* Widths are in drawing units, not pixels: a non-scaling stroke would
     measure its dashes in pixels too and break the draw-on. */
  .trail {
    fill: none;
    stroke-width: 0.011;
    stroke-linejoin: round;
    stroke-linecap: round;
    stroke-dasharray: 1 1;
    stroke-dashoffset: 1;
  }

  .trail.glow {
    stroke-width: 0.009;
  }

  .blue {
    stroke: var(--loader-blue);
  }

  .red {
    stroke: var(--loader-red);
  }

  .tip.blue {
    fill: var(--loader-blue);
    stroke: none;
  }

  .tip.red {
    fill: var(--loader-red);
    stroke: none;
  }

  .hand-dot {
    fill: rgb(200 205 215);
  }

  .string {
    stroke: rgb(255 255 255 / 0.45);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
    opacity: 0;
  }

  /* Script has taken over: it places everything itself, strings included. */
  .driven :global(*) {
    animation: none !important;
  }

  .driven .string {
    opacity: 1;
  }

  .caption {
    margin: 0;
    text-align: center;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.62));
    font-size: var(--font-size-min, 0.875rem);
    letter-spacing: 0.02em;
  }

  @keyframes shape-loader-frames {
    from {
      opacity: 0;
    }
  }

  /* Reduced motion: the finished drawing, dimmed, with nothing travelling. */
  @media (prefers-reduced-motion: reduce) {
    svg {
      opacity: 0.55;
    }

    .trail {
      animation: none !important;
      stroke-dashoffset: 0;
    }

    .tip,
    .hand-dot,
    .string {
      display: none;
    }
  }
</style>
