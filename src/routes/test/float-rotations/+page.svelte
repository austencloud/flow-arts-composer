<script lang="ts">
  import { onMount } from "svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    GridLocation,
    GridMode,
    GridPlacement,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import {
    MotionType,
    RotationDirection,
    Orientation,
    HandSide,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import {
    floatClockwiseHandpathMap,
    floatCounterClockwiseHandpathMap,
  } from "$lib/shared/pictograph/arrow/positioning/calculation/config/float-rotation-maps";

  type Loc = (typeof GridLocation)[keyof typeof GridLocation];
  type Handpath = "cw" | "ccw";

  // Pending, unsaved per-cell target angles. Dialing edits these in-memory and
  // previews live (no write, no reload). "Save all" flushes them to source.
  let pending = $state<Record<string, number>>({});
  let status = $state("");
  let saving = $state(false);

  const dirtyCount = $derived(Object.keys(pending).length);

  // The angle the current SOURCE applies for a float at (handpath, arrowLocation).
  function mapRotation(handpath: Handpath, arrow: Loc): number {
    const map =
      handpath === "cw"
        ? floatClockwiseHandpathMap
        : floatCounterClockwiseHandpathMap;
    return map[arrow] ?? 0;
  }

  const cellKey = (handpath: Handpath, loc: Loc) => `${handpath}:${loc}`;

  // Effective angle = pending edit if present, else the current source value.
  function displayAngle(handpath: Handpath, loc: Loc): number {
    return pending[cellKey(handpath, loc)] ?? mapRotation(handpath, loc);
  }

  const isDirty = (handpath: Handpath, loc: Loc) =>
    cellKey(handpath, loc) in pending;

  // Dial a cell by ±45°. No network, no reload — just updates the preview. If it
  // lands back on the source value, drop it from pending (nothing to save).
  function rotate(handpath: Handpath, loc: Loc, delta: number) {
    const key = cellKey(handpath, loc);
    const current = displayAngle(handpath, loc);
    const next =
      (((Math.round((current + delta) / 45) * 45) % 360) + 360) % 360;
    const base = mapRotation(handpath, loc);
    const nextPending = { ...pending };
    if (next === base) delete nextPending[key];
    else nextPending[key] = next;
    pending = nextPending;
  }

  function discardAll() {
    pending = {};
    status = "";
  }

  // Flush every pending change to source in one batch, then reload once so the
  // page re-renders from the canonical (now-saved) maps.
  async function saveAll() {
    const entries = Object.entries(pending);
    if (!entries.length || saving) return;
    saving = true;
    status = `Saving ${entries.length} change${entries.length > 1 ? "s" : ""}…`;
    try {
      for (const [key, angle] of entries) {
        const [handpath, loc] = key.split(":");
        const res = await fetch("/test/float-rotations/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ handpath, location: loc, angle }),
        });
        if (!res.ok) {
          status = `Save failed for ${key} (${res.status}): ${await res.text()}`;
          saving = false;
          return;
        }
      }
      sessionStorage.setItem("float-tuner-scroll", String(window.scrollY));
      status = "Saved. Reloading…";
      // The file writes make Vite full-reload on its own; this is only a
      // self-canceling fallback (the navigation clears it) so we never
      // double-reload and interrupt the pictograph prepare.
      setTimeout(() => window.location.reload(), 2500);
    } catch (e) {
      status = `Save error: ${e instanceof Error ? e.message : String(e)}`;
      saving = false;
    }
  }

  // Live in-place preview: override the rendered RED float arrow's rotation to
  // the effective angle, without a reload. Self-contained to this page — touches
  // no shared render code. The arrow's own inline transform is
  // `translate(x, y) rotate(Ndeg)`; we swap the rotate to the target, preserving
  // the translate. A MutationObserver re-applies if the renderer re-renders; the
  // early-return-when-already-correct guard prevents an observer feedback loop.
  function previewRotation(node: HTMLElement, angle: number) {
    let current = angle;
    let raf = 0;
    function apply() {
      const arrow = node.querySelector<SVGGElement>(".red-arrow-svg");
      if (!arrow) return;
      if ((arrow.style.transform || "").includes(`rotate(${current}deg)`))
        return;
      const style = arrow.getAttribute("style") || "";
      const translate = style.match(/translate\([^)]*\)/)?.[0] ?? "";
      arrow.style.transform = `${translate} rotate(${current}deg)`;
    }
    const obs = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    });
    obs.observe(node, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    apply();
    return {
      update(a: number) {
        current = a;
        apply();
      },
      destroy() {
        obs.disconnect();
        cancelAnimationFrame(raf);
      },
    };
  }

  onMount(() => {
    const y = sessionStorage.getItem("float-tuner-scroll");
    if (y != null) {
      window.scrollTo(0, parseInt(y, 10));
      sessionStorage.removeItem("float-tuner-scroll");
    }
  });

  const LOC_NAME: Record<Loc, string> = {
    n: "N",
    e: "E",
    s: "S",
    w: "W",
    ne: "NE",
    se: "SE",
    sw: "SW",
    nw: "NW",
    c: "C",
  };

  interface FloatCase {
    id: string;
    handpath: Handpath;
    start: Loc;
    end: Loc;
    arrow: Loc;
    prefloat: (typeof MotionType)[keyof typeof MotionType];
    gridMode: (typeof GridMode)[keyof typeof GridMode];
    /** Location for the neutral BLUE static hand (kept clear of the float). */
    leftStatic: Loc;
  }

  function buildFloat(c: FloatCase): PictographData {
    return {
      id: c.id,
      letter: null,
      gridMode: c.gridMode,
      startPlacement: null,
      endPlacement: null,
      motions: {
        [HandSide.RIGHT]: createMotionData({
          motionType: MotionType.FLOAT,
          turns: "fl",
          rotationDirection: RotationDirection.NO_ROTATION,
          prefloatMotionType: c.prefloat,
          prefloatRotationDirection:
            c.handpath === "cw"
              ? RotationDirection.CLOCKWISE
              : RotationDirection.COUNTER_CLOCKWISE,
          startLocation: c.start,
          endLocation: c.end,
          arrowLocation: c.arrow,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.IN,
          hand: HandSide.RIGHT,
          gridMode: c.gridMode,
        }),
        [HandSide.LEFT]: createMotionData({
          motionType: MotionType.STATIC,
          rotationDirection: RotationDirection.NO_ROTATION,
          startLocation: c.leftStatic,
          endLocation: c.leftStatic,
          arrowLocation: c.leftStatic,
          turns: 0,
          startOrientation: Orientation.IN,
          endOrientation: Orientation.IN,
          hand: HandSide.LEFT,
          gridMode: c.gridMode,
        }),
      },
    };
  }

  // ── Section A: exact reproduction of the reported pictograph ──────────────
  const reported: PictographData = {
    id: "reported-B-beat10",
    letter: Letter.B,
    gridMode: GridMode.DIAMOND,
    startPlacement: GridPlacement.ALPHA3,
    endPlacement: GridPlacement.ALPHA1,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: MotionType.ANTI,
        turns: 0.5,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.WEST,
        endLocation: GridLocation.SOUTH,
        arrowLocation: GridLocation.SOUTHWEST,
        startOrientation: Orientation.OUT,
        endOrientation: Orientation.COUNTER,
        hand: HandSide.LEFT,
        gridMode: GridMode.DIAMOND,
      }),
      [HandSide.RIGHT]: createMotionData({
        motionType: MotionType.FLOAT,
        turns: "fl",
        rotationDirection: RotationDirection.NO_ROTATION,
        prefloatMotionType: MotionType.ANTI,
        prefloatRotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.EAST,
        endLocation: GridLocation.NORTH,
        arrowLocation: GridLocation.NORTHEAST,
        startOrientation: Orientation.OUT,
        endOrientation: Orientation.CLOCK,
        hand: HandSide.RIGHT,
        gridMode: GridMode.DIAMOND,
      }),
    },
  };

  // ── Section B: every DIAMOND cardinal-shift float ─────────────────────────
  const diamondCases: FloatCase[] = [
    {
      id: "d-cw-ne",
      handpath: "cw",
      start: "n",
      end: "e",
      arrow: "ne",
      prefloat: MotionType.PRO,
      gridMode: GridMode.DIAMOND,
      leftStatic: "s",
    },
    {
      id: "d-cw-se",
      handpath: "cw",
      start: "e",
      end: "s",
      arrow: "se",
      prefloat: MotionType.PRO,
      gridMode: GridMode.DIAMOND,
      leftStatic: "w",
    },
    {
      id: "d-cw-sw",
      handpath: "cw",
      start: "s",
      end: "w",
      arrow: "sw",
      prefloat: MotionType.PRO,
      gridMode: GridMode.DIAMOND,
      leftStatic: "n",
    },
    {
      id: "d-cw-nw",
      handpath: "cw",
      start: "w",
      end: "n",
      arrow: "nw",
      prefloat: MotionType.PRO,
      gridMode: GridMode.DIAMOND,
      leftStatic: "e",
    },
    {
      id: "d-ccw-ne",
      handpath: "ccw",
      start: "e",
      end: "n",
      arrow: "ne",
      prefloat: MotionType.ANTI,
      gridMode: GridMode.DIAMOND,
      leftStatic: "s",
    },
    {
      id: "d-ccw-se",
      handpath: "ccw",
      start: "s",
      end: "e",
      arrow: "se",
      prefloat: MotionType.ANTI,
      gridMode: GridMode.DIAMOND,
      leftStatic: "w",
    },
    {
      id: "d-ccw-sw",
      handpath: "ccw",
      start: "w",
      end: "s",
      arrow: "sw",
      prefloat: MotionType.ANTI,
      gridMode: GridMode.DIAMOND,
      leftStatic: "n",
    },
    {
      id: "d-ccw-nw",
      handpath: "ccw",
      start: "n",
      end: "w",
      arrow: "nw",
      prefloat: MotionType.ANTI,
      gridMode: GridMode.DIAMOND,
      leftStatic: "e",
    },
  ];

  // ── Section C: every BOX intercardinal-shift float ────────────────────────
  const boxCases: FloatCase[] = [
    {
      id: "b-cw-e",
      handpath: "cw",
      start: "ne",
      end: "se",
      arrow: "e",
      prefloat: MotionType.PRO,
      gridMode: GridMode.BOX,
      leftStatic: "sw",
    },
    {
      id: "b-cw-s",
      handpath: "cw",
      start: "se",
      end: "sw",
      arrow: "s",
      prefloat: MotionType.PRO,
      gridMode: GridMode.BOX,
      leftStatic: "nw",
    },
    {
      id: "b-cw-w",
      handpath: "cw",
      start: "sw",
      end: "nw",
      arrow: "w",
      prefloat: MotionType.PRO,
      gridMode: GridMode.BOX,
      leftStatic: "ne",
    },
    {
      id: "b-cw-n",
      handpath: "cw",
      start: "nw",
      end: "ne",
      arrow: "n",
      prefloat: MotionType.PRO,
      gridMode: GridMode.BOX,
      leftStatic: "se",
    },
    {
      id: "b-ccw-e",
      handpath: "ccw",
      start: "se",
      end: "ne",
      arrow: "e",
      prefloat: MotionType.ANTI,
      gridMode: GridMode.BOX,
      leftStatic: "sw",
    },
    {
      id: "b-ccw-n",
      handpath: "ccw",
      start: "ne",
      end: "nw",
      arrow: "n",
      prefloat: MotionType.ANTI,
      gridMode: GridMode.BOX,
      leftStatic: "se",
    },
    {
      id: "b-ccw-w",
      handpath: "ccw",
      start: "nw",
      end: "sw",
      arrow: "w",
      prefloat: MotionType.ANTI,
      gridMode: GridMode.BOX,
      leftStatic: "ne",
    },
    {
      id: "b-ccw-s",
      handpath: "ccw",
      start: "sw",
      end: "se",
      arrow: "s",
      prefloat: MotionType.ANTI,
      gridMode: GridMode.BOX,
      leftStatic: "nw",
    },
  ];

  const diamondPictographs = diamondCases.map((c) => ({
    c,
    data: buildFloat(c),
  }));
  const boxPictographs = boxCases.map((c) => ({ c, data: buildFloat(c) }));
</script>

{#snippet dial(handpath: Handpath, loc: Loc)}
  <div
    class="dial"
    role="group"
    aria-label="Rotate {handpath} {LOC_NAME[loc]} float arrow"
  >
    <button
      class="step"
      disabled={saving}
      onclick={() => rotate(handpath, loc, -45)}
      aria-label="Rotate 45 degrees counter-clockwise"
      title="−45° (counter-clockwise)">−45°</button
    >
    <span class="angle" class:dirty={isDirty(handpath, loc)}>
      {displayAngle(handpath, loc)}°{isDirty(handpath, loc) ? " *" : ""}
    </span>
    <button
      class="step"
      disabled={saving}
      onclick={() => rotate(handpath, loc, 45)}
      aria-label="Rotate 45 degrees clockwise"
      title="+45° (clockwise)">+45°</button
    >
  </div>
  <div class="cell-key">
    map cell <code>{handpath} · {LOC_NAME[loc]}</code>
    {#if isDirty(handpath, loc)}<span class="was"
        >was {mapRotation(handpath, loc)}°</span
      >{/if}
  </div>
{/snippet}

<div class="page">
  <header>
    <h1>Float arrow rotations — live tuner</h1>
    <p>
      RED hand is the float under test; BLUE is a neutral static hand. Each dial
      rotates the arrow by 45° and previews it live with no reload. Nothing is
      written until you press Save all, which flushes every pending change into
      <code>float-rotation-maps.ts</code> at once and reloads once. Each dial
      edits a canonical map cell
      <code>(handpath · arrow-location)</code>, so every float that shares that
      cell updates together. Point each RED chevron along its hand's travel
      (start → end).
    </p>
  </header>

  <div class="savebar" class:has-changes={dirtyCount > 0}>
    <div class="savebar-status">
      {#if status}
        <span class="msg">{status}</span>
      {:else if dirtyCount > 0}
        <span class="msg"
          >{dirtyCount} unsaved change{dirtyCount > 1 ? "s" : ""}</span
        >
      {:else}
        <span class="msg idle">No unsaved changes</span>
      {/if}
    </div>
    <div class="savebar-actions">
      <button
        class="btn ghost"
        disabled={saving || dirtyCount === 0}
        onclick={discardAll}>Discard</button
      >
      <button
        class="btn primary"
        disabled={saving || dirtyCount === 0}
        onclick={saveAll}
        >{saving
          ? "Saving…"
          : `Save all${dirtyCount ? ` (${dirtyCount})` : ""}`}</button
      >
    </div>
  </div>

  <section>
    <h2>Reported case — Letter B, beat 10</h2>
    <p class="note">
      The one you gave me. RED float E → N (arrow at NE). Dial it until the
      chevron points correctly; it edits the <code>ccw · NE</code> cell.
    </p>
    <div class="grid">
      <div class="cell highlight">
        <div class="label">Letter B · diamond · beat 10</div>
        <div
          class="pictograph-container"
          use:previewRotation={displayAngle("ccw", "ne")}
        >
          <PictographContainer pictographData={reported} />
        </div>
        <div class="info">
          <span class="red">RED float</span> E→N ·
          <span class="blue">BLUE anti</span> W→S 0.5 cw
        </div>
        {@render dial("ccw", "ne")}
      </div>
    </div>
  </section>

  <section>
    <h2>Diamond floats — all 4 intercardinal arrow locations × handpath</h2>
    <p class="note">Cardinal shifts (N/E/S/W → neighbor).</p>
    <div class="grid">
      {#each diamondPictographs as { c, data } (c.id)}
        <div class="cell" class:highlight={c.id === "d-ccw-ne"}>
          <div class="label">
            {c.handpath.toUpperCase()} handpath · arrow {LOC_NAME[c.arrow]}
          </div>
          <div
            class="pictograph-container"
            use:previewRotation={displayAngle(c.handpath, c.arrow)}
          >
            <PictographContainer pictographData={data} />
          </div>
          <div class="info">
            <span class="red">RED float</span>
            {LOC_NAME[c.start]}→{LOC_NAME[c.end]}
          </div>
          {@render dial(c.handpath, c.arrow)}
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Box floats — all 4 cardinal arrow locations × handpath</h2>
    <p class="note">
      Intercardinal shifts (NE/SE/SW/NW → neighbor) in box mode.
    </p>
    <div class="grid">
      {#each boxPictographs as { c, data } (c.id)}
        <div class="cell">
          <div class="label">
            {c.handpath.toUpperCase()} handpath · arrow {LOC_NAME[c.arrow]}
          </div>
          <div
            class="pictograph-container"
            use:previewRotation={displayAngle(c.handpath, c.arrow)}
          >
            <PictographContainer pictographData={data} />
          </div>
          <div class="info">
            <span class="red">RED float</span>
            {LOC_NAME[c.start]}→{LOC_NAME[c.end]}
          </div>
          {@render dial(c.handpath, c.arrow)}
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .page {
    padding: 32px 24px 96px;
    max-width: 1240px;
    margin: 0 auto;
    color: var(--theme-text-primary, #e8e8ec);
  }
  header {
    margin-bottom: 32px;
  }
  h1 {
    font-size: 2rem;
    font-weight: 800;
    margin: 0 0 8px;
  }
  header p {
    max-width: 74ch;
    line-height: 1.5;
    opacity: 0.85;
  }
  code {
    background: rgba(255, 255, 255, 0.1);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 0.85em;
  }
  .savebar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 16px;
    margin: 0 0 8px;
    border-radius: 12px;
    background: rgba(20, 20, 26, 0.92);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .savebar.has-changes {
    border-color: #f2c14e;
    box-shadow: 0 0 0 1px #f2c14e inset;
  }
  .savebar-status .msg {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .savebar-status .msg.idle {
    opacity: 0.55;
    font-weight: 600;
  }
  .savebar-actions {
    display: flex;
    gap: 10px;
  }
  .btn {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 10px;
    font-weight: 800;
    font-size: 0.95rem;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: inherit;
    background: rgba(255, 255, 255, 0.07);
    transition:
      background 0.12s ease,
      opacity 0.12s ease;
  }
  .btn.primary {
    background: #f2c14e;
    color: #1a1400;
    border-color: #f2c14e;
  }
  .btn.primary:hover:not(:disabled) {
    background: #f6cf72;
  }
  .btn.ghost:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.14);
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  section {
    margin-top: 48px;
  }
  h2 {
    font-size: 1.35rem;
    font-weight: 700;
    margin: 0 0 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    padding-bottom: 8px;
  }
  .note {
    max-width: 78ch;
    line-height: 1.5;
    opacity: 0.8;
    margin: 0 0 20px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 24px;
  }
  .cell {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .cell.highlight {
    border-color: #f2c14e;
    box-shadow: 0 0 0 1px #f2c14e inset;
  }
  .label {
    font-weight: 700;
    font-size: 0.9rem;
    letter-spacing: 0.01em;
  }
  .pictograph-container {
    width: 280px;
    height: 280px;
    margin: 0 auto;
    background: rgba(0, 0, 0, 0.35);
    border-radius: 8px;
    overflow: hidden;
  }
  .info {
    font-size: 0.85rem;
    line-height: 1.5;
    opacity: 0.9;
  }
  .dial {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  .step {
    min-width: 64px;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.07);
    color: inherit;
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
    transition:
      background 0.12s ease,
      border-color 0.12s ease;
  }
  .step:hover:not(:disabled) {
    background: rgba(242, 193, 78, 0.18);
    border-color: #f2c14e;
  }
  .step:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .angle {
    min-width: 5ch;
    text-align: center;
    font-weight: 800;
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
  }
  .angle.dirty {
    color: #f2c14e;
  }
  .cell-key {
    text-align: center;
    font-size: 0.75rem;
    opacity: 0.6;
  }
  .cell-key .was {
    margin-left: 6px;
    color: #f2c14e;
    opacity: 0.85;
  }
  .red {
    color: #ff5c6a;
    font-weight: 700;
  }
  .blue {
    color: #4c8dff;
    font-weight: 700;
  }
</style>
