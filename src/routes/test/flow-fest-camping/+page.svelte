<script lang="ts">
  /**
   * One job: Austen outlines where people really camp at the festival.
   *
   * The site marker page next door does everything; this page does only
   * camping, on the same registered orthophoto, with today's game tents and
   * cars drawn on top so he can see what is in the wrong place. Areas save in
   * world metres (x east, z south) for the Flow Fest crowd and camp runs.
   */
  import { onMount } from "svelte";
  import {
    FLOW_FEST_IMAGE,
    imagePointToWorld,
    worldPointToImage,
    type ImagePoint,
  } from "../flow-fest-path-tracer/_lib/flow-fest-trace";
  import currentLayout from "./_lib/current-layout.json";

  type KindId = "tents" | "car-camping" | "camper-cars" | "parking" | "no-camping";
  type Area = { id: string; kind: KindId; points: ImagePoint[] };
  type View = { x: number; y: number; width: number };
  /** Outline draws areas; erase takes the old game tents off; spots marks where tents really stand. */
  type Tool = "outline" | "erase" | "spots";
  type Step =
    | { kind: "area"; id: string }
    | { kind: "erase"; indices: number[] }
    | { kind: "restore"; indices: number[] }
    | { kind: "spot-add"; at: ImagePoint }
    | { kind: "spot-remove"; at: ImagePoint };
  type Draft = { areas: Area[]; removedTents: number[]; tentSpots?: ImagePoint[] };

  const KINDS: { id: KindId; label: string; color: string }[] = [
    { id: "tents", label: "Tent camping", color: "#f2a33a" },
    { id: "car-camping", label: "Car camping", color: "#4aa3ff" },
    { id: "camper-cars", label: "Upper lot: campers' cars", color: "#b48cff" },
    { id: "parking", label: "Parking, no camping", color: "#a7b0bd" },
    { id: "no-camping", label: "No camping", color: "#ff5c5c" },
  ];
  const kindOf = (id: KindId) => KINDS.find((k) => k.id === id) ?? KINDS[0]!;
  const STORAGE_KEY = "flow-fest-camping-areas-v1";

  const today = {
    tents: currentLayout.tents.map((t) => worldPointToImage(t)),
    cars: currentLayout.cars.map((c) => worldPointToImage(c)),
    landmarks: currentLayout.landmarks.map((l) => ({
      label: l.label,
      // The night fire sits beside Middle Earth; its label goes under the point so the two read apart.
      below: l.id === "fire",
      at: worldPointToImage(l),
    })),
  };

  // Open on everything the game places today, with room around it.
  const startView = (() => {
    const all = [...today.tents, ...today.cars, ...today.landmarks.map((l) => l.at)];
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const margin = 120;
    const minX = Math.min(...xs) - margin;
    const minY = Math.min(...ys) - margin;
    return { x: minX, y: minY, width: Math.max(...xs) + margin - minX, height: Math.max(...ys) + margin - minY };
  })();

  let svgElement = $state<SVGSVGElement | null>(null);
  let mapWidth = $state(1);
  let mapHeight = $state(1);
  let view = $state<View>({ x: startView.x, y: startView.y, width: startView.width });
  let fitted = false;

  let kind = $state<KindId>("tents");
  let areas = $state<Area[]>([]);
  let drawing = $state<ImagePoint[] | null>(null);
  let selectedId = $state<string | null>(null);
  let showToday = $state(true);
  let notice = $state("");
  let saving = $state(false);
  let saved = $state(true);
  let tool = $state<Tool>("outline");
  /** Indices into today's tents that Austen took off the map. */
  let removed = $state<number[]>([]);
  /** Where tents really stand: one dot per tent, roughly placed. */
  let spots = $state<ImagePoint[]>([]);
  let brush = $state<ImagePoint | null>(null);
  let history: Step[] = [];
  let stroke: number[] | null = null;

  const viewHeight = $derived(view.width * (mapHeight / Math.max(1, mapWidth)));
  /** Screen pixels to image pixels, so strokes and dots keep one size on screen. */
  const pixelScale = $derived(view.width / Math.max(1, mapWidth));
  const removedSet = $derived(new Set(removed));
  const brushRadius = $derived(14 * pixelScale);

  // Fit the whole starting box once the map knows its size.
  $effect(() => {
    if (fitted || mapWidth <= 1 || mapHeight <= 1) return;
    fitted = true;
    const aspect = mapHeight / mapWidth;
    const width = Math.max(startView.width, startView.height / aspect);
    view = {
      x: startView.x + (startView.width - width) / 2,
      y: startView.y + (startView.height - width * aspect) / 2,
      width,
    };
  });

  onMount(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Area[] | Draft;
        const draft: Draft = Array.isArray(parsed) ? { areas: parsed, removedTents: [] } : parsed;
        if (draft.areas?.length || draft.removedTents?.length || draft.tentSpots?.length) {
          areas = draft.areas ?? [];
          removed = draft.removedTents ?? [];
          spots = draft.tentSpots ?? [];
          saved = false;
          notice = "Brought back your unsaved changes from this browser.";
          return;
        }
      }
    } catch {
      // A blocked or empty store just means starting from the saved file.
    }
    void loadSaved();
  });

  async function loadSaved(): Promise<void> {
    try {
      const response = await fetch("/test/flow-fest-camping/save");
      const body = (await response.json()) as {
        areas?: { id: string; kind: KindId; vertices: { x: number; z: number }[] }[];
        removedTents?: { x: number; z: number }[];
        tentSpots?: { x: number; z: number }[];
      };
      areas = (body.areas ?? []).map((area) => ({
        id: area.id,
        kind: area.kind,
        points: area.vertices.map((vertex) => worldPointToImage(vertex)),
      }));
      removed = currentLayout.tents.flatMap((tent, index) =>
        (body.removedTents ?? []).some((gone) => Math.hypot(gone.x - tent.x, gone.z - tent.z) < 0.5) ? [index] : []
      );
      spots = (body.tentSpots ?? []).map((spot) => worldPointToImage(spot));
      if (areas.length || removed.length || spots.length) notice = "Opened what you saved last time.";
    } catch {
      notice = "Could not read the saved areas; starting empty.";
    }
  }

  function remember(): void {
    saved = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ areas, removedTents: removed, tentSpots: spots } satisfies Draft));
    } catch {
      // The draft is a convenience; Save writes the real copy.
    }
  }

  function toImage(event: { clientX: number; clientY: number }): ImagePoint {
    const matrix = svgElement?.getScreenCTM();
    if (!svgElement || !matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  function contains(points: ImagePoint[], at: ImagePoint): boolean {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i]!;
      const b = points[j]!;
      if (a.y > at.y !== b.y > at.y && at.x < ((b.x - a.x) * (at.y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  function finishArea(): void {
    if (!drawing) return;
    if (drawing.length < 3) {
      notice = "An area needs at least three corners.";
      return;
    }
    const area = { id: `${kind}-${Date.now().toString(36)}`, kind, points: drawing };
    areas = [...areas, area];
    history.push({ kind: "area", id: area.id });
    drawing = null;
    selectedId = area.id;
    notice = `${kindOf(kind).label} area added.`;
    remember();
  }

  function removeSelected(): void {
    if (!selectedId) return;
    areas = areas.filter((area) => area.id !== selectedId);
    selectedId = null;
    notice = "Area removed.";
    remember();
  }

  const tentWord = (count: number) => `${count} tent${count === 1 ? "" : "s"}`;

  /** The nearest of today's tents within the brush, removed or not. */
  function tentNear(at: ImagePoint, wantRemoved: boolean): number | undefined {
    let best: number | undefined;
    let bestDistance = brushRadius;
    today.tents.forEach((tent, index) => {
      if (removedSet.has(index) !== wantRemoved) return;
      const distance = Math.hypot(tent.x - at.x, tent.y - at.y);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    return best;
  }

  function eraseAt(at: ImagePoint): void {
    if (!stroke) return;
    const hits = today.tents.flatMap((tent, index) =>
      !removedSet.has(index) && Math.hypot(tent.x - at.x, tent.y - at.y) < brushRadius ? [index] : []
    );
    if (!hits.length) return;
    stroke.push(...hits);
    removed = [...removed, ...hits];
  }

  function finishStroke(): void {
    if (stroke?.length) {
      history.push({ kind: "erase", indices: stroke });
      notice = `Removed ${tentWord(stroke.length)}. ${removed.length} off the map so far.`;
      remember();
    }
    stroke = null;
  }

  function restoreTents(indices: number[]): void {
    if (!indices.length) return;
    removed = removed.filter((index) => !indices.includes(index));
    history.push({ kind: "restore", indices });
    notice = `Brought back ${tentWord(indices.length)}.`;
    remember();
  }

  /** A click in spots mode: on a dot takes it off, anywhere else adds one. */
  function toggleSpot(at: ImagePoint): void {
    const hit = spots.find((spot) => Math.hypot(spot.x - at.x, spot.y - at.y) < 8 * pixelScale);
    if (hit) {
      spots = spots.filter((spot) => spot.x !== hit.x || spot.y !== hit.y);
      history.push({ kind: "spot-remove", at: { x: hit.x, y: hit.y } });
      notice = `Tent spot removed. ${spots.length} marked.`;
    } else {
      spots = [...spots, at];
      history.push({ kind: "spot-add", at });
      notice = `${spots.length} tent spot${spots.length === 1 ? "" : "s"} marked.`;
    }
    remember();
  }

  function chooseTool(next: Tool): void {
    tool = next;
    drawing = null;
    selectedId = null;
    if (next === "erase") showToday = true;
  }

  function undo(): void {
    if (drawing?.length) {
      drawing = drawing.length > 1 ? drawing.slice(0, -1) : null;
      return;
    }
    const step = history.pop();
    if (step?.kind === "spot-add") {
      spots = spots.filter((spot) => spot.x !== step.at.x || spot.y !== step.at.y);
      notice = "Took that tent spot back.";
      remember();
    } else if (step?.kind === "spot-remove") {
      spots = [...spots, step.at];
      notice = "Put that tent spot back.";
      remember();
    } else if (step?.kind === "erase") {
      removed = removed.filter((index) => !step.indices.includes(index));
      notice = `Put back ${tentWord(step.indices.length)}.`;
      remember();
    } else if (step?.kind === "restore") {
      removed = [...removed, ...step.indices];
      notice = `Took ${tentWord(step.indices.length)} off again.`;
      remember();
    } else if (step?.kind === "area") {
      areas = areas.filter((area) => area.id !== step.id);
      selectedId = null;
      notice = "Last area removed.";
      remember();
    } else if (areas.length) {
      areas = areas.slice(0, -1);
      selectedId = null;
      notice = "Last area removed.";
      remember();
    }
  }

  async function save(): Promise<void> {
    if (drawing && drawing.length >= 3) finishArea();
    saving = true;
    try {
      const response = await fetch("/test/flow-fest-camping/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          areas: areas.map((area) => ({
            id: area.id,
            kind: area.kind,
            label: kindOf(area.kind).label,
            vertices: area.points.map(imagePointToWorld),
          })),
          removedTents: removed.map((index) => ({ x: currentLayout.tents[index]!.x, z: currentLayout.tents[index]!.z })),
          tentSpots: spots.map((spot) => {
            const world = imagePointToWorld(spot);
            return { x: Math.round(world.x * 100) / 100, z: Math.round(world.z * 100) / 100 };
          }),
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
        areaCount?: number;
        removedCount?: number;
        spotCount?: number;
      };
      if (!result.ok) {
        notice = result.error ?? "The save was refused.";
        return;
      }
      saved = true;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Nothing to clear.
      }
      const removedNote = result.removedCount ? `, ${tentWord(result.removedCount)} removed` : "";
      const spotNote = result.spotCount ? `, ${result.spotCount} tent spot${result.spotCount === 1 ? "" : "s"}` : "";
      notice = `Saved ${result.areaCount} area${result.areaCount === 1 ? "" : "s"}${removedNote}${spotNote}. Tell Claude when you're done.`;
    } catch {
      notice = "The save did not reach the dev server.";
    } finally {
      saving = false;
    }
  }

  // A press that moves more than a few pixels pans the map; one that stays put
  // places a corner or picks an area.
  let press: { x: number; y: number; view: View; moved: boolean } | null = null;

  function handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 1) return;
    svgElement?.setPointerCapture(event.pointerId);
    if (tool === "erase" && event.button === 0) {
      // Pressing on a removed tent brings it back; anywhere else starts a brush stroke.
      const at = toImage(event);
      const gone = tentNear(at, true);
      if (gone !== undefined) {
        restoreTents([gone]);
        return;
      }
      stroke = [];
      eraseAt(at);
      return;
    }
    press = { x: event.clientX, y: event.clientY, view: { ...view }, moved: false };
  }

  function handlePointerMove(event: PointerEvent): void {
    if (tool === "erase") {
      brush = toImage(event);
      if (stroke) {
        eraseAt(brush);
        return;
      }
    }
    if (!press) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!press.moved && Math.hypot(dx, dy) < 5) return;
    press.moved = true;
    view = { ...press.view, x: press.view.x - dx * pixelScale, y: press.view.y - dy * pixelScale };
  }

  function handlePointerUp(event: PointerEvent): void {
    if (stroke) {
      finishStroke();
      return;
    }
    const wasClick = press && !press.moved && event.button === 0;
    if (tool === "erase") {
      press = null;
      return;
    }
    if (tool === "spots") {
      press = null;
      if (wasClick) toggleSpot(toImage(event));
      return;
    }
    press = null;
    if (!wasClick) return;
    const at = toImage(event);
    if (drawing) {
      const first = drawing[0]!;
      if (drawing.length >= 3 && Math.hypot(at.x - first.x, at.y - first.y) < 10 * pixelScale) {
        finishArea();
      } else {
        drawing = [...drawing, at];
      }
      return;
    }
    const hit = [...areas].reverse().find((area) => contains(area.points, at));
    if (hit && hit.id !== selectedId) {
      selectedId = hit.id;
      return;
    }
    selectedId = null;
    drawing = [at];
  }

  function handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const at = toImage(event);
    const factor = Math.exp(event.deltaY * 0.0015);
    const width = Math.min(FLOW_FEST_IMAGE.width * 1.2, Math.max(60, view.width * factor));
    const scale = width / view.width;
    view = { x: at.x - (at.x - view.x) * scale, y: at.y - (at.y - view.y) * scale, width };
  }

  function zoom(factor: number): void {
    const centre = { x: view.x + view.width / 2, y: view.y + viewHeight / 2 };
    const width = Math.min(FLOW_FEST_IMAGE.width * 1.2, Math.max(60, view.width * factor));
    view = { x: centre.x - width / 2, y: centre.y - (viewHeight * width) / view.width / 2, width };
  }

  function handleKey(event: KeyboardEvent): void {
    if (event.key === "Enter") finishArea();
    else if (event.key === "Escape") {
      drawing = null;
      selectedId = null;
      tool = "outline";
    } else if (event.key === "Backspace") undo();
    else if (event.key === "Delete") removeSelected();
    else if (event.key === "s" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void save();
    } else return;
  }

  const pointsAttribute = (points: ImagePoint[]) => points.map((p) => `${p.x},${p.y}`).join(" ");
  const centroid = (points: ImagePoint[]) => ({
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  });
</script>

<svelte:window onkeydown={handleKey} />
<svelte:head><title>Where people camp</title></svelte:head>

<main class="page">
  <header class="bar">
    <h1>Where people camp</h1>
    <div class="kinds" role="group" aria-label="What you are outlining">
      {#each KINDS as option (option.id)}
        <button
          type="button"
          class="pill"
          class:pill--on={tool === "outline" && kind === option.id}
          aria-pressed={tool === "outline" && kind === option.id}
          style="--swatch: {option.color}"
          onclick={() => {
            kind = option.id;
            chooseTool("outline");
          }}
        >
          <span class="swatch" aria-hidden="true"></span>{option.label}
        </button>
      {/each}
      <button
        type="button"
        class="pill"
        class:pill--on={tool === "erase"}
        aria-pressed={tool === "erase"}
        style="--swatch: #ff5c5c"
        onclick={() => chooseTool(tool === "erase" ? "outline" : "erase")}
      >
        <span class="erase-mark" aria-hidden="true">×</span>Remove old tents{#if removed.length}&nbsp;({removed.length}){/if}
      </button>
      <button
        type="button"
        class="pill"
        class:pill--on={tool === "spots"}
        aria-pressed={tool === "spots"}
        style="--swatch: #ffffff"
        onclick={() => chooseTool(tool === "spots" ? "outline" : "spots")}
      >
        <span class="spot-mark" aria-hidden="true"></span>Place tents{#if spots.length}&nbsp;({spots.length}){/if}
      </button>
    </div>
    <div class="actions">
      {#if drawing}
        <button type="button" class="pill" onclick={finishArea} disabled={drawing.length < 3}>Close area</button>
      {/if}
      <button type="button" class="pill" onclick={undo}>Undo</button>
      {#if selectedId}
        <button type="button" class="pill pill--danger" onclick={removeSelected}>Remove area</button>
      {/if}
      {#if tool === "erase" && removed.length}
        <button type="button" class="pill" onclick={() => restoreTents([...removed])}>Bring back all tents</button>
      {/if}
      <button
        type="button"
        class="pill"
        aria-pressed={showToday}
        onclick={() => {
          showToday = !showToday;
          if (!showToday) tool = "outline";
        }}
      >
        {showToday ? "Hide" : "Show"} old tents and cars
      </button>
      <button type="button" class="pill" aria-label="Zoom in" onclick={() => zoom(0.7)}>+</button>
      <button type="button" class="pill" aria-label="Zoom out" onclick={() => zoom(1.4)}>−</button>
      <button type="button" class="pill pill--save" onclick={save} disabled={saving}>
        {saving ? "Saving…" : saved ? "Saved" : "Save"}
      </button>
    </div>
  </header>

  <p class="help">
    {#if tool === "spots"}
      Click where a tent stands, one dot per tent; rough is fine. Click a white dot to take it off. Drag to move the map, scroll to zoom.
    {:else if tool === "erase"}
      Drag across tents to take them off the map. Click a red X to bring that tent back. Scroll to zoom; drag with the wheel button to move the map.
    {:else if drawing}
      Click each corner of the {kindOf(kind).label.toLowerCase()} area. Click the first corner or press Enter to close it, Escape to drop it.
    {:else}
      Pick a kind above, then click around an area's edge. Drag to move the map, scroll to zoom. Click an area to pick it.
    {/if}
    {#if notice}<span class="notice" role="status">{notice}</span>{/if}
  </p>

  <div class="map-frame" bind:clientWidth={mapWidth} bind:clientHeight={mapHeight}>
    <svg
      bind:this={svgElement}
      class="map"
      class:map--erase={tool === "erase"}
      viewBox="{view.x} {view.y} {view.width} {viewHeight}"
      role="application"
      aria-label="Aerial photo of the festival site for outlining camping areas"
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={() => {
        press = null;
        finishStroke();
      }}
      onpointerleave={() => (brush = null)}
      onwheel={handleWheel}
    >
      <image href="/data/flow-fest-sim/ortho.webp" x="0" y="0" width={FLOW_FEST_IMAGE.width} height={FLOW_FEST_IMAGE.height} />

      {#each areas as area (area.id)}
        {@const option = kindOf(area.kind)}
        {@const middle = centroid(area.points)}
        <g class="area" class:area--selected={area.id === selectedId} style="--swatch: {option.color}">
          <polygon points={pointsAttribute(area.points)} stroke-width={(area.id === selectedId ? 4 : 2) * pixelScale} />
          <text x={middle.x} y={middle.y} font-size={13 * pixelScale} stroke-width={3 * pixelScale}>{option.label}</text>
        </g>
      {/each}

      {#if showToday}
        <g class="today" aria-hidden="true">
          {#each today.cars as car, index (index)}
            <rect x={car.x - 3 * pixelScale} y={car.y - 3 * pixelScale} width={6 * pixelScale} height={6 * pixelScale} stroke-width={1.5 * pixelScale} class="car" />
          {/each}
          {#each today.tents as tent, index (index)}
            {#if removedSet.has(index)}
              {@const arm = 4 * pixelScale}
              <path
                d="M{tent.x - arm} {tent.y - arm} L{tent.x + arm} {tent.y + arm} M{tent.x + arm} {tent.y - arm} L{tent.x - arm} {tent.y + arm}"
                stroke-width={2.5 * pixelScale}
                class="tent-removed"
              />
            {:else}
              <circle cx={tent.x} cy={tent.y} r={3.5 * pixelScale} stroke-width={1.5 * pixelScale} class="tent" />
            {/if}
          {/each}
          {#each today.landmarks as landmark (landmark.label)}
            <text x={landmark.at.x} y={landmark.at.y + (landmark.below ? 18 : -8) * pixelScale} font-size={12 * pixelScale} stroke-width={3 * pixelScale} class="landmark">{landmark.label}</text>
          {/each}
        </g>
      {/if}

      {#if drawing}
        {@const option = kindOf(kind)}
        <g class="area area--drawing" style="--swatch: {option.color}">
          <polyline points={pointsAttribute(drawing)} stroke-width={2.5 * pixelScale} />
          {#each drawing as corner, index (index)}
            <circle cx={corner.x} cy={corner.y} r={(index === 0 ? 6 : 4) * pixelScale} stroke-width={1.5 * pixelScale} />
          {/each}
        </g>
      {/if}

      {#each spots as spot, index (index)}
        <circle cx={spot.x} cy={spot.y} r={4.5 * pixelScale} stroke-width={2 * pixelScale} class="spot" />
      {/each}

      {#if tool === "erase" && brush}
        <circle cx={brush.x} cy={brush.y} r={brushRadius} stroke-width={1.5 * pixelScale} class="brush" />
      {/if}
    </svg>
    {#if showToday}
      <p class="legend">
        <span class="legend-tent" aria-hidden="true"></span>Old game tent
        <span class="legend-car" aria-hidden="true"></span>Old game car
        {#if removed.length}
          <span class="legend-removed" aria-hidden="true">×</span>Removed
        {/if}
        {#if spots.length}
          <span class="legend-spot" aria-hidden="true"></span>Your tent
        {/if}
      </p>
    {/if}
  </div>
</main>

<style>
  .page {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: auto auto 1fr;
    gap: 8px;
    padding: 12px;
    background: #0f1419;
    color: #e8edf2;
    font-family: system-ui, sans-serif;
    overflow: hidden;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
  }
  h1 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 650;
  }
  .kinds,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .actions {
    margin-left: auto;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid #3a4552;
    border-radius: 999px;
    background: #1b232c;
    color: inherit;
    font: inherit;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .pill:hover:not(:disabled) {
    background: #26313c;
  }
  .pill:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .pill--on {
    border-color: var(--swatch);
    background: color-mix(in srgb, var(--swatch) 22%, #1b232c);
  }
  .pill--save {
    border-color: #5fbf7a;
    background: #23402c;
  }
  .pill--danger {
    border-color: #ff5c5c;
  }
  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    background: var(--swatch);
  }
  .help {
    margin: 0;
    color: #aab4bf;
    font-size: 0.92rem;
  }
  .notice {
    margin-left: 12px;
    color: #e8edf2;
  }
  .map-frame {
    position: relative;
    min-height: 0;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid #2a333d;
  }
  .map {
    display: block;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
  }
  .area polygon {
    fill: color-mix(in srgb, var(--swatch) 32%, transparent);
    stroke: var(--swatch);
  }
  .area--selected polygon {
    fill: color-mix(in srgb, var(--swatch) 45%, transparent);
    stroke: #fff;
  }
  .area text,
  .landmark {
    fill: #fff;
    stroke: #0f1419;
    paint-order: stroke;
    text-anchor: middle;
    dominant-baseline: middle;
    pointer-events: none;
  }
  .area--drawing polyline {
    fill: none;
    stroke: var(--swatch);
  }
  .area--drawing circle {
    fill: var(--swatch);
    stroke: #fff;
  }
  .today {
    pointer-events: none;
  }
  .tent {
    fill: #ffb347;
    stroke: #3a1d00;
  }
  .car {
    fill: #7ec8ff;
    stroke: #00243d;
  }
  .landmark {
    font-weight: 600;
  }
  .legend {
    position: absolute;
    left: 10px;
    bottom: 10px;
    margin: 0;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    border-radius: 8px;
    background: rgb(15 20 25 / 0.85);
    font-size: 0.85rem;
    pointer-events: none;
  }
  .legend-tent,
  .legend-car {
    width: 10px;
    height: 10px;
    margin-left: 6px;
  }
  .legend-tent {
    border-radius: 50%;
    background: #ffb347;
  }
  .legend-car {
    background: #7ec8ff;
  }
  .map--erase {
    cursor: none;
  }
  .brush {
    fill: rgb(255 92 92 / 0.15);
    stroke: #ff5c5c;
    pointer-events: none;
  }
  .tent-removed {
    stroke: #ff5c5c;
    stroke-linecap: round;
  }
  .spot {
    fill: #ffffff;
    stroke: #14202b;
    pointer-events: none;
  }
  .spot-mark,
  .legend-spot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 0 0 2px #14202b;
  }
  .legend-spot {
    margin-left: 6px;
  }
  .erase-mark,
  .legend-removed {
    color: #ff5c5c;
    font-weight: 700;
    line-height: 1;
  }
  .erase-mark {
    font-size: 1.2rem;
  }
  .legend-removed {
    margin-left: 6px;
  }
</style>
