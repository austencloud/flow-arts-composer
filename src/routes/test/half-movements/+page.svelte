<!--
  Half-Movement Matrix — Phase 2b review harness

  Bird's-eye COVERAGE MATRIX: rows = motion type, columns = turns value. Every
  cell is one (motionType, turns) family rendered as a REAL pictograph through
  the production pipeline (buildHalvedStep -> PictographContainer):

    green  = per-turns glyph art exists (asset {mt}_half_{turns}.svg)
    orange = engine-legal but NO ART yet (renders fallback art — the
             Illustrator work list; scripts/half-domain-coverage.mjs is the
             coverage authority)
    grey ✕ = not pipeline-representable (dash/static have no fl turns)

  Click a matrix cell to pop open that family's 8 VARIATIONS (every start
  point x both directions) and WASD-edit the arrow placement. Adjustments are
  authored in GLYPH-LOCAL space shared per family — one nudge moves all 8
  variations coherently — and AUTOSAVE as canon into the default placement
  JSONs the pipeline reads (dev-only ./save endpoint).

  Structurally blocked families (float motions, skews, hash center-dashes,
  quarter fractions) are pipeline work, not art holes — they live outside this
  matrix entirely.
-->
<script lang="ts">
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import {
    createMotionData,
    createPlaceholderMotion,
    type MotionData,
  } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import { createArrowPlacementData } from "$lib/shared/pictograph/arrow/positioning/placement/domain/create-arrow-placement-data";
  import { calculateSegmentRotation } from "$lib/shared/pictograph/arrow/positioning/calculation/services/segment-rotation";
  import { buildHalvedStep } from "$lib/shared/animation-engine/services/build-halved-step";
  import { HALF_ASSET_TURNS } from "$lib/shared/pictograph/arrow/rendering/services/half-asset-manifest";
  import {
    MotionType,
    HandSide,
    Orientation,
    RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import {
    GridMode,
    GridLocation,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

  const { NORTH: N, EAST: E, SOUTH: S, WEST: W } = GridLocation;
  const { IN, OUT } = Orientation;
  const CW = RotationDirection.CLOCKWISE;
  const CCW = RotationDirection.COUNTER_CLOCKWISE;

  const LOC_SHORT: Partial<Record<GridLocation, string>> = {
    [GridLocation.NORTH]: "N",
    [GridLocation.EAST]: "E",
    [GridLocation.SOUTH]: "S",
    [GridLocation.WEST]: "W",
    [GridLocation.NORTHEAST]: "NE",
    [GridLocation.SOUTHEAST]: "SE",
    [GridLocation.SOUTHWEST]: "SW",
    [GridLocation.NORTHWEST]: "NW",
    [GridLocation.CENTER]: "center",
  };

  type Turns = number | "fl";
  const turnsLabel = (t: Turns) => (t === "fl" ? "fl" : String(t));

  // Full-motion step (red staff + invisible blue placeholder, per the
  // both-hands step contract buildHalvedStep expects).
  const fullStep = (
    id: string,
    type: MotionType,
    from: GridLocation,
    to: GridLocation,
    startOri: Orientation,
    endOri: Orientation,
    rot: RotationDirection,
    turns: Turns
  ): StepData =>
    ({
      id: `hm-${id}`,
      letter: null,
      stepNumber: 1,
      gridMode: GridMode.DIAMOND,
      motions: {
        left: createPlaceholderMotion(HandSide.LEFT, {
          location: E,
          orientation: IN,
        }),
        right: createMotionData({
          motionType: type,
          rotationDirection: rot,
          startLocation: from,
          endLocation: to,
          startOrientation: startOri,
          endOrientation: endOri,
          turns: turns as number,
          hand: HandSide.RIGHT,
          propType: PropType.STAFF,
          gridMode: GridMode.DIAMOND,
        }),
      },
    }) as unknown as StepData;

  // ── WASD placement harness ─────────────────────────────────────────────────
  // Adjustments are authored in GLYPH-LOCAL space (the extracted asset's frame,
  // staff along +x) and shared per (motionType, turns) — the same granularity
  // as the asset files — so nudging one cell moves its whole family coherently.
  // Per cell, local -> screen is rotate(R) with local y flipped when the
  // pipeline mirrors (ArrowSvg's segment scale(1,-1)).
  //
  // Persistence is CANON: the page holds TOTALS per key, autosaves them to the
  // dev-only ./save endpoint, which writes the default placement JSONs the
  // pipeline's segment branch reads (glyph-local, rotated by the orchestrator).
  // In-session the pipeline still has the load-time values cached, so the page
  // renders the DELTA (total - load-time base) as manualAdjustment on top —
  // identical math, no double-application, and a full reload shows the same
  // picture straight from the files.
  type CellMeta = { key: string; R: number; mirrored: boolean };

  const metaOf = (half: StepData | null): CellMeta | null => {
    const m = half?.motions?.right as MotionData | undefined;
    if (!m) return null;
    return {
      key: `${m.motionType}_t${m.turns}`,
      R: calculateSegmentRotation(
        m.endOrientation,
        m.endLocation,
        m.startLocation
      ),
      mirrored:
        m.motionType === MotionType.ANTI
          ? m.rotationDirection === CW
          : m.rotationDirection === CCW,
    };
  };

  const MT_LIST = ["pro", "anti", "dash", "static"] as const;

  let adjustments = $state<Record<string, { x: number; y: number }>>({}); // TOTALS
  let baseline = $state<Record<string, { x: number; y: number }>>({}); // JSON at load
  let baselineLoaded = $state(false);
  let saveStatus = $state<"idle" | "saving" | "saved" | "error">("idle");
  let lastSavedStr = "";
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let selected = $state<string | null>(null); // cell sub (unique per cell)
  let selectedMeta = $state<CellMeta | null>(null);

  $effect(() => {
    // Load the pipeline's own placement files once — they are both the render
    // baseline (what the cached pipeline already applies this session) and the
    // starting totals.
    (async () => {
      const out: Record<string, { x: number; y: number }> = {};
      for (const mt of MT_LIST) {
        try {
          const res = await fetch(
            `/data/arrow_placement/default/default_${mt}_half_placements.json`
          );
          const data = await res.json();
          for (const [turns, xy] of Object.entries(
            (data?.[mt] ?? {}) as Record<string, [number, number]>
          )) {
            out[`${mt}_t${turns}`] = { x: xy[0], y: xy[1] };
          }
        } catch {
          /* missing file = empty dataset */
        }
      }
      baseline = out;
      adjustments = JSON.parse(JSON.stringify(out));
      lastSavedStr = JSON.stringify(adjustments);
      baselineLoaded = true;
    })();
  });

  $effect(() => {
    // Autosave: any totals change (after baseline load) debounces into a POST
    // that rewrites the placement JSONs — the nudge becomes canon immediately.
    const str = JSON.stringify(adjustments);
    if (!baselineLoaded || str === lastSavedStr) return;
    saveStatus = "saving";
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const res = await fetch("/test/half-movements/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ adjustments: JSON.parse(str) }),
        });
        if (!res.ok) throw new Error(String(res.status));
        lastSavedStr = str;
        saveStatus = "saved";
      } catch {
        saveStatus = "error";
      }
    }, 600);
  });

  /** Apply the DELTA (total - load-time baseline) as the screen-space
   *  manualAdjustment the render pipeline already honors; the baseline part is
   *  already applied by the pipeline itself from the JSON it cached at load. */
  const withAdjustment = (step: StepData, meta: CellMeta | null): StepData => {
    if (!meta) return step;
    const tot = adjustments[meta.key];
    const b = baseline[meta.key];
    const adj = {
      x: (tot?.x ?? 0) - (b?.x ?? 0),
      y: (tot?.y ?? 0) - (b?.y ?? 0),
    };
    if (!adj.x && !adj.y) return step;
    const rad = (meta.R * Math.PI) / 180;
    const ly = meta.mirrored ? -adj.y : adj.y;
    const sx = adj.x * Math.cos(rad) - ly * Math.sin(rad);
    const sy = adj.x * Math.sin(rad) + ly * Math.cos(rad);
    const right = step.motions.right as MotionData;
    return {
      ...step,
      motions: {
        ...step.motions,
        right: createMotionData({
          ...right,
          arrowPlacementData: createArrowPlacementData({
            ...right.arrowPlacementData,
            manualAdjustmentX: sx,
            manualAdjustmentY: sy,
          }),
        }),
      },
    } as StepData;
  };

  const selectCell = (sub: string, meta: CellMeta | null) => {
    if (!meta) return;
    if (selected === sub) {
      selected = null;
      selectedMeta = null;
    } else {
      selected = sub;
      selectedMeta = meta;
    }
  };

  const onKeydown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === "escape") {
      if (selected) {
        selected = null;
        selectedMeta = null;
      } else {
        expanded = null;
      }
      return;
    }
    if (!selected || !selectedMeta) return;
    if (k === "r") {
      e.preventDefault();
      adjustments = { ...adjustments, [selectedMeta.key]: { x: 0, y: 0 } };
      return;
    }
    if (k !== "w" && k !== "a" && k !== "s" && k !== "d") return;
    e.preventDefault();
    // Same increment scheme as the step editor's ArrowAdjustmentPanel.
    const inc = e.shiftKey && e.ctrlKey ? 200 : e.shiftKey ? 20 : 5;
    const dx = k === "a" ? -inc : k === "d" ? inc : 0;
    const dy = k === "w" ? -inc : k === "s" ? inc : 0;
    // Screen delta -> glyph-local (inverse of withAdjustment's transform).
    const rad = (selectedMeta.R * Math.PI) / 180;
    const u = dx * Math.cos(rad) + dy * Math.sin(rad);
    const v = -dx * Math.sin(rad) + dy * Math.cos(rad);
    const lx = u;
    const lyv = selectedMeta.mirrored ? -v : v;
    const cur = adjustments[selectedMeta.key] ?? { x: 0, y: 0 };
    adjustments = {
      ...adjustments,
      [selectedMeta.key]: {
        x: Math.round((cur.x + lx) * 10) / 10,
        y: Math.round((cur.y + lyv) * 10) / 10,
      },
    };
  };

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(adjustments, null, 2));
  };
  // ───────────────────────────────────────────────────────────────────────────

  type Cell = {
    label: string;
    sub: string;
    step: StepData | null;
    meta: CellMeta | null;
  };

  const dirWord = (rot: RotationDirection) => (rot === CW ? "cw" : "ccw");

  // Guide-proven recipes: pro t1 in->out, dash in->out, everything else
  // in->in. The declared full-step endOri doesn't drive the halfway state —
  // calculateOrientationAt samples the engine at t from startOri + turns —
  // but we keep the proven values where they're known.
  //
  // For a shift the hand-path direction is fixed by start->end; the motion's
  // rotationDirection is the PROP rotation, which is derived: pro = same as
  // the path, anti = opposite (TurnsPage: PRO E->S carries CW, ANTI E->S
  // carries CCW). `pathCw` is the swept axis; rot falls out of it.
  const shiftCell = (
    type: MotionType,
    from: GridLocation,
    to: GridLocation,
    pathCw: boolean,
    turns: Turns
  ): Cell => {
    const endOri = type === MotionType.PRO && turns === 1 ? OUT : IN;
    const propCw = type === MotionType.PRO ? pathCw : !pathCw;
    const rot = propCw ? CW : CCW;
    const full = fullStep(
      `${type}-${from}-${to}-t${turns}`,
      type,
      from,
      to,
      IN,
      endOri,
      rot,
      turns
    );
    const half = buildHalvedStep(full, 0.5);
    const mid = half?.motions?.right?.endLocation;
    return {
      label: `${LOC_SHORT[from]} → ${mid ? LOC_SHORT[mid] : "?"}`,
      sub: `${type} t${turnsLabel(turns)} · half of ${LOC_SHORT[from]}→${LOC_SHORT[to]} · path ${pathCw ? "cw" : "ccw"}, prop ${dirWord(rot)}`,
      step: half,
      meta: metaOf(half),
    };
  };

  const dashCell = (
    from: GridLocation,
    to: GridLocation,
    rot: RotationDirection,
    turns: Turns
  ): Cell => {
    const full = fullStep(
      `dash-${from}-${to}-${dirWord(rot)}-t${turns}`,
      MotionType.DASH,
      from,
      to,
      IN,
      OUT,
      rot,
      turns
    );
    const half = buildHalvedStep(full, 0.5);
    return {
      label: `${LOC_SHORT[from]} → center`,
      sub: `dash t${turnsLabel(turns)} ${dirWord(rot)} · half of ${LOC_SHORT[from]}→${LOC_SHORT[to]}`,
      step: half,
      meta: metaOf(half),
    };
  };

  const staticCell = (
    at: GridLocation,
    rot: RotationDirection,
    turns: Turns
  ): Cell => {
    const full = fullStep(
      `static-${at}-${dirWord(rot)}-t${turns}`,
      MotionType.STATIC,
      at,
      at,
      IN,
      IN,
      rot,
      turns
    );
    const half = buildHalvedStep(full, 0.5);
    return {
      label: `${LOC_SHORT[at]} (static)`,
      sub: `static t${turnsLabel(turns)} ${dirWord(rot)} · at ${LOC_SHORT[at]}`,
      step: half,
      meta: metaOf(half),
    };
  };

  // Cardinal ring, cw order. cw shift ends at the next cardinal, ccw at the previous.
  const RING = [N, E, S, W] as const;
  const cwEnd = (from: GridLocation) =>
    RING[(RING.indexOf(from as (typeof RING)[number]) + 1) % 4]!;
  const ccwEnd = (from: GridLocation) =>
    RING[(RING.indexOf(from as (typeof RING)[number]) + 3) % 4]!;

  const OPPOSITE: [GridLocation, GridLocation][] = [
    [N, S],
    [E, W],
    [S, N],
    [W, E],
  ];

  /** Every variation of one family: all start points x both directions. */
  const variationCells = (mt: MotionType, turns: Turns): Cell[] => {
    if (mt === MotionType.PRO || mt === MotionType.ANTI) {
      return [
        ...RING.map((from) => shiftCell(mt, from, cwEnd(from), true, turns)),
        ...RING.map((from) => shiftCell(mt, from, ccwEnd(from), false, turns)),
      ];
    }
    if (mt === MotionType.DASH) {
      return [
        ...OPPOSITE.map(([f, t]) => dashCell(f, t, CW, turns)),
        ...OPPOSITE.map(([f, t]) => dashCell(f, t, CCW, turns)),
      ];
    }
    return [
      ...RING.map((at) => staticCell(at, CW, turns)),
      ...RING.map((at) => staticCell(at, CCW, turns)),
    ];
  };

  // ── Coverage matrix ────────────────────────────────────────────────────────
  // scripts/half-domain-coverage.mjs is the authority behind these sets.
  const ALL_TURNS: Turns[] = [0, 0.5, 1, 1.5, 2, 2.5, 3, "fl"];
  const MT_ORDER = [
    MotionType.PRO,
    MotionType.ANTI,
    MotionType.DASH,
    MotionType.STATIC,
  ] as const;

  const LEGAL_TURNS: Record<string, Set<Turns>> = {
    [MotionType.PRO]: new Set(ALL_TURNS),
    [MotionType.ANTI]: new Set(ALL_TURNS),
    [MotionType.DASH]: new Set(ALL_TURNS.filter((t) => t !== "fl")),
    [MotionType.STATIC]: new Set(ALL_TURNS.filter((t) => t !== "fl")),
  };
  // Coverage comes from the generated manifest (single source of truth shared
  // with the arrow path resolver) — ingesting new art via
  // scripts/ingest-half-arrows.mjs flips cells green here automatically.
  const COVERED: Record<string, ReadonlySet<Turns>> = HALF_ASSET_TURNS;

  type Status = "covered" | "hole" | "blocked";
  const statusOf = (mt: MotionType, t: Turns): Status =>
    !LEGAL_TURNS[mt]!.has(t)
      ? "blocked"
      : COVERED[mt]!.has(t)
        ? "covered"
        : "hole";

  const familyKey = (mt: MotionType, t: Turns) => `${mt}_t${t}`;

  // One representative pictograph per family, for the matrix minis.
  const FAMILY_SHAPE: Record<string, [GridLocation, GridLocation]> = {
    [MotionType.PRO]: [E, S],
    [MotionType.ANTI]: [E, S],
    [MotionType.DASH]: [S, N],
    [MotionType.STATIC]: [E, E],
  };
  const familyCell = (mt: MotionType, turns: Turns): Cell | null => {
    const [from, to] = FAMILY_SHAPE[mt]!;
    const rot = mt === MotionType.PRO ? CW : CCW;
    const full = fullStep(
      `family-${mt}-${turns}`,
      mt,
      from,
      to,
      IN,
      IN,
      rot,
      turns
    );
    const half = buildHalvedStep(full, 0.5);
    if (!half) return null;
    return {
      label: `${mt} · t${turnsLabel(turns)}`,
      sub: familyKey(mt, turns),
      step: half,
      meta: metaOf(half),
    };
  };
  const FAMILY_CELLS: Record<string, Cell | null> = Object.fromEntries(
    MT_ORDER.flatMap((mt) =>
      ALL_TURNS.filter((t) => LEGAL_TURNS[mt]!.has(t)).map((t) => [
        familyKey(mt, t),
        familyCell(mt, t),
      ])
    )
  );

  // Completion stats — the math-brain readout.
  const rowLegal = (mt: MotionType) => LEGAL_TURNS[mt]!.size;
  const rowCovered = (mt: MotionType) => COVERED[mt]!.size;
  const TOTAL_LEGAL = MT_ORDER.reduce((n, mt) => n + rowLegal(mt), 0);
  const TOTAL_COVERED = MT_ORDER.reduce((n, mt) => n + rowCovered(mt), 0);
  const COVERED_PCT = Math.round((TOTAL_COVERED / TOTAL_LEGAL) * 100);

  const isTuned = (key: string) => {
    const a = adjustments[key];
    return !!a && (a.x !== 0 || a.y !== 0);
  };
  const tunedCount = $derived(
    MT_ORDER.flatMap((mt) =>
      ALL_TURNS.filter((t) => LEGAL_TURNS[mt]!.has(t)).map((t) =>
        familyKey(mt, t)
      )
    ).filter(isTuned).length
  );

  // ── Expansion ──────────────────────────────────────────────────────────────
  let expanded = $state<{ mt: MotionType; turns: Turns } | null>(null);
  let panelEl = $state<HTMLElement | null>(null);

  const variations = $derived(
    expanded ? variationCells(expanded.mt, expanded.turns) : []
  );

  const expandFamily = (mt: MotionType, t: Turns) => {
    if (expanded?.mt === mt && expanded?.turns === t) {
      expanded = null;
      selected = null;
      selectedMeta = null;
      return;
    }
    expanded = { mt, turns: t };
    // Auto-select the first variation so WASD works immediately (any
    // variation edits the shared family value anyway).
    const first = variationCells(mt, t).find((c) => c.meta);
    selected = first?.sub ?? null;
    selectedMeta = first?.meta ?? null;
  };

  $effect(() => {
    if (expanded && panelEl) {
      panelEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  // Scale reference: the SAME motions un-halved, rendered with the regular
  // arrow assets. The half glyphs should read as the same pen weight as these.
  const REFERENCE: Cell[] = [
    {
      label: "pro (full)",
      sub: "regular asset · E→S cw, 1 turn",
      step: fullStep("ref-pro", MotionType.PRO, E, S, IN, OUT, CW, 1),
      meta: null,
    },
    {
      label: "anti (full)",
      sub: "regular asset · E→S ccw, 1 turn",
      step: fullStep("ref-anti", MotionType.ANTI, E, S, IN, IN, CCW, 1),
      meta: null,
    },
    {
      label: "dash (full)",
      sub: "regular asset · S→N ccw, 2 turns",
      step: fullStep("ref-dash", MotionType.DASH, S, N, IN, OUT, CCW, 2),
      meta: null,
    },
    {
      label: "static (full)",
      sub: "regular asset · E ccw, 2 turns",
      step: fullStep("ref-static", MotionType.STATIC, E, E, IN, IN, CCW, 2),
      meta: null,
    },
  ];

  const PICTO_FLAGS = {
    stepNumberOverride: false,
    showGrid: true,
    showTKA: false,
    showPlacements: false,
    showReversals: false,
    showTnD: false,
    showElemental: false,
    showNonRadialPoints: false,
    showHandPoints: true,
    darkMode: false,
    printMode: true,
    disableTransitions: true,
  } as const;
</script>

<svelte:window onkeydown={onKeydown} />

<div class="page">
  <h1>Half-Movement Matrix</h1>
  <p class="subtitle">
    Rows = motion type, columns = turns. <span class="lg green">green</span> =
    art exists, <span class="lg orange">orange</span> = engine-legal but no art
    yet, <span class="lg grey">✕</span> = not representable. Click a cell to
    open its 8 variations, then <strong>WASD</strong> to move the glyph
    (Shift&nbsp;=&nbsp;20px, Ctrl+Shift&nbsp;=&nbsp;200px,
    <strong>R</strong>&nbsp;=&nbsp;reset,
    <strong>Esc</strong>&nbsp;=&nbsp;close). One nudge moves the whole family
    and <strong>autosaves as canon</strong>
    into the placement JSONs.
  </p>

  <div class="panel">
    {#if selected && selectedMeta}
      <span class="panel-live">
        editing <strong>{selectedMeta.key}</strong>
        — local ({(adjustments[selectedMeta.key]?.x ?? 0).toFixed(1)},
        {(adjustments[selectedMeta.key]?.y ?? 0).toFixed(1)})
      </span>
    {:else}
      <span class="panel-idle">no cell selected</span>
    {/if}
    <span class="panel-values">
      {#each Object.entries(adjustments).filter(([, v]) => v.x || v.y) as [k, v] (k)}
        <code>{k}: ({v.x}, {v.y})</code>
      {/each}
    </span>
    <span
      class="save-status"
      class:saving={saveStatus === "saving"}
      class:saved={saveStatus === "saved"}
      class:error={saveStatus === "error"}
    >
      {saveStatus === "saving"
        ? "saving…"
        : saveStatus === "saved"
          ? "saved ✓"
          : saveStatus === "error"
            ? "save FAILED"
            : "no changes"}
    </span>
    <button type="button" class="copy-btn" onclick={copyJson}>Copy JSON</button>
  </div>

  <div class="stats">
    <div class="stat-line">
      <strong
        >Art coverage: {TOTAL_COVERED} / {TOTAL_LEGAL} families ({COVERED_PCT}%)</strong
      >
      <span class="stat-tuned"
        >placement tuned: {tunedCount} / {TOTAL_LEGAL}</span
      >
    </div>
    <div
      class="progress"
      role="progressbar"
      aria-valuenow={COVERED_PCT}
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div class="progress-fill" style:width="{COVERED_PCT}%"></div>
    </div>
  </div>

  <div class="matrix">
    <div class="corner"></div>
    {#each ALL_TURNS as t (t)}
      <div class="col-head">{turnsLabel(t)}</div>
    {/each}
    <div class="col-head row-stat-head">row</div>

    {#each MT_ORDER as mt (mt)}
      <div class="row-head">{mt}</div>
      {#each ALL_TURNS as t (t)}
        {@const st = statusOf(mt, t)}
        {#if st === "blocked"}
          <div
            class="mcell blocked"
            title="no {turnsLabel(
              t
            )}-turns {mt} halves — not pipeline-representable"
          >
            ✕
          </div>
        {:else}
          {@const cell = FAMILY_CELLS[familyKey(mt, t)]}
          <button
            type="button"
            class="mcell {st}"
            class:open={expanded?.mt === mt && expanded?.turns === t}
            onclick={() => expandFamily(mt, t)}
            title="{mt} · {turnsLabel(t)} turns — {st === 'covered'
              ? `asset ${mt}_half${typeof t === 'number' ? `_${t.toFixed(1)}` : `_${t}`}.svg`
              : 'NO ART (fallback shown)'}"
          >
            <div class="mini">
              {#if cell?.step}
                <PictographContainer
                  pictographData={withAdjustment(cell.step, cell.meta)}
                  gridMode={GridMode.DIAMOND}
                  rightPropTypeOverride={PropType.STAFF}
                  {...PICTO_FLAGS}
                />
              {/if}
            </div>
            {#if st === "hole"}
              <span class="tag">no art</span>
            {/if}
            {#if isTuned(familyKey(mt, t))}
              <span class="dot" title="placement tuned"></span>
            {/if}
          </button>
        {/if}
      {/each}
      <div class="row-stat">{rowCovered(mt)}/{rowLegal(mt)}</div>
    {/each}
  </div>

  <p class="note center">
    Outside this matrix (pipeline-blocked, not art holes): float motions, skewed
    motions, hash (center-touching dashes), quarter fractions.
  </p>

  {#if expanded}
    <section class="variations" bind:this={panelEl}>
      <h2>
        {expanded.mt} · {turnsLabel(expanded.turns)} turns — all 8 variations
        {#if statusOf(expanded.mt, expanded.turns) === "hole"}
          <span class="hole-flag"
            >NO ART — showing fallback {expanded.mt}_half.svg</span
          >
        {/if}
      </h2>
      <p class="note">
        every start point x both directions. Nudging ANY cell moves the whole
        family — the adjustment is one glyph-local value shared across all 8.
      </p>
      <div class="grid">
        {#each variations as cell (cell.sub)}
          <div
            class="cell"
            class:selected={selected === cell.sub}
            onclick={() => selectCell(cell.sub, cell.meta)}
            onkeydown={(e) =>
              (e.key === "Enter" || e.key === " ") &&
              selectCell(cell.sub, cell.meta)}
            role="button"
            tabindex="0"
          >
            <div class="label">{cell.label}</div>
            <div class="stage">
              {#if cell.step}
                <PictographContainer
                  pictographData={withAdjustment(cell.step, cell.meta)}
                  gridMode={GridMode.DIAMOND}
                  rightPropTypeOverride={PropType.STAFF}
                  {...PICTO_FLAGS}
                />
              {:else}
                <div class="null-step">buildHalvedStep returned null</div>
              {/if}
            </div>
            <div class="sub">{cell.sub}</div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <h2>Scale reference — regular arrows</h2>
  <p class="note">the un-halved motions with the standard arrow assets</p>
  <div class="grid">
    {#each REFERENCE as cell (cell.sub)}
      <div class="cell">
        <div class="label">{cell.label}</div>
        <div class="stage">
          <PictographContainer
            pictographData={cell.step}
            gridMode={GridMode.DIAMOND}
            rightPropTypeOverride={PropType.STAFF}
            {...PICTO_FLAGS}
          />
        </div>
        <div class="sub">{cell.sub}</div>
      </div>
    {/each}
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    padding: 24px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    color: white;
  }

  h1 {
    text-align: center;
    margin: 0 0 8px;
  }

  h2 {
    max-width: 1400px;
    margin: 32px auto 4px;
    font-size: 1.2rem;
    color: #a855f7;
  }

  .subtitle {
    max-width: 820px;
    margin: 0 auto 8px;
    text-align: center;
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.5;
  }

  .lg {
    font-weight: 700;
  }

  .lg.green {
    color: #4ade80;
  }

  .lg.orange {
    color: #ffaa3c;
  }

  .lg.grey {
    color: rgba(255, 255, 255, 0.45);
  }

  .note {
    max-width: 1400px;
    margin: 0 auto 12px;
    color: rgba(255, 255, 255, 0.55);
    font-size: 0.9rem;
  }

  .note.center {
    text-align: center;
    margin-top: 12px;
  }

  .stats {
    max-width: 1000px;
    margin: 0 auto 16px;
  }

  .stat-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 6px;
    font-size: 1rem;
  }

  .stat-line strong {
    color: #4ade80;
  }

  .stat-tuned {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.9rem;
  }

  .progress {
    height: 10px;
    background: rgba(255, 170, 60, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 5px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #22c55e;
    border-radius: 5px 0 0 5px;
  }

  .matrix {
    display: grid;
    grid-template-columns: 64px repeat(8, minmax(0, 1fr)) 56px;
    gap: 8px;
    align-items: center;
    max-width: 1000px;
    margin: 0 auto;
  }

  .col-head {
    text-align: center;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.95rem;
  }

  .row-stat-head,
  .row-stat {
    text-align: center;
    font-family: monospace;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.85rem;
  }

  .row-head {
    text-align: right;
    padding-right: 6px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.8);
  }

  .mcell {
    position: relative;
    aspect-ratio: 1;
    width: 100%;
    padding: 3px;
    border-radius: 10px;
    border: 3px solid transparent;
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;
    display: grid;
    place-items: center;
  }

  .mcell.covered {
    border-color: rgba(34, 197, 94, 0.8);
  }

  .mcell.hole {
    border-color: rgba(255, 170, 60, 0.8);
    border-style: dashed;
  }

  .mcell.hole .mini {
    filter: grayscale(0.65) opacity(0.5);
  }

  .mcell.blocked {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.02);
    color: rgba(255, 255, 255, 0.3);
    font-size: 1.3rem;
    cursor: default;
  }

  .mcell.open {
    box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.8);
  }

  .mcell:not(.blocked):hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .mini {
    width: 100%;
    aspect-ratio: 1;
    background: white;
    border-radius: 6px;
    overflow: hidden;
  }

  .tag {
    position: absolute;
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(180, 90, 10, 0.92);
    color: white;
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 4px;
    pointer-events: none;
  }

  .dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #a855f7;
    border: 2px solid rgba(255, 255, 255, 0.9);
    pointer-events: none;
  }

  .variations {
    max-width: 1400px;
    margin: 0 auto;
  }

  .variations h2 {
    margin-top: 28px;
  }

  .hole-flag {
    margin-left: 12px;
    font-size: 0.8rem;
    color: #ffaa3c;
    font-weight: 700;
  }

  /* ── Cells / grids (variations + reference) ── */
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .cell {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 12px;
    text-align: center;
    cursor: pointer;
  }

  .cell.selected {
    border-color: #a855f7;
    box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.5);
  }

  .panel {
    position: sticky;
    top: 8px;
    z-index: 10;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    max-width: 1400px;
    margin: 0 auto 16px;
    padding: 10px 16px;
    background: rgba(20, 20, 40, 0.95);
    border: 1px solid rgba(168, 85, 247, 0.4);
    border-radius: 10px;
    font-size: 0.9rem;
  }

  .panel-live strong {
    color: #a855f7;
  }

  .panel-idle {
    color: rgba(255, 255, 255, 0.5);
  }

  .panel-values {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .panel-values code {
    background: rgba(255, 255, 255, 0.08);
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 0.8rem;
  }

  .copy-btn {
    margin-left: auto;
    padding: 8px 16px;
    min-height: 44px;
    background: #a855f7;
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
  }

  .copy-btn:hover {
    background: #9333ea;
  }

  .save-status {
    min-width: 9ch;
    text-align: center;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.5);
  }

  .save-status.saving {
    color: #ffd27a;
  }

  .save-status.saved {
    color: #6ee7a0;
  }

  .save-status.error {
    color: #ff8a8a;
    font-weight: 700;
  }

  .label {
    font-weight: 600;
    margin-bottom: 8px;
  }

  .stage {
    aspect-ratio: 1;
    background: white;
    border-radius: 8px;
    overflow: hidden;
  }

  .null-step {
    display: grid;
    place-items: center;
    height: 100%;
    color: #b91c1c;
    font-size: 0.85rem;
    padding: 8px;
  }

  .sub {
    margin-top: 8px;
    font-family: monospace;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
  }
</style>
