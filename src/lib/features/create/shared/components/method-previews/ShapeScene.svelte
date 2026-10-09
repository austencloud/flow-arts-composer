<script lang="ts">
  /**
   * ShapeScene
   *
   * Mirrors: Shape (the Shape Matrix). A Surprise roll rebuilds the matrix
   * with the Matrix's own reveal (runShapeMatrixGridReveal): the rows land,
   * then the columns, then the crossings, then the chosen crossing lights
   * with the two headers that name it. The finger taps that tile, which
   * grows into the stage as the Matrix's tile-to-hero morph does, and its
   * mandala draws itself with the guide painter's reveal
   * (createCellRevealFrame, renderCell's twin). The finished drawing is the
   * tile's own picture.
   *
   * The corner is the page the Matrix opens on (SHAPE_MATRIX_DEFAULT_TURN),
   * traced with the user's props and painted in their hand colors. The table
   * keeps the Matrix's class names (rowhead, colhead, cell, sel) because the
   * reveal finds its targets by them.
   *
   * Finished picture: the corner with its chosen tile marked, and that
   * tile's mandala complete on the stage.
   */
  import { onDestroy, onMount, tick } from "svelte";
  import type { GhostState } from "$lib/shared/attract/services/attract-ghost.svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { yieldToScheduler } from "$lib/shared/foundation/utils/background-scheduling";
  import type { MandalaGuideRevealFrame } from "$lib/shared/mandala/services/mandala-guide-image";
  import {
    runShapeMatrixGridReveal,
    SHAPE_MATRIX_REVEAL_CHOSEN_CLASS,
    type RevealAnimator,
  } from "$lib/shared/shape-matrix/app/services/shape-matrix-reveal";
  import ShapeMatrixMandalaArt from "$lib/shared/shape-matrix/components/ShapeMatrixMandalaArt.svelte";
  import {
    flowerKey,
    type Flower,
  } from "$lib/shared/shape-matrix/domain/flower-signature";
  import { propPairFromLegacy } from "$lib/shared/shape-matrix/domain/prop-pair";
  import {
    cellArtworkSrc,
    headerArtworkSrc,
    shapeMatrixArtworkPainterForColors,
  } from "$lib/shared/shape-matrix/services/shape-matrix-artwork";
  import {
    loadShapeMatrix,
    type ShapeMatrixData,
  } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
  import { createCellRevealFrame } from "$lib/shared/shape-matrix/services/shape-matrix-render";
  import MethodPreviewFinger from "./MethodPreviewFinger.svelte";
  import {
    cellCenter,
    shapeCellRect,
    shapeLayout,
    shapeStageCovers,
    transformOnto,
  } from "./method-preview-compositions";
  import {
    placeGhost,
    sceneGhost,
    tapAt,
    type SceneRun,
  } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";
  import { SHAPE_PREVIEW_TIMING, shapeCorner } from "./method-preview-shape";

  /** The Matrix reveal's easing. */
  const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

  let {
    playing,
    turn,
    shape,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  let root = $state<HTMLElement | null>(null);
  let table = $state<HTMLTableElement | null>(null);
  let stage = $state<HTMLElement | null>(null);
  let canvas = $state<HTMLCanvasElement | null>(null);
  let pose = $state.raw<GhostState | null>(null);
  let data = $state.raw<ShapeMatrixData | null>(null);
  /** Tiles with artwork so far, in reveal order. Each paints in its own task. */
  let paintedTiles = $state(0);
  /** The stage's laid-out content box, in CSS px (bind:clientWidth). */
  let stageWidth = $state(0);
  let stageHeight = $state(0);
  /** False while the corner rebuilds: the tiles under the stage show then. */
  let stageShown = $state(true);
  /** True while the tapped tile grows into the stage. */
  let growing = $state(false);

  const layout = $derived(shapeLayout(shape, width, height));
  /** The cells the finished stage sits over, as "row:column". */
  const coveredCells = $derived.by(() => {
    const keys = new Set<string>();
    if (!layout) return keys;
    for (let row = 0; row < layout.rows; row++) {
      for (let column = 0; column < layout.columns; column++) {
        if (shapeStageCovers(layout, row, column)) keys.add(`${row}:${column}`);
      }
    }
    return keys;
  });
  const corner = $derived(
    data && layout ? shapeCorner(data.axis, layout) : null
  );
  // The Matrix's stills follow the user's saved hand colors (ShapeMatrixGrid).
  const painter = $derived(
    shapeMatrixArtworkPainterForColors(getSettings().primaryPropColors)
  );
  const headCount = $derived(
    corner && layout
      ? corner.rows.length + (layout.columnHeads ? corner.columns.length : 0)
      : 0
  );

  let disposed = false;
  let announced = false;
  /** True while a turn draws the stage; the finished picture waits. */
  let revealing = false;
  let frame: MandalaGuideRevealFrame | null = null;
  let frameKey = "";
  let frameCanvas: HTMLCanvasElement | null = null;
  /** Animations and timers a turn started, so settle can end them. */
  let animations: Animation[] = [];
  let timers: ReturnType<typeof setTimeout>[] = [];

  function track(
    element: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions
  ): Animation | null {
    const target = element as HTMLElement;
    if (typeof target.animate !== "function") return null;
    const animation = target.animate(keyframes, options);
    animations.push(animation);
    return animation;
  }

  /** The Matrix reveal's animator, recording what it starts. */
  const tracker: RevealAnimator = {
    animate: (element, keyframes, options) => {
      track(element, keyframes, options);
    },
    // No turn starts under reduced motion (plan: Spec Corrections 10).
    reducedMotion: () => false,
    setTimeout: (fn, ms) => {
      const id = setTimeout(fn, ms);
      timers.push(id);
      return id;
    },
  };

  function stopTracked(): void {
    for (const animation of animations) animation.cancel();
    for (const id of timers) clearTimeout(id);
    animations = [];
    timers = [];
  }

  function cellOrder(row: number, column: number): number {
    return headCount + row * (corner?.columns.length ?? 0) + column;
  }

  function isChosen(row: number, column: number): boolean {
    return row === layout?.chosen.row && column === layout?.chosen.column;
  }

  /** The chosen tile's row flower (blue hand) and column flower (red hand). */
  function chosenPair(): { left: Flower; right: Flower } | null {
    const box = layout;
    if (!corner || !box) return null;
    const left = corner.rows[box.chosen.row];
    const right = corner.columns[box.chosen.column];
    return left && right ? { left, right } : null;
  }

  /**
   * The stage's reveal frame for the chosen tile. It is made again when the
   * box, the colors, or the canvas change; its finished paint is the tile's
   * picture at the stage's size. The colors and size follow live; the props
   * load once, at mount.
   */
  function stageFrame(): MandalaGuideRevealFrame | null {
    const target = canvas;
    const box = layout;
    const matrix = data;
    const pair = chosenPair();
    if (!target || !box || !matrix || !pair) return null;
    const colors = getSettings().primaryPropColors ?? undefined;
    const dpr =
      typeof window !== "undefined" ? (window.devicePixelRatio ?? 1) : 1;
    // A border snaps to device pixels (a 1px border is 1 device pixel at a
    // ratio of 1.5), so the box minus two CSS pixels can be a pixel short.
    // The laid-out box is the truth, and a tile measures itself the same way
    // (ShapeMatrixMandalaArt), so the stage matches the tile's own picture.
    const measured = Math.round(Math.min(stageWidth, stageHeight));
    const size = measured > 0 ? measured : box.stage.size - 2;
    const key = [
      size,
      dpr,
      matrix.geometryKey,
      matrix.props.left,
      matrix.props.right,
      flowerKey(pair.left),
      flowerKey(pair.right),
      colors?.left,
      colors?.right,
    ].join("|");
    // A stage that remounts at the same size is a new canvas.
    if (key !== frameKey || target !== frameCanvas) {
      frameKey = key;
      frameCanvas = target;
      frame = createCellRevealFrame(
        target,
        matrix.left.get(flowerKey(pair.left))!,
        matrix.right.get(flowerKey(pair.right))!,
        size,
        matrix.clubTipDx,
        { colors, dpr }
      );
    }
    return frame;
  }

  // The finished stage follows the box, the props, and the colors.
  $effect(() => {
    const finished = stageFrame();
    if (finished && !revealing) finished.paint(1);
  });

  onMount(() => {
    void prepare();
  });

  onDestroy(() => {
    disposed = true;
    stopTracked();
  });

  /**
   * Load the matrix the way the Matrix does, for the user's props. A
   * flower's paths are built on first use and each tile paints a raster, so
   * both happen one per task: the board never stalls for the whole corner.
   */
  async function prepare(): Promise<void> {
    let matrix: ShapeMatrixData;
    try {
      matrix = await loadShapeMatrix(propPairFromLegacy(getSettings()));
    } catch (error) {
      console.warn("[method preview] Shape could not load the matrix", error);
      return;
    }
    const box = layout;
    if (disposed || !box) return;
    const warm = shapeCorner(matrix.axis, box);
    const builds = [
      ...warm.rows.map((flower) => () => matrix.left.get(flowerKey(flower))),
      ...warm.columns.map(
        (flower) => () => matrix.right.get(flowerKey(flower))
      ),
    ];
    for (const build of builds) {
      build();
      await yieldToScheduler();
      if (disposed) return;
    }
    data = matrix;
    await tick();
    const tiles =
      headCount + (corner ? corner.rows.length * corner.columns.length : 0);
    for (let count = 1; count <= tiles; count++) {
      paintedTiles = count;
      await tick();
      await yieldToScheduler();
      if (disposed) return;
    }
    // Any later corner (a resized box) paints at once.
    paintedTiles = Number.POSITIVE_INFINITY;
    await tick();
    const finished = stageFrame();
    if (!finished || announced) return;
    finished.paint(1);
    announced = true;
    onready();
  }

  function settle(): void {
    stopTracked();
    revealing = false;
    stageShown = true;
    growing = false;
    pose = null;
    root
      ?.querySelectorAll(`.${SHAPE_MATRIX_REVEAL_CHOSEN_CLASS}`)
      .forEach((element) =>
        element.classList.remove(SHAPE_MATRIX_REVEAL_CHOSEN_CLASS)
      );
    stageFrame()?.paint(1);
  }

  /** Draw the stage's mandala from its first stroke to the finished tile. */
  function drawStage(run: SceneRun): Promise<boolean> {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame !== "function") {
        resolve(true);
        return;
      }
      const startedAt = performance.now();
      let id = 0;
      const step = (now: number) => {
        const progress = Math.min(
          1,
          Math.max(0, (now - startedAt) / SHAPE_PREVIEW_TIMING.drawMs)
        );
        stageFrame()?.paint(progress);
        if (progress >= 1) {
          resolve(true);
          return;
        }
        id = requestAnimationFrame(step);
      };
      id = requestAnimationFrame(step);
      run.onAbort(() => {
        cancelAnimationFrame(id);
        resolve(false);
      });
    });
  }

  async function play(run: SceneRun): Promise<void> {
    const box = layout;
    const host = table;
    const stageBox = stage;
    if (!box || !host || !stageBox || !stageFrame()) return;
    revealing = true;
    const chosenRect = shapeCellRect(box, box.chosen.row, box.chosen.column);
    const chosen = cellCenter(chosenRect);
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    placeGhost(
      finger,
      Math.max(0, chosen.x - box.cell * 0.6),
      Math.min(height, chosen.y + box.cell * 0.45)
    );

    // The finished stage steps aside while the corner rebuilds, and the tiles
    // under it show again at once.
    stageShown = false;
    const stageOut = track(stageBox, [{ opacity: 1 }, { opacity: 0 }], {
      duration: SHAPE_PREVIEW_TIMING.stageOutMs,
      easing: "ease-in",
      fill: "forwards",
    });
    runShapeMatrixGridReveal(host, tracker);

    if (!(await run.wait(SHAPE_PREVIEW_TIMING.fingerLeavesMs))) return;
    if (!(await tapAt(finger, run, chosen.x, chosen.y))) return;
    if (!(await run.wait(SHAPE_PREVIEW_TIMING.growDelayMs))) return;

    // The tapped tile grows into the stage and its mandala draws itself. The
    // Matrix morphs a tile into its hero with a page-wide view transition;
    // the preview moves its own stage, starting over the tile.
    finger.ghost.visible = false;
    stageFrame()?.paint(0);
    // The tiles under the stage fade out as it grows over them.
    stageShown = true;
    growing = true;
    track(
      stageBox,
      [
        { opacity: 0, transform: transformOnto(box.stage, chosenRect) },
        { opacity: 1, offset: 0.35 },
        { opacity: 1, transform: "none" },
      ],
      { duration: SHAPE_PREVIEW_TIMING.growMs, easing: EASE }
    );
    stageOut?.cancel();
    if (!(await drawStage(run))) return;
    settle();
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div
  class="scene"
  class:growing
  bind:this={root}
  style:--accent={accent}
  style:--grow-ms="{SHAPE_PREVIEW_TIMING.growMs}ms"
>
  {#if layout && corner && data}
    {@const matrix = data}
    <table
      class="matrix"
      bind:this={table}
      style:left="{layout.x}px"
      style:top="{layout.y}px"
      style:--cell="{layout.cell}px"
      style:--columns={corner.columns.length + 1}
    >
      {#if layout.columnHeads}
        <thead>
          <tr>
            <th class="corner"></th>
            {#each corner.columns as flower, column (column)}
              <th class="colhead">
                {#if corner.rows.length + column < paintedTiles}
                  <ShapeMatrixMandalaArt
                    instant
                    paint={(size) =>
                      headerArtworkSrc(matrix, flower, "right", size, painter)}
                    artKey={`right:${flowerKey(flower)}`}
                  />
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
      {/if}
      <tbody>
        {#each corner.rows as rowFlower, row (row)}
          <tr>
            <th class="rowhead">
              {#if row < paintedTiles}
                <ShapeMatrixMandalaArt
                  instant
                  paint={(size) =>
                    headerArtworkSrc(matrix, rowFlower, "left", size, painter)}
                  artKey={`left:${flowerKey(rowFlower)}`}
                />
              {/if}
            </th>
            {#each corner.columns as columnFlower, column (column)}
              <td class="cell-td">
                <span
                  class="cell"
                  class:sel={isChosen(row, column)}
                  class:covered={stageShown &&
                    coveredCells.has(`${row}:${column}`)}
                >
                  {#if cellOrder(row, column) < paintedTiles}
                    <span class="artwork">
                      <ShapeMatrixMandalaArt
                        instant
                        paint={(size) =>
                          cellArtworkSrc(
                            matrix,
                            rowFlower,
                            columnFlower,
                            size,
                            painter
                          )}
                        artKey={`${flowerKey(rowFlower)}__${flowerKey(columnFlower)}`}
                      />
                    </span>
                  {/if}
                </span>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
  {#if layout}
    <div
      class="stage"
      bind:this={stage}
      bind:clientWidth={stageWidth}
      bind:clientHeight={stageHeight}
      style:left="{layout.stage.x}px"
      style:top="{layout.stage.y}px"
      style:width="{layout.stage.size}px"
      style:height="{layout.stage.size}px"
    >
      <canvas bind:this={canvas}></canvas>
    </div>
  {/if}
  <MethodPreviewFinger {pose} />
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  /* Grid tracks, not table layout: every tile is exactly --cell, so tiles
     sit where the composition put them. The table elements stay because the
     reveal finds a tile's row with closest("tr"). Its own stacking context
     keeps the chosen tile's ring under the stage. */
  .matrix {
    position: absolute;
    z-index: 0;
    display: grid;
    grid-template-columns: repeat(var(--columns), var(--cell));
    grid-auto-rows: var(--cell);
    margin: 0;
    border-spacing: 0;
  }

  .matrix thead,
  .matrix tbody,
  .matrix tr {
    display: contents;
  }

  .matrix th,
  .matrix td {
    box-sizing: border-box;
    width: var(--cell);
    height: var(--cell);
    padding: 0;
  }

  /* The Matrix's headers and tiles (ShapeMatrixGrid). */
  .corner {
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: transparent;
  }

  .colhead {
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, #111922);
  }

  .rowhead {
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, #111922);
  }

  .colhead,
  .rowhead,
  .cell {
    transition:
      background var(--duration-fast, 150ms) var(--transition-easing, ease),
      box-shadow var(--duration-fast, 150ms) var(--transition-easing, ease);
  }

  .cell {
    position: relative;
    display: block;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
  }

  .artwork {
    position: absolute;
    inset: 0;
    display: block;
  }

  /* The chosen crossing: the Matrix's wash and ring, in the method color. */
  .cell.sel {
    z-index: 2;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
  }

  .cell.sel::after {
    content: "";
    position: absolute;
    inset: 1px;
    z-index: 2;
    border: 2px solid var(--accent);
    border-radius: 3px;
    pointer-events: none;
  }

  /* The Surprise reveal names the chosen crossing (ShapeMatrixGrid). */
  .rowhead:global(.reveal-chosen) {
    background: color-mix(
      in srgb,
      var(--prop-blue, #2e3192) 34%,
      var(--theme-card-bg, #111922)
    );
    box-shadow: inset 0 0 0 2px var(--prop-blue-text, #818cf8);
  }

  .colhead:global(.reveal-chosen) {
    background: color-mix(
      in srgb,
      var(--prop-red, #ed1c24) 26%,
      var(--theme-card-bg, #111922)
    );
    box-shadow: inset 0 0 0 2px var(--prop-red-text, #f87171);
  }

  .cell:global(.reveal-chosen) {
    z-index: 3;
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  /* The finished stage's background is translucent by design, so the tiles
     under it hide while it shows. The reveal animates .cell opacity itself,
     so a covered tile hides its contents and decorations instead. These
     rules sit after .cell.sel and the reveal highlight so they win. */
  .cell.covered,
  .cell.covered:global(.reveal-chosen) {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
  }

  .cell.covered .artwork,
  .cell.covered::after {
    opacity: 0;
  }

  /* The fade runs only while the tile grows into the stage. Uncovering when
     a turn starts, or after a cut, is instant. */
  .scene.growing .cell {
    transition:
      background var(--grow-ms) cubic-bezier(0.22, 1, 0.36, 1),
      border-color var(--grow-ms) cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow var(--grow-ms) cubic-bezier(0.22, 1, 0.36, 1);
  }

  .scene.growing .cell .artwork,
  .scene.growing .cell::after {
    transition: opacity var(--grow-ms) cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* The stage the chosen tile grows into, like the Matrix's detail hero. */
  .stage {
    position: absolute;
    z-index: 1;
    box-sizing: border-box;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 4px;
    background: var(--theme-card-bg, #111922);
    transform-origin: 0 0;
  }

  .stage::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--accent) 55%, transparent);
    pointer-events: none;
  }

  .stage canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .colhead,
    .rowhead,
    .cell,
    .scene.growing .cell,
    .scene.growing .cell .artwork,
    .scene.growing .cell::after {
      transition: none;
    }
  }
</style>
