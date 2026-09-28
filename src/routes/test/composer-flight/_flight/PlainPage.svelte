<script lang="ts">
  /**
   * The plain Composer page with the section controls, where a staged version
   * cannot run: reduced motion, or a window too small for the stage. Next and
   * the rail scroll to a section, and the rail marks the one being read.
   */
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import FlightControls from "./FlightControls.svelte";
  import { headerHeight, pageSections, sectionTitle } from "./page-sections";

  let { children }: { children: Snippet } = $props();

  const calm = new MediaQuery("(prefers-reduced-motion: reduce)");

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
  let goTo: (index: number) => void = () => {};

  $effect(() => {
    if (!root) return;
    const found = pageSections(root);
    if (!found) return;
    const { page, sections } = found;
    stops = sections.map(sectionTitle);

    let tops: number[] = [];
    // The section Next or the rail went to stays current until the reader
    // scrolls by themselves. Otherwise a short section there leaves the next
    // one's top above the reading line, and that one takes the mark.
    let chosen: number | null = null;

    const render = () => {
      const line = window.scrollY + window.innerHeight * READING_LINE;
      let reading = 0;
      tops.forEach((top, index) => {
        if (top < line) reading = index;
      });
      active = chosen ?? reading;
    };

    const measure = () => {
      const pageTop = page.getBoundingClientRect().top + window.scrollY;
      tops = sections.map((section) => pageTop + section.offsetTop);
      render();
    };

    goTo = (index) => {
      chosen = index;
      active = index;
      const target =
        index === 0 ? 0 : tops[index] - headerHeight(page) - HEADER_GAP;
      window.scrollTo({
        top: Math.max(0, target),
        behavior: calm.current ? "instant" : "smooth",
      });
    };

    // The mark moves on at the next scroll, so a click inside a section does
    // not move it by itself.
    const release = () => {
      chosen = null;
    };

    const observer = new ResizeObserver(() => measure());
    observer.observe(page);
    window.addEventListener("scroll", render, { passive: true });
    window.addEventListener("resize", measure);
    for (const type of OWN_SCROLL_INPUT) {
      window.addEventListener(type, release, { passive: true });
    }
    measure();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", render);
      window.removeEventListener("resize", measure);
      for (const type of OWN_SCROLL_INPUT) {
        window.removeEventListener(type, release);
      }
    };
  });
</script>

<div class="plain-page" bind:this={root}>
  {@render children()}
</div>

<FlightControls {stops} {active} onGo={(index) => goTo(index)} />

<style>
  .plain-page {
    position: relative;
  }

  /* Next replaces the hero's own scroll cue. */
  .plain-page :global(.composer-page .scroll-cue) {
    display: none;
  }
</style>
