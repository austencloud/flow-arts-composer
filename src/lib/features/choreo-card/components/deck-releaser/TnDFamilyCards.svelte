<script lang="ts">
  /**
   * TnDFamilyCards — the six elemental family cards as a multi-select picker.
   * Extracted from ConfigureStep so every layout prototype (and the real screen)
   * shares one implementation. Elemental color is intentional here: it encodes
   * the element identity, the one place color carries meaning on this screen.
   */
  import type { TnDFamilyOption } from "../../services/deck-composer";
  import { TND_BY_FAMILY } from "../../domain/tnd-element";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";

  interface Props {
    families: TnDFamilyOption[];
    selected: Set<string>;
    /** Multiplier for the per-card count (selected turn-pattern count). */
    multiplier: number;
    onToggle: (familyId: string) => void;
    /** Cards-per-row; defaults to 3. Prototypes pass 2 for narrow rails. */
    columns?: number;
    /** When provided, renders an All / None control above the grid. */
    onSelectAll?: () => void;
    onClear?: () => void;
  }

  const {
    families,
    selected,
    multiplier,
    onToggle,
    columns = 2,
    onSelectAll,
    onClear,
  }: Props = $props();

  /**
   * Display order: row = motion family (Split → Tog → Quarter), column =
   * direction (Same → Opp). With two columns this lays each family's Same|Opp
   * pair side by side, all Same in the left column, all Opp in the right.
   */
  function familyRank(id: string): number {
    const family = id.startsWith("split") ? 0 : id.startsWith("tog") ? 1 : 2;
    const direction = id.includes("opp") ? 1 : 0;
    return family * 2 + direction;
  }
  const ordered = $derived(
    [...families].sort(
      (a, b) => familyRank(a.familyId) - familyRank(b.familyId)
    )
  );
</script>

<div class="family-cards">
  {#if onSelectAll || onClear}
    <div class="bulk-row">
      {#if onSelectAll}<FilterChipBase
          label="All"
          icon="fas fa-check-double"
          mode="action"
          onclick={onSelectAll}
        />{/if}
      {#if onClear}<FilterChipBase
          label="None"
          icon="fas fa-xmark"
          mode="action"
          chipColor="var(--semantic-error)"
          onclick={onClear}
        />{/if}
    </div>
  {/if}
  <div class="cards-mid">
    <div class="grid" style="--cols: {columns}">
      {#each ordered as fam (fam.familyId)}
        {@const el = TND_BY_FAMILY[fam.familyId]}
        <button
          type="button"
          class="family-btn"
          class:selected={selected.has(fam.familyId)}
          style="--accent: {el?.accentColor ?? 'var(--theme-accent, #b763cd)'};"
          onclick={() => onToggle(fam.familyId)}
        >
          {#if el}
            <img
              src={el.iconPath}
              alt="{el.element} element"
              class="family-icon"
              width="36"
              height="36"
            />
          {/if}
          <span class="family-name">{fam.label}</span>
          <span class="family-count"
            >{fam.sequenceCount * multiplier} cards</span
          >
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  /* Two rows: All/None pinned top · cards centred in the slack below. Frames the
     column whitespace above-and-below the cluster so it reads as deliberate
     matting rather than trailing empty space. */
  .family-cards {
    display: grid;
    grid-template-rows: auto 1fr;
    justify-items: center;
    gap: 12px;
    height: 100%;
    min-height: 0;
  }

  .bulk-row {
    display: flex;
    gap: 6px;
    justify-content: center;
  }

  .cards-mid {
    display: flex;
    align-self: center;
    width: 100%;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr));
    gap: 12px;
    width: 100%;
  }

  .family-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-height: 112px;
    padding: 16px 12px;
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--accent) 8%,
        var(--theme-card-bg, rgba(255, 255, 255, 0.04))
      ),
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    border: 1.5px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: 12px;
    color: var(--theme-text, #fff);
    cursor: pointer;
    transition:
      transform var(--transition-spring),
      box-shadow var(--transition-fast),
      border-color var(--transition-fast),
      background var(--transition-fast);
  }

  .family-btn:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
    box-shadow: 0 4px 16px color-mix(in srgb, var(--accent) 25%, transparent);
  }

  .family-btn.selected {
    transform: translateY(-1px) scale(1.01);
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--accent) 24%,
        var(--theme-card-bg, rgba(255, 255, 255, 0.04))
      ),
      color-mix(
        in srgb,
        var(--accent) 8%,
        var(--theme-card-bg, rgba(255, 255, 255, 0.04))
      )
    );
    border-color: color-mix(in srgb, var(--accent) 70%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--accent) 45%, transparent);
  }

  .family-btn:active {
    transform: scale(0.98);
  }

  .family-icon {
    width: 44px;
    height: 44px;
    object-fit: contain;
    opacity: 0.55;
    transition: opacity var(--transition-fast);
  }

  .family-btn:hover .family-icon,
  .family-btn.selected .family-icon {
    opacity: 1;
  }

  .family-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--accent);
  }

  .family-count {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  @media (prefers-reduced-motion: reduce) {
    .family-btn {
      transition: none;
    }
    .family-btn:hover {
      transform: none;
    }
  }
</style>
