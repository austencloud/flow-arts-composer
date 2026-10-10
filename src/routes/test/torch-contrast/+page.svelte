<script lang="ts">
  import { onMount } from "svelte";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    applyTorchContrastPalette,
    TORCH_CONTRAST_PALETTE,
  } from "#lib/shared/pictograph/prop/domain/torch-contrast.js";
  import {
    applyMotionColorToSvg,
    SELECTIVE_COLOR_PROP_TYPES,
  } from "#lib/shared/utils/svg-color-utils.js";

  type PreviewDefinition = {
    id: "torch" | "bigtorch";
    label: string;
    propType: PropType;
    file: string;
  };

  type HandPreviews = {
    left: string;
    right: string;
  };

  type RenderedPreview = {
    dark: HandPreviews;
    light: HandPreviews;
  };

  const previews: PreviewDefinition[] = [
    {
      id: "torch",
      label: "Torch",
      propType: PropType.TORCH,
      file: "/images/props/pictograph/torch.svg?contrast-draft=5",
    },
    {
      id: "bigtorch",
      label: "Big torch",
      propType: PropType.BIGTORCH,
      file: "/images/props/pictograph/bigtorch.svg?contrast-draft=5",
    },
  ];

  const surfaces = [
    {
      id: "dark" as const,
      label: "Dark editor surface",
      background: TORCH_CONTRAST_PALETTE.dark.background,
      shaft: TORCH_CONTRAST_PALETTE.dark.shaft,
      metal: TORCH_CONTRAST_PALETTE.dark.metal,
      flame: TORCH_CONTRAST_PALETTE.dark.flame,
    },
    {
      id: "light" as const,
      label: "Light editor surface",
      background: TORCH_CONTRAST_PALETTE.light.background,
      shaft: TORCH_CONTRAST_PALETTE.light.shaft,
      metal: TORCH_CONTRAST_PALETTE.light.metal,
      flame: TORCH_CONTRAST_PALETTE.light.flame,
    },
  ];

  const handColors = [
    { id: "blue" as const, label: "Left prop (blue)", color: HandSide.LEFT },
    { id: "red" as const, label: "Right prop (red)", color: HandSide.RIGHT },
  ];

  let rendered = $state<Record<string, RenderedPreview>>({});
  let loadError = $state("");

  function renderEditorProp(
    rawSvg: string,
    definition: PreviewDefinition,
    color: HandSide,
    darkMode: boolean
  ): string {
    const selective = (
      SELECTIVE_COLOR_PROP_TYPES as readonly string[]
    ).includes(definition.id);
    const coloredSvg = applyMotionColorToSvg(rawSvg, color, {
      makeClassNamesUnique: true,
      themeMode: darkMode ? "dark" : "light",
      selectiveColorMode: selective,
    });

    const contrastArtwork = applyTorchContrastPalette(
      coloredSvg,
      definition.propType,
      darkMode ? "dark" : "light"
    );

    return addOverlapPoint(contrastArtwork, definition, darkMode);
  }

  function getOuterGridPoint(
    definition: PreviewDefinition,
    darkMode: boolean
  ): string {
    const isBigTorch = definition.propType === PropType.BIGTORCH;

    return `
      <circle
        data-overlap-point="true"
        data-grid-theme="${darkMode ? "dark" : "light"}"
        cx="${isBigTorch ? "281.9" : "306.9"}"
        cy="${isBigTorch ? "12.55" : "7.75"}"
        r="25"
        fill="${darkMode ? "#d0d0d0" : "#000000"}"
      />
    `;
  }

  function addOverlapPoint(
    svgMarkup: string,
    definition: PreviewDefinition,
    darkMode: boolean
  ): string {
    return svgMarkup
      .replace("<svg ", '<svg overflow="visible" ')
      .replace(
        "</style>",
        `</style>${getOuterGridPoint(definition, darkMode)}`
      );
  }

  onMount(async () => {
    try {
      const entries = await Promise.all(
        previews.map(async (definition) => {
          const response = await fetch(definition.file);
          if (!response.ok) {
            throw new Error(`${definition.label} returned ${response.status}`);
          }

          const rawSvg = await response.text();
          const preview: RenderedPreview = {
            dark: {
              left: renderEditorProp(rawSvg, definition, HandSide.LEFT, true),
              right: renderEditorProp(rawSvg, definition, HandSide.RIGHT, true),
            },
            light: {
              left: renderEditorProp(rawSvg, definition, HandSide.LEFT, false),
              right: renderEditorProp(
                rawSvg,
                definition,
                HandSide.RIGHT,
                false
              ),
            },
          };

          return [definition.id, preview] as const;
        })
      );

      rendered = Object.fromEntries(entries);
    } catch (error) {
      loadError =
        error instanceof Error
          ? error.message
          : "The torch assets did not load.";
    }
  });
</script>

<svelte:head>
  <title>Torch contrast review</title>
</svelte:head>

<main>
  <header>
    <p class="eyebrow">Construct visual draft</p>
    <h1>Torch contrast review</h1>
    <p class="intro">
      This page shows the editor render used by Construct. Each flame is tested
      against the actual Diamond outer point at large and small tile sizes.
    </p>
  </header>

  {#if loadError}
    <p class="error" role="alert">{loadError}</p>
  {:else}
    {#each previews as definition (definition.id)}
      {@const preview = rendered[definition.id]}
      <section>
        <div class="section-heading">
          <div>
            <h2>{definition.label}</h2>
            <p>{definition.file.split("?")[0]}</p>
          </div>
          <p class="preserved">
            The flame replaces the wick in editor rendering.
          </p>
        </div>

        {#if preview}
          <div class="surface-grid">
            {#each surfaces as surface (surface.id)}
              {@const surfacePreview = preview[surface.id]}
              <figure
                class:dark-surface={surface.id === "dark"}
                style:background={surface.background}
              >
                <figcaption>
                  <strong>{surface.label}</strong>
                  <span>
                    Actual outer point · Flame {surface.flame} · Wick removed
                  </span>
                </figcaption>

                <div class="hand-grid">
                  {#each handColors as hand (hand.id)}
                    <div class="hand-preview">
                      <div class="prop-artwork">
                        {@html surfacePreview[hand.id]}
                      </div>
                      <span class="hand-label {hand.id}">{hand.label}</span>
                    </div>
                  {/each}
                </div>

                <div class="tile-size-row" aria-label="Small editor tile check">
                  <span>Small tile</span>
                  <div class="tile-artwork">
                    {@html surfacePreview.left}
                  </div>
                  <div class="tile-artwork">
                    {@html surfacePreview.right}
                  </div>
                </div>
              </figure>
            {/each}
          </div>
        {:else}
          <p class="loading">Loading {definition.label.toLowerCase()}…</p>
        {/if}
      </section>
    {/each}
  {/if}
</main>

<style>
  main {
    min-height: 100vh;
    padding: clamp(1.25rem, 4vw, 3rem);
    background: #15171c;
    color: #f4f4f5;
    font-family: system-ui, sans-serif;
  }

  header {
    max-width: 48rem;
    margin-bottom: 2rem;
  }

  .eyebrow {
    margin: 0 0 0.5rem;
    color: #93c5fd;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h1,
  h2,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0.75rem;
    font-size: clamp(2rem, 5vw, 3.75rem);
    line-height: 1;
  }

  .intro {
    margin-bottom: 0;
    color: #d4d4d8;
    font-size: clamp(1rem, 2vw, 1.125rem);
    line-height: 1.6;
  }

  section {
    padding: 1.75rem 0 2.25rem;
    border-top: 1px solid #3f3f46;
  }

  .section-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  h2 {
    margin-bottom: 0.25rem;
    font-size: clamp(1.5rem, 3vw, 2rem);
  }

  .section-heading p {
    margin-bottom: 0;
    color: #a1a1aa;
    font-size: var(--font-size-min, 0.875rem);
  }

  .preserved {
    text-align: right;
  }

  .surface-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr));
    gap: 1rem;
  }

  figure {
    min-height: 22rem;
    margin: 0;
    padding: 1rem;
    border: 1px solid #52525b;
    border-radius: 0.75rem;
    color: #18181b;
  }

  figure.dark-surface {
    color: #fafafa;
  }

  figcaption {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: var(--font-size-min, 0.875rem);
  }

  figcaption span {
    color: currentColor;
    font-size: var(--font-size-compact, 0.75rem);
    opacity: 0.72;
  }

  .tile-size-row {
    display: grid;
    grid-template-columns: 1fr 4rem 4rem;
    align-items: center;
    gap: 0.75rem;
    min-height: 5rem;
    margin-top: 0.75rem;
    padding: 0.75rem;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    border-radius: 0.5rem;
  }

  .tile-size-row > span {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
  }

  .tile-artwork {
    display: grid;
    min-width: 0;
    place-items: center;
    overflow: visible;
  }

  .tile-artwork :global(svg) {
    width: 3.5rem;
    height: auto;
    overflow: visible;
    transform: rotate(-90deg);
  }

  .hand-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    height: calc(100% - 2.5rem);
    margin-top: 1rem;
  }

  .hand-preview {
    display: grid;
    grid-template-rows: 1fr auto;
    min-width: 0;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    border-radius: 0.5rem;
    container-type: inline-size;
  }

  .prop-artwork {
    display: grid;
    min-height: 16rem;
    place-items: center;
    overflow: hidden;
  }

  .prop-artwork :global(svg) {
    width: min(14rem, 76cqw);
    height: auto;
    transform: rotate(-90deg);
  }

  .hand-label {
    margin: 0.75rem;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    text-align: center;
  }

  .hand-label::before {
    display: inline-block;
    width: 0.625rem;
    height: 0.625rem;
    margin-right: 0.375rem;
    border-radius: 50%;
    content: "";
  }

  .hand-label.blue::before {
    background: #2563eb;
  }

  .hand-label.red::before {
    background: #dc2626;
  }

  .loading,
  .error {
    min-height: 8rem;
    padding: 1rem;
    color: #d4d4d8;
    font-size: var(--font-size-min, 0.875rem);
  }

  .error {
    border: 1px solid #ef4444;
    color: #fecaca;
  }

  @media (max-width: 42rem) {
    .section-heading,
    figcaption {
      align-items: start;
      flex-direction: column;
    }

    .preserved {
      text-align: left;
    }
  }
</style>
