<!--
  PLACEMENTS CONCEPT — "grid way" picture (design-reaction scaffold, throwaway).

  ONE hero visual: the real diamond grid + the REAL hand prop, loaded through the
  actual propSvgLoader (correct color, viewBox, native size, center), placed on
  the REAL diamond hand points. Press Next → hands slide between alpha/beta/gamma.

  Hands keep FIXED orientation (no prop-style rotation-angle map) — only placement
  changes. Right hand mirrored, same as PropSvg. Size = asset native size in the
  950 grid space (loader applies no scale), placed via translate(-center).
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import { slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { propSvgLoader } from "$lib/shared/pictograph/prop/services/prop-svg-loader";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import type { PropPlacementData } from "$lib/shared/pictograph/prop/domain/models/prop-placement-data";
  import LessonGridDisplay from "$lib/shared/pictograph/grid/components/LessonGridDisplay.svelte";

  type SvgData = {
    svgContent: string;
    viewBox: { width: number; height: number };
    center: { x: number; y: number };
  };

  type Pt = { x: number; y: number };

  // The 8 hand points around the grid (radius ~143 from center), clockwise from N.
  // Even index = diamond (cardinal); odd index = box (intercardinal). grid-coordinates.ts.
  const PTS: Pt[] = [
    { x: 475.0, y: 331.9 }, // 0  N  diamond
    { x: 576.2, y: 373.8 }, // 1  NE box
    { x: 618.1, y: 475.0 }, // 2  E  diamond
    { x: 576.2, y: 576.2 }, // 3  SE box
    { x: 475.0, y: 618.1 }, // 4  S  diamond
    { x: 373.8, y: 576.2 }, // 5  SW box
    { x: 331.9, y: 475.0 }, // 6  W  diamond
    { x: 373.8, y: 373.8 }, // 7  NW box
  ];
  const isDiamondPt = (idx: number) => idx % 2 === 0;
  const wrap8 = (n: number) => ((n % 8) + 8) % 8;

  // beta's two hand props share one grid point; offset them a constant L/R amount
  // (independent of grid location) so both read. Hand-prop rendering circumstance.
  const BETA_DX = 16;

  // A placement = the angular offset (in 45° steps) between the two hands.
  type PlacementKind = "alpha" | "beta" | "gamma";
  type PlacementStep = { name: string; vtg: string; kind: PlacementKind; caption: string };
  // vtg = old-school VTG timing word (split/together/quarter), subtle nod.
  const steps: PlacementStep[] = [
    {
      name: "Alpha",
      vtg: "Split",
      kind: "alpha",
      caption: "Hands at opposite points on the grid.",
    },
    {
      name: "Beta",
      vtg: "Together",
      kind: "beta",
      caption: "Both hands at the same point.",
    },
    {
      name: "Gamma",
      vtg: "Quarter",
      kind: "gamma",
      caption: "Hands at neighboring points, a right angle apart.",
    },
  ];
  // Canonical bases (left, right), grounded in generate-skewed-dataframe.ts + MCP.
  // Left anchors at SOUTH for all three; right animates N → S → E across the walkthrough.
  //   alpha1 = left S, right N | beta5 = left S, right S | gamma11 = left S, right E
  const BASE: Record<PlacementKind, { right: number; left: number }> = {
    alpha: { right: 0, left: 4 }, // right N, left S
    beta: { right: 4, left: 4 }, // right S, left S
    gamma: { right: 2, left: 4 }, // right E, left S
  };

  // Canonical letter glyph, bottom-left at x=50 y=800 in the 950 space (per TKAGlyph).
  // Greek glyph SVGs; recolored off-white via CSS for the dark background.
  const GLYPH: Record<PlacementKind, { src: string; w: number; h: number }> = {
    alpha: { src: "/images/letters_trimmed/Type6/α.svg", w: 92.22, h: 100 },
    beta: { src: "/images/letters_trimmed/Type6/β.svg", w: 66.05, h: 100 },
    gamma: { src: "/images/letters_trimmed/Type6/γ.svg", w: 79, h: 100.11 },
  };

  // Resolve a placement's two hand points for a given rotation / color-swap / mirror.
  // `cell` = geometric state id (right's point index before hand swap), for the discovery tray.
  // Hands from explicit current point indices. Transforms mutate these directly
  // (one-shot algebra), so rotation stays clockwise no matter what came before.
  function handsFor(kind: PlacementKind, rightIdx, leftIdx) {
    const rp = PTS[rightIdx]!;
    let right = rp;
    let left = PTS[leftIdx]!;
    if (kind === "beta") {
      // both hands share one grid point: constant offset so both props read.
      // Offset the right hand rightward and the left hand leftward.
      right = { x: rp.x + BETA_DX, y: rp.y };
      left = { x: rp.x - BETA_DX, y: rp.y };
    }
    // discovery identity + variation count:
    //  alpha = 4 pairs × 2 colorings, beta = 8 points → 8; gamma = 8 pairs × 2 → 16.
    let cell: number, total: number;
    if (kind === "gamma") {
      const diff = wrap8(leftIdx - rightIdx); // 2 (right leads) or 6 (left leads)
      cell = rightIdx + (diff === 2 ? 0 : 8);
      total = 16;
    } else {
      cell = rightIdx;
      total = 8;
    }
    return { right, left, diamond: isDiamondPt(rightIdx), cell, total };
  }
  const baseHands = (kind: PlacementKind) =>
    handsFor(kind, BASE[kind].right, BASE[kind].left);

  const COMPARE = steps.length; // index of the compare-row stage
  const TOTAL = steps.length + 1;

  let i = $state(0);
  const isCompare = $derived(i === COMPARE);
  const step = $derived(steps[Math.min(i, steps.length - 1)]!);
  const lastIdx = steps.length - 1; // gamma
  const FLIP_MS = 600;
  const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

  // FLIP morph refs: big hero ↔ gamma row card; peel refs for alpha/beta.
  let heroEl = $state<HTMLDivElement>();
  let squareEls = $state<(HTMLElement | undefined)[]>([]);
  let figureEls = $state<(HTMLElement | undefined)[]>([]);
  let stackOriginLeft = 0; // gamma column x, stashed so the Back out-transition has a target

  let rightHand = $state<SvgData | null>(null);
  let leftHand = $state<SvgData | null>(null);

  async function loadHand(color: HandSide): Promise<SvgData | null> {
    const motionData = {
      propType: PropType.HAND,
      color,
    } as unknown as MotionData;
    const propData = {
      positionX: 0,
      positionY: 0,
      rotationAngle: 0,
      coordinates: null,
      svgCenter: null,
      svgMirrored: false,
      manualAdjustmentX: 0,
      manualAdjustmentY: 0,
    } as unknown as PropPlacementData;
    // useGridVersion=true → the grid-centered animated hand asset (built for movement).
    const r = await propSvgLoader.loadPropSvg(propData, motionData, true, {
      themeMode: "light",
    });
    return r.svgData as SvgData | null;
  }

  onMount(async () => {
    [rightHand, leftHand] = await Promise.all([
      loadHand(HandSide.RIGHT),
      loadHand(HandSide.LEFT),
    ]);
  });

  function prefersReduced() {
    return (
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  // FLIP: animate `el` from a previously-measured rect to its current spot.
  function flipFrom(el: HTMLElement | undefined, first: DOMRect | null) {
    if (!el || !first || prefersReduced()) return;
    const last = el.getBoundingClientRect();
    if (!last.width || !last.height) return;
    el.animate(
      [
        {
          transformOrigin: "top left",
          transform: `translate(${first.left - last.left}px, ${first.top - last.top}px) scale(${first.width / last.width}, ${first.height / last.height})`,
        },
        { transformOrigin: "top left", transform: "none" },
      ],
      { duration: FLIP_MS, easing: EASE }
    );
  }

  // alpha/beta peel: slides between own slot and gamma's column + fades.
  // Runs on BOTH mount (in) and unmount (out), so Back animates out symmetrically.
  // Gamma's own figure is a no-op here — it morphs via the WAAPI FLIP instead.
  function peelTransition(
    node: Element,
    params: { slots: number },
    opts?: { direction?: string }
  ) {
    if (prefersReduced() || node === figureEls[lastIdx]) return { duration: 0 };
    const me = node.getBoundingClientRect();
    const g = squareEls[lastIdx]?.getBoundingClientRect();
    const targetLeft = g ? g.left : stackOriginLeft;
    const offset = targetLeft - me.left;
    // on the way out (Back), fade to 0 early so the tail of the fade isn't seen.
    const fadeOutEarly = opts?.direction === "out";
    return {
      delay: Math.max(0, params.slots - 1) * 90,
      duration: 520,
      easing: cubicOut,
      css: (t: number) => {
        const o = fadeOutEarly ? Math.max(0, (t - 0.45) / 0.55) : t;
        return `transform: translateX(${(1 - t) * offset}px); opacity: ${o};`;
      },
    };
  }

  // ---- Stage 3: tap a placement → expand a focus panel that proves invariance ----
  let focus = $state<number | null>(null); // which compare card is expanded (0/1/2)
  let rightIdx = $state(0); // current right-hand point index (live state the actions mutate)
  let leftIdx = $state(0);
  let visited = $state<Set<number>>(new Set());
  let lastAction = $state("");

  const focusStep = $derived(focus === null ? null : steps[focus]);
  const focusHands = $derived(
    focusStep ? handsFor(focusStep.kind, rightIdx, leftIdx) : null
  );
  // which discovery state is on screen + how many total for this placement (8 or 16)
  const currentCell = $derived(focusHands ? focusHands.cell : 0);
  const focusTotal = $derived(focusHands ? focusHands.total : 8);

  $effect(() => {
    if (focus !== null && !visited.has(currentCell)) {
      visited = new Set(visited).add(currentCell);
    }
  });

  function openFocus(idx: number) {
    if (focus === idx) {
      focus = null;
      return;
    } // tap the open card again to close
    focus = idx;
    const k = steps[idx]!.kind;
    rightIdx = BASE[k].right;
    leftIdx = BASE[k].left;
    visited = new Set();
    lastAction = "";
  }
  function doRotate() {
    // clockwise step applied to the live state (PTS ordered clockwise from N → +1)
    rightIdx = wrap8(rightIdx + 1);
    leftIdx = wrap8(leftIdx + 1);
    lastAction = `Rotated clockwise — still ${steps[focus!]!.name}.`;
  }
  function doMirror() {
    const nr = wrap8(8 - rightIdx),
      nb = wrap8(8 - leftIdx); // reflect across the vertical axis
    const noChange = nr === rightIdx && nb === leftIdx;
    rightIdx = nr;
    leftIdx = nb;
    lastAction = noChange
      ? `Mirror does nothing here — this one's symmetric. Still ${steps[focus!]!.name}.`
      : `Mirrored — still ${steps[focus!]!.name}.`;
  }
  function doSwap() {
    const noChange = rightIdx === leftIdx; // beta: both hands at one point
    [rightIdx, leftIdx] = [leftIdx, rightIdx];
    lastAction = noChange
      ? `Swap does nothing here — both hands share a point. Still ${steps[focus!]!.name}.`
      : `Swapped colors — still ${steps[focus!]!.name}.`;
  }

  async function go(n: number) {
    focus = null; // collapse any open focus panel before changing stage
    const from = i;
    const to = Math.max(0, Math.min(TOTAL - 1, n));
    if (to === from) return;

    const entering = to === COMPARE && from === lastIdx; // gamma → row
    const leaving = from === COMPARE && to === lastIdx; // row → gamma

    let firstRect: DOMRect | null = null;
    if (entering && heroEl) firstRect = heroEl.getBoundingClientRect();
    else if (leaving && squareEls[lastIdx])
      firstRect = squareEls[lastIdx]!.getBoundingClientRect();
    if (leaving && firstRect) {
      stackOriginLeft = firstRect.left;
      // hide the small gamma card immediately so only the morphing hero shows
      const gFig = figureEls[lastIdx];
      if (gFig) gFig.style.opacity = "0";
    }

    i = to;
    await tick();

    if (entering) {
      flipFrom(squareEls[lastIdx], firstRect);
    } else if (leaving) {
      flipFrom(heroEl, firstRect);
    }
  }
</script>

<svelte:head><title>Placements Concept — grid way</title></svelte:head>

{#snippet hand(sd: SvgData, p: Pt, mirror: boolean)}
  <!-- same transform as PropSvg, minus rotation: translate(point) [mirror] translate(-center) -->
  <g
    class="hand"
    style="transform: translate({p.x}px, {p.y}px) {mirror
      ? 'scaleX(-1) '
      : ''}translate({-sd.center.x}px, {-sd.center.y}px);"
  >
    {@html sd.svgContent}
  </g>
{/snippet}

{#snippet letterGlyph(kind: PlacementKind)}
  <image
    class="glyph"
    href={GLYPH[kind].src}
    x="50"
    y="800"
    width={GLYPH[kind].w}
    height={GLYPH[kind].h}
    aria-hidden="true"
  />
{/snippet}

{#snippet squareInner(s: PlacementStep)}
  {@const b = baseHands(s.kind)}
  <div class="card-grid">
    <LessonGridDisplay type="diamond" showLabels={false} size="medium" />
  </div>
  <svg class="card-hands" viewBox="0 0 950 950" aria-hidden="true">
    {@render letterGlyph(s.kind)}
    {#if rightHand}{@render hand(rightHand, b.right, true)}{/if}
    {#if leftHand}{@render hand(leftHand, b.left, false)}{/if}
  </svg>
{/snippet}

<div class="shell">
  <div class="crumb">SKELETON · Hand Placements · the grid way</div>

  <div class="stage">
    {#if isCompare}
      <div class="pane">
        <div class="compare">
          {#each steps as s, idx (s.name)}
            <figure
              class="card"
              class:selected={focus === idx}
              style="z-index:{idx};"
              bind:this={figureEls[idx]}
              transition:peelTransition|global={{
                slots: steps.length - 1 - idx,
              }}
            >
              <button
                type="button"
                class="card-square"
                bind:this={squareEls[idx]}
                onclick={() => openFocus(idx)}
                aria-pressed={focus === idx}
                aria-label={`Explore ${s.name}`}
              >
                {@render squareInner(s)}
              </button>
              <figcaption>
                <span class="eyebrow">{s.vtg}</span>
                <b>{s.name}</b>
              </figcaption>
            </figure>
          {/each}
        </div>
        <div class="label">
          <p>These are the three basic placements. Tap one to play with it.</p>
        </div>

        {#if focus !== null && focusStep && focusHands}
          <div class="focus" transition:slide={{ duration: 320 }}>
            <div class="focus-head">
              <span class="eyebrow">{focusStep.vtg}</span>
              <h2>{focusStep.name}</h2>
            </div>

            <div class="focus-pic">
              <div class="grid-layer">
                <LessonGridDisplay
                  type={focusHands.diamond ? "diamond" : "box"}
                  showLabels={false}
                  size="large"
                />
              </div>
              <svg class="hand-layer" viewBox="0 0 950 950" aria-hidden="true">
                {@render letterGlyph(focusStep.kind)}
                {#if rightHand}{@render hand(
                    rightHand,
                    focusHands.right,
                    true
                  )}{/if}
                {#if leftHand}{@render hand(
                    leftHand,
                    focusHands.left,
                    false
                  )}{/if}
              </svg>
            </div>

            <p class="focus-caption">
              {lastAction ||
                `Rotate, mirror, or swap hands — it stays ${focusStep.name}.`}
            </p>

            <div class="focus-controls">
              <button type="button" class="tbtn" onclick={doRotate}
                >⟳ Rotate</button
              >
              <button type="button" class="tbtn" onclick={doMirror}
                >⇄ Mirror</button
              >
              <button type="button" class="tbtn" onclick={doSwap}
                >◐ Swap colors</button
              >
            </div>

            <div class="tray">
              <div
                class="tray-grid"
                style="grid-template-columns: repeat({focusTotal > 8
                  ? 8
                  : 4}, auto);"
              >
                {#each Array(focusTotal) as _, c}
                  <span class="cell" class:lit={visited.has(c)}></span>
                {/each}
              </div>
              <span class="tray-count"
                >Discovered {visited.size} of {focusTotal}</span
              >
            </div>
          </div>
        {/if}
      </div>
    {:else}
      {@const hb = baseHands(step.kind)}
      <div class="pane pane-front">
        <div class="hero" bind:this={heroEl}>
          <div class="grid-layer">
            <LessonGridDisplay type="diamond" showLabels={false} size="large" />
          </div>

          <svg class="hand-layer" viewBox="0 0 950 950" aria-hidden="true">
            {@render letterGlyph(step.kind)}
            {#if rightHand}{@render hand(rightHand, hb.right, true)}{/if}
            {#if leftHand}{@render hand(leftHand, hb.left, false)}{/if}
          </svg>
        </div>

        {#key i}
          <div class="label">
            <span class="eyebrow">{step.vtg}</span>
            <h1>{step.name}</h1>
            <p>{step.caption}</p>
          </div>
        {/key}
      </div>
    {/if}
  </div>

  <footer class="nav">
    <button class="navbtn" disabled={i === 0} onclick={() => go(i - 1)}
      >‹ Back</button
    >
    <div class="ticks">
      {#each Array(TOTAL) as _, idx}
        <button
          class="tick"
          class:on={idx === i}
          onclick={() => go(idx)}
          aria-label={`Stage ${idx + 1}`}
        ></button>
      {/each}
    </div>
    <button
      class="navbtn primary"
      disabled={i === TOTAL - 1}
      onclick={() => go(i + 1)}>Next ›</button
    >
  </footer>
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    width: 100%;
    background: #0c0c12;
    color: #f0f0f5;
    font-family: system-ui, sans-serif;
  }
  .crumb {
    padding: 0.9rem 1.5rem;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #6f6f88;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }

  .stage {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 2rem 1.5rem;
  }
  /* both swap panes share one grid cell so they overlap (not stack) mid-transition */
  .pane {
    grid-area: 1 / 1;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2rem;
    width: 100%;
  }
  /* hero pane stacks above the row, so the back-morph flies toward you in front */
  .pane-front {
    z-index: 2;
  }

  .hero {
    position: relative;
    width: min(70vh, 560px);
    aspect-ratio: 1;
  }
  .grid-layer {
    position: absolute;
    inset: 0;
  }
  .grid-layer :global(.lesson-grid-display) {
    width: 100%;
  }
  .grid-layer :global(.grid-svg) {
    max-width: 100% !important;
  }

  .hand-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .hand {
    transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* letter glyph: black source recolored to off-white (#d9d9d9) for the dark bg */
  .glyph {
    filter: invert(0.85);
  }

  /* compare-row stage */
  .compare {
    --gap: clamp(1rem, 4vw, 2.5rem);
    display: flex;
    gap: var(--gap);
    align-items: flex-start;
    justify-content: center;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
  }
  .card-square {
    position: relative;
    width: min(26vh, 220px);
    aspect-ratio: 1;
    /* button reset */
    border: 1px solid transparent;
    border-radius: 16px;
    background: transparent;
    padding: 0;
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      background 0.2s ease,
      transform 0.2s ease;
  }
  .card-square:hover {
    border-color: rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.03);
  }
  .card-square:focus-visible {
    outline: 2px solid #4ea7e8;
    outline-offset: 2px;
  }
  .card.selected .card-square {
    border-color: #4ea7e8;
    background: rgba(78, 167, 232, 0.08);
  }
  .card-grid {
    position: absolute;
    inset: 0;
  }
  .card-grid :global(.lesson-grid-display) {
    width: 100%;
  }
  .card-grid :global(.grid-svg) {
    max-width: 100% !important;
  }
  .card-hands {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .card figcaption {
    text-align: center;
  }
  .card figcaption b {
    display: block;
    font-size: 1.4rem;
    font-style: italic;
    font-weight: 600;
  }

  /* Stage 3 focus panel */
  .focus {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    width: 100%;
    max-width: 520px;
    padding: 1.5rem 1rem 0;
  }
  .focus-head {
    text-align: center;
  }
  .focus-head h2 {
    font-size: 2.2rem;
    font-style: italic;
    margin: 0;
  }
  .focus-pic {
    position: relative;
    width: min(52vh, 380px);
    aspect-ratio: 1;
  }
  .focus-caption {
    font-size: 1rem;
    color: #c4c4d4;
    margin: 0;
    min-height: 1.4em; /* reserve space so the row doesn't shift when caption changes */
    text-align: center;
  }
  .focus-controls {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  .tbtn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.6rem 1.1rem;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.04);
    color: #e6e6f0;
    font-size: 0.95rem;
    cursor: pointer;
    min-height: 44px;
  }
  .tbtn:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .tbtn:active {
    transform: scale(0.96);
  }
  .tbtn:focus-visible {
    outline: 2px solid #4ea7e8;
    outline-offset: 2px;
  }

  .tray {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .tray-grid {
    display: grid;
    gap: 0.4rem;
    justify-content: center;
  }
  .cell {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background: transparent;
    transition:
      background 0.3s ease,
      border-color 0.3s ease,
      transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .cell.lit {
    background: #4ea7e8;
    border-color: #4ea7e8;
    transform: scale(1.12);
  }
  .tray-count {
    font-size: 0.8rem;
    letter-spacing: 0.04em;
    color: #8a8aa0;
  }

  .label {
    text-align: center;
    max-width: 600px;
  }
  .eyebrow {
    display: block;
    font-size: 0.8rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #6f6f88;
    margin-bottom: 0.35rem;
  }
  .label h1 {
    font-size: 3rem;
    font-style: italic;
    margin: 0 0 0.4rem;
    animation: pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .label p {
    font-size: 1.1rem;
    color: #c4c4d4;
    margin: 0;
    line-height: 1.5;
  }

  @keyframes pop {
    0% {
      opacity: 0;
      transform: scale(0.7) translateY(8px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .nav {
    position: sticky;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.75rem;
    padding: 1rem;
    background: rgba(12, 12, 18, 0.92);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(8px);
  }
  .navbtn {
    padding: 0.6rem 1.5rem;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: transparent;
    color: #d0d0e0;
    font-size: 0.95rem;
    cursor: pointer;
    min-height: 44px;
  }
  .navbtn.primary {
    background: #4ea7e8;
    border-color: #4ea7e8;
    color: #06121d;
    font-weight: 600;
  }
  .navbtn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .ticks {
    display: flex;
    gap: 0.5rem;
  }
  .tick {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: transparent;
    cursor: pointer;
    padding: 0;
  }
  .tick.on {
    background: #4ea7e8;
    border-color: #4ea7e8;
  }

  @media (prefers-reduced-motion: reduce) {
    .hand {
      transition: none;
    }
    .card {
      transition: none;
    }
    .label h1 {
      animation: none;
    }
  }

  /* ---- mobile (portrait): stack the compare row vertically ---- */
  @media (max-width: 640px) {
    .stage {
      padding: 1.25rem 1rem;
    }
    .hero {
      width: min(86vw, 460px);
    }
    .label h1 {
      font-size: 2.2rem;
    }
    .compare {
      flex-direction: column;
      align-items: center;
    }
    .focus {
      max-width: 100%;
      padding-top: 1rem;
    }
    .focus-pic {
      width: min(82vw, 360px);
    }
    .focus-head h2 {
      font-size: 1.9rem;
    }
    .nav {
      gap: 1rem;
    }
    .navbtn {
      padding: 0.6rem 1.1rem;
    }
  }
</style>
