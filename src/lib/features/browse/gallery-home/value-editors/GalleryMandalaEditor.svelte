<!--
  GalleryMandalaEditor: the mandala screen.

  One box per distinct mandala the pool draws, sparse to dense, under the
  three band headings the Mandala sort uses. The heading stays put and the
  bands pan inside their own area; while the pool is still being measured the
  hint counts it off and boxes slot in as their key arrives. Tapping a box
  applies the Mandala filter, and the host shows the sequences that draw it.
  Spec: docs/superpowers/specs/2026-10-20-mandala-browse-design.md.
-->
<script lang="ts">
  import { flip } from "svelte/animate";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { arrive, flipDuration, leave } from "#lib/shared/transitions/motion.js";
  import MandalaStill from "#lib/shared/mandala/components/MandalaStill.svelte";
  import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
  import {
    DENSITY_BANDS,
    formatDensity,
    formatMandalaLabel,
  } from "#lib/shared/browse/services/sequence-density.js";
  import type { MandalaGroup } from "#lib/shared/browse/services/mandala-index.svelte.js";
  import type {
    GalleryValueHeadSnippet,
    GalleryWorkspaceProps,
  } from "../gallery-workspace-types";

  type Props = Pick<
    GalleryWorkspaceProps,
    "catalog" | "stackHint" | "isValueApplied" | "onPickValue"
  > & { valueHead: GalleryValueHeadSnippet };

  let { catalog, stackHint, isValueApplied, onPickValue, valueHead }: Props =
    $props();

  /** The box's nominal width in pixels; the still's lines are weighted for it. */
  const BOX_PX = 128;

  const bands = $derived(
    DENSITY_BANDS.map((band) => ({
      band,
      groups: catalog.mandalaGroups.filter((group) => group.band.id === band.id),
    })).filter((entry) => entry.groups.length > 0)
  );

  const hint = $derived(
    catalog.mandalaDone
      ? stackHint
      : t("browse_ui_measuring_mandalas", {
          measured: catalog.mandalaProgress.measured,
          total: catalog.mandalaProgress.total,
        })
  );

  function countLabel(count: number): string {
    return count === 1
      ? t("browse_ui_mandala_one_sequence")
      : t("browse_ui_mandala_sequences", { count });
  }

  function boxName(group: MandalaGroup): string {
    return t("browse_ui_mandala_box_name", {
      label: group.band.label,
      coverage: formatDensity(group.coverage),
      count: countLabel(group.sequences.length),
    });
  }

  function applied(group: MandalaGroup): boolean {
    return isValueApplied?.(BrowseFilterType.MANDALA, group.key) ?? false;
  }
</script>

<div class="drill-screen screen-mandala">
  {@render valueHead(t("browse_audit_pick_mandala"), hint)}
  <div class="mandala-bands" aria-busy={!catalog.mandalaDone}>
    {#each bands as entry (entry.band.id)}
      <section class="mandala-band">
        <h3 class="band-head">
          <span>{entry.band.label}</span>
          <span class="band-count">{entry.groups.length}</span>
        </h3>
        <div class="mandala-grid">
          {#each entry.groups as group, i (group.key)}
            {@const isApplied = applied(group)}
            <button
              class="mandala-box"
              class:value-applied={isApplied}
              type="button"
              aria-label={boxName(group)}
              title={formatMandalaLabel(group.coverage)}
              aria-pressed={isValueApplied ? isApplied : undefined}
              animate:flip={{ duration: flipDuration() }}
              in:arrive={{ index: i }}
              out:leave
              onclick={() =>
                onPickValue(
                  BrowseFilterType.MANDALA,
                  group.key,
                  formatMandalaLabel(group.coverage)
                )}
            >
              <MandalaStill key={group.key} paths={group.paths} size={BOX_PX} />
              <span class="mandala-count">{group.sequences.length}</span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</div>

<style>
  /* The heading stays fixed; the bands are the one thing that pans. */
  .screen-mandala {
    justify-content: flex-start;
    overflow: hidden;
  }
  .mandala-bands {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding-bottom: 0.5rem;
  }
  .mandala-band {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .band-head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin: 0;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--theme-text-muted, #9aa6b8);
  }
  .band-count {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    opacity: 0.8;
  }
  .mandala-grid {
    position: relative;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 0.6rem;
  }
  .mandala-box {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 1;
    padding: 0.35rem;
    border-radius: 16px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #e8edf6);
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
  }
  .mandala-box:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    transform: translateY(-1px);
  }
  .mandala-box:active {
    transform: scale(0.985);
  }
  .mandala-box:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
  /* The applied box wears the accent ring the other single-select editors use. */
  .mandala-box.value-applied {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 70%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 22%,
      transparent
    );
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--theme-accent, #6366f1) 55%, transparent);
  }
  .mandala-count {
    position: absolute;
    right: 0.4rem;
    bottom: 0.4rem;
    min-width: 1.5rem;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    background: var(--theme-panel-bg, #11131a);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    font-size: 0.78rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: center;
    line-height: 1.3;
  }

  @media (prefers-reduced-motion: reduce) {
    .mandala-box {
      transition: none;
    }
    .mandala-box:hover,
    .mandala-box:active {
      transform: none;
    }
  }

  @container drill (min-width: 640px) and (max-width: 899.98px) {
    .mandala-bands {
      max-width: 560px;
      align-self: center;
    }
  }
  @container drill (min-width: 900px) {
    .mandala-bands {
      max-width: 960px;
      align-self: center;
    }
    .mandala-grid {
      grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
      gap: 0.8rem;
    }
  }
  @container drill (min-width: 1600px) {
    .mandala-bands {
      max-width: 1400px;
    }
    .mandala-grid {
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 1rem;
    }
  }
</style>
