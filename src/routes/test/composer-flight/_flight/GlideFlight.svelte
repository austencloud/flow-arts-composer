<script lang="ts">
  /**
   * Glide: Stops without the ride. The same fixed stage, rail and Next, but
   * the camera no longer rides the scroll along a winding path. Leaving a
   * section, by scrolling past it or with Next, the rail, a link or the
   * keyboard, starts one timed glide straight ahead: the section drifts back
   * toward you as it fades and the next one arrives from just ahead. The
   * browser's compositor runs the glide, so a busy page cannot make it
   * stutter, and the rest of the gesture that started it is absorbed, so one
   * flick moves one section. A section taller than the stage pans with the
   * scroll while it rests. A small window or reduced motion gets the plain
   * page instead.
   */
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import FlightControls from "./FlightControls.svelte";
  import FlightStars from "./FlightStars.svelte";
  import PlainPage from "./PlainPage.svelte";
  import {
    FLIGHT_PERSPECTIVE,
    GLIDE_STAR_STEP,
    glidePose,
    glideTarget,
    landingOffset,
    nearestStop,
    planStops,
    restPan,
  } from "./flight-camera";
  import { harness } from "./harness.svelte";
  import { headerHeight, pageSections, sectionTitle } from "./page-sections";

  let { children }: { children: Snippet } = $props();

  const roomy = new MediaQuery("(min-width: 1100px) and (min-height: 700px)");
  const calm = new MediaQuery("(prefers-reduced-motion: reduce)");
  const staged = $derived(roomy.current && !calm.current);

  /** Gap under the header, and the band kept free below a section for Next. */
  const TOP_GAP = 16;
  const CONTROLS_BAND = 76;
  /** Scroll between two stops, as a fraction of the viewport height. The
      glide itself is timed; this spacing only keeps a page-down press or a
      dragged scrollbar from skipping stops. */
  const TRAVEL = 0.9;
  /** Scroll, in px, a stop absorbs before a glide starts: less than one wheel
      notch or arrow press, so either moves on. */
  const HOLD = 32;
  /** One glide. Longer than the interface duration tokens on purpose: it
      moves the whole scene, not a control. */
  const GLIDE_MS = 800;
  /** Input quiet for this long ends the gesture that started a glide. */
  const QUIET_MS = 200;
  /** Keyframes per glide; the compositor interpolates between them. */
  const GLIDE_SAMPLES = 24;
  /** Parked far below the stage while out of the scene, so the page's own
      near-viewport loading waits until a glide is one stop away. */
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
  let glideTo: (index: number) => void = () => {};

  $effect(() => {
    harness.note = staged
      ? ""
      : "Glide needs a window at least 1100 by 700 with motion on, so this is the plain page.";
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
    const easing =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--ease-in-out")
        .trim() || "cubic-bezier(0.4, 0, 0.2, 1)";

    let plan = planStops({ heights: [], room: 1, travel: 1, hold: 0 });
    let heights: number[] = [];
    let trackTop = 0;
    let restTop = 0;
    let room = 0;
    let measured = false;
    /** The stop resting on the stage, or the one a running glide lands on. */
    let current = 0;
    let pan = 0;
    let glides: Animation[] = [];
    let queued: { index: number; pan: number } | null = null;
    let locked = false;
    let lastInput = 0;
    let unlockTimer = 0;
    let starFrame = 0;
    let starDepth = 0;

    // Whole device pixels, so a resting section's text stays sharp.
    const restY = (index: number, panned: number) =>
      Math.round(
        (restTop + Math.max(0, (room - heights[index]) / 2) - panned) *
          devicePixelRatio
      ) / devicePixelRatio;

    const pose = (index: number, panned: number, relative: number) => {
      const { z, opacity } = glidePose(relative);
      return {
        transform: `translate3d(0, ${restY(index, panned).toFixed(2)}px, ${z.toFixed(1)}px)`,
        opacity: opacity.toFixed(3),
      };
    };

    // At rest the current stop sits in place and its neighbours wait unseen
    // where a glide would start them, so they load early and keyboard focus
    // can reach them; every other stop is parked.
    const place = () => {
      sections.forEach((section, index) => {
        const style = section.style;
        const relative = index - current;
        if (Math.abs(relative) > 1) {
          style.visibility = "hidden";
          style.opacity = "0";
          style.transform = PARKED;
          style.pointerEvents = "none";
          style.zIndex = "0";
          return;
        }
        const panned =
          relative === 0 ? pan : relative < 0 ? plan.pans[index] : 0;
        const { transform, opacity } = pose(index, panned, relative);
        style.visibility = "";
        style.transform = transform;
        style.opacity = opacity;
        style.pointerEvents = relative === 0 ? "" : "none";
        style.zIndex = relative === 0 ? "2" : "1";
      });
    };

    const holdOffset = () => trackTop + landingOffset(plan, current, pan);

    const lock = () => {
      locked = true;
      clearTimeout(unlockTimer);
      window.scrollTo({ top: holdOffset(), behavior: "instant" });
    };

    // The gesture that started a glide is over once its input has been quiet
    // for a moment; only then does scrolling pan or glide again.
    const releaseWhenQuiet = () => {
      clearTimeout(unlockTimer);
      const wait = lastInput + QUIET_MS - performance.now();
      if (wait > 0) {
        unlockTimer = window.setTimeout(releaseWhenQuiet, wait);
        return;
      }
      locked = false;
    };

    // The stars drift on the glide's own eased progress.
    const followStars = (glide: Animation, direction: number) => {
      cancelAnimationFrame(starFrame);
      const from = starDepth;
      starDepth += direction * GLIDE_STAR_STEP;
      const tick = () => {
        const progress = glide.effect?.getComputedTiming().progress ?? 1;
        depth = from + direction * GLIDE_STAR_STEP * progress;
        if (glide.playState === "running") {
          starFrame = requestAnimationFrame(tick);
        }
      };
      starFrame = requestAnimationFrame(tick);
    };

    const frames = (
      index: number,
      panned: number,
      from: number,
      to: number
    ): Keyframe[] =>
      Array.from({ length: GLIDE_SAMPLES + 1 }, (_, step) => {
        const progress = step / GLIDE_SAMPLES;
        return {
          offset: progress,
          ...pose(index, panned, from + (to - from) * progress),
        };
      });

    const land = () => {
      place();
      for (const animation of glides) animation.cancel();
      glides = [];
      depth = starDepth;
      if (queued) {
        const next = queued;
        queued = null;
        glide(next.index, next.pan);
        return;
      }
      releaseWhenQuiet();
    };

    function glide(to: number, landPan: number) {
      if (glides.length) {
        queued = { index: to, pan: landPan };
        return;
      }
      if (to === current) {
        window.scrollTo({
          top: trackTop + landingOffset(plan, to, landPan),
          behavior: "smooth",
        });
        return;
      }
      const from = current;
      const fromPan = pan;
      const direction = Math.sign(to - from);
      current = to;
      pan = Math.min(Math.max(landPan, 0), plan.pans[to] ?? 0);
      active = to;
      lock();
      const leaving = sections[from];
      const arriving = sections[to];
      for (const section of [leaving, arriving]) {
        section.style.visibility = "";
        section.style.pointerEvents = "none";
      }
      // The nearer section draws on top: the one being left going forward,
      // the one coming back going back.
      leaving.style.zIndex = direction > 0 ? "3" : "2";
      arriving.style.zIndex = direction > 0 ? "2" : "3";
      const timing: KeyframeAnimationOptions = {
        duration: GLIDE_MS,
        easing,
        fill: "forwards",
      };
      glides = [
        leaving.animate(frames(from, fromPan, 0, -direction), timing),
        arriving.animate(frames(to, pan, direction, 0), timing),
      ];
      followStars(glides[0], direction);
      Promise.all(glides.map((animation) => animation.finished)).then(
        land,
        () => {}
      );
    }

    const onScroll = () => {
      if (!measured) return;
      if (locked) {
        const hold = holdOffset();
        if (Math.abs(window.scrollY - hold) > 0.5) {
          window.scrollTo({ top: hold, behavior: "instant" });
        }
        return;
      }
      const offset = window.scrollY - trackTop;
      const target = glideTarget(plan, current, offset);
      if (target === null) {
        const panned = restPan(plan, current, offset);
        if (panned !== pan) {
          pan = panned;
          sections[current].style.transform = pose(current, pan, 0).transform;
        }
        return;
      }
      // Scrolling back arrives at the end of a tall stop, where it was left.
      glide(target, target > current ? 0 : plan.pans[target]);
    };

    // While a glide runs, the rest of the gesture that started it is
    // absorbed. Where the browser will not let it be cancelled, onScroll
    // holds the page in place instead.
    const absorb = (event: Event) => {
      if (!locked || (event instanceof WheelEvent && event.ctrlKey)) return;
      lastInput = performance.now();
      if (event.cancelable) event.preventDefault();
    };

    // Pan that brings an element into the upper part of the stage.
    const panToShow = (index: number, target: Element) => {
      const section = sections[index];
      const box = section.getBoundingClientRect();
      const scale = box.height / section.offsetHeight || 1;
      return (target.getBoundingClientRect().top - box.top) / scale - room / 3;
    };

    // Keyboard focus landing in a section the camera is not resting on
    // glides there, so a focused control is never left unseen.
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches(":focus-visible"))
        return;
      const index = sections.findIndex((section) => section.contains(target));
      if (index < 0 || index === current) return;
      glide(index, panToShow(index, target));
    };

    // In-page links glide to the section that holds their target.
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
      if (!destination || index < 0) return;
      event.preventDefault();
      glide(index, panToShow(index, destination));
    };

    const measure = () => {
      const viewport = window.innerHeight;
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
      stage.style.height = `${plan.length + viewport}px`;
      trackTop = stage.getBoundingClientRect().top + window.scrollY;
      if (!measured) {
        // A reload can land anywhere on the page: rest on the nearest stop.
        const offset = window.scrollY - trackTop;
        current = nearestStop(plan, offset);
        pan = restPan(plan, current, offset);
        active = current;
        measured = true;
      }
      pan = Math.min(pan, plan.pans[current] ?? 0);
      if (glides.length) return;
      place();
      // A section above that changed height moves every stop after it; keep
      // the reader on the same stop instead of reading that as a scroll.
      if (glideTarget(plan, current, window.scrollY - trackTop) !== null) {
        window.scrollTo({ top: holdOffset(), behavior: "instant" });
      }
    };

    glideTo = (index) => glide(index, 0);

    const observer = new ResizeObserver(() => measure());
    for (const section of sections) observer.observe(section);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", absorb, { passive: false });
    window.addEventListener("touchmove", absorb, { passive: false });
    page.addEventListener("focusin", onFocusIn);
    page.addEventListener("click", onClick);
    measure();

    return () => {
      observer.disconnect();
      clearTimeout(unlockTimer);
      cancelAnimationFrame(starFrame);
      for (const animation of glides) animation.cancel();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", absorb);
      window.removeEventListener("touchmove", absorb);
      page.removeEventListener("focusin", onFocusIn);
      page.removeEventListener("click", onClick);
      page.style.removeProperty("--flight-room");
      page.style.removeProperty("--flight-focus-y");
      stage.style.removeProperty("height");
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
    class="glide-flight"
    bind:this={track}
    style:--flight-perspective="{FLIGHT_PERSPECTIVE}px"
    style:--flight-band="{CONTROLS_BAND}px"
  >
    <FlightStars {depth} trail={0} />
    {@render children()}
  </div>
  <FlightControls
    {stops}
    {active}
    onGo={(index) => glideTo(index)}
    placement="stage"
  />
{:else}
  <PlainPage>{@render children()}</PlainPage>
{/if}

<style>
  .glide-flight {
    position: relative;
    /* The track's height follows the sections; the browser must not read
       that as content moving and nudge the scroll to compensate. */
    overflow-anchor: none;
  }

  /* The page becomes a fixed stage the height of the window; the track
     around it supplies the scroll a tall section pans through. */
  .glide-flight :global(.composer-page) {
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
    /* A section taller than the stage runs on below it; it fades out above
       Next instead of passing under the buttons, which also shows there is
       more of it to scroll through. */
    mask-image: linear-gradient(
      to bottom,
      #000 calc(100% - var(--flight-band)),
      transparent calc(100% - var(--flight-band) + 1.5rem)
    );
  }

  /* Every section shares one cell and floats in the space itself. Only one
     rests there at a time, so none needs a backing to hide another. */
  .glide-flight :global(.composer-page > section) {
    grid-area: 1 / 1;
    align-self: start;
    justify-self: center;
    box-sizing: border-box;
    width: min(100% - 10rem, var(--shell-w, min(1720px, 92vw)));
    margin: 0;
    will-change: transform, opacity;
    backface-visibility: hidden;
  }

  /* The hero sizes itself to the window; on the stage it fills the room, and
     without its scroll cue it needs no extra space below. */
  .glide-flight :global(.composer-page > .opening) {
    min-height: var(--flight-room, auto);
    padding-bottom: clamp(0.75rem, 2vw, 28px);
  }

  .glide-flight :global(.composer-page .scroll-cue) {
    display: none;
  }
</style>
