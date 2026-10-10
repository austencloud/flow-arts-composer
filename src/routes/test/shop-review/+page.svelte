<script lang="ts">
  /**
   * Shop visual-review harness — one document, all viewports.
   *
   * Every shop surface is a real route (not a component fixture), so each
   * frame is a plain iframe pointed at the live page. Pattern mirrors
   * src/routes/test/smart-collections/+page.svelte: side-by-side device
   * frames, scaled uniformly via CSS transform so the iframe itself keeps a
   * true CSS viewport (width/height attributes), with a `?frame=N&surface=X`
   * single-frame mode for screenshot tooling.
   */
  import { page } from "$app/state";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  interface Surface {
    id: string;
    label: string;
    shortLabel: string;
    path: string;
  }

  interface Viewport {
    id: string;
    label: string;
    width: number;
    height: number;
  }

  const SURFACES: [Surface, ...Surface[]] = [
    { id: "front-door", label: "Front door", shortLabel: "Front door", path: "/shop" },
    {
      id: "tnd-trilogy",
      label: "T&D Trilogy",
      shortLabel: "T&D Trilogy",
      path: "/shop/tnd-trilogy",
    },
    {
      id: "starter-pack",
      label: "Starter Pack",
      shortLabel: "Starter Pack",
      path: "/shop/starter-pack",
    },
    {
      id: "loop-deck",
      label: "LOOP Deck",
      shortLabel: "LOOP Deck",
      path: "/shop/loop-deck",
    },
    {
      id: "architect",
      label: "LOOP Deck Architect",
      shortLabel: "Architect",
      path: "/shop/loop-deck/architect",
    },
    {
      id: "success",
      label: "Success (no session)",
      shortLabel: "Success",
      path: "/shop/success",
    },
  ];

  // Uniform display height every frame is scaled to, so the row reads as one
  // document regardless of source viewport size. Kept at or below the
  // shortest real viewport (Z Fold folded landscape, 412 tall) so no frame
  // ever scales ABOVE 1x and softens.
  const TARGET_HEIGHT = 380;

  const VIEWPORTS: [Viewport, ...Viewport[]] = [
    { id: "se", label: "iPhone SE", width: 375, height: 667 },
    { id: "fold", label: "Z Fold folded, landscape", width: 960, height: 412 },
    { id: "tablet", label: "Tablet portrait", width: 820, height: 1180 },
    { id: "laptop", label: "Laptop", width: 1440, height: 900 },
    { id: "4k-200", label: "4K @ 200%", width: 1920, height: 1080 },
    { id: "4k-150", label: "4K @ 150%", width: 2560, height: 1440 },
    { id: "4k-100", label: "4K @ 100% / TV", width: 3840, height: 2160 },
  ];

  function findSurface(id: string | null): Surface {
    return SURFACES.find((surface) => surface.id === id) ?? SURFACES[0];
  }

  function parseFrameIndex(raw: string | null): number | null {
    if (raw === null) return null;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed >= VIEWPORTS.length) {
      return null;
    }
    return parsed;
  }

  // ?frame=N&surface=X — single isolated frame, no harness chrome, for
  // screenshot tooling. Mirrors smart-collections' `isFrame` seam.
  const frameIndex = $derived(parseFrameIndex(page.url.searchParams.get("frame")));
  const isFrame = $derived(frameIndex !== null);
  const frameSurface = $derived(findSurface(page.url.searchParams.get("surface")));
  const frameViewport = $derived(
    frameIndex !== null ? VIEWPORTS[frameIndex] : undefined
  );

  let selectedSurfaceId = $state(
    findSurface(page.url.searchParams.get("surface")).id
  );
  const selectedSurface = $derived(findSurface(selectedSurfaceId));

  function scaleFor(viewport: Viewport): number {
    return TARGET_HEIGHT / viewport.height;
  }
</script>

<svelte:head>
  <title
    >{isFrame
      ? `${frameSurface.label} frame`
      : "Shop visual review — all viewports"}</title
  >
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if isFrame && frameViewport}
  <div class="frame-only">
    <iframe
      src={frameSurface.path}
      title={`${frameSurface.label} @ ${frameViewport.label}`}
      width={frameViewport.width}
      height={frameViewport.height}
    ></iframe>
  </div>
{:else}
  <main class="harness">
    <header class="harness-head">
      <span class="eyebrow">Visual review</span>
      <h1>Shop, every viewport</h1>
      <p>
        Pick a surface. Every device frame renders below it, side by side, at
        its true CSS viewport — scaled to a shared display height so the row
        reads as one document.
      </p>
    </header>

    <div class="surface-picker">
      <span id="shop-review-surface-label">Surface</span>
      <SegmentedControl
        options={SURFACES.map((surface) => ({
          value: surface.id,
          label: surface.label,
          shortLabel: surface.shortLabel,
        }))}
        value={selectedSurfaceId}
        onchange={(value) => (selectedSurfaceId = value)}
        color="accent"
        size="sm"
        semantics="radiogroup"
        ariaLabelledby="shop-review-surface-label"
      />
    </div>

    <p class="surface-path"><code>{selectedSurface.path}</code></p>

    <div class="frames-row">
      {#each VIEWPORTS as viewport (viewport.id)}
        {@const scale = scaleFor(viewport)}
        {@const displayWidth = Math.round(viewport.width * scale)}
        <figure class="frame-card">
          <div
            class="frame-shell"
            style={`--display-width: ${displayWidth}px; --display-height: ${TARGET_HEIGHT}px; --frame-width: ${viewport.width}px; --frame-height: ${viewport.height}px; --frame-scale: ${scale};`}
          >
            {#key `${selectedSurface.id}-${viewport.id}`}
              <iframe
                src={selectedSurface.path}
                title={`${selectedSurface.label}, ${viewport.label}`}
                width={viewport.width}
                height={viewport.height}
              ></iframe>
            {/key}
          </div>
          <figcaption>
            <strong>{viewport.label}</strong>
            <span>{viewport.width} × {viewport.height}</span>
          </figcaption>
        </figure>
      {/each}
    </div>
  </main>
{/if}

<style>
  :global(html),
  :global(body) {
    margin: 0;
    min-height: 100%;
    background: #0b0d13;
  }

  .frame-only {
    display: grid;
    min-height: 100dvh;
    place-items: start;
    background: #0b0d13;
  }

  .frame-only iframe {
    display: block;
    border: 0;
  }

  .harness {
    min-height: 100dvh;
    padding: clamp(16px, 2.5vw, 48px);
    background:
      radial-gradient(
        circle at 8% 0%,
        rgba(139, 108, 255, 0.14),
        transparent 28rem
      ),
      #0b0d13;
    color: #f7f8fb;
    font-family: system-ui, sans-serif;
  }

  .harness-head {
    max-width: var(--shell-w, min(1720px, 92vw));
    margin: 0 auto clamp(18px, 2.4vw, 32px);
  }

  .eyebrow {
    color: color-mix(in srgb, #8b6cff 76%, white);
    font-size: 12px;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .harness-head h1 {
    margin: 6px 0 0;
    font-size: clamp(28px, 3.2vw, 46px);
    letter-spacing: -0.03em;
    line-height: 1.05;
  }

  .harness-head p {
    max-width: 66ch;
    margin: 10px 0 0;
    color: rgba(235, 239, 248, 0.66);
    font-size: 14px;
    line-height: 1.5;
  }

  .surface-picker {
    display: flex;
    max-width: var(--shell-w, min(1720px, 92vw));
    margin: 0 auto;
    flex-direction: column;
    gap: 8px;
  }

  .surface-picker > span {
    color: color-mix(in srgb, #8b6cff 76%, white);
    font-size: 12px;
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .surface-path {
    max-width: var(--shell-w, min(1720px, 92vw));
    margin: 10px auto 0;
    color: rgba(235, 239, 248, 0.5);
    font-size: 13px;
  }

  .surface-path code {
    color: rgba(235, 239, 248, 0.82);
  }

  .frames-row {
    display: flex;
    max-width: var(--shell-w, min(1720px, 92vw));
    margin: clamp(18px, 2.4vw, 32px) auto 0;
    gap: 20px;
    overflow-x: auto;
    padding-bottom: 8px;
    overscroll-behavior-inline: contain;
  }

  .frame-card {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: 10px;
    margin: 0;
  }

  .frame-shell {
    width: var(--display-width);
    height: var(--display-height);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    background: #0b0d13;
    box-shadow: 0 16px 44px rgba(0, 0, 0, 0.44);
  }

  .frame-shell iframe {
    display: block;
    width: var(--frame-width);
    height: var(--frame-height);
    border: 0;
    transform: scale(var(--frame-scale));
    transform-origin: top left;
  }

  .frame-card figcaption {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .frame-card figcaption strong {
    color: #f7f8fb;
    font-size: 13px;
    font-weight: 650;
  }

  .frame-card figcaption span {
    color: rgba(235, 239, 248, 0.55);
  }

  @media (max-width: 560px) {
    .harness {
      padding: 14px;
    }
  }
</style>
