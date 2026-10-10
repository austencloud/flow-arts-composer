<!--
  The shelf switch above the catalog: All, then one chip per shelf that actually
  has products, each carrying its count.

  Exactly one shelf is showing at any moment, which is what SegmentedControl is
  for — a row of independent toggles could represent "Decks and Books at once",
  a state this filter does not have, and would lose the sliding indicator.

  It is a radiogroup, not a tablist. Tabs promise a tabpanel per tab; this is
  one grid that re-filters, which is what every other filter row in the app
  (CreatorsPanel, the smart-collections filters) uses radiogroup for.

  It sticks under the site header so the shelf you picked stays reachable while
  you scroll the grid.
-->
<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { shelfRank, type CatalogEntry } from "../../domain/catalog-listings";
  import { shelfChipLabel } from "./front-door-catalog";

  interface Props {
    entries: readonly CatalogEntry[];
    /** "all" or a shelf label ("Deck", "Book", …). */
    value: string;
    onchange: (value: string) => void;
  }

  let { entries, value, onchange }: Props = $props();

  // Shelf order is a merchandising decision, not whatever order the catalog
  // happens to load in: the printed decks are the flagship shelf and lead, and
  // the bundle (a way to buy several of them) reads last.
  const shelves = $derived(
    [...new Set(entries.map((e) => e.shelf))].sort(
      (a, b) => shelfRank(a) - shelfRank(b)
    )
  );

  const options = $derived([
    {
      value: "all",
      label: "All",
      count: entries.length,
      id: "shop-shelf-all",
      ariaLabel: `All ${entries.length} ${entries.length === 1 ? "product" : "products"}`,
    },
    ...shelves.map((shelf) => {
      const count = entries.filter((e) => e.shelf === shelf).length;
      const label = shelfChipLabel(shelf);
      return {
        value: shelf,
        label,
        count,
        id: `shop-shelf-${shelf.toLowerCase()}`,
        ariaLabel: `${label}, ${count}`,
      };
    }),
  ]);
</script>

<div class="shelf-filter">
  <!-- The control fills its parent by design, so the parent is the one that
       decides how wide four short labels should be. Without this cap the row
       stretches the full content band and four words read as a progress bar. -->
  <div class="control-shell" style:--option-count={options.length}>
    <SegmentedControl
      {options}
      {value}
      {onchange}
      color="accent"
      semantics="radiogroup"
      ariaLabel="Filter the catalog by shelf"
    />
  </div>
</div>

<style>
  .shelf-filter {
    position: sticky;
    /* px: this clears the fixed-height SiteHeader, which does not ramp. */
    top: calc(64px + env(safe-area-inset-top, 0px));
    z-index: 20;
    display: flex;
    justify-content: center;
    padding: 0.75rem 0;
    /* No full-width bar: a strip of black spanning the whole content band to
       hold four short words is dead space. The control carries its own
       backdrop and floats over the grid instead. */
    background: transparent;
    pointer-events: none;
  }

  .control-shell {
    width: 100%;
    /* Room for the widest label plus its count, per option. */
    max-width: calc(var(--option-count, 4) * 9.5rem);
    pointer-events: auto;
    /* Opaque behind the control, which is translucent by design — without this
       the tiles scroll through it. */
    border-radius: 10px;
    background: var(--shop-filter-bg, rgba(8, 8, 18, 0.94));
    box-shadow: 0 0.75rem 2rem rgba(0, 0, 0, 0.45);
  }
</style>
