<script lang="ts">
  /**
   * The /composer stage. On a large window with motion allowed, the page's
   * sections rest one at a time on a fixed stage instead of scrolling past.
   * Leaving a section, by scrolling past it or with Next, the rail, an
   * in-page link or Tab, starts one timed glide straight ahead: the section
   * drifts toward you as it fades and the next one arrives from just beyond
   * it. The browser's compositor runs the glide, so a busy page cannot make
   * it stutter, and the rest of the gesture that started it is absorbed, so
   * one flick moves one section. A section taller than the stage pans with
   * the scroll while it rests, and a gesture that reaches its end stops there
   * before the next one glides on.
   *
   * The page prerenders and hydrates as the plain page, and the stage takes
   * over once SvelteKit has finished the navigation that brought the reader
   * here. A smaller or zoomed-in window, a touch screen, and reduced motion
   * keep the plain page; /about renders the same sections without this
   * wrapper.
   */
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { afterNavigate } from "$app/navigation";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import GlideControls from "./GlideControls.svelte";
  import GlideStars from "./GlideStars.svelte";
  import type { GlideMemory } from "./glide-memory";
  import {
    GLIDE_PERSPECTIVE,
    GLIDE_STAR_STEP,
    fitPlace,
    glidePose,
    glideTarget,
    landingOffset,
    planStops,
    restPan,
    restRange,
    type GlidePlace,
  } from "./glide-plan";
  import { headerHeight, pageSections, sectionTitle } from "./page-sections";

  let { children, memory }: { children: Snippet; memory: GlideMemory } =
    $props();

  // Keep in step with the stage media queries in the styles below.
  const roomy = new MediaQuery(
    "(min-width: 1100px) and (min-height: 700px) and (hover: hover) and (pointer: fine)"
  );
  const calm = new MediaQuery("(prefers-reduced-motion: reduce)");

  /** What the navigation that brought the reader here asks the stage to
      show first. */
  type Arrival = { place: GlidePlace } | { target: Element };

  // The server cannot know the window, so hydration always matches the plain
  // page it prerendered. The stage then waits for SvelteKit to finish the
  // navigation, which scrolls the plain page itself: to a restored position,
  // to a link's #target, or to the top, and smoothly, so the stage must not
  // mistake that scroll for the reader's. The stage also clips the sections
  // it parks, so a browser without overflow: clip keeps the plain page.
  let arrived = $state(false);
  let arrival: Arrival | null = null;
  afterNavigate((navigation) => {
    const restored = memory.takeRestored();
    if (arrived || !CSS.supports("overflow", "clip")) return;
    const hash = navigation.to?.url.hash.slice(1);
    const target = hash
      ? document.getElementById(decodeURIComponent(hash))
      : null;
    // Only a stage starting now opens here; one that starts later, when the
    // window grows, opens on the section the reader has reached.
    if (roomy.current && !calm.current) {
      arrival = restored
        ? { place: restored }
        : target
          ? { target }
          : { place: { stop: 0, pan: 0 } };
    }
    arrived = true;
  });
  const staged = $derived(arrived && roomy.current && !calm.current);

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
  /** Input quiet for this long ends the gesture that started a glide. */
  const QUIET_MS = 200;
  /** Keyframes per glide; the compositor interpolates between them. */
  const GLIDE_SAMPLES = 24;
  /** A section whose top is above this share of the window is the one being
      read on the plain page. */
  const READING_LINE = 0.45;
  /** Parked to the side of the clipped stage while out of the scene. The
      page's own near-viewport loading waits until a glide is one stop away,
      and a parked section stays readable to assistive technology and
      reachable by Tab without the browser scrolling toward it. */
  const PARKED = "translate3d(400vw, 0, 0)";
  const STAGED_PROPERTIES = [
    "opacity",
    "transform",
    "z-index",
    "pointer-events",
  ];

  let track: HTMLDivElement | undefined = $state();
  let stops: string[] = $state([]);
  let active = $state(0);
  let depth = $state(0);
  let goTo: (index: number) => void = () => {};

  $effect(() => {
    if (!staged || !track) return;
    const found = pageSections(track);
    if (!found || !found.sections.length) return;
    const { page, sections } = found;
    const stage = track;
    stops = sections.map(sectionTitle);
    const easing =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--ease-in-out")
        .trim() || "ease-in-out";

    // Arriving, the stage opens where the navigation asked: the place this
    // history entry was left at, the section holding a link's #target, or
    // the top. A stage that starts later, because the window grew large
    // enough, opens on the section being read on the plain page.
    const entry = arrival;
    arrival = null;
    let opening: GlidePlace = { stop: 0, pan: 0 };
    let openingTarget: Element | null = null;
    if (entry && "target" in entry) {
      const holder = sections.findIndex((section) =>
        section.contains(entry.target)
      );
      if (holder >= 0) {
        opening = { stop: holder, pan: 0 };
        openingTarget = entry.target;
      }
    } else if (entry) {
      opening = entry.place;
    } else {
      const line = window.innerHeight * READING_LINE;
      let reading = 0;
      let readingTop = 0;
      sections.forEach((section, index) => {
        const top = section.getBoundingClientRect().top;
        if (index === 0 || top < line) {
          reading = index;
          readingTop = top;
        }
      });
      opening = {
        stop: reading,
        pan: Math.max(0, headerHeight(page) + TOP_GAP - readingTop),
      };
    }
    stage.classList.add("staged");

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
    /** True from a Tab press until the focus move it causes is done. */
    let tabbing = false;
    let lastScroll = 0;
    /** The resting stop's pan when the scroll gesture under way began. */
    let gesturePan = 0;

    // Whole device pixels, so a resting section's text stays sharp.
    const restY = (index: number, panned: number) =>
      Math.round(
        (restTop +
          Math.max(0, (room - (heights[index] ?? room)) / 2) -
          panned) *
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
    // where a glide would start them, so they load early; every other stop
    // is parked.
    const place = () => {
      sections.forEach((section, index) => {
        const style = section.style;
        const relative = index - current;
        if (Math.abs(relative) > 1) {
          style.opacity = "0";
          style.transform = PARKED;
          style.pointerEvents = "none";
          style.zIndex = "0";
          return;
        }
        const panned =
          relative === 0 ? pan : relative < 0 ? (plan.pans[index] ?? 0) : 0;
        const { transform, opacity } = pose(index, panned, relative);
        style.transform = transform;
        style.opacity = opacity;
        style.pointerEvents = relative === 0 ? "" : "none";
        style.zIndex = relative === 0 ? "2" : "1";
      });
    };

    /** Pans the resting stop in place. */
    const panTo = (panned: number) => {
      pan = panned;
      const resting = sections[current];
      if (resting) resting.style.transform = pose(current, pan, 0).transform;
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
      // A section that loaded mid-glide can have moved the stop just landed on.
      if (Math.abs(window.scrollY - holdOffset()) > 0.5) {
        window.scrollTo({ top: holdOffset(), behavior: "instant" });
      }
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
      const leaving = sections[current];
      const arriving = sections[to];
      if (!leaving || !arriving) return;
      const from = current;
      const fromPan = pan;
      const direction = Math.sign(to - from);
      current = to;
      pan = Math.min(Math.max(landPan, 0), plan.pans[to] ?? 0);
      active = to;
      lock();
      for (const section of [leaving, arriving]) {
        section.style.pointerEvents = "none";
      }
      // The nearer section draws on top: the one being left going forward,
      // the one coming back going back.
      leaving.style.zIndex = direction > 0 ? "3" : "2";
      arriving.style.zIndex = direction > 0 ? "2" : "3";
      const timing: KeyframeAnimationOptions = {
        // Longer than an interface transition on purpose: it moves the whole
        // scene, not a control.
        duration: motionDuration(DURATION.scene),
        easing,
        fill: "forwards",
      };
      const leave = leaving.animate(
        frames(from, fromPan, 0, -direction),
        timing
      );
      glides = [leave, arriving.animate(frames(to, pan, direction, 0), timing)];
      followStars(leave, direction);
      Promise.all(glides.map((animation) => animation.finished)).then(
        land,
        () => {}
      );
    }

    const onScroll = () => {
      if (!measured) return;
      // Scroll after a quiet moment is a new gesture; note where it began.
      const now = performance.now();
      if (now - lastScroll > QUIET_MS) gesturePan = pan;
      lastScroll = now;
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
        if (panned !== pan) panTo(panned);
        return;
      }
      // One gesture reads on through a tall stop or leaves it, never both, so
      // a page-down or a long flick cannot skip the rest of a section: one
      // that began short of the end stops there, and the next one glides. A
      // jump of several stops, as a dragged scrollbar makes, goes straight on.
      const edge = target > current ? (plan.pans[current] ?? 0) : 0;
      if (
        Math.abs(target - current) === 1 &&
        Math.abs(gesturePan - edge) > plan.hold
      ) {
        panTo(edge);
        lastInput = now;
        lock();
        releaseWhenQuiet();
        return;
      }
      // Scrolling back arrives at the end of a tall stop, where it was left.
      glide(target, target > current ? 0 : (plan.pans[target] ?? 0));
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
      if (!section) return 0;
      const box = section.getBoundingClientRect();
      const scale = box.height / section.offsetHeight || 1;
      return (target.getBoundingClientRect().top - box.top) / scale - room / 3;
    };

    // Tab marks the focus move it causes as the reader's own. The page's demos
    // move focus by themselves as they play, and that must not pull the
    // camera back to a section the reader has left.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      tabbing = true;
      setTimeout(() => (tabbing = false));
    };

    // Tabbing into a section the camera is not resting on glides there, so a
    // focused control is never left unseen.
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!tabbing || !(target instanceof HTMLElement)) return;
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
      const wasAt = trackTop + (plan.docks[current] ?? 0);
      const wasSpan = plan.pans[current] ?? 0;
      restTop = headerHeight(page) + TOP_GAP;
      room = viewport - restTop - CONTROLS_BAND;
      heights = sections.map((section) => section.offsetHeight);
      plan = planStops({
        heights,
        room,
        travel: Math.round(viewport * TRAVEL),
        hold: HOLD,
      });
      stage.style.height = `${plan.length + viewport}px`;
      trackTop = stage.getBoundingClientRect().top + window.scrollY;
      const offset = window.scrollY - trackTop;
      const first = !measured;
      if (first) {
        ({ stop: current, pan } = fitPlace(plan, {
          stop: opening.stop,
          pan: openingTarget
            ? panToShow(opening.stop, openingTarget)
            : opening.pan,
        }));
        active = current;
        measured = true;
      }
      pan = Math.min(pan, plan.pans[current] ?? 0);
      if (glides.length) return; // land() settles the scroll instead
      place();
      // A section above that changed height moves the stop the reader rests
      // on. Follow it, so the view stays put instead of reading the change
      // as a scroll. Past the last stop the reader is on the footer, which
      // scrolls as usual.
      const moved =
        first ||
        Math.abs(trackTop + (plan.docks[current] ?? 0) - wasAt) > 0.5 ||
        plan.pans[current] !== wasSpan;
      const last = plan.docks.length - 1;
      const onFooter =
        !first && current === last && offset > restRange(plan, last).end;
      if (moved && !onFooter && Math.abs(window.scrollY - holdOffset()) > 0.5) {
        window.scrollTo({ top: holdOffset(), behavior: "instant" });
      }
    };

    goTo = (index) => glide(index, 0);

    // Back or Forward to another entry of this page returns straight to the
    // place it was left at, as the browser returns to a scroll position.
    const jump = (spot: GlidePlace) => {
      for (const animation of glides) animation.cancel();
      glides = [];
      queued = null;
      locked = false;
      clearTimeout(unlockTimer);
      ({ stop: current, pan } = fitPlace(plan, spot));
      active = current;
      depth = starDepth;
      place();
      window.scrollTo({ top: holdOffset(), behavior: "instant" });
    };
    const disconnect = memory.connect({
      resting: () => ({ stop: current, pan }),
      jump,
    });

    const observer = new ResizeObserver(() => measure());
    for (const section of sections) observer.observe(section);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", absorb, { passive: false });
    window.addEventListener("touchmove", absorb, { passive: false });
    window.addEventListener("keydown", onKeyDown, true);
    page.addEventListener("focusin", onFocusIn);
    page.addEventListener("click", onClick);
    measure();

    return () => {
      disconnect();
      observer.disconnect();
      clearTimeout(unlockTimer);
      cancelAnimationFrame(starFrame);
      for (const animation of glides) animation.cancel();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", absorb);
      window.removeEventListener("touchmove", absorb);
      window.removeEventListener("keydown", onKeyDown, true);
      page.removeEventListener("focusin", onFocusIn);
      page.removeEventListener("click", onClick);
      stage.classList.remove("staged");
      stage.style.removeProperty("height");
      for (const section of sections) {
        for (const property of STAGED_PROPERTIES) {
          section.style.removeProperty(property);
        }
      }
      // A window shrunk below the stage, or motion turned off, returns to
      // the plain page at the section that was resting on the stage.
      if (!staged && page.isConnected) {
        const resting = sections[current];
        const top =
          current === 0 || !resting
            ? 0
            : resting.getBoundingClientRect().top +
              window.scrollY +
              pan -
              restTop;
        window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
      }
    };
  });
</script>

<div
  class="glide"
  bind:this={track}
  style:--glide-perspective="{GLIDE_PERSPECTIVE}px"
  style:--glide-gap="{TOP_GAP}px"
  style:--glide-band="{CONTROLS_BAND}px"
>
  {#if staged}
    <GlideStars {depth} />
  {/if}
  {@render children()}
  {#if staged}
    <GlideControls {stops} {active} onGo={(index) => goTo(index)} />
  {/if}
</div>

<style>
  .glide {
    position: relative;
    /* Where a resting section's top sits, and the height it can use: the
       window below the header and a small gap, less the band kept for Next. */
    --glide-top: calc(var(--marketing-header-h, 64px) + var(--glide-gap));
    --glide-room: calc(100dvh - var(--glide-top) - var(--glide-band));
  }

  /* Keep these two queries in step with `roomy` and `calm` in the script.
     Before the stage takes over, on the prerendered page or without script,
     the plain page already places and sizes the hero as the stage will, so
     nothing moves when it does. The hero fills the room between the header
     and Next, and without its scroll cue, which Next replaces, it needs no
     extra space below. */
  @media (min-width: 1100px) and (min-height: 700px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
    .glide :global(.composer-page) {
      padding-top: var(--glide-top);
    }

    .glide :global(.composer-page > .opening) {
      --hero-card-cap: min(45rem, calc(var(--glide-room) * 0.47));
      min-height: var(--glide-room);
      padding-bottom: clamp(0.75rem, 2vw, 28px);
    }

    .glide :global(.composer-page .scroll-cue) {
      display: none;
    }
  }

  @media (min-width: 105rem) and (min-height: 56.25rem) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
    .glide :global(.composer-page > .opening) {
      --hero-card-cap: min(52rem, calc(var(--glide-room) * 0.51));
    }
  }

  /* The track's height follows the sections; the browser must not read
     that as content moving and nudge the scroll to compensate. As a column,
     it ends with Next, which stays at the bottom of the window until the
     footer scrolls in and then rides up with the stage above it. */
  .glide:global(.staged) {
    display: flex;
    flex-direction: column;
    overflow-anchor: none;
  }

  /* The page becomes a fixed stage the height of the window; the track
     around it supplies the scroll a tall section pans through. Sections read
     --stop-room and --stop-pad to size themselves to the room they rest in. */
  .glide:global(.staged) :global(.composer-page) {
    --stop-room: var(--glide-room);
    --stop-pad: 0px;
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
    perspective: var(--glide-perspective);
    perspective-origin: 50% calc(var(--glide-top) + var(--glide-room) / 2);
    /* A section taller than the stage runs on below it; it fades out above
       Next instead of passing under the buttons, which also shows there is
       more of it to scroll through. */
    mask-image: linear-gradient(
      to bottom,
      #000 calc(100% - var(--glide-band)),
      transparent calc(100% - var(--glide-band) + 1.5rem)
    );
  }

  /* Every section shares one cell and floats in the space itself. Only one
     rests there at a time, so none needs a backing to hide another, and the
     rules that divide neighbours on the plain page have nothing to divide. */
  .glide:global(.staged) :global(.composer-page > section) {
    grid-area: 1 / 1;
    align-self: start;
    justify-self: center;
    box-sizing: border-box;
    width: min(100% - 10rem, var(--shell-w, min(1720px, 92vw)));
    margin: 0;
    border-block: 0;
    will-change: transform, opacity;
    backface-visibility: hidden;
  }
</style>
