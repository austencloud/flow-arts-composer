<script lang="ts">
  import CategoryTile from "../CategoryTile.svelte";
  import type { GalleryWorkspaceProps } from "../gallery-workspace-types";

  type Props = Pick<
    GalleryWorkspaceProps,
    | "catalog"
    | "section"
    | "sheet"
    | "chooserTitle"
    | "chooserHint"
    | "chooserCategories"
    | "onSelectCategory"
  >;

  let {
    catalog,
    section,
    sheet,
    chooserTitle,
    chooserHint,
    chooserCategories = "all",
    onSelectCategory,
  }: Props = $props();

  const entries = $derived(
    chooserCategories === "secondary"
      ? catalog.secondaryCategories
      : [...catalog.primaryCategories, ...catalog.secondaryCategories]
  );
</script>

<!-- Refinement is already a focused "add a filter" task. Put every
         available category in one consistent canvas instead of making two
         categories privileged and hiding the rest behind More. -->
<div class="drill-screen screen-chooser">
  <header class="drill-head">
    <h2 tabindex="-1">
      {chooserTitle ??
        (sheet ? "Filter sequences" : "How do you want to browse?")}
    </h2>
    <p>
      {chooserHint ??
        (sheet
          ? "Counts update with your current filters."
          : "Pick one to narrow it down.")}
    </p>
  </header>
  <div class="unified-choice-grid">
    {#each entries as entry (entry.key)}
      <CategoryTile
        {entry}
        composition="unified"
        active={section === entry.section}
        avatarFor={(name) => catalog.creatorAvatars.get(name)}
        onselect={onSelectCategory}
      />
    {/each}
  </div>
</div>
