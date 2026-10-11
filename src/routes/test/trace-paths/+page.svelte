<!--
src/routes/test/trace-paths/+page.svelte
Open at: https://localhost:5173/test/trace-paths

Trace Paths — Phase 0 device-truth harness.

WHY THIS EXISTS
---------------
Everything the trace game grades depends on what a real device actually reports:
how many coalesced points arrive per frame, whether pointer capture survives a
gesture, whether a notification fires pointercancel or just lostpointercapture,
and whether a second finger on a second grid is delivered at all. None of that
is knowable from a desktop mouse, and none of it is knowable from reading the
spec. This page is where we find out on the hardware, BEFORE anyone trusts the
game chrome wrapped around it.

It is unstyled and internal on purpose. It is a probe, not a screen.

WHAT IT RENDERS
---------------
The REAL TraceStage (which in turn renders the real TraceRouteLayer), driven by
the REAL createTracePathsState factory. No mock stage, no fake route, no
reimplemented geometry — a harness that reproduces the components under test
tells you about the reproduction, not the device.

HOW IT OBSERVES WITHOUT INTERFERING
-----------------------------------
TraceStage is the only file in the feature that touches pointer events, and this
page does NOT modify it. Instead the wrapper below listens in the CAPTURE phase,
which fires before the stage's own bubble-phase handlers, so every reading here
is taken from the same event the stage is about to grade and nothing is
swallowed, cancelled, or reordered. Capture ownership is read from
gotpointercapture / lostpointercapture, which bubble — so the "capture held"
column is the browser's answer, not our guess about it.

Hand assignment shown here is read from the panel the pointer landed on (the
stage labels each grid "Left trace surface" / "Right trace surface"). That is the
same place-based source the stage itself uses. It is never inferred from pointer
order and never from isPrimary.

NOTHING LEAVES THIS PAGE
------------------------
No fetch, no localStorage, no analytics, no export button. Every reading lives
in memory for the life of the tab and is gone on reload. Raw pointer traces are
diagnostic here and are not persisted or transmitted, same as in the game.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { createHandPath } from "#lib/shared/foundation/services/hand-path-factory.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";

  import TraceStage from "#lib/features/learn/play/games/trace-paths/components/TraceStage.svelte";
  import {
    createTracePathsState,
    setTracePathsContext,
    handName,
    locationName,
    segmentEndPoint,
  } from "#lib/features/learn/play/games/trace-paths/state/trace-paths-state.svelte.js";
  import {
    handPathToTraceRound,
    pairHandPathsToTraceRound,
  } from "#lib/features/learn/play/games/trace-paths/services/hand-path-to-trace.js";
  import {
    normalizeStagePoint,
    polylineLength,
    type StageRect,
  } from "#lib/features/learn/play/games/trace-paths/services/trace-path-sampler.js";
  import { projectOntoPolyline } from "#lib/features/learn/play/games/trace-paths/services/trace-evaluator.js";
  import { sharedGridPreflight } from "#lib/features/learn/play/games/trace-paths/services/shared-grid-preflight.js";
  import type {
    NormalizedPoint,
    TraceHand,
    TraceSegment,
  } from "#lib/features/learn/play/games/trace-paths/domain/trace-types.js";
  import { TRACE_HANDS } from "#lib/features/learn/play/games/trace-paths/domain/trace-types.js";

  // The state under test

  const trace = createTracePathsState();
  setTracePathsContext(trace);

  // Fixture routes
  //
  // Fixed, not random. Two people comparing an iPhone against an Android need
  // to be tracing the same shape, and a bug that only shows up on one route has
  // to be reproducible on demand. Each is 5 locations = 4 beats.

  const N = GridLocation.NORTH;
  const E = GridLocation.EAST;
  const S = GridLocation.SOUTH;
  const W = GridLocation.WEST;

  type FixtureId = "one-hand" | "two-hand" | "hold" | "contended";

  const FIXTURES: { value: FixtureId; label: string }[] = [
    { value: "one-hand", label: "One hand" },
    { value: "two-hand", label: "Two hands" },
    { value: "hold", label: "Hold + move" },
    { value: "contended", label: "Same path" },
  ];

  let fixture = $state<FixtureId>("two-hand");

  const fixtureInstruction = $derived.by(() => {
    switch (fixture) {
      case "one-hand":
        return "Start on the solid left-hand marker. Follow the rail into the dashed target.";
      case "two-hand":
        return "Place one finger on each solid marker, then trace both rails together.";
      case "hold":
        return "Keep the right hand anchored while the left follows its route.";
      case "contended":
        return "Both hands share one route. The spacing check should reject this pattern.";
    }
  });

  const visibleBeat = $derived(
    Math.min(trace.beatIndex + 1, Math.max(trace.totalBeats, 1))
  );

  /**
   * "Contended" is the deliberate failure case: both hands walk the identical
   * route, so at every beat two fingertips are asked to occupy one point. It
   * exists so the preflight button has something real to reject — a preflight
   * that has only ever returned `passes: true` has not been tested.
   */
  function loadFixture(id: FixtureId): void {
    fixture = id;
    resetObservations();

    switch (id) {
      case "one-hand":
        trace.loadRound(
          handPathToTraceRound(createHandPath([N, E, S, W, N]), HandSide.LEFT)
        );
        return;
      case "two-hand":
        trace.loadRound(
          pairHandPathsToTraceRound(
            createHandPath([N, E, S, W, N]),
            createHandPath([S, W, N, E, S])
          )
        );
        return;
      case "hold":
        // Left oscillates north/east; right anchors west, a point left never
        // visits, so the two corridors never contend.
        trace.loadRound(
          pairHandPathsToTraceRound(
            createHandPath([N, E, N, E, N]),
            createHandPath([W, W, W, W, W])
          )
        );
        return;
      case "contended":
        trace.loadRound(
          pairHandPathsToTraceRound(
            createHandPath([N, E, S, W, N]),
            createHandPath([N, E, S, W, N])
          )
        );
        return;
    }
  }

  // The first load is deliberately NOT called here — loadFixture clears the
  // observation buffers, and those are declared below. Calling it at this point
  // would read them inside their temporal dead zone and throw on mount. It runs
  // at the end of this block instead.

  // Live pointer observations

  interface PointerRow {
    pointerId: number;
    pointerType: string;
    /** Read from the panel the pointer landed on — the stage's own source. */
    hand: TraceHand | null;
    captureHeld: boolean;
    moves: number;
    /** getCoalescedEvents().length on the most recent move. */
    lastCoalesced: number;
    maxCoalesced: number;
    /** Total raw points the browser reported, vs. moves fired. */
    totalPoints: number;
    at: NormalizedPoint | null;
    /** Normalized distance from the hand's current expected path. */
    distance: number | null;
    /** 0..1 along that path, or null on a hold segment. */
    progress: number | null;
  }

  // Non-reactive working set. Written at pointer rate (which on a 120Hz phone is
  // far above frame rate) and flushed to the reactive snapshot once per frame —
  // the same discipline TraceStage uses, for the same reason.
  const live = new Map<number, PointerRow>();
  let rows = $state<PointerRow[]>([]);
  let flushHandle: number | null = null;

  function scheduleFlush(): void {
    if (flushHandle !== null) return;
    flushHandle = requestAnimationFrame(() => {
      flushHandle = null;
      rows = [...live.values()];
    });
  }

  /** Prefix sums of a polyline's segment lengths — the shape projectOntoPolyline wants. */
  const cumulativeCache = new WeakMap<object, number[]>();
  function cumulativeFor(path: readonly NormalizedPoint[]): number[] {
    const cached = cumulativeCache.get(path as unknown as object);
    if (cached) return cached;
    const out: number[] = [0];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      out.push(out[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
    }
    cumulativeCache.set(path as unknown as object, out);
    return out;
  }

  /**
   * How far off route this point is, right now, in normalized stage units.
   * Uses the evaluator's OWN projection function — the harness must not carry a
   * second opinion about distance, or a disagreement between them would look
   * like a device bug.
   */
  function measure(
    segment: TraceSegment | undefined,
    point: NormalizedPoint
  ): { distance: number | null; progress: number | null } {
    if (!segment) return { distance: null, progress: null };
    if (segment.kind === "hold") {
      const at = segmentEndPoint(segment);
      return {
        distance: Math.hypot(point.x - at.x, point.y - at.y),
        progress: null,
      };
    }
    const path = segment.expectedPath;
    const projection = projectOntoPolyline(
      point,
      path,
      cumulativeFor(path),
      polylineLength(path)
    );
    return { distance: projection.distance, progress: projection.progress };
  }

  // Event log

  interface LogEntry {
    id: number;
    /** ms since page load — the axis that matters for "what happened first". */
    at: number;
    clock: string;
    kind: string;
    detail: string;
  }

  const LOG_CAP = 250;
  let log = $state<LogEntry[]>([]);
  let logSeq = 0;

  // Declared here, above resetObservations, because loadFixture runs during
  // component init — a `let` referenced before its declaration is a TDZ crash,
  // not a warning.
  let preflight = $state<{
    passes: boolean;
    worstSeparation: number;
    reason?: string;
  } | null>(null);

  function note(kind: string, detail: string): void {
    logSeq += 1;
    const entry: LogEntry = {
      id: logSeq,
      at: performance.now(),
      clock: new Date().toLocaleTimeString(undefined, { hour12: false }),
      kind,
      detail,
    };
    // Newest first: on a phone the top of the list is the only part on screen
    // when you look up from tracing.
    log = [entry, ...log].slice(0, LOG_CAP);
  }

  function resetObservations(): void {
    live.clear();
    rows = [];
    log = [];
    preflight = null;
  }

  // Capture-phase observation

  let probe = $state<HTMLDivElement | undefined>(undefined);

  /** The panel element a pointer landed on, and which hand it represents. */
  function handFor(target: EventTarget | null): {
    element: HTMLElement | null;
    hand: TraceHand | null;
  } {
    const element =
      target instanceof Element
        ? (target.closest('[role="application"]') as HTMLElement | null)
        : null;
    if (!element) return { element: null, hand: null };
    const label = element.getAttribute("aria-label") ?? "";
    for (const hand of TRACE_HANDS) {
      if (label.startsWith(handName(hand))) return { element, hand };
    }
    return { element, hand: null };
  }

  function rectOf(element: HTMLElement): StageRect {
    const box = element.getBoundingClientRect();
    return {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    };
  }

  function onDown(event: PointerEvent): void {
    const { hand } = handFor(event.target);
    live.set(event.pointerId, {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      hand,
      captureHeld: false,
      moves: 0,
      lastCoalesced: 0,
      maxCoalesced: 0,
      totalPoints: 0,
      at: null,
      distance: null,
      progress: null,
    });
    note(
      "pointerdown",
      `#${event.pointerId} ${event.pointerType} → ${hand ? handName(hand) : "no panel"}` +
        (event.isPrimary ? " (primary)" : " (non-primary)")
    );
    scheduleFlush();
  }

  function onMove(event: PointerEvent): void {
    const row = live.get(event.pointerId);
    if (!row) return;

    // The number this whole harness exists to surface. A device that coalesces
    // will report several points per move; one that does not reports zero and
    // the stage falls back to the parent event. Both are valid — but grading
    // tolerances were chosen assuming the first, so we need to know which one
    // we are standing on.
    const coalesced =
      typeof event.getCoalescedEvents === "function"
        ? event.getCoalescedEvents().length
        : 0;

    row.moves += 1;
    row.lastCoalesced = coalesced;
    row.maxCoalesced = Math.max(row.maxCoalesced, coalesced);
    row.totalPoints += Math.max(coalesced, 1);

    // event.target, never currentTarget: currentTarget is the wrapper this
    // listener is bound to, which sits OUTSIDE the panels. Once capture is held
    // the target is the capturing surface, which is exactly the panel we want.
    const { element, hand } = handFor(event.target);
    if (element && hand) {
      const point = normalizeStagePoint(
        event.clientX,
        event.clientY,
        rectOf(element)
      );
      const measured = measure(trace.currentSegments[hand], point);
      row.at = point;
      row.distance = measured.distance;
      row.progress = measured.progress;
    }

    scheduleFlush();
  }

  function onUp(event: PointerEvent): void {
    const row = live.get(event.pointerId);
    if (!row) return;
    note(
      "pointerup",
      `#${event.pointerId} after ${row.moves} moves / ${row.totalPoints} pts`
    );
    live.delete(event.pointerId);
    scheduleFlush();
  }

  /**
   * The two events that decide whether an interruption is handled correctly.
   * A device that fires pointercancel on a notification, a swipe-from-edge, or
   * a palm rejection must PAUSE the round, never fail it — so seeing them here,
   * with timestamps, is how we confirm the pause path is the one being taken.
   */
  function onCancel(event: PointerEvent): void {
    const row = live.get(event.pointerId);
    note(
      "pointercancel",
      `#${event.pointerId} ${event.pointerType}` +
        (row ? ` after ${row.moves} moves` : " (untracked)")
    );
    live.delete(event.pointerId);
    scheduleFlush();
  }

  function onGotCapture(event: PointerEvent): void {
    const row = live.get(event.pointerId);
    if (row) row.captureHeld = true;
    note("gotpointercapture", `#${event.pointerId}`);
    scheduleFlush();
  }

  function onLostCapture(event: PointerEvent): void {
    const row = live.get(event.pointerId);
    if (row) row.captureHeld = false;
    note(
      "lostpointercapture",
      `#${event.pointerId}` + (row ? "" : " (already released)")
    );
    scheduleFlush();
  }

  function onVisibility(): void {
    note("visibilitychange", document.visibilityState);
  }

  $effect(() => {
    const element = probe;
    if (!element) return;

    // Capture phase for the raw pointer stream: it runs before TraceStage's own
    // handlers, so nothing here can preempt, cancel, or reorder what the stage
    // sees. `passive: true` states outright that this listener never calls
    // preventDefault — the stage owns that decision.
    const raw = { capture: true, passive: true } as const;
    element.addEventListener("pointerdown", onDown, raw);
    element.addEventListener("pointermove", onMove, raw);
    element.addEventListener("pointerup", onUp, raw);
    element.addEventListener("pointercancel", onCancel, raw);

    // Capture events are read in the BUBBLE phase, because they only exist once
    // the stage has actually taken or released capture. Reading them in capture
    // phase would report the state one beat stale.
    element.addEventListener("gotpointercapture", onGotCapture);
    element.addEventListener("lostpointercapture", onLostCapture);

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      element.removeEventListener("pointerdown", onDown, raw);
      element.removeEventListener("pointermove", onMove, raw);
      element.removeEventListener("pointerup", onUp, raw);
      element.removeEventListener("pointercancel", onCancel, raw);
      element.removeEventListener("gotpointercapture", onGotCapture);
      element.removeEventListener("lostpointercapture", onLostCapture);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  });

  onDestroy(() => {
    if (flushHandle !== null) cancelAnimationFrame(flushHandle);
    trace.destroy();
  });

  // ---------------------------------------------------------------------
  // Preflight
  // ---------------------------------------------------------------------

  function runPreflight(): void {
    const round = trace.round;
    if (!round) {
      preflight = null;
      note("preflight", "no round loaded");
      return;
    }
    const result = sharedGridPreflight(round);
    preflight = result;
    note(
      "preflight",
      `${result.passes ? "PASS" : "FAIL"} worstSeparation=${result.worstSeparation.toFixed(4)}`
    );
  }

  // ---------------------------------------------------------------------
  // Derived readouts
  // ---------------------------------------------------------------------

  const beats = $derived(trace.round?.beats ?? []);
  const activeHands = $derived(trace.activeHands);

  // Hoisted so the discriminated-union narrowing survives into the template.
  // Narrowing a getter's result across template blocks is not something TS can
  // be relied on to keep.
  const finishedMetrics = $derived(
    trace.phase.name === "feedback" ? trace.phase.metrics : null
  );

  function fixed(value: number | null, places: number): string {
    return value === null ? "—" : value.toFixed(places);
  }

  /** Ordered beat state for one hand: what it is asked to do, and where we are. */
  // Everything loadFixture touches is declared by this point, so the opening
  // round can safely be built now.
  loadFixture("two-hand");

  function beatStateFor(hand: TraceHand) {
    return beats.map((beat) => {
      const segment = beat.segments[hand];
      const label = !segment
        ? "—"
        : segment.kind === "hold"
          ? `hold ${locationName(segment.location)}`
          : `${locationName(segment.start)}→${locationName(segment.end)}`;
      const status =
        beat.index < trace.beatIndex
          ? "done"
          : beat.index === trace.beatIndex
            ? "current"
            : "pending";
      return { index: beat.index, label, status };
    });
  }
</script>

<svelte:head>
  <title>Trace Paths touch test</title>
</svelte:head>

<div class="harness">
  <main class="page">
    <section class="game-card" aria-labelledby="trace-title">
      <header class="hero">
        <div class="heading">
          <p class="eyebrow">
            <span class="status-dot" aria-hidden="true"></span>
            Touch test
            <span class="privacy">Local only</span>
          </p>
          <h1 id="trace-title">Trace Paths</h1>
          <p class="instruction">
            <span class="instruction-sizer" aria-hidden="true">
              Both hands share one route. The spacing check should reject this
              pattern.
            </span>
            <span>{fixtureInstruction}</span>
          </p>
        </div>

        <div class="round-progress" aria-live="polite">
          <span class="round-label">Round progress</span>
          <span class="round-value">
            Beat <span class="num">{visibleBeat}</span>
            <span aria-hidden="true">/</span>
            <span class="num">{trace.totalBeats}</span>
          </span>
        </div>
      </header>

      <div class="fixture-bar">
        <span class="fixture-label">Pattern</span>
        <div class="fixture-control">
          <SegmentedControl
            options={FIXTURES}
            value={fixture}
            onchange={loadFixture}
            color="accent"
          />
        </div>
      </div>

      <!-- This remains the sole observation boundary. The real game stage owns
           every pointer event and the harness only listens during capture. -->
      <div class="probe" bind:this={probe}>
        <TraceStage
          showRoute={true}
          exitLabel="Restart"
          onExit={() => loadFixture(fixture)}
        />
      </div>
    </section>

    <details class="diagnostics">
      <summary>
        <span class="summary-icon" aria-hidden="true">
          <i class="fas fa-wave-square"></i>
        </span>
        <span class="summary-copy">
          <strong>Device diagnostics</strong>
          <small>Pointer capture and round telemetry</small>
        </span>
        <span class="summary-chevron" aria-hidden="true">
          <i class="fas fa-chevron-down"></i>
        </span>
      </summary>

      <div class="diagnostic-body">
        <div class="diagnostic-toolbar">
          <p>Readings stay in memory and disappear when this page reloads.</p>
          <div class="diagnostic-actions">
            <PanelButton variant="primary" fullWidth onclick={runPreflight}>
              Check route spacing
            </PanelButton>
            <PanelButton fullWidth onclick={() => loadFixture(fixture)}>
              Reload round
            </PanelButton>
            <PanelButton
              fullWidth
              disabled={log.length === 0}
              onclick={() => (log = [])}
            >
              Clear log
            </PanelButton>
          </div>
        </div>

        <!-- Reserved space keeps the toolbar still when the result arrives. -->
        <p class="verdict" class:shown={preflight !== null} aria-live="polite">
          {#if preflight}
            <span
              class="tag"
              class:pass={preflight.passes}
              class:fail={!preflight.passes}
            >
              {preflight.passes ? "PASS" : "FAIL"}
            </span>
            Closest route gap
            <span class="num">{preflight.worstSeparation.toFixed(4)}</span>
            {preflight.reason ?? ""}
          {:else}
            &nbsp;
          {/if}
        </p>

        <section class="panel">
          <h2>Live pointers</h2>
          <p class="hint">
            Hand assignment comes from the surface touched. Capture state comes
            from the browser's own got and lost capture events.
          </p>
          <div class="scroll pointer-scroll themed-scrollbar">
            {#if rows.length === 0}
              <p class="empty">Touch a route to see pointer data.</p>
            {:else}
              <table>
                <thead>
                  <tr>
                    <th>id</th>
                    <th>type</th>
                    <th>hand</th>
                    <th>capture</th>
                    <th>moves</th>
                    <th>coal.</th>
                    <th>max</th>
                    <th>pts</th>
                    <th>dist</th>
                    <th>prog</th>
                  </tr>
                </thead>
                <tbody>
                  {#each rows as row (row.pointerId)}
                    <tr>
                      <td class="num">{row.pointerId}</td>
                      <td>{row.pointerType}</td>
                      <td>{row.hand ? handName(row.hand) : "—"}</td>
                      <td>{row.captureHeld ? "held" : "no"}</td>
                      <td class="num">{row.moves}</td>
                      <td class="num">{row.lastCoalesced}</td>
                      <td class="num">{row.maxCoalesced}</td>
                      <td class="num">{row.totalPoints}</td>
                      <td class="num">{fixed(row.distance, 4)}</td>
                      <td class="num">{fixed(row.progress, 3)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>
        </section>

        <section class="panel">
          <h2>Round state</h2>
          <p class="hint">
            Phase <strong>{trace.phase.name}</strong> · beat
            <span class="num">{trace.beatIndex + 1}</span> /
            <span class="num">{trace.totalBeats}</span>
            {#if finishedMetrics}
              · checkpoints
              <span class="num">{finishedMetrics.checkpointsHit}</span> /
              <span class="num">{finishedMetrics.checkpointsTotal}</span>
            {/if}
          </p>
          <div class="hands">
            {#each activeHands as hand (hand)}
              <div class="hand">
                <h3>
                  {handName(hand)}
                  <span class="badge" class:active={trace.armed[hand]}>
                    {trace.armed[hand] ? "armed" : "not armed"}
                  </span>
                  <span class="badge" class:active={trace.satisfied[hand]}>
                    {trace.satisfied[hand] ? "satisfied" : "open"}
                  </span>
                </h3>
                <ol class="beats">
                  {#each beatStateFor(hand) as beat (beat.index)}
                    <li
                      class:done={beat.status === "done"}
                      class:current={beat.status === "current"}
                    >
                      <span class="num">{beat.index + 1}</span>
                      {beat.label}
                      <span class="status">{beat.status}</span>
                    </li>
                  {/each}
                </ol>
              </div>
            {/each}
          </div>
        </section>

        <section class="panel">
          <h2>Event log</h2>
          <p class="hint">
            Newest first. Browser interruptions park the round instead of
            scoring a miss.
          </p>
          <div class="scroll event-scroll themed-scrollbar" role="log">
            {#if log.length === 0}
              <p class="empty">No events yet.</p>
            {:else}
              <table>
                <thead>
                  <tr>
                    <th>t+ms</th>
                    <th>clock</th>
                    <th>event</th>
                    <th>detail</th>
                  </tr>
                </thead>
                <tbody>
                  {#each log as entry (entry.id)}
                    <tr>
                      <td class="num">{entry.at.toFixed(1)}</td>
                      <td class="num">{entry.clock}</td>
                      <td>{entry.kind}</td>
                      <td>{entry.detail}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>
        </section>
      </div>
    </details>
  </main>
</div>

<style>
  .harness {
    container-type: inline-size;
    min-height: 100svh;
    box-sizing: border-box;
    padding-top: max(0.5rem, env(safe-area-inset-top, 0px));
    padding-right: max(0.5rem, env(safe-area-inset-right, 0px));
    padding-bottom: max(1rem, env(safe-area-inset-bottom, 0px));
    padding-left: max(0.5rem, env(safe-area-inset-left, 0px));
    background:
      radial-gradient(
        circle at 8% 0%,
        color-mix(in srgb, var(--prop-blue, #3575e2) 14%, transparent),
        transparent 34rem
      ),
      radial-gradient(
        circle at 92% 0%,
        color-mix(in srgb, var(--prop-red, #ed1c24) 10%, transparent),
        transparent 32rem
      ),
      var(--theme-panel-bg, #101117);
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm);
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: min(100%, 72rem);
    margin: 0 auto;
  }

  .game-card,
  .diagnostics {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-panel-bg, #14151d);
    box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.24);
  }

  .game-card {
    position: relative;
    overflow: hidden;
    border-radius: 1rem;
  }

  .game-card::before {
    content: "";
    position: absolute;
    z-index: 2;
    inset: 0 0 auto;
    height: 3px;
    background: linear-gradient(
      90deg,
      var(--prop-blue, #3575e2),
      var(--theme-accent, #818cf8) 50%,
      var(--prop-red, #ed1c24)
    );
  }

  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 1rem;
    padding: 1rem;
    background:
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--prop-blue, #3575e2) 9%, transparent),
        transparent 46%
      ),
      linear-gradient(
        225deg,
        color-mix(in srgb, var(--prop-red, #ed1c24) 7%, transparent),
        transparent 42%
      );
  }

  .heading {
    min-width: 0;
  }

  .eyebrow {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0 0 0.35rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .status-dot {
    width: 0.5rem;
    height: 0.5rem;
    flex: none;
    border-radius: 50%;
    background: var(--semantic-success, #22c55e);
    box-shadow: 0 0 0 0.25rem
      color-mix(in srgb, var(--semantic-success, #22c55e) 14%, transparent);
  }

  .privacy {
    margin-left: 0.25rem;
    padding: 0.2rem 0.45rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 999px;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact);
    letter-spacing: 0;
    text-transform: none;
  }

  .hero h1 {
    margin: 0;
    font-size: clamp(1.75rem, 8cqw, 2.75rem);
    line-height: 1;
    letter-spacing: -0.035em;
  }

  .instruction {
    display: grid;
    max-width: 42rem;
    margin: 0.6rem 0 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-sm);
    line-height: 1.45;
  }

  .instruction > span {
    grid-area: 1 / 1;
  }

  .instruction-sizer {
    visibility: hidden;
  }

  .round-progress {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
    min-width: 7.5rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.75rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .round-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact);
  }

  .round-value {
    font-size: var(--font-size-sm);
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }

  .fixture-bar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.035));
  }

  .fixture-label {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact);
    font-weight: 700;
  }

  .fixture-control {
    min-width: 0;
  }

  /* A stable small viewport keeps mobile browser chrome from resizing the
     drawing surface while a finger is down. The measured TraceStage still
     chooses stacked or side-by-side grids from the box it actually receives. */
  .probe {
    height: clamp(42rem, 78svh, 50rem);
    min-height: 0;
    background:
      radial-gradient(
        circle at 18% 12%,
        color-mix(in srgb, var(--prop-blue, #3575e2) 6%, transparent),
        transparent 35%
      ),
      radial-gradient(
        circle at 82% 12%,
        color-mix(in srgb, var(--prop-red, #ed1c24) 5%, transparent),
        transparent 35%
      );
  }

  .diagnostics {
    overflow: hidden;
    border-radius: 0.875rem;
  }

  .diagnostics summary {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    min-height: 3.5rem;
    padding: 0.65rem 0.8rem;
    box-sizing: border-box;
    cursor: pointer;
    list-style: none;
    touch-action: manipulation;
  }

  .diagnostics summary::-webkit-details-marker {
    display: none;
  }

  .diagnostics summary:focus-visible {
    outline: 2px solid var(--theme-accent, #818cf8);
    outline-offset: -3px;
  }

  @media (hover: hover) {
    .diagnostics summary:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.05));
    }
  }

  .summary-icon {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.65rem;
    background: color-mix(
      in srgb,
      var(--theme-accent, #818cf8) 18%,
      transparent
    );
    color: var(--theme-accent, #818cf8);
  }

  .summary-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .summary-copy strong {
    font-size: var(--font-size-sm);
  }

  .summary-copy small {
    overflow: hidden;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .summary-chevron {
    display: grid;
    place-items: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
  }

  .summary-chevron i {
    transition: transform var(--duration-normal) ease;
  }

  .diagnostics[open] .summary-chevron i {
    transform: rotate(180deg);
  }

  .diagnostic-body {
    display: grid;
    gap: 0.75rem;
    padding: 0 0.75rem 0.75rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .diagnostic-toolbar {
    display: grid;
    gap: 0.75rem;
    padding-top: 0.75rem;
  }

  .diagnostic-toolbar p {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-sm);
  }

  .diagnostic-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
    gap: 0.5rem;
  }

  /* Reserved height keeps the controls still when preflight reports back. */
  .verdict {
    margin: 0;
    min-height: 1.5rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-compact);
    visibility: hidden;
  }

  .verdict.shown {
    visibility: visible;
  }

  .tag {
    display: inline-block;
    margin-right: 0.25rem;
    padding: 0.15rem 0.4rem;
    border-radius: 0.35rem;
    color: var(--theme-text, #fff);
    font-weight: 800;
  }

  .tag.pass {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 28%,
      transparent
    );
  }

  .tag.fail {
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 30%,
      transparent
    );
  }

  .panel {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.75rem;
    padding: 0.75rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .panel h2 {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 750;
  }

  .hint {
    margin: 0.3rem 0 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-compact);
    line-height: 1.45;
  }

  .empty {
    margin: 0.5rem 0 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  /* Wide tables scroll inside their own box; the page body never scrolls sideways. */
  .scroll {
    margin-top: 0.5rem;
    max-height: 18rem;
    overflow: auto;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 0.5rem;
  }

  .pointer-scroll {
    height: 8rem;
  }

  .event-scroll {
    height: 12rem;
  }

  table {
    width: 100%;
    min-width: 36rem;
    border-collapse: collapse;
    font-size: var(--font-size-compact);
  }

  th,
  td {
    text-align: left;
    padding: 0.4rem 0.5rem;
    white-space: nowrap;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  th {
    position: sticky;
    top: 0;
    background: var(--theme-panel-bg, #14141c);
  }

  /* Every changing number is tabular, so a column never jitters as it counts. */
  .num {
    font-variant-numeric: tabular-nums;
  }

  .hands {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .hand {
    min-width: 0;
    padding: 0.65rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 0.6rem;
  }

  .hand h3 {
    margin: 0;
    font-size: var(--font-size-compact);
    font-weight: 700;
  }

  .badge {
    display: inline-block;
    min-width: 5.5rem;
    margin-left: 0.25rem;
    padding: 0 0.3125rem;
    border-radius: 0.25rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.16));
    box-sizing: border-box;
    font-weight: 500;
    text-align: center;
  }

  .badge.active {
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 45%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 12%,
      transparent
    );
  }

  .beats {
    margin: 0.25rem 0 0;
    padding-left: 1.25rem;
    font-size: var(--font-size-compact);
  }

  .beats li {
    padding: 0.0625rem 0;
  }

  .beats li.done {
    opacity: 0.55;
  }

  .beats li.current {
    font-weight: 700;
  }

  .status {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  @container (max-width: 32rem) {
    .hero {
      gap: 0.65rem;
      padding: 0.9rem;
    }

    .round-progress {
      min-width: 6.25rem;
      padding: 0.55rem 0.6rem;
    }

    .round-label {
      max-width: 5rem;
      text-align: right;
    }

    .fixture-bar {
      grid-template-columns: 1fr;
      gap: 0.4rem;
      padding: 0.65rem 0.75rem 0.75rem;
    }

    .fixture-label {
      padding-left: 0.15rem;
    }

    .diagnostic-body {
      padding-inline: 0.5rem;
    }
  }

  @container (min-width: 42rem) {
    .page {
      gap: 1rem;
    }

    .hero {
      padding: 1.25rem 1.4rem;
    }

    .fixture-bar {
      padding-inline: 1.4rem;
    }

    .probe {
      height: clamp(32rem, 68svh, 42rem);
    }

    .diagnostics summary {
      padding-inline: 1rem;
    }

    .diagnostic-body {
      padding: 0 1rem 1rem;
    }

    .diagnostic-toolbar {
      grid-template-columns: minmax(12rem, 1fr) minmax(24rem, 2fr);
      align-items: center;
    }
  }

  @container (min-width: 64rem) {
    .hero {
      padding: 1.4rem 1.75rem;
    }

    .fixture-bar {
      padding-inline: 1.75rem;
    }

    .probe {
      height: min(62svh, 40rem);
    }

    .scroll {
      max-height: 26rem;
    }
  }

  @media (pointer: coarse) {
    .diagnostics summary {
      min-height: 4rem;
    }
  }

  @media (orientation: landscape) and (max-height: 600px) {
    .probe {
      height: 28rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .summary-chevron i {
      transition: none;
    }
  }
</style>
