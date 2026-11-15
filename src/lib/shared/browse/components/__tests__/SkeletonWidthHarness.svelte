<script lang="ts">
  import BrowseThumbnailSkeleton from "../BrowseThumbnailSkeleton.svelte";

  const {
    width,
    count,
    columns,
    stepCounts = null,
  }: {
    width: number;
    count: number;
    columns: number;
    stepCounts?: readonly number[] | null;
  } = $props();
</script>

<!-- A fixed content width, as BrowsePanel's grid area gives the grid. -->
<div data-testid="host" style:width="{width}px">
  <BrowseThumbnailSkeleton {count} pinchColumnOverride={columns} {stepCounts} />
</div>
