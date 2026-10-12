<!--
CustomizeOverview.svelte - the Customize panel's landing screen.

Three tiles, one per setting. Each tile draws a small picture of the screen it
opens: the Style tile shows where each of the three axes sits, and the two
placement tiles show the sixteen placements in the same order the picker lays
them out, lit when allowed and dim when blocked. The picture answers "what is
this set to" before the words do, and it tells a first-time reader what the
screen behind the tile is for.

The tiles replace the drill panel's plain text rows through its `listContent`
slot. Navigation still belongs to SettingsDrillPanel: a tile only reports which
setting was chosen.

Layout follows the panel, not the window. Under 34rem of panel width the tiles
stack with the picture beside the words and share the height between them;
from 34rem the three stand side by side with the picture on top. A wide but
short pane (a phone on its side gives the panel about 150px) keeps the three
columns and puts the picture back beside the words, so all three still fit.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    GridMode,
    type GridLocation,
    type GridPlacement,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { getGridLocationsFromPlacement } from "#lib/shared/pictograph/grid/services/grid-placement-deriver.js";
  import { getAllPlacements } from "../../shared/domain/start-placement-presets";
  import {
    GENERATION_DASH_OPTIONS,
    GENERATION_STYLE_OPTIONS,
  } from "#lib/shared/create/domain/generation-style-display.js";

  type CustomizeScreen = "style" | "startPos" | "endPos";
  type StyleAxis = "smooth" | "mixed" | "choppy";

  let {
    gridMode = GridMode.DIAMOND,
    constraintPreset,
    handPathMode,
    motionTypeFilter,
    styleValue,
    startBlocked,
    startValue,
    endAllowed,
    endValue,
    endLocked,
    onOpen,
  }: {
    gridMode?: GridMode;
    constraintPreset: StyleAxis;
    handPathMode: StyleAxis;
    motionTypeFilter: "no-dash" | "prefer-dash" | null;
    styleValue: string;
    /** Start placements the generator may NOT use. */
    startBlocked: readonly GridPlacement[];
    startValue: string;
    /** End placements the generator may use. Empty means any. */
    endAllowed: readonly GridPlacement[];
    endValue: string;
    /** LOOP decides where a sequence ends, so the tile explains and stays put. */
    endLocked: boolean;
    onOpen: (screen: CustomizeScreen) => void;
  } = $props();

  // Where each axis sits on its three-stop track, read from the same option
  // lists the Style screen draws its buttons from, so the order and the
  // words always match what the tile opens.
  function axisReading(
    options: readonly { value: string; label: string }[],
    value: string
  ) {
    const stop = Math.max(
      0,
      options.findIndex((o) => o.value === value)
    );
    return { stop, word: options[stop]?.label ?? "" };
  }

  const styleAxes = $derived([
    {
      id: "props",
      name: t("create_ui_props"),
      ...axisReading(GENERATION_STYLE_OPTIONS, constraintPreset),
    },
    {
      id: "hands",
      name: t("create_ui_hands"),
      ...axisReading(GENERATION_STYLE_OPTIONS, handPathMode),
    },
    {
      id: "dashes",
      name: t("create_ui_dashes"),
      ...axisReading(GENERATION_DASH_OPTIONS, motionTypeFilter ?? "mixed"),
    },
  ]);

  // Point on a 24-unit cell for each hand location. Diamond grids use the four
  // compass points, box grids the four corners, so the same map serves both.
  const R = 7.5;
  const D = R * Math.SQRT1_2;
  const POINT: Record<GridLocation, [number, number]> = {
    n: [12, 12 - R],
    e: [12 + R, 12],
    s: [12, 12 + R],
    w: [12 - R, 12],
    ne: [12 + D, 12 - D],
    se: [12 + D, 12 + D],
    sw: [12 - D, 12 + D],
    nw: [12 - D, 12 - D],
    c: [12, 12],
  };

  const gridOutline = $derived(
    gridMode === GridMode.BOX
      ? [POINT.nw, POINT.ne, POINT.se, POINT.sw]
      : [POINT.n, POINT.e, POINT.s, POINT.w]
  );
  const outlinePoints = $derived(gridOutline.map((p) => p.join(",")).join(" "));

  // Both hands on one point (the beta placements) would draw one dot over the
  // other. Nudge them apart along the grid's edge so both colors still show.
  function handDots(placement: GridPlacement) {
    const [left, right] = getGridLocationsFromPlacement(placement);
    const a = POINT[left];
    const b = POINT[right];
    if (left !== right) return { blue: a, red: b };
    const dx = a[0] - 12;
    const dy = a[1] - 12;
    const len = Math.hypot(dx, dy) || 1;
    const tx = (-dy / len) * 2.6;
    const ty = (dx / len) * 2.6;
    return {
      blue: [a[0] - tx, a[1] - ty] as [number, number],
      red: [a[0] + tx, a[1] + ty] as [number, number],
    };
  }

  const placements = $derived(
    getAllPlacements(gridMode).map((placement) => ({
      placement,
      ...handDots(placement),
    }))
  );

  const startBlockedSet = $derived(new Set(startBlocked));
  const endAllowedSet = $derived(new Set(endAllowed));

  function startOn(p: GridPlacement) {
    return !startBlockedSet.has(p);
  }

  function endOn(p: GridPlacement) {
    return endAllowedSet.size === 0 || endAllowedSet.has(p);
  }
</script>

{#snippet chevron()}
  <svg
    class="tile-chevron"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    aria-hidden="true"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
{/snippet}

{#snippet lock()}
  <svg
    class="tile-lock"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      d="M12 17a2 2 0 002-2v-2a2 2 0 00-4 0v2a2 2 0 002 2zm6-9h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zM8.9 6a3.1 3.1 0 016.2 0v2H8.9V6z"
    />
  </svg>
{/snippet}

{#snippet placementMap(isOn: (p: GridPlacement) => boolean)}
  <span class="placement-map" aria-hidden="true">
    {#each placements as cell (cell.placement)}
      <svg class="map-cell" class:on={isOn(cell.placement)} viewBox="0 0 24 24">
        <polygon class="map-grid" points={outlinePoints} />
        <circle
          class="map-dot blue"
          cx={cell.blue[0]}
          cy={cell.blue[1]}
          r="2.6"
        />
        <circle class="map-dot red" cx={cell.red[0]} cy={cell.red[1]} r="2.6" />
      </svg>
    {/each}
  </span>
{/snippet}

<div class="customize-overview drill-grow">
  <div class="overview-body">
    <div class="tiles">
      <button class="tile" type="button" onclick={() => onOpen("style")}>
        <span class="tile-art style-art" aria-hidden="true">
          {#each styleAxes as axis (axis.id)}
            <span class="axis">
              <span class="axis-head">
                <span class="axis-name">{axis.name}</span>
                <span class="axis-word">{axis.word}</span>
              </span>
              <span class="axis-track" style:--stop={axis.stop}>
                <span class="axis-stop"></span>
                <span class="axis-stop"></span>
                <span class="axis-stop"></span>
                <span class="axis-thumb"></span>
              </span>
            </span>
          {/each}
        </span>
        <span class="tile-text">
          <span class="tile-name">{t("create_ui_style_label")}</span>
          <span class="tile-value">{styleValue}</span>
        </span>
        {@render chevron()}
      </button>

      <button class="tile" type="button" onclick={() => onOpen("startPos")}>
        <span class="tile-art">{@render placementMap(startOn)}</span>
        <span class="tile-text">
          <span class="tile-name">{t("create_ui_start_placement_label")}</span>
          <span class="tile-value">{startValue}</span>
        </span>
        {@render chevron()}
      </button>

      <!-- Locked rather than removed: dropping the tile would shift the layout
         and leave someone who saw the setting once with no explanation. It
         stays focusable so a screen reader still hears why. -->
      <button
        class="tile"
        class:locked={endLocked}
        type="button"
        aria-disabled={endLocked}
        onclick={() => {
          if (!endLocked) onOpen("endPos");
        }}
      >
        <span class="tile-art">{@render placementMap(endOn)}</span>
        <span class="tile-text">
          <span class="tile-name">{t("create_ui_end_placement_label")}</span>
          {#if endLocked}
            <span class="tile-value locked-reason">
              {@render lock()}
              {t("create_ui_set_by_loop")}
            </span>
          {:else}
            <span class="tile-value">{endValue}</span>
          {/if}
        </span>
        {#if !endLocked}
          {@render chevron()}
        {/if}
      </button>
    </div>

    <!-- These settings persist across sessions, which is what made a saved
       Choppy props value look like a broken generator. -->
    <p class="overview-note">{t("create_deep_settings_persist_note")}</p>
  </div>
</div>

<style>
  .customize-overview {
    /* Size containment, so the layout can ask about height too. The overview
       still fills the drill body (it is a .drill-grow child), and if its tiles
       ever need more than that, they overflow into the body's scroller. A
       container cannot restyle itself, so the layout lives one level in. */
    container: customize-overview / size;
  }

  .overview-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 100%;
  }

  /* Stacked: three rows share the height so a tall phone is not three short
     strips over a void, capped so a tall tablet column does not turn them into
     slabs. */
  .tiles {
    flex: 1 0 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.625rem;
  }

  .tile {
    flex: 1 1 0;
    max-height: 11rem;
    min-height: 9rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
    padding: 0.75rem 0.875rem 0.75rem 0.75rem;
    background: color-mix(in srgb, var(--theme-text, white) 6%, transparent);
    border: 1px solid
      color-mix(in srgb, var(--theme-text, white) 12%, transparent);
    border-radius: 1rem;
    color: var(--theme-text, white);
    font: inherit;
    text-align: start;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition:
      background-color var(--duration-fast) ease,
      border-color var(--duration-fast) ease,
      transform var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .tile:not(.locked):hover {
      background: color-mix(in srgb, var(--theme-text, white) 10%, transparent);
      border-color: color-mix(
        in srgb,
        var(--customize-accent, var(--theme-accent)) 55%,
        transparent
      );
    }
  }

  .tile:not(.locked):active {
    transform: scale(0.98);
    transition-duration: var(--duration-instant);
  }

  .tile:focus-visible {
    outline: 2px solid var(--theme-text, white);
    outline-offset: 2px;
  }

  .tile.locked {
    cursor: default;
  }

  .tile.locked .tile-art {
    opacity: 0.45;
  }

  /* The picture's well. Tinted with the panel accent so the art reads as part
     of this surface rather than a hole cut through it. */
  .tile-art {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 7.5rem;
    aspect-ratio: 1;
    padding: 0.5rem;
    border-radius: 0.75rem;
    background: color-mix(
      in srgb,
      var(--customize-accent, var(--theme-accent)) 14%,
      transparent
    );
    box-shadow: inset 0 0 0 1px
      color-mix(
        in srgb,
        var(--customize-accent, var(--theme-accent)) 22%,
        transparent
      );
  }

  .tile-text {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .tile-name {
    font-size: var(--font-size-base, 1rem);
    font-weight: 600;
    line-height: 1.25;
  }

  .tile-value {
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.35;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    overflow-wrap: anywhere;
  }

  .locked-reason {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
  }

  .tile-lock {
    flex: 0 0 auto;
    width: 0.875rem;
    height: 0.875rem;
  }

  .tile-chevron {
    flex: 0 0 auto;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  /* ── Style readout: three tracks, one stop lit per axis ── */
  .style-art {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.5rem;
    padding-inline: 0.625rem;
  }

  .axis {
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
    width: 100%;
  }

  .axis-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.375rem;
    min-width: 0;
  }

  .axis-word {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    line-height: 1;
    color: var(--theme-text, white);
    white-space: nowrap;
  }

  .axis-name {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    line-height: 1;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .axis-track {
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 0.625rem;
  }

  .axis-track::before {
    content: "";
    position: absolute;
    inset-inline: 0.25rem;
    top: 50%;
    height: 2px;
    translate: 0 -50%;
    border-radius: 1px;
    background: color-mix(in srgb, var(--theme-text, white) 22%, transparent);
  }

  .axis-stop {
    position: relative;
    width: 0.375rem;
    height: 0.375rem;
    margin-inline: 0.0625rem;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-text, white) 35%, transparent);
  }

  /* Positioned on the same three stops the dots sit on: the track is the
     thumb's width short of full, divided into two equal spans. */
  .axis-thumb {
    position: absolute;
    top: 50%;
    left: calc((100% - 0.625rem) * var(--stop) / 2);
    width: 0.625rem;
    height: 0.625rem;
    translate: 0 -50%;
    border-radius: 50%;
    background: var(--theme-text, white);
    box-shadow: 0 0 0 2px
      color-mix(
        in srgb,
        var(--customize-accent, var(--theme-accent)) 70%,
        transparent
      );
  }

  /* ── Placement map: the picker's sixteen cells in its own order ── */
  .placement-map {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 2px;
    width: 100%;
    height: 100%;
  }

  .map-cell {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 3px;
  }

  .map-grid {
    fill: none;
    stroke: color-mix(in srgb, var(--theme-text, white) 22%, transparent);
    stroke-width: 1.25;
    stroke-linejoin: round;
  }

  .map-dot {
    fill: color-mix(in srgb, var(--theme-text, white) 28%, transparent);
  }

  .map-cell.on {
    background: color-mix(in srgb, var(--theme-text, white) 10%, transparent);
  }

  .map-cell.on .map-grid {
    stroke: color-mix(in srgb, var(--theme-text, white) 45%, transparent);
  }

  .map-cell.on .map-dot.blue {
    fill: var(--dm-motion-blue, #3575e2);
  }

  .map-cell.on .map-dot.red {
    fill: var(--dm-motion-red, #ed1c24);
  }

  .overview-note {
    flex: 0 0 auto;
    margin: 0;
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.4;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    text-align: center;
  }

  /* Side by side: the picture leads, the words sit under it with the chevron
     at their end. Capped so a 4K panel gets bigger pictures, not wider gaps. */
  @container customize-overview (min-width: 34rem) {
    .tiles {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      align-content: center;
      gap: 1rem;
      width: 100%;
      max-width: 60rem;
      margin-inline: auto;
    }

    .tile {
      max-height: none;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        "art art"
        "text chevron";
      align-items: center;
      row-gap: 0.875rem;
      column-gap: 0.5rem;
      padding: 0.875rem;
    }

    .tile-art {
      grid-area: art;
      width: 100%;
      padding: 0.75rem;
    }

    .tile-text {
      grid-area: text;
    }

    .tile-chevron {
      grid-area: chevron;
    }

    .style-art {
      gap: 1rem;
      padding-inline: 1rem;
    }

    .axis {
      gap: 0.375rem;
    }

    .axis-name,
    .axis-word {
      font-size: var(--font-size-sm, 0.875rem);
    }

    .placement-map {
      gap: 4px;
    }
  }

  /* Wide but short: three columns, picture beside the words. The style
     readout drops its value words here; the tile's own value line carries
     them. */
  @container customize-overview (min-width: 34rem) and (max-height: 24rem) {
    .overview-body {
      gap: 0.5rem;
    }

    .tiles {
      max-width: none;
      gap: 0.625rem;
    }

    .tile {
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas: "art text chevron";
      column-gap: 0.625rem;
      row-gap: 0;
      padding: 0.625rem;
    }

    .tile-art {
      width: 5rem;
      padding: 0.375rem;
    }

    .style-art {
      gap: 0.375rem;
      padding-inline: 0.5rem;
    }

    .axis {
      gap: 0.125rem;
    }

    .axis-word {
      display: none;
    }

    .axis-name {
      font-size: var(--font-size-compact, 0.75rem);
    }

    .placement-map {
      gap: 2px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tile {
      transition: none;
    }
  }
</style>
