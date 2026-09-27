<!--
  The fixed navigation shell for the desktop Your Work rail.

  The shelf tabs stay visible while only the selected shelf's cards scroll.
  Accounts with hundreds of collections can therefore reach Visuals, videos, and
  the TKA decks without crossing the collection list first. The caller keeps
  ownership of the cards and their navigation; this component only presents
  the shelf choice and its active panel.
-->
<script module lang="ts">
  export type WorkShelfId =
    | "collections"
    | "art"
    | "performances"
    | "core"
    | "shared";
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";

  interface ShelfDefinition {
    label: string;
    shortLabel: string;
    description: string;
    icon: string;
  }

  interface Props {
    value: WorkShelfId;
    sharedAvailable: boolean;
    onchange: (shelfId: WorkShelfId) => void;
    content: Snippet<[WorkShelfId]>;
  }

  let { value, sharedAvailable, onchange, content }: Props = $props();

  const shelves: Record<WorkShelfId, ShelfDefinition> = {
    collections: {
      label: "My Collections",
      shortLabel: "Saved",
      description: "All saved sequences and the collections you build.",
      icon: "fa-folder",
    },
    art: {
      label: "Visuals",
      shortLabel: "Visuals",
      description: "Your tunnels, 3D scenes, and mandalas.",
      icon: "fa-palette",
    },
    performances: {
      label: "Performances",
      shortLabel: "Videos",
      description: "Your uploads and collaboration invites.",
      icon: "fa-video",
    },
    core: {
      label: "TKA Core",
      shortLabel: "Core",
      description: "The founding TKA decks.",
      icon: "fa-book-open",
    },
    shared: {
      label: "Shared",
      shortLabel: "More",
      description:
        "Collections people shared with you, plus the ones you follow.",
      icon: "fa-user-group",
    },
  };

  const shelfIds = Object.keys(shelves) as WorkShelfId[];
  const options = $derived(
    shelfIds.map((shelfId) => ({
      value: shelfId,
      label: shelves[shelfId].label,
      id: `work-shelf-tab-${shelfId}`,
      controls: `work-shelf-panel-${shelfId}`,
      disabled: shelfId === "shared" && !sharedAvailable,
      ariaLabel:
        shelfId === "shared" && !sharedAvailable
          ? `${shelves[shelfId].shortLabel}, ${shelves[shelfId].label}, no collections yet`
          : shelves[shelfId].shortLabel === shelves[shelfId].label
            ? shelves[shelfId].label
            : `${shelves[shelfId].shortLabel}, ${shelves[shelfId].label}`,
    }))
  );
</script>

{#snippet tabContent(shelfId: WorkShelfId)}
  <span class="shelf-tab-content">
    <i class="fas {shelves[shelfId].icon}" aria-hidden="true"></i>
    <span>{shelves[shelfId].shortLabel}</span>
  </span>
{/snippet}

<header class="rail-header">
  <div class="title-row">
    <h2>{t("browse_ui_you")}</h2>
  </div>
  <SegmentedControl
    {options}
    {value}
    {onchange}
    color="accent"
    density="tight"
    semantics="tabs"
    ariaLabel="Choose a library shelf"
    optionContent={tabContent}
  />
</header>

<div
  class="shelf-panel"
  id="work-shelf-panel-{value}"
  role="tabpanel"
  aria-labelledby="work-shelf-tab-{value}"
>
  {#if value !== "collections"}
    <header class="shelf-panel-header">
      <h3>{shelves[value].label}</h3>
      <p>{shelves[value].description}</p>
    </header>
  {/if}

  {@render content(value)}
</div>

<style>
  .rail-header {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: clamp(12px, 1.8cqi, 20px);
    border-bottom: 1px solid var(--theme-stroke);
    background: transparent;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .title-row h2 {
    margin: 0;
    color: var(--theme-text);
    font-size: clamp(17px, 2.6cqi, 22px);
    font-weight: 700;
  }

  .shelf-tab-content {
    display: grid;
    justify-items: center;
    gap: 3px;
    min-width: 0;
  }

  .shelf-tab-content i {
    font-size: 13px;
  }

  .shelf-tab-content span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shelf-panel {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    scrollbar-gutter: stable;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: clamp(14px, 1.8cqi, 24px);
  }

  .shelf-panel-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .shelf-panel-header h3 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-sm, 14px);
    font-weight: 700;
  }

  .shelf-panel-header p {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
  }
</style>
