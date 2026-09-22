<!--
GlyphRenderer.svelte - Renders TKAGlyph to SVG for canvas conversion

This component renders a complete TKAGlyph (letter + turns + future same/opp dots)
as an SVG element, which can then be serialized and converted to an image for
canvas rendering. This ensures the entire glyph fades as a unified unit.
-->
<script module lang="ts">
  // Module-level cache for fetched SVG content to avoid repeated network requests
  // This persists across all component instances and re-renders
  const svgContentCache = new Map<string, string>();

  // Cache for fully serialized glyph SVGs keyed by letter + turns tuple.
  // Avoids expensive getBBox() + DOM cloning + serialization on every beat change
  // when the same letter/turns combo was already rendered this session.
  interface GlyphCacheEntry {
    svgString: string;
    width: number;
    height: number;
    x: number;
    y: number;
  }
  const serializedGlyphCache = new Map<string, GlyphCacheEntry>();
  const MAX_GLYPH_CACHE = 60;
</script>

<script lang="ts">
  import TKAGlyph, {
    getLetterDimensions,
    preloadLetterDimensions,
  } from "$lib/shared/pictograph/tka-glyph/components/TKAGlyph.svelte";
  import TurnsColumn from "$lib/shared/pictograph/tka-glyph/components/TurnsColumn.svelte";
  import SkewBraces from "$lib/shared/pictograph/tka-glyph/components/SkewBraces.svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { turnsTupleGenerator } from "$lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator";
  import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import { isSkewedFrameBeat } from "$lib/shared/foundation/services/skewed-frame";
  import { parseTurnsTuple } from "$lib/shared/pictograph/tka-glyph/utils/turn-tuple-parser";
  import { getTurnsColumnRightExtent } from "$lib/shared/pictograph/tka-glyph/utils/turn-position-calculator";
  import { onMount } from "svelte";

  let {
    letter = null,
    stepData = null,
    pictographData = null,
    onSvgReady,
  } = $props<{
    letter: string | null;
    stepData?: StartPlacementData | StepData | null;
    pictographData?: PictographData | null;
    onSvgReady?: (
      svgString: string,
      width: number,
      height: number,
      x: number,
      y: number
    ) => void;
  }>();

  // Generate turns tuple from step data
  const turnsTuple = $derived.by(() => {
    if (
      !stepData ||
      !isVisibleMotion(stepData.motions?.left) ||
      !isVisibleMotion(stepData.motions?.right)
    ) {
      return "(s, 0, 0)";
    }
    return turnsTupleGenerator.generateTurnsTuple(stepData);
  });

  // A beat that starts or ends in a zeta/eta position wears braces around its
  // letter - matches PictographRenderer.svelte's own skewedFrame gate, so the
  // animation canvas (this component's serialized output) agrees with the
  // live pictograph. GlyphRenderer only serializes the TKAGlyph subtree it
  // owns, so SkewBraces (a sibling of TKAGlyph in PictographRenderer) has to
  // be mounted here directly rather than reused from there.
  const skewedFrame = $derived(
    !!stepData &&
      isVisibleMotion(stepData.motions?.left) &&
      isVisibleMotion(stepData.motions?.right) &&
      isSkewedFrameBeat(stepData.motions.left, stepData.motions.right)
  );

  // Track loaded letter dimensions with $state for reactivity - mirrors
  // PictographRenderer.svelte's loadedLetterDimensions so an async load
  // (cold letter, not yet in TKAGlyph's cache) can trigger a re-run of the
  // serialization effect below once the real size resolves.
  let loadedLetterDimensions = $state<{ width: number; height: number }>({
    width: 100,
    height: 100,
  });

  // Load letter dimensions when the letter changes - same cache TKAGlyph
  // itself reads, so a letter already seen this session resolves on the
  // same synchronous pass via letterDimensions below; a cold letter falls
  // through to preloadLetterDimensions and updates state when it resolves.
  $effect(() => {
    const currentLetter = letter;
    if (!currentLetter) {
      loadedLetterDimensions = { width: 100, height: 100 };
      return;
    }
    const cachedDims = getLetterDimensions(currentLetter);
    if (cachedDims.width !== 100 || cachedDims.height !== 100) {
      loadedLetterDimensions = cachedDims;
    } else {
      // Drop the previous (now-stale) letter's resolved size before the
      // load starts. Without this reset, loadedLetterDimensions still held
      // the PRIOR letter's real width while this cold letter's fetch was in
      // flight, letterDimensions fell back to that stale value, and
      // letterDimensionsReady read true immediately - serializing (and
      // permanently caching) this letter's skewed-beat braces at the wrong
      // width. This effect only reads `letter`, so writing state here
      // cannot re-trigger it.
      loadedLetterDimensions = { width: 100, height: 100 };
      preloadLetterDimensions([currentLetter]).then(() => {
        // Ignore a superseded load: if `letter` moved on again before this
        // resolved, applying it now would overwrite dimensions for
        // whichever letter is current at that point.
        if (letter === currentLetter) {
          loadedLetterDimensions = getLetterDimensions(currentLetter);
        }
      });
    }
  });

  // Effective letter dimensions: synchronous cache lookup + async fallback -
  // mirrors PictographRenderer.svelte's letterDimensions derived exactly, so
  // a cached letter's real size is available the same frame it renders
  // instead of one frame late.
  const letterDimensions = $derived.by(() => {
    const currentLetter = letter;
    if (currentLetter) {
      const cached = getLetterDimensions(currentLetter);
      if (cached.width !== 100 || cached.height !== 100) {
        return cached;
      }
    }
    return loadedLetterDimensions;
  });

  // True once letterDimensions holds a real measurement rather than the
  // 100x100 placeholder - same sentinel PictographRenderer's
  // letterDimensionsReady uses. Gates serialization below so a skewed
  // beat's braces (which read letterDimensions) can't get baked into the
  // serialized-glyph cache at the wrong width before the real size loads.
  const letterDimensionsReady = $derived(
    letterDimensions.width !== 100 || letterDimensions.height !== 100
  );

  // Extra width the turns column reserves to the right of the letter+dash
  // edge, so the closing brace clears the turn numbers instead of painting
  // under them - same rightExtent PictographRenderer computes.
  const braceRightExtent = $derived(
    skewedFrame ? getTurnsColumnRightExtent(parseTurnsTuple(turnsTuple)) : 0
  );

  let svgElement: SVGSVGElement | null = $state(null);
  let isReady = $state(false);

  // When the glyph changes, serialize the SVG and notify parent
  $effect(() => {
    // Track all dependencies that should trigger re-serialization
    const currentLetter = letter;
    const currentTurnsTuple = turnsTuple;
    const currentSkewed = skewedFrame;
    const currentExtent = braceRightExtent;

    if (currentLetter && svgElement && isReady) {
      // A skewed beat's braces read letterDimensions for their own layout
      // and rightExtent clearance - reading letterDimensionsReady only in
      // this branch means a plain beat (which never renders SkewBraces)
      // never tracks it as a dependency, so it keeps serializing
      // immediately exactly as before. A skewed beat with a cold or
      // permanently-failed letter fetch still serializes below (the letter
      // and turns render now, braces use whatever provisional
      // letterDimensions the template already has - the 100x100 sentinel)
      // instead of leaving the canvas blank forever, but shouldCache is
      // false so that provisional result never gets baked into
      // serializedGlyphCache under this beat's key. Once
      // letterDimensionsReady flips true this effect reruns (tracked via
      // the read below) and serializes again for real, caching that one.
      const shouldCache = !(currentSkewed && !letterDimensionsReady);

      // Serialize immediately - transition timing is controlled by GlyphTransitionController
      // Using requestAnimationFrame ensures DOM is ready without artificial delay
      requestAnimationFrame(() => {
        serializeAndNotify(shouldCache);
      });
    }
  });

  onMount(() => {
    isReady = true;
  });

  async function serializeAndNotify(shouldCache: boolean = true) {
    if (!svgElement || !onSvgReady) {
      return;
    }

    try {
      // Check serialized glyph cache first - avoids getBBox() + DOM cloning + serialization.
      // A skewed-frame beat wears braces a non-skewed beat of the same
      // letter/turns does not, so the flag has to be part of the key -
      // otherwise the two would collide on one cached (un)braced SVG string.
      const glyphCacheKey = `${letter}|${turnsTuple}|${skewedFrame ? "skew" : "plain"}`;
      const cached = serializedGlyphCache.get(glyphCacheKey);
      if (cached) {
        onSvgReady(cached.svgString, cached.width, cached.height, cached.x, cached.y);
        return;
      }

      // Get the bounding box of the glyph group
      const glyphGroup = svgElement.querySelector(".tka-glyph");
      if (!glyphGroup) {
        return;
      }

      const bbox = (glyphGroup as SVGGraphicsElement).getBBox();

      // TKAGlyph has transform="translate(50, 800)", so bbox is relative to that transform
      // We need to get the actual position in the 952px viewBox coordinate system
      // The glyph is positioned at (50, 800) by default in TKAGlyph.svelte
      const glyphBaseX = 50;
      const glyphBaseY = 800;

      // The actual position in the viewBox is the base position plus the bbox offset
      const viewBoxX = glyphBaseX + bbox.x;
      const viewBoxY = glyphBaseY + bbox.y;
      const viewBoxWidth = bbox.width;
      const viewBoxHeight = bbox.height;

      // Create a new SVG with proper viewBox for just the glyph
      const svgCopy = svgElement.cloneNode(true) as SVGSVGElement;

      // CRITICAL FIX: Inline external SVG images
      // When SVG is converted to data URL and drawn to canvas, external resources
      // (like <image href="...">) are blocked for security reasons.
      // We must fetch and inline the SVG content directly.
      const imageElements = svgCopy.querySelectorAll("image");

      for (const img of imageElements) {
        const href = img.getAttribute("href");
        if (href && href.endsWith(".svg")) {
          try {
            // Use cached SVG content if available, otherwise fetch and cache
            let svgText: string;
            if (svgContentCache.has(href)) {
              svgText = svgContentCache.get(href)!;
            } else {
              const response = await fetch(href);
              svgText = await response.text();
              svgContentCache.set(href, svgText);
            }

            // Parse the external SVG
            const parser = new DOMParser();
            const externalSvgDoc = parser.parseFromString(
              svgText,
              "image/svg+xml"
            );
            const externalSvgRoot = externalSvgDoc.documentElement;

            // Create a <g> wrapper to preserve the image's position and size
            const g = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "g"
            );

            // Copy image attributes to the group
            const x = parseFloat(img.getAttribute("x") || "0");
            const y = parseFloat(img.getAttribute("y") || "0");
            const width = parseFloat(img.getAttribute("width") || "100");
            const height = parseFloat(img.getAttribute("height") || "100");

            // Get the external SVG's viewBox
            const viewBox = externalSvgRoot.getAttribute("viewBox");
            let scaleX = 1;
            let scaleY = 1;

            if (viewBox) {
              const [, , vbWidth, vbHeight] = viewBox
                .split(" ")
                .map(parseFloat);
              if (vbWidth && vbHeight) {
                scaleX = width / vbWidth;
                scaleY = height / vbHeight;
              }
            }

            // Apply transform to position and scale the inlined content
            g.setAttribute(
              "transform",
              `translate(${x}, ${y}) scale(${scaleX}, ${scaleY})`
            );

            // Copy all children from external SVG to the group
            while (externalSvgRoot.firstChild) {
              g.appendChild(externalSvgRoot.firstChild);
            }

            // Replace the <image> with the <g>
            img.parentNode?.replaceChild(g, img);
          } catch (error) {
            console.error("[GlyphRenderer] Failed to inline SVG:", href, error);
          }
        }
      }

      // CRITICAL FIX: Set viewBox to the FULL 950x950 pictograph space
      // This ensures the glyph appears in the correct position when rendered to canvas
      // The canvas will show the entire pictograph area, with the glyph at the bottom left
      svgCopy.setAttribute("viewBox", "0 0 950 950");
      svgCopy.setAttribute("width", "950");
      svgCopy.setAttribute("height", "950");

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgCopy);

      // Store in cache so subsequent visits to this letter skip getBBox/cloning/serialization.
      // Skipped when shouldCache is false (a skewed beat serialized early
      // with provisional, not-yet-ready letterDimensions) so the eventual
      // real-dimensions serialization isn't shadowed by this one.
      if (shouldCache) {
        if (serializedGlyphCache.size >= MAX_GLYPH_CACHE) {
          const oldest = serializedGlyphCache.keys().next().value;
          if (oldest !== undefined) serializedGlyphCache.delete(oldest);
        }
        serializedGlyphCache.set(glyphCacheKey, {
          svgString, width: viewBoxWidth, height: viewBoxHeight, x: viewBoxX, y: viewBoxY,
        });
      }

      if (onSvgReady) {
        // Pass the glyph bbox dimensions so AnimatorCanvas knows where to draw it
        // The SVG viewBox is the full 950x950, but we tell the canvas where the glyph is within that space
        onSvgReady(svgString, viewBoxWidth, viewBoxHeight, viewBoxX, viewBoxY);
      } else {
        console.error("[GlyphRenderer] onSvgReady callback is not defined!");
      }
    } catch (error) {
      console.error("[GlyphRenderer] Failed to serialize glyph SVG:", error);
    }
  }
</script>

<!-- Hidden SVG container for rendering the glyph -->
<svg
  bind:this={svgElement}
  xmlns="http://www.w3.org/2000/svg"
  style="position: absolute; left: -9999px; top: -9999px; width: 952px; height: 952px;"
  viewBox="0 0 950 950"
>
  {#if letter}
    <TKAGlyph {letter} {pictographData} x={50} y={800} scale={1} />
    {#if skewedFrame}
      <!-- visible gates on letterDimensionsReady (not just true) so a
           provisional, not-yet-cached serialization (see shouldCache above)
           emits the letter and turns with no braces at all, matching what
           PictographRenderer shows during the same cold-letter window,
           instead of braces laid out against the 100x100 sentinel. The real
           braces arrive on the re-serialization that does get cached once
           dimensions resolve. -->
      <SkewBraces
        {letter}
        {letterDimensions}
        rightExtent={braceRightExtent}
        x={50}
        y={800}
        scale={1}
        visible={letterDimensionsReady}
      />
    {/if}
    <TurnsColumn
      {turnsTuple}
      {letter}
      {pictographData}
      x={50}
      y={800}
      scale={1}
      visible={true}
    />
  {/if}
</svg>
