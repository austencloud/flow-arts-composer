<!--
  PresenterHost — mounts the ghost mind over the whole app.

  Presentation mode only (`?present=1`). It owns four things and nothing else:
  the ghost's coordinate space, the takeover listener, the route watchdog, and
  the two visible pieces (the pointer and its thought).

  Everything about WHAT the ghost does lives in the intention bag; everything
  about HOW it moves lives in the attract-ghost core. This file deliberately
  knows neither.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import GhostPointer from "./GhostPointer.svelte";
  import GhostMindOverlay from "./GhostMindOverlay.svelte";
  import ThoughtCaption from "./ThoughtCaption.svelte";
  import { createAttractGhost } from "../services/attract-ghost.svelte";
  import { createRng } from "../services/rng";
  import { presentationState } from "../state/presentation-state.svelte";
  import { createSensors, readRoute } from "../services/sensors";
  import { createGhostMind } from "../services/mind.svelte";
  import { ALL_INTENTIONS } from "../intentions";
  import { setEscapeHatch } from "../intentions/explore";
  import { scoreAll } from "../domain/scoring";
  import { isDeniedModule, isDeniedPath } from "../domain/annotations";

  let { seed }: { seed?: number } = $props();

  function initialDebugVisibility(): boolean {
    if (typeof window === "undefined") return false;
    const value = new URLSearchParams(window.location.search).get("ghostDebug");
    if (value === "0" || value === "false") return false;
    return import.meta.env.DEV || value === "1" || value === "true";
  }

  let showMindOverlay = $state(initialDebugVisibility());

  /**
   * How long the visitor keeps the wheel after touching anything. The composer
   * attract acts park forever on takeover, which is right for a marketing
   * section — a visitor who took over that demo is finished with it. A kiosk is
   * the opposite: takeover is a moment, not a state. Left un-resumed, one
   * curious tap (or a palm on the trackpad) ends a four-hour unattended run and
   * Austen comes back to a static screen with a dot in the corner.
   */
  const RESUME_AFTER_IDLE_MS = 30_000;
  /**
   * Idle-resume exists for an UNATTENDED laptop. In dev Austen is sitting right
   * there, and a ghost that grabs the wheel back 30s after he touched something
   * is the same annoyance in a different costume — he asked for the opposite:
   * once he interacts it stays off until he presses play. So in dev the only way
   * back is an explicit resume (the parked dot, or the F9 admin button).
   * `window.__ghost.autoResume(true)` re-enables it for testing the kiosk path.
   */
  let autoResume = !import.meta.env.DEV;
  /**
   * A tour that has not made a decision in this long is wedged on something no
   * intention models — a modal nothing can dismiss, a route with no annotated
   * control, a view that never finished mounting. Going home is always
   * recoverable; standing there is not.
   */
  const STALL_MS = 240_000;

  // The ghost's coordinate space is the document body — that is also the query
  // root, so `waitFor` sees the whole app rather than one section's band. The
  // overlay is fixed, so a body that is offset from the viewport (a banner, a
  // scrolled document) would shear the two apart; measure once and correct.
  let originX = $state(0);
  let originY = $state(0);

  // One stream feeds both halves of a decision — which intention, and which
  // card that intention presses — so a replayed seed reproduces the actual
  // tour, not just the list of intention ids.
  const rng = createRng(seed);
  const { core, run } = createAttractGhost({
    getRoot: () => document.body,
    choose: rng.next,
  });
  const { sense } = createSensors();
  const mind = createGhostMind({
    intentions: ALL_INTENTIONS,
    ghost: core,
    sense,
    rng,
    // Stage mode slows the whole tour: a caption read across a room has to be
    // FOUND before it can be read, and a laptop's tempo blurs past at that
    // distance. Read once at mount — the flag is set at setup and latched, so
    // it cannot change under a running tour.
    pace: presentationState.stage ? 1.6 : 1,
    observe: () => showMindOverlay,
  });
  const act = run(mind.tick);
  const ghost = act.ghost;

  /**
   * Safety layer 2. The allowlist means the ghost should never be able to walk
   * into /admin or checkout, but a denied route reached by any means at all is
   * a demo showing a stranger the admin panel — so this is a hard backstop, not
   * a nicety. It is the one place the presenter navigates programmatically,
   * because a safety retreat is not choreography.
   */
  /**
   * A real module switch, the same one pressing the nav performs. NEVER goto()
   * or history.back(): those move the URL while the module system carries on
   * believing it is elsewhere, and the shell then renders an empty screen
   * until a human clicks a module. The presenter must not be able to leave the
   * app in a state a visitor has to rescue it from.
   */
  async function goHome(): Promise<void> {
    await handleModuleChange("create");
  }

  /**
   * Every route back to work goes through here so the persisted activity and the
   * running loop can never disagree — the bug that would look like "I pressed
   * play and it went dead again after the next reload".
   */
  function resumeTour(): void {
    presentationState.markRunning();
    act.resume();
  }

  function guardRoute(): void {
    const pathname = window.location.pathname;
    const { moduleId } = readRoute(pathname);
    if (isDeniedPath(pathname) || isDeniedModule(moduleId)) {
      void goHome();
    }
  }

  onMount(() => {
    console.info(
      `[ghost] presentation mode — seed ${mind.seed}. Replay with ?present=${mind.seed}`
    );

    // The trail answers the only question worth asking when the ghost stalls
    // in front of strangers — which precondition lied. Reachable from the
    // console at a jam, not just in a test.
    (window as unknown as { __ghost?: unknown }).__ghost = {
      seed: mind.seed,
      trail: () => mind.trail.entries(),
      failures: () => mind.trail.failures(),
      memory: mind.memory,
      /** What the ghost is weighing right now, best first. */
      scores: () =>
        scoreAll(ALL_INTENTIONS, { ...sense(), ...mind.memory }).map(
          (s) => `${s.intention.id} ${s.score.toFixed(3)}`
        ),
      world: () => sense(),
      status: () => mind.status,
      /** Toggle the developer HUD without restarting the seeded session. */
      debug: (on = true) => {
        showMindOverlay = on;
        return showMindOverlay;
      },
      /** Force idle-resume on/off — it is off in dev by default. */
      autoResume: (on = true) => {
        autoResume = on;
        return autoResume;
      },
      pause: () => {
        act.pause();
        presentationState.markPaused();
      },
      resume: () => resumeTour(),
      stop: () => act.kill(),
    };

    setEscapeHatch(goHome);

    const measure = () => {
      const r = document.body.getBoundingClientRect();
      originX = r.left;
      originY = r.top;
    };
    measure();

    // Takeover: a REAL pointer event means a visitor has the wheel. The core's
    // press never dispatches pointer events, so this can only ever be a human.
    // Seeded from the persisted pause so a reload does not reset the clock: a
    // takeover 2 seconds before an HMR update is still a takeover 2 seconds ago.
    let lastHumanInputAt =
      presentationState.activity === "paused"
        ? performance.now() - Math.min(presentationState.pausedForMs, 1e9)
        : 0;
    const onRealPointer = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      // Operating the ghost's own card (drag, minimize, resume) is the
      // OPERATOR's hand, not a visitor takeover — it must not pause the tour.
      if ((event.target as HTMLElement).closest?.(".mind-overlay")) return;
      lastHumanInputAt = performance.now();
      act.pause();
      presentationState.markPaused();
    };
    const onKey = (event: KeyboardEvent) => {
      // isTrusted FIRST: kill() is the one irreversible transition in the
      // lifecycle, and an untrusted synthetic Escape — any dialog library, any
      // shortcut layer dispatching one — must not be able to end the demo.
      if (!event.isTrusted) return;
      lastHumanInputAt = performance.now();
      // Escape is the deliberate off switch: a human standing at the laptop who
      // wants the app back for good. Everything else is a takeover.
      if (event.key === "Escape") {
        act.kill();
        // Escape is "I want the app back for good", so it must not come back on
        // the next hot reload either.
        presentationState.deactivate();
      } else {
        act.pause();
        presentationState.markPaused();
      }
    };

    /**
     * The idle-resume and stall watchdog. Both exist for the same reason: the
     * presenter is unattended for hours and nobody is coming to nudge it.
     */
    // The stall clock must not count time the visitor was driving, or the first
    // watchdog tick after a long takeover would immediately "rescue" a ghost
    // that has simply not had a turn yet.
    let runningSince = performance.now();
    function watchdog(): void {
      if (act.dead) return;
      const idleFor = performance.now() - lastHumanInputAt;
      if (act.paused) {
        if (autoResume && idleFor > RESUME_AFTER_IDLE_MS) {
          runningSince = performance.now();
          resumeTour();
        }
        return;
      }
      // Only meaningful while running: a paused ghost is stalled on purpose.
      const lastProgress = Math.max(mind.trail.lastAt(), runningSince);
      if (performance.now() - lastProgress > STALL_MS) {
        runningSince = performance.now();
        console.warn(
          `[ghost] no decision in ${Math.round(STALL_MS / 1000)}s — going home. Last trail:`,
          mind.trail.entries().slice(-3)
        );
        void goHome();
      }
    }

    window.addEventListener("pointerdown", onRealPointer, { capture: true });
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("resize", measure);
    const guard = setInterval(guardRoute, 1000);
    const watch = setInterval(watchdog, 5000);

    act.setVisible(true);
    act.start();

    // The reload half of Austen's ask: if the visitor had the wheel when the
    // page went away, they still have it. The loop starts, parks on its first
    // iteration, and waits as the "watch the demo again" dot — so an HMR update
    // mid-keystroke no longer hands the app back to the ghost.
    if (presentationState.activity === "paused") act.pause();

    return () => {
      setEscapeHatch(null);
      clearInterval(guard);
      clearInterval(watch);
      window.removeEventListener("pointerdown", onRealPointer, {
        capture: true,
      });
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("resize", measure);
      act.kill();
    };
  });
</script>

<div
  class="presenter-overlay"
  class:docked={ghost.parked && showMindOverlay}
  style={`transform: translate(${originX}px, ${originY}px)`}
>
  <GhostPointer
    x={ghost.x}
    y={ghost.y}
    pressed={ghost.pressed}
    visible={ghost.visible}
    parked={ghost.parked}
    mood={mind.mood}
    speed={ghost.speed}
    heading={ghost.heading}
    dimmed={ghost.dimmed}
    considering={ghost.considering}
    stage={presentationState.stage}
    onResume={resumeTour}
  />
</div>

{#if !ghost.parked}
  <ThoughtCaption
    thought={mind.thought}
    x={ghost.x + originX}
    y={ghost.y + originY}
    stage={presentationState.stage}
  />
{/if}

{#if showMindOverlay}
  <GhostMindOverlay
    status={mind.status}
    thought={mind.thought}
    mood={mind.mood}
    seed={mind.seed}
    stage={presentationState.stage}
    parked={ghost.parked}
    onResume={resumeTour}
    onClose={() => (showMindOverlay = false)}
  />
{/if}

<style>
  /* Fixed and inert: the ghost must never occlude the elementFromPoint probe
     that gates every press, and must never eat a visitor's click. The parked
     resume button re-enables pointer events on itself only. */
  .presenter-overlay {
    position: fixed;
    inset: 0;
    /* Above EVERYTHING, including drawers, sheets and the fullscreen sequence
       viewer. The ghost demonstrates those surfaces, so a z-index that lets
       one of them cover it makes the presenter invisible exactly when it is
       doing its most interesting work. Safe to sit on top: the layer is
       inert, so it never occludes the elementFromPoint probe that gates every
       press, and never eats a visitor's click. */
    z-index: 2147483000;
    pointer-events: none;
  }

  /* Parked WITH the card visible: the ghost docks into the card (its Play
     button is the resume control), so the loose parked dot — which sat
     behind the panel where it could not even be clicked — disappears. The
     dot-only park remains for kiosk runs with the card closed. */
  .presenter-overlay.docked {
    visibility: hidden;
  }
</style>
