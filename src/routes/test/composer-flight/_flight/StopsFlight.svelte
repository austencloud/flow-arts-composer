<script lang="ts">
  /**
   * Stops: the real Composer sections as panels on a fixed stage. Scrolling,
   * the arrow keys, the rail or Next fly a camera from one panel to the next
   * through the star field, and a flight that has started always finishes at
   * a panel. A panel taller than the stage pans while the camera rests on it.
   * A small window or reduced motion gets the plain page instead.
   */
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { scroll } from "motion";
  import FlowFlight from "./FlowFlight.svelte";
  import FlightStars from "./FlightStars.svelte";
  import FlightControls from "./FlightControls.svelte";
  import {
    FLIGHT_PERSPECTIVE,
    STOP_SPACING,
    activeStop,
    cameraAt,
    laneOffset,
    planStops,
    settleOffset,
    stopPose,
  } from "./flight-camera";
  import { harness } from "./harness.svelte";
  import { headerHeight, pageSections, sectionTitle } from "./page-sections";

  let { children }: { children: Snippet } = $props();

  const roomy = new MediaQuery("(min-width: 1100px) and (min-height: 700px)");
  const calm = new MediaQuery("(prefers-reduced-motion: reduce)");
  const staged = $derived(roomy.current && !calm.current);

  /** Gap under the header, and the band kept free below a panel for Next. */
  const TOP_GAP = 16;
  const CONTROLS_BAND = 76;
  /** Scroll per flight, as a fraction of the viewport height. */
  const TRAVEL = 0.9;
  /** Scroll, in px, a stop absorbs before the camera leaves it: less than one
      wheel notch or arrow press, so either still flies on, and more than a
      sub-pixel landing, so arriving never starts the next flight. */
  const HOLD = 32;
  /** Quiet time that counts as the end of a scroll where scrollend is missing. */
  const SETTLE_FALLBACK_MS = 160;
  /** Parked far below the stage while out of the scene, so the page's own
      near-viewport loading waits until the camera approaches. */
  const PARKED = "translate3d(0, 400vh, 0)";
  const STAGED_PROPERTIES = [
    "visibility",
    "opacity",
    "transform",
    "z-index",
    "pointer-events",
  ];

  let track: HTMLDivElement | undefined = $state();
  let stops: string[] = $state([]);
  let active = $state(0);
  let depth = $state(0);
  let lift = $state(0);
  let trackHeight = $state(0);
  let flyTo: (index: number) => void = () => {};

  $effect(() => {
    harness.note = staged
      ? ""
      : "Stops needs a window at least 1100 by 700 with motion on, so this is the plain page.";
    return () => {
      harness.note = "";
    };
  });

  $effect(() => {
    if (!staged || !track) return;
    const found = pageSections(track);
    if (!found) return;
    const { page, sections } = found;
    const stage = track;
    stops = sections.map(sectionTitle);

    let plan = planStops({ heights: [], room: 1, travel: 1, hold: 0 });
    let heights: number[] = [];
    let trackTop = 0;
    let width = 0;
    let viewport = 0;
    let restTop = 0;
    let room = 0;
    let lastScroll = window.scrollY;
    let direction = 0;
    let settleTimer = 0;

    const render = () => {
      const camera = cameraAt(plan, window.scrollY - trackTop);
      active = activeStop(camera.position);
      depth = camera.position * STOP_SPACING;
      lift = camera.pans.reduce((sum, pan) => sum + pan, 0);
      sections.forEach((section, index) => {
        const style = section.style;
        const relative = index - camera.position;
        const pose = stopPose(relative);
        if (!pose.present) {
          style.visibility = "hidden";
          style.opacity = "0";
          style.transform = PARKED;
          style.pointerEvents = "none";
          return;
        }
        const lane = laneOffset(index, camera.position);
        // Whole device pixels, so a resting panel's text stays sharp.
        const rest =
          Math.round(
            (restTop +
              Math.max(0, (room - heights[index]) / 2) -
              camera.pans[index]) *
              devicePixelRatio
          ) / devicePixelRatio;
        style.visibility = "";
        style.opacity = pose.opacity.toFixed(3);
        style.transform = `translate3d(${(lane.x * width).toFixed(1)}px, ${(rest + lane.y * viewport).toFixed(2)}px, ${pose.z.toFixed(1)}px)`;
        style.zIndex = String(1000 - Math.round(relative * 100));
        style.pointerEvents = pose.docked ? "" : "none";
      });
    };

    const measure = () => {
      width = page.clientWidth;
      viewport = window.innerHeight;
      restTop = headerHeight(page) + TOP_GAP;
      room = viewport - restTop - CONTROLS_BAND;
      page.style.setProperty("--flight-room", `${room}px`);
      page.style.setProperty("--flight-focus-y", `${restTop + room / 2}px`);
      heights = sections.map((section) => section.offsetHeight);
      plan = planStops({
        heights,
        room,
        travel: Math.round(viewport * TRAVEL),
        hold: HOLD,
      });
      trackHeight = plan.length + viewport;
      trackTop = stage.getBoundingClientRect().top + window.scrollY;
      render();
    };

    const settle = () => {
      const offset = window.scrollY - trackTop;
      if (offset <= 0 || offset >= plan.length) return;
      const target = settleOffset(plan, offset, direction);
      if (target !== null) {
        window.scrollTo({ top: trackTop + target, behavior: "smooth" });
      }
    };

    const onScroll = () => {
      const now = window.scrollY;
      if (now !== lastScroll) direction = Math.sign(now - lastScroll);
      lastScroll = now;
      render();
      if (!("onscrollend" in window)) {
        clearTimeout(settleTimer);
        settleTimer = window.setTimeout(settle, SETTLE_FALLBACK_MS);
      }
    };

    flyTo = (index) => {
      window.scrollTo({
        top: trackTop + (plan.docks[index] ?? 0),
        behavior: "smooth",
      });
    };

    // Keyboard focus landing in a panel the camera is not resting on flies
    // there, so a focused control is never left small and out of reach.
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches(":focus-visible"))
        return;
      const index = sections.findIndex((section) => section.contains(target));
      if (index < 0) return;
      const { position } = cameraAt(plan, window.scrollY - trackTop);
      if (Math.abs(index - position) > 0.001) flyTo(index);
    };

    // In-page links fly to the panel that holds their target.
    const onClick = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>('a[href^="#"]')
          : null;
      if (!link) return;
      const destination = document.getElementById(
        decodeURIComponent(link.hash.slice(1))
      );
      const index = destination
        ? sections.findIndex((section) => section.contains(destination))
        : -1;
      if (index < 0) return;
      event.preventDefault();
      flyTo(index);
    };

    const stopScroll = scroll((_progress: number, _info: unknown) =>
      onScroll()
    );
    const observer = new ResizeObserver(() => measure());
    for (const section of sections) observer.observe(section);
    window.addEventListener("resize", measure);
    window.addEventListener("scrollend", settle);
    page.addEventListener("focusin", onFocusIn);
    page.addEventListener("click", onClick);
    measure();

    return () => {
      stopScroll();
      observer.disconnect();
      clearTimeout(settleTimer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scrollend", settle);
      page.removeEventListener("focusin", onFocusIn);
      page.removeEventListener("click", onClick);
      page.style.removeProperty("--flight-room");
      page.style.removeProperty("--flight-focus-y");
      for (const section of sections) {
        for (const property of STAGED_PROPERTIES) {
          section.style.removeProperty(property);
        }
      }
    };
  });
</script>

{#if staged}
  <div
    class="stops-flight"
    bind:this={track}
    style:height={trackHeight ? `${trackHeight}px` : undefined}
    style:--flight-perspective="{FLIGHT_PERSPECTIVE}px"
    style:--flight-band="{CONTROLS_BAND}px"
  >
    <FlightStars {depth} {lift} />
    {@render children()}
  </div>
  <FlightControls
    {stops}
    {active}
    onGo={(index) => flyTo(index)}
    placement="stage"
  />
{:else}
  <FlowFlight still>{@render children()}</FlowFlight>
{/if}

<style>
  .stops-flight {
    position: relative;
  }

  /* The page becomes a fixed stage the height of the window; the track
     around it supplies the scroll distance the camera travels. */
  .stops-flight :global(.composer-page) {
    position: sticky;
    top: 0;
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    width: 100%;
    height: 100vh;
    height: 100dvh;
    margin: 0;
    padding: 0;
    overflow: clip;
    perspective: var(--flight-perspective);
    perspective-origin: 50% var(--flight-focus-y, 50%);
    /* A panel taller than the stage runs on below it; it fades out above
       Next instead of passing under the buttons, which also shows there is
       more of it to scroll through. */
    mask-image: linear-gradient(
      to bottom,
      #000 calc(100% - var(--flight-band)),
      transparent calc(100% - var(--flight-band) + 1.5rem)
    );
  }

  /* Every section is a panel in space: one shared cell, placed and pushed
     into depth by the camera. */
  .stops-flight :global(.composer-page > section) {
    grid-area: 1 / 1;
    align-self: start;
    justify-self: center;
    box-sizing: border-box;
    width: min(100% - 10rem, var(--shell-w, min(1720px, 92vw)));
    margin: 0;
    padding: clamp(1.25rem, 2.4vw, 2.5rem);
    border: 1px solid var(--theme-stroke, oklch(0.45 0.03 270 / 0.2));
    border-radius: clamp(1rem, 1.5vw, 1.5rem);
    /* The theme wash is translucent; over the shared solid floor the panel
       hides the next stop waiting behind it instead of doubling its text. */
    background:
      linear-gradient(
        var(--theme-panel-bg, rgb(15, 15, 20)),
        var(--theme-panel-bg, rgb(15, 15, 20))
      ),
      var(--sheet-bg-solid, rgb(15, 15, 20));
    box-shadow: 0 2rem 6rem oklch(0.04 0.03 270 / 0.45);
    will-change: transform, opacity;
    backface-visibility: hidden;
  }

  /* The hero sizes itself to the window; on the stage it fills one panel. */
  .stops-flight :global(.composer-page > .opening) {
    min-height: var(--flight-room, auto);
  }

  .stops-flight :global(.composer-page .scroll-cue) {
    display: none;
  }
</style>
