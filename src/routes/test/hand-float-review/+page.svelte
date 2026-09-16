<script lang="ts">
  /**
   * Hand-float arrow review harness.
   *
   * Every quarter hand-float the guide pages can author, rendered through the
   * REAL pipeline (PRO shift on HAND props → PictographPreparer hand-path mode
   * → FLOAT arrow), one pictograph per (location, handpath direction, color).
   *
   * Each cell's caption carries an independent oracle: the expected chord
   * direction computed from pure grid geometry (end − start), NOT from the
   * arrow pipeline. The rendered float chevron must point the same way as the
   * caption's big arrow. Any cell where they disagree is a pipeline bug.
   *
   * Born from the 2026-08-09 gamma-page incident: hand-path floats stamped a
   * cw/ccw rotationDirection that shouldMirrorArrow interpreted as a prop
   * spin, mirroring every ccw chevron. See
   * tests/unit/arrow-adjustment/HandPathFloatMirroring.test.ts.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    HandSide,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import {
    GridMode,
    GridLocation,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

  const {
    NORTH,
    EAST,
    SOUTH,
    WEST,
    NORTHEAST,
    SOUTHEAST,
    SOUTHWEST,
    NORTHWEST,
  } = GridLocation;

  // Screen-space unit coords per location (y down, like the rendered grid).
  const COORD: Record<string, [number, number]> = {
    [NORTH]: [0, -1],
    [NORTHEAST]: [1, -1],
    [EAST]: [1, 0],
    [SOUTHEAST]: [1, 1],
    [SOUTH]: [0, 1],
    [SOUTHWEST]: [-1, 1],
    [WEST]: [-1, 0],
    [NORTHWEST]: [-1, -1],
  };

  // Quarter-step rings. Cardinal floats land on cardinals, intercardinal on
  // intercardinals — matching what the guide/hand-path builders author.
  const CARDINALS = [NORTH, EAST, SOUTH, WEST];
  const INTERCARDINALS = [NORTHEAST, SOUTHEAST, SOUTHWEST, NORTHWEST];

  const nextOnRing = (ring: GridLocation[], loc: GridLocation, cw: boolean) => {
    const i = ring.indexOf(loc);
    return ring[(i + (cw ? 1 : ring.length - 1)) % ring.length]!;
  };

  // Independent oracle: chord direction end−start → one of 8 unicode arrows.
  const chordArrow = (from: GridLocation, to: GridLocation): string => {
    const [ax, ay] = COORD[from]!;
    const [bx, by] = COORD[to]!;
    const dx = Math.sign(bx - ax);
    const dy = Math.sign(by - ay);
    const key = `${dx},${dy}`;
    const ARROWS: Record<string, string> = {
      "0,-1": "↑",
      "1,-1": "↗",
      "1,0": "→",
      "1,1": "↘",
      "0,1": "↓",
      "-1,1": "↙",
      "-1,0": "←",
      "-1,-1": "↖",
    };
    return ARROWS[key] ?? "?";
  };

  const OPPOSITE: Record<string, GridLocation> = {
    [NORTH]: SOUTH,
    [SOUTH]: NORTH,
    [EAST]: WEST,
    [WEST]: EAST,
    [NORTHEAST]: SOUTHWEST,
    [SOUTHWEST]: NORTHEAST,
    [NORTHWEST]: SOUTHEAST,
    [SOUTHEAST]: NORTHWEST,
  };

  const SHORT: Record<string, string> = {
    [NORTH]: "N",
    [EAST]: "E",
    [SOUTH]: "S",
    [WEST]: "W",
    [NORTHEAST]: "NE",
    [SOUTHEAST]: "SE",
    [SOUTHWEST]: "SW",
    [NORTHWEST]: "NW",
  };

  // Authored exactly like GammaPage: PRO shift, HAND prop; the preparer's
  // hand-path mode converts it to FLOAT. The other hand sits STATIC opposite.
  // Cardinal hands live on the diamond grid; intercardinal hands are box mode.
  const motion = (
    color: HandSide,
    from: GridLocation,
    to: GridLocation,
    gridMode: GridMode
  ) =>
    createMotionData({
      motionType: from === to ? MotionType.STATIC : MotionType.PRO,
      startLocation: from,
      endLocation: to,
      color,
      propType: PropType.HAND,
      gridMode,
    });

  type Case = {
    label: string;
    expected: string;
    gridMode: GridMode;
    data: PictographData;
  };

  const makeCase = (
    movingColor: HandSide,
    from: GridLocation,
    to: GridLocation,
    cw: boolean
  ): Case => {
    const gridMode = CARDINALS.includes(from) ? GridMode.DIAMOND : GridMode.BOX;
    const staticLoc = OPPOSITE[from]!;
    const moving = motion(movingColor, from, to, gridMode);
    const still = motion(
      movingColor === HandSide.LEFT ? HandSide.RIGHT : HandSide.LEFT,
      staticLoc,
      staticLoc,
      gridMode
    );
    return {
      label: `${SHORT[from]}→${SHORT[to]} ${cw ? "cw" : "ccw"}`,
      expected: chordArrow(from, to),
      gridMode,
      data: {
        id: `hfr-${movingColor}-${SHORT[from]}-${SHORT[to]}`,
        letter: null,
        startPlacement: null,
        endPlacement: null,
        gridMode,
        motions:
          movingColor === HandSide.LEFT
            ? { left: moving, right: still }
            : { left: still, right: moving },
      } as unknown as PictographData,
    };
  };

  type Section = { title: string; cases: Case[] };

  // ── Per-cell rotation nudges ───────────────────────────────────────────────
  // Austen's visual pass: rotate any wrong arrow in 45° steps until it reads
  // right, then Copy corrections. Offsets survive reload via localStorage and
  // apply as an extra rotate() appended to the rendered arrow group's own
  // transform (post-translate, so it pivots on the arrow itself).
  const STORE_KEY = "hand-float-review-offsets";

  let offsets: Record<string, number> = $state({});
  if (typeof localStorage !== "undefined") {
    try {
      offsets = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}");
    } catch {
      offsets = {};
    }
  }

  const applyOffset = (id: string, cellEl: HTMLElement | null, deg: number) => {
    const el = cellEl?.querySelector<SVGGElement>("g.arrow-svg");
    if (!el) return;
    if (el.dataset.baseTransform === undefined) {
      el.dataset.baseTransform = el.style.transform;
    }
    el.style.transform =
      deg === 0
        ? el.dataset.baseTransform
        : `${el.dataset.baseTransform} rotate(${deg}deg)`;
  };

  const cellEls: Record<string, HTMLElement> = {};

  const nudge = (id: string, step: number) => {
    const next = ((((offsets[id] ?? 0) + step) % 360) + 360) % 360;
    if (next === 0) delete offsets[id];
    else offsets[id] = next;
    localStorage.setItem(STORE_KEY, JSON.stringify(offsets));
    applyOffset(id, cellEls[id] ?? null, next);
  };

  // Re-apply persisted offsets once arrows exist (they render async). Poll a
  // few times instead of observing — dev harness, not product code.
  $effect(() => {
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      let allFound = true;
      for (const [id, deg] of Object.entries(offsets)) {
        const el = cellEls[id]?.querySelector("g.arrow-svg");
        if (el) applyOffset(id, cellEls[id]!, deg);
        else allFound = false;
      }
      if (allFound || tries > 40) clearInterval(t);
    }, 500);
    return () => clearInterval(t);
  });

  let copied = $state(false);
  const copyCorrections = async () => {
    const lines = Object.entries(offsets).map(([id, deg]) => {
      // id format: hfr-<color>-<FROM>-<TO>
      const [, color, from, to] = id.split("-");
      return { color, motion: `${from}→${to}`, addDegrees: deg };
    });
    const payload = JSON.stringify(lines, null, 2);
    await navigator.clipboard.writeText(payload);
    console.log("[hand-float-review] corrections:", payload);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  };

  const resetAll = () => {
    for (const id of Object.keys(offsets))
      applyOffset(id, cellEls[id] ?? null, 0);
    offsets = {};
    localStorage.removeItem(STORE_KEY);
  };

  const sectionFor = (color: HandSide, cw: boolean): Section => {
    const cases: Case[] = [];
    for (const ring of [CARDINALS, INTERCARDINALS]) {
      for (const from of ring) {
        cases.push(makeCase(color, from, nextOnRing(ring, from, cw), cw));
      }
    }
    return {
      title: `${color === HandSide.LEFT ? "Left" : "Right"} hand — ${cw ? "clockwise" : "counter-clockwise"} handpath`,
      cases,
    };
  };

  const SECTIONS: Section[] = [
    sectionFor(HandSide.LEFT, true),
    sectionFor(HandSide.LEFT, false),
    sectionFor(HandSide.RIGHT, true),
    sectionFor(HandSide.RIGHT, false),
  ];
</script>

<svelte:head>
  <title>Hand-Float Arrow Review</title>
</svelte:head>

<main class="review">
  <header>
    <h1>Hand-Float Arrow Review</h1>
    <p>
      Every quarter hand-float, rendered through the real hand-path pipeline.
      The big arrow under each cell is the expected chord direction, computed
      from pure geometry — the rendered chevron must point the same way. Any
      disagreement is a pipeline bug. Use −45 / +45 on a wrong cell until its
      chevron reads right, then Copy corrections and hand the output to an agent
      — offsets persist across reloads.
    </p>
    <div class="toolbar">
      <button class="tool" onclick={copyCorrections}>
        {copied
          ? "Copied ✓"
          : `Copy corrections (${Object.keys(offsets).length})`}
      </button>
      <button class="tool" onclick={resetAll}>Reset all</button>
    </div>
  </header>

  {#each SECTIONS as section (section.title)}
    <section>
      <h2>{section.title}</h2>
      <div class="grid">
        {#each section.cases as c (c.data.id)}
          <figure class="cell">
            <div
              class="picto"
              class:nudged={(offsets[c.data.id] ?? 0) !== 0}
              bind:this={cellEls[c.data.id]}
            >
              <PictographContainer
                pictographData={c.data}
                gridMode={c.gridMode}
                leftPropTypeOverride={PropType.HAND}
                rightPropTypeOverride={PropType.HAND}
                showGrid={true}
                showTKA={false}
                showPlacements={false}
                showElemental={false}
                showReversals={false}
                showTnD={false}
                showNonRadialPoints={false}
                showHandPoints={true}
                darkMode={true}
                disableTransitions={true}
              />
            </div>
            <figcaption>
              <span class="label">{c.label}</span>
              <span class="expected" aria-label="expected direction"
                >{c.expected}</span
              >
            </figcaption>
            <div class="nudges">
              <button
                class="tool sm"
                onclick={() => nudge(c.data.id, -45)}
                aria-label="rotate {c.label} minus 45">−45</button
              >
              <span class="offset" class:hot={(offsets[c.data.id] ?? 0) !== 0}>
                {offsets[c.data.id] ?? 0}°
              </span>
              <button
                class="tool sm"
                onclick={() => nudge(c.data.id, 45)}
                aria-label="rotate {c.label} plus 45">+45</button
              >
            </div>
          </figure>
        {/each}
      </div>
    </section>
  {/each}
</main>

<style>
  .review {
    max-width: 100rem;
    margin: 0 auto;
    padding: 2rem clamp(1rem, 3vw, 3rem) 4rem;
    color: var(--theme-text, #e8e8f0);
  }

  header {
    margin-bottom: 2rem;
    max-width: 48rem;
  }

  h1 {
    font-size: 1.75rem;
    margin: 0 0 0.5rem;
  }

  header p {
    margin: 0;
    opacity: 0.8;
    line-height: 1.5;
  }

  section {
    margin-bottom: 2.5rem;
  }

  h2 {
    font-size: 1.15rem;
    margin: 0 0 1rem;
    opacity: 0.9;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 0.75rem;
  }

  @media (max-width: 1400px) {
    .grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .cell {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .picto {
    aspect-ratio: 1;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 0.5rem;
    overflow: hidden;
    background: #0d0d14;
  }

  figcaption {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: 0.85rem;
  }

  .expected {
    font-size: 1.35rem;
    line-height: 1;
    font-family: system-ui, sans-serif;
  }

  .toolbar {
    display: flex;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .tool {
    min-height: 44px;
    padding: 0.5rem 1rem;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .tool:hover {
    background: rgba(255, 255, 255, 0.16);
  }

  .tool.sm {
    padding: 0.35rem 0.6rem;
    font-size: 0.85rem;
    font-family: ui-monospace, Consolas, monospace;
  }

  .nudges {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }

  .offset {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 0.85rem;
    min-width: 3.2ch;
    text-align: center;
    font-variant-numeric: tabular-nums;
    opacity: 0.6;
  }

  .offset.hot {
    opacity: 1;
    color: #ffb454;
  }

  .picto.nudged {
    border-color: #ffb454;
  }
</style>
