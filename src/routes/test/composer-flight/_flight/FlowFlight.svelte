<script lang="ts">
  /**
   * Flow: the real Composer page scrolling normally through the star field.
   * A section rests flat while it crosses the reading band. Below the band it
   * waits small in the distance and grows toward you as it rises; above it,
   * it swells and fades as it passes over your head. `still` keeps the plain
   * page and only adds the section controls, for reduced motion or for Stops
   * on a small window.
   */
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { scroll } from "motion";
  import FlightStars from "./FlightStars.svelte";
  import FlightControls from "./FlightControls.svelte";
  import { FLIGHT_PERSPECTIVE, flowPose } from "./flight-camera";
  import { harness } from "./harness.svelte";
  import { headerHeight, pageSections, sectionTitle } from "./page-sections";

  let { children, still = false }: { children: Snippet; still?: boolean } =
    $props();

  const calm = new MediaQuery("(prefers-reduced-motion: reduce)");
  const flying = $derived(!still && !calm.current);

  /** Star depth travelled per px of page scroll. */
  const STAR_DEPTH_PER_PX = 1.4;
  /** While the reader scrolls, a section becomes the current one once its
      top passes this line. */
  const READING_LINE = 0.45;
  const HEADER_GAP = 16;
  /** Input that means the reader is scrolling by themselves again. */
  const OWN_SCROLL_INPUT = [
    "wheel",
    "touchmove",
    "keydown",
    "pointerdown",
  ] as const;

  let root: HTMLDivElement | undefined = $state();
  let stops: string[] = $state([]);
  let active = $state(0);
  let depth = $state(0);
  let goTo: (index: number) => void = () => {};

  $effect(() => {
    if (still) return;
    harness.note = calm.current
      ? "Motion is turned off on this device, so this is the plain page."
      : "";
    return () => {
      harness.note = "";
    };
  });

  $effect(() => {
    if (!root) return;
    const found = pageSections(root);
    if (!found) return;
    const { page, sections } = found;
    const moving = flying;
    stops = sections.map(sectionTitle);

    let tops: number[] = [];
    let heights: number[] = [];
    // The section Next or the rail went to stays current until the reader
    // scrolls by themselves. Otherwise a short section there leaves the next
    // one's top above the reading line, and that one takes the mark.
    let chosen: number | null = null;

    const render = () => {
      const scrollY = window.scrollY;
      const viewport = window.innerHeight;
      let reading = 0;
      sections.forEach((section, index) => {
        const top = tops[index] - scrollY;
        if (top < viewport * READING_LINE) reading = index;
        if (!moving) return;
        const pose = flowPose(top, top + heights[index], viewport);
        const style = section.style;
        if (pose.opacity <= 0) {
          // Back at its layout place while invisible, so the page's own
          // near-viewport loading and keyboard focus behave as they do today.
          style.transform = "none";
          style.opacity = "0";
          return;
        }
        // An approaching section recedes toward its own top edge and a
        // leaving one swells from its bottom edge, so neither is drawn into
        // the space of the section next to it.
        style.transformOrigin = pose.z < 0 ? "50% 0" : "50% 100%";
        style.transform = `perspective(${FLIGHT_PERSPECTIVE}px) translate3d(0, 0, ${pose.z.toFixed(1)}px)`;
        style.opacity = pose.opacity.toFixed(3);
        style.zIndex = String(1000 + Math.round(pose.z / 10));
      });
      active = chosen ?? reading;
      if (moving) depth = scrollY * STAR_DEPTH_PER_PX;
    };

    const measure = () => {
      const pageTop = page.getBoundingClientRect().top + window.scrollY;
      tops = sections.map((section) => pageTop + section.offsetTop);
      heights = sections.map((section) => section.offsetHeight);
      render();
    };

    goTo = (index) => {
      chosen = index;
      active = index;
      const target =
        index === 0 ? 0 : tops[index] - headerHeight(page) - HEADER_GAP;
      window.scrollTo({
        top: Math.max(0, target),
        behavior: moving ? "smooth" : "instant",
      });
    };

    // The mark moves on at the next scroll, so a click inside a section does
    // not move it by itself.
    const release = () => {
      chosen = null;
    };

    const stopScroll = scroll((_progress: number, _info: unknown) => render());
    const observer = new ResizeObserver(() => measure());
    observer.observe(page);
    window.addEventListener("resize", measure);
    for (const type of OWN_SCROLL_INPUT) {
      window.addEventListener(type, release, { passive: true });
    }
    measure();

    return () => {
      stopScroll();
      observer.disconnect();
      window.removeEventListener("resize", measure);
      for (const type of OWN_SCROLL_INPUT) {
        window.removeEventListener(type, release);
      }
      for (const section of sections) {
        for (const property of [
          "transform",
          "transform-origin",
          "opacity",
          "z-index",
        ]) {
          section.style.removeProperty(property);
        }
      }
    };
  });
</script>

<div class="flow-flight" class:flying bind:this={root}>
  {#if flying}
    <FlightStars {depth} />
  {/if}
  {@render children()}
</div>

<FlightControls {stops} {active} onGo={(index) => goTo(index)} />

<style>
  .flow-flight {
    position: relative;
  }

  /* Next replaces the hero's own scroll cue in both prototypes. */
  .flow-flight :global(.composer-page .scroll-cue) {
    display: none;
  }

  /* The sections' depth order stays inside the page, under the site header
     and the section controls. */
  .flow-flight.flying :global(.composer-page) {
    isolation: isolate;
  }

  .flow-flight.flying :global(.composer-page > section) {
    position: relative;
    will-change: transform, opacity;
    backface-visibility: hidden;
  }
</style>
