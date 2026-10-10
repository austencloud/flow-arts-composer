<script lang="ts">
  import type { MandalaPalette } from "#lib/shared/mandala/domain/mandala-types.js";
  import {
    DARK_MOTION_BLUE_FILL,
    DARK_MOTION_BLUE_STROKE,
    DARK_MOTION_PURPLE_FILL,
    DARK_MOTION_PURPLE_STROKE,
    DARK_MOTION_RED_FILL,
    DARK_MOTION_RED_STROKE,
  } from "#lib/shared/mandala/domain/mandala-constants.js";
  import { renderMandalaSVG } from "#lib/shared/mandala/services/mandala-renderer.js";
  import type {
    CatalogShapeGroup,
    CatalogShapeMember,
  } from "../../services/catalog-shape-index";

  interface Props {
    groups?: CatalogShapeGroup[];
    group?: CatalogShapeGroup;
    scanProgress?: string;
    copyCount(member: CatalogShapeMember): number;
    onOpenGroup(group: CatalogShapeGroup): void;
    onInspect(group: CatalogShapeGroup, memberIndex: number): void;
    onAdd(member: CatalogShapeMember): void;
  }

  let {
    groups = [],
    group,
    scanProgress = "",
    copyCount,
    onOpenGroup,
    onInspect,
    onAdd,
  }: Props = $props();

  const MONO_PALETTE: MandalaPalette = {
    leftStroke: "#c0b8e8",
    leftFill: "rgba(192, 184, 232, 0.1)",
    rightStroke: "#c0b8e8",
    rightFill: "rgba(192, 184, 232, 0.1)",
    purpleStroke: "#c0b8e8",
    purpleFill: "rgba(192, 184, 232, 0.1)",
  };

  const COLOR_PALETTE: MandalaPalette = {
    leftStroke: DARK_MOTION_BLUE_STROKE,
    leftFill: DARK_MOTION_BLUE_FILL,
    rightStroke: DARK_MOTION_RED_STROKE,
    rightFill: DARK_MOTION_RED_FILL,
    purpleStroke: DARK_MOTION_PURPLE_STROKE,
    purpleFill: DARK_MOTION_PURPLE_FILL,
  };

  const svgCache = new Map<string, string>();

  function renderMember(
    member: CatalogShapeMember,
    representative: boolean
  ): string {
    const key = [
      representative ? "group" : "member",
      member.scope,
      member.key,
      member.sequence.id,
      member.prop ?? "pair",
    ].join(":");
    const cached = svgCache.get(key);
    if (cached) return cached;

    const svg = renderMandalaSVG(member.previewPaths, {
      size: 300,
      style: "stroke",
      show: "both",
      strokeWidth: 2.5,
      palette:
        representative || member.scope === "solo"
          ? MONO_PALETTE
          : COLOR_PALETTE,
    });
    svgCache.set(key, svg);
    return svg;
  }
</script>

<div class="gallery" aria-busy={Boolean(scanProgress)}>
  {#if group}
    <div class="grid">
      {#each group.members as member, index (`${member.sequence.id}-${member.prop ?? "pair"}`)}
        <article class="tile">
          <button
            class="inspect"
            type="button"
            onclick={() => onInspect(group, index)}
          >
            <div class="art">{@html renderMember(member, false)}</div>
            <span class="name">{member.word}</span>
            <span class="meta">
              {member.scope === "solo"
                ? `${member.prop ?? "solo"} path`
                : "combined"}
            </span>
          </button>
          <button class="add" type="button" onclick={() => onAdd(member)}>
            <i class="fas fa-plus" aria-hidden="true"></i>
            Add
            {#if copyCount(member) > 0}
              <span>{copyCount(member)}</span>
            {/if}
          </button>
        </article>
      {/each}
    </div>
  {:else if groups.length > 0}
    <div class="grid">
      {#each groups as shape (shape.key)}
        <button
          class="group tile"
          type="button"
          onclick={() => onOpenGroup(shape)}
        >
          <div class="art">
            {@html renderMember(shape.representative, true)}
          </div>
          <span class="name">
            {shape.members.length === 1
              ? shape.representative.word
              : `${shape.members.length} variants`}
          </span>
          <span class="meta">
            {shape.scope === "solo" ? "solo orbit" : "combined shape"}
          </span>
          {#if shape.members.length > 1}
            <span class="badge">{shape.members.length}</span>
          {/if}
        </button>
      {/each}
    </div>
  {:else if scanProgress}
    <div class="skeleton-grid" aria-label="Loading shapes">
      {#each Array(8) as _}
        <div class="skeleton"></div>
      {/each}
    </div>
  {:else}
    <div class="empty">
      <i class="fas fa-shapes" aria-hidden="true"></i>
      <p>No shapes found in this catalog.</p>
    </div>
  {/if}
</div>

<style>
  .gallery {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--spacing-md);
    container-type: inline-size;
    scrollbar-width: thin;
    scrollbar-color: var(--theme-stroke, rgba(255, 255, 255, 0.14)) transparent;
  }

  .grid,
  .skeleton-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--spacing-sm);
    align-content: start;
  }

  .tile {
    position: relative;
    min-width: 0;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: var(--radius-2026-sm);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.035));
    color: var(--theme-text, white);
    overflow: hidden;
  }

  .group,
  .inspect {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    padding: var(--spacing-sm);
    border: none;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .group {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .tile:hover,
  .tile:focus-visible,
  .inspect:focus-visible {
    border-color: var(--theme-accent, #a78bfa);
    outline: none;
  }

  .inspect:focus-visible {
    box-shadow: inset 0 0 0 2px var(--theme-accent, #a78bfa);
  }

  .art {
    width: 100%;
    aspect-ratio: 1;
    border-radius: calc(var(--radius-2026-sm) - 2px);
    background: rgba(0, 0, 0, 0.08);
    overflow: hidden;
  }

  .art :global(svg) {
    width: 100%;
    height: 100%;
  }

  .name {
    margin-top: var(--spacing-sm);
    overflow: hidden;
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    margin-top: var(--spacing-xs);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: var(--font-size-compact, 12px);
  }

  .add {
    width: calc(100% - 2 * var(--spacing-sm));
    min-height: var(--min-touch-target);
    margin: 0 var(--spacing-sm) var(--spacing-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-2026-sm);
    background: rgba(168, 85, 246, 0.12);
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
  }

  .add span,
  .badge {
    min-width: 1.5rem;
    height: 1.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--spacing-xs);
    border-radius: 999px;
    background: rgba(168, 85, 246, 0.28);
    color: white;
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
  }

  .badge {
    position: absolute;
    top: var(--spacing-sm);
    right: var(--spacing-sm);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.16));
    background: var(--theme-overlay-strong, rgba(0, 0, 0, 0.68));
  }

  .skeleton {
    aspect-ratio: 1;
    border-radius: var(--radius-2026-sm);
    background: linear-gradient(
      110deg,
      var(--theme-card-bg, rgba(255, 255, 255, 0.035)) 25%,
      rgba(168, 85, 246, 0.09) 38%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.035)) 52%
    );
    background-size: 200% 100%;
    animation: shimmer 1.6s ease-in-out infinite;
  }

  .empty {
    min-height: 16rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  .empty i {
    font-size: 2rem;
  }

  .empty p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
  }

  @keyframes shimmer {
    to {
      background-position-x: -200%;
    }
  }

  @container (min-width: 42rem) {
    .grid,
    .skeleton-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @container (min-width: 64rem) {
    .grid,
    .skeleton-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @container (min-width: 86rem) {
    .grid,
    .skeleton-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  @container (min-width: 112rem) {
    .grid,
    .skeleton-grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }

  @container (min-width: 150rem) {
    .grid,
    .skeleton-grid {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
    }
  }
</style>
