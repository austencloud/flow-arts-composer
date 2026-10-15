<!--
  The Codex's prop choice, set into the page rather than slid over it.

  One quiet line of prop silhouettes - a family each, in the app picker's own
  curated order - and under it the chosen family's builds as words. A family
  with a single build shows just its name there, so the line always says what
  the board is drawing. The choice belongs to this page (its URL carries it);
  it never touches the reader's saved prop.
-->
<script lang="ts">
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    getBasePropType,
    getFamilyTileDisplayProp,
    getPropTypeDisplayInfo,
  } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
  import { localizedPropName } from "#lib/shared/settings/components/tabs/prop-type/localized-prop-name.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { CODEX_PROP_FAMILIES, codexPropBuilds } from "../_data/codex-props";

  let {
    value,
    onChange,
  }: {
    value: PropType;
    onChange: (propType: PropType) => void;
  } = $props();

  const family = $derived(getBasePropType(value));
  const builds = $derived(codexPropBuilds(family));

  /** Columns for a section when it wraps: no more than six, and rows kept
   *  even, so ten props sit five and five rather than six and four. */
  function columns(count: number): number {
    return Math.ceil(count / Math.ceil(count / 6));
  }
</script>

<div class="prop-picker" role="group" aria-label={tDynamic("guide_codex_prop")}>
  <div class="families">
    {#each CODEX_PROP_FAMILIES as section, sectionIndex (sectionIndex)}
      {#if sectionIndex > 0}<span class="rule" aria-hidden="true"></span>{/if}
      <div class="section" style:--cols={columns(section.length)}>
        {#each section as base (base)}
          {@const shown = getFamilyTileDisplayProp(base, value)}
          <button
            type="button"
            class="family"
            aria-pressed={base === family}
            aria-label={localizedPropName(base)}
            title={localizedPropName(base)}
            onclick={() => {
              if (base !== family) onChange(base);
            }}
          >
            <span
              class="glyph"
              style:mask-image={`url("${getPropTypeDisplayInfo(shown).image}")`}
              style:-webkit-mask-image={`url("${getPropTypeDisplayInfo(shown).image}")`}
            ></span>
          </button>
        {/each}
      </div>
    {/each}
  </div>

  <div class="builds">
    {#if builds.length > 1}
      {#each builds as build (build)}
        <button
          type="button"
          class="build"
          aria-pressed={build === value}
          onclick={() => onChange(build)}
        >
          {localizedPropName(build)}
        </button>
      {/each}
    {:else}
      <span class="build only">{localizedPropName(family)}</span>
    {/if}
  </div>
</div>

<style>
  /* A host can size the picker with --codex-prop-chip and --codex-prop-words
     (the Codex page does past 2400px, beside cells that are 250px wide). */
  .prop-picker {
    --chip: var(--codex-prop-chip, 2.75rem);
    container-type: inline-size;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    max-width: 100%;
    min-width: 0;
    color: var(--ink, var(--theme-text));
  }

  /* Narrow (a side column, a phone): each section is its own small grid,
     the sections stacked with a hairline between. Wide: one line, the
     hairline standing upright between the sections. Nothing scrolls. */
  .families {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }
  .section {
    display: grid;
    grid-template-columns: repeat(var(--cols), var(--chip));
    justify-content: center;
    gap: 0.15rem;
  }
  .rule {
    width: min(9rem, 50%);
    height: 1px;
    background: color-mix(in srgb, currentColor 22%, transparent);
  }

  @container (min-width: 48rem) {
    .families {
      flex-direction: row;
      gap: 0.6rem;
    }
    .section {
      display: flex;
    }
    .rule {
      width: 1px;
      height: 1.4rem;
    }
  }

  .family {
    flex: none;
    display: grid;
    place-items: center;
    width: var(--chip);
    height: var(--chip);
    padding: 0;
    border: 1px solid transparent;
    border-radius: 999px;
    background: none;
    color: var(--ink-dim, var(--theme-text-dim));
    cursor: pointer;
    transition:
      color 160ms ease,
      border-color 160ms ease,
      background-color 160ms ease;
  }
  .family:hover {
    color: var(--ink, var(--theme-text));
  }
  .family[aria-pressed="true"] {
    color: var(--ink, var(--theme-text));
    border-color: color-mix(in srgb, currentColor 45%, transparent);
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  .family:focus-visible,
  .build:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 2px;
  }

  .glyph {
    width: 62%;
    height: 62%;
    background: currentColor;
    mask-size: contain;
    mask-position: center;
    mask-repeat: no-repeat;
    -webkit-mask-size: contain;
    -webkit-mask-position: center;
    -webkit-mask-repeat: no-repeat;
  }

  /* The builds read as a line of words, set in the guide's italic. Inline
     words in a balanced block, so a wrap splits the line evenly and never
     strands one build on a line of its own. */
  .builds {
    min-height: 2rem;
    text-align: center;
    text-wrap: balance;
    font-family: var(--guide-display, inherit);
    font-style: italic;
    font-size: var(--codex-prop-words, 1.05rem);
  }

  .build {
    display: inline-block;
    padding: 0.2rem 0.55rem;
    border: 0;
    border-radius: 6px;
    background: none;
    font: inherit;
    color: var(--ink-dim, var(--theme-text-dim));
    cursor: pointer;
    text-decoration: underline 1px transparent;
    text-underline-offset: 0.3em;
    transition:
      color 160ms ease,
      text-decoration-color 160ms ease;
  }
  .build:hover {
    color: var(--ink, var(--theme-text));
  }
  .build[aria-pressed="true"],
  .build.only {
    color: var(--ink, var(--theme-text));
    text-decoration-color: color-mix(in srgb, currentColor 55%, transparent);
  }
  .build.only {
    cursor: default;
  }

  /* A mouse needs no 44px row; keep the wrapped words close. */
  @media (pointer: fine) {
    .build {
      min-height: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .family,
    .build {
      transition: none;
    }
  }
</style>
