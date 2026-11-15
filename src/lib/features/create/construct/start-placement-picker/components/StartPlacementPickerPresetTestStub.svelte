<script lang="ts">
  type Tile = { id?: string };
  let {
    pictographDataSet = [],
    onPictographSelect = () => {},
    layout = "presets",
  }: {
    pictographDataSet?: Tile[];
    onPictographSelect?: (tile: Tile) => void;
    layout?: string;
  } = $props();
</script>

<div data-testid="preset-path" data-layout={layout}>
  {#each pictographDataSet as tile, index (tile.id ?? index)}
    <button
      type="button"
      data-testid="start-tile"
      onclick={() => onPictographSelect(tile)}>{tile.id ?? index}</button
    >
  {/each}
</div>
