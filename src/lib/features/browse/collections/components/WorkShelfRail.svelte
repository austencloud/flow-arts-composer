<!--
  The desktop You shelf selector and its active panel.

  The selector sits above the content area while only the selected shelf's cards scroll.
  Accounts with hundreds of collections can therefore reach Visuals, videos, and
  the TKA decks without crossing the collection list first. The caller keeps
  ownership of the cards and their navigation; this component only presents
  the shelf choice and its active panel. The caller places these two regions
  around either the full-width Drafts pane or the rail/detail split.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { Snippet } from "svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import BackToBrowseButton from "#lib/features/browse/shared/components/BackToBrowseButton.svelte";
  import type { WorkShelfId } from "../services/work-shelf-navigation.js";

  interface ShelfDefinition {
    label: string;
    shortLabel: string;
    description: string;
    icon: string;
  }

  interface Props {
    value: WorkShelfId;
    onchange: (shelfId: WorkShelfId) => void;
    content: Snippet<[WorkShelfId]>;
    region: "tabs" | "panel";
  }

  let { value, onchange, content, region }: Props = $props();

  const shelves = $derived<Record<WorkShelfId, ShelfDefinition>>({
    drafts: {
      label: "Drafts",
      shortLabel: "Drafts",
      description: "Unfinished sequences on this device",
      icon: "fa-pen-to-square",
    },
    collections: {
      label: t("browse_ui_my_collections"),
      shortLabel: t("browse_verified_saved"),
      description: t("browse_verified_collections_description"),
      icon: "fa-folder",
    },
    art: {
      label: t("browse_ui_visuals"),
      shortLabel: t("browse_ui_visuals"),
      description: t("browse_verified_visuals_description"),
      icon: "fa-palette",
    },
    performances: {
      label: t("browse_verified_performances"),
      shortLabel: t("browse_verified_videos"),
      description: t("browse_verified_performances_description"),
      icon: "fa-video",
    },
    core: {
      label: t("browse_verified_tka_core"),
      shortLabel: t("browse_verified_core"),
      description: t("browse_verified_core_description"),
      icon: "fa-book-open",
    },
    shared: {
      label: t("browse_following"),
      shortLabel: t("browse_following"),
      description: t("browse_verified_shared_description"),
      icon: "fa-user-group",
    },
  });

  const shelfIds = $derived(Object.keys(shelves) as WorkShelfId[]);
  const options = $derived(
    shelfIds.map((shelfId) => ({
      value: shelfId,
      label: shelves[shelfId].label,
      id: `work-shelf-tab-${shelfId}`,
      controls: `work-shelf-panel-${shelfId}`,
      ariaLabel:
        shelves[shelfId].shortLabel === shelves[shelfId].label
          ? shelves[shelfId].label
          : t("browse_verified_shelf_label", {
              short: shelves[shelfId].shortLabel,
              label: shelves[shelfId].label,
            }),
    }))
  );
</script>

{#snippet tabContent(shelfId: WorkShelfId)}
  <span class="shelf-tab-content">
    <i class="fas {shelves[shelfId].icon}" aria-hidden="true"></i>
    <span>{shelves[shelfId].shortLabel}</span>
  </span>
{/snippet}

{#if region === "tabs"}
  <header class="rail-header">
    <BackToBrowseButton />
    <div class="tab-width">
      <SegmentedControl
        {options}
        {value}
        {onchange}
        color="accent"
        density="tight"
        semantics="tabs"
        ariaLabel={t("browse_ui_you")}
        optionContent={tabContent}
      />
    </div>
  </header>
{/if}

{#if region === "panel"}
  <div
    class="shelf-panel"
    id="work-shelf-panel-{value}"
    role="tabpanel"
    aria-labelledby="work-shelf-tab-{value}"
  >
    {#if value !== "collections" && value !== "drafts"}
      <header class="shelf-panel-header">
        <h3>{shelves[value].label}</h3>
        <p>{shelves[value].description}</p>
      </header>
    {/if}

    {@render content(value)}
  </div>
{/if}

<style>
  .rail-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: clamp(8px, 1.2cqi, 12px) clamp(10px, 1.6cqi, 16px);
    border-bottom: 1px solid var(--theme-stroke);
    background: transparent;
  }

  .tab-width {
    flex: 1 1 auto;
    min-width: 0;
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
    white-space: nowrap;
  }

  .shelf-panel {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    scrollbar-gutter: stable;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: clamp(10px, 1.4cqi, 14px) clamp(10px, 1.6cqi, 16px);
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
