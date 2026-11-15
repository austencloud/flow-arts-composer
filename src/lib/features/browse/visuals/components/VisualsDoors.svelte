<!--
  VisualsDoors.svelte — one door per visual type that has work, under (or
  beside) the stage. A door shows the type's name, how many pieces it holds,
  and a few of its stills: tunnels as up to two overlapped and slightly turned,
  mandalas as a two-by-two of four. With fewer pieces there are fewer stills,
  centred; never an empty slot. Pressing a door opens that type's wall.

  The stills are sized from the door's own art area (container units), so a
  door looks right at a phone's half-width and at a wide screen's column.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { PublicArtifactEnvelope } from "#lib/shared/artifact-revisions/domain/public-artifact.js";
  import type {
    PublishedVisualType,
    VisualTypeMeta,
  } from "../domain/visuals-types.js";
  import VisualStill from "./VisualStill.svelte";

  interface DoorGroup {
    readonly meta: VisualTypeMeta;
    readonly items: readonly PublicArtifactEnvelope[];
  }

  let {
    groups,
    onOpen,
  }: {
    groups: readonly DoorGroup[];
    onOpen: (route: PublishedVisualType) => void;
  } = $props();

  /** Tunnels show two stills, mandalas four. */
  function stillsFor(group: DoorGroup) {
    return group.items.slice(0, group.meta.artifactType === "tunnel" ? 2 : 4);
  }
</script>

<div class="doors">
  {#each groups as group (group.meta.route)}
    {@const stills = stillsFor(group)}
    <button
      type="button"
      class="door"
      onclick={() => onOpen(group.meta.route)}
    >
      <span
        class="art"
        data-kind={group.meta.artifactType}
        data-count={stills.length}
      >
        {#each stills as item, slot (item.artifactId)}
          <span class="still-slot slot-{slot}">
            <VisualStill src={item.posterUrl} kind={group.meta.artifactType} />
          </span>
        {/each}
      </span>
      <span class="label">
        <span class="name">{t(group.meta.labelKey)}</span>
        <span class="count">
          {t(
            group.items.length === 1
              ? "browse_visuals_pieces_one"
              : "browse_visuals_pieces_other",
            { count: group.items.length }
          )}
        </span>
      </span>
    </button>
  {/each}
</div>

<style>
  .doors {
    display: flex;
    gap: 12px;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .door {
    position: relative;
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 0;
    overflow: hidden;
    border-radius: 18px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--surface-panel-floor);
    color: var(--theme-text, #e8edf6);
    text-align: left;
    cursor: pointer;
    transition: border-color var(--duration-fast) var(--ease-standard);
  }

  @media (hover: hover) {
    .door:hover {
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.28));
    }

    .door:hover .art {
      --still-lift: 1.2;
    }
  }

  .door:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }

  /* The art area is a size container: every still is sized from it. */
  .art {
    --still-radius: 12px;
    position: relative;
    flex: 1;
    min-height: 0;
    container-type: size;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-content: center;
    justify-content: center;
    padding: 10px;
    box-sizing: border-box;
  }

  .still-slot {
    display: block;
    width: var(--s);
  }

  /* Tunnels: two overlapped and turned a little; one centred and straight. */
  .art[data-kind="tunnel"] {
    --s: min(84cqw, 92cqh);
    padding: 0;
  }

  .art[data-kind="tunnel"] .still-slot {
    position: absolute;
    left: calc(50% - var(--s) / 2);
    top: calc(50% - var(--s) / 2);
  }

  .art[data-kind="tunnel"][data-count="2"] {
    --s: min(48cqw, 72cqh);
  }

  .art[data-kind="tunnel"][data-count="2"] .slot-0 {
    left: calc(50% - var(--s) * 0.9);
    top: calc(50% - var(--s) * 0.62);
    transform: rotate(-8deg);
  }

  .art[data-kind="tunnel"][data-count="2"] .slot-1 {
    left: calc(50% - var(--s) * 0.1);
    top: calc(50% - var(--s) * 0.38);
    transform: rotate(7deg);
  }

  /* Mandalas: a two-by-two. Fewer stills wrap and centre; none is left empty. */
  .art[data-kind="mandala"][data-count="1"] {
    --s: min(78cqw, 92cqh);
  }

  .art[data-kind="mandala"][data-count="2"] {
    --s: min(46cqw, 90cqh);
  }

  .art[data-kind="mandala"][data-count="3"],
  .art[data-kind="mandala"][data-count="4"] {
    --s: min(46cqw, 45cqh);
  }

  .label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 14px 12px;
  }

  .name {
    font-size: var(--font-size-lg, 1.125rem);
    font-weight: 700;
    color: var(--theme-text, #fff);
  }

  .count {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, #9aa6b8);
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    .door {
      transition: none;
    }
  }
</style>
