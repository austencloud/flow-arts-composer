<!--
  GalleryGrid - Renders module-grouped screenshot cards in a responsive grid.
  Supports selection mode with checkbox overlays and tag chip display.
-->
<script lang="ts">
  import type { GalleryItem } from "../../services/types";
  import type { MediaTag } from "@austencloud/media-tagging-types";
  import { TagChip } from "@austencloud/media-tagging-ui";

  type DeviceCategory = "phone" | "tablet" | "desktop";

  interface Props {
    moduleGroups: Map<string, Map<string, GalleryItem[]>>;
    collapsedModules: Record<string, boolean>;
    columnMin: number;
    allTags: MediaTag[];
    selectionMode: boolean;
    selectedIds: Set<string>;
    onOpenSpotlight: (item: GalleryItem) => void;
    onOpenTagPanel: (item: GalleryItem, e: MouseEvent | TouchEvent) => void;
    onToggleModuleCollapse: (moduleId: string) => void;
    onToggleSelection: (itemId: string) => void;
    onStartLongPress: (item: GalleryItem, e: TouchEvent) => void;
    onCancelLongPress: () => void;
  }

  let {
    moduleGroups,
    collapsedModules,
    columnMin,
    allTags,
    selectionMode,
    selectedIds,
    onOpenSpotlight,
    onOpenTagPanel,
    onToggleModuleCollapse,
    onToggleSelection,
    onStartLongPress,
    onCancelLongPress,
  }: Props = $props();

  const MODULE_NAMES: Record<string, string> = {
    public: "Public Pages",
    create: "Create",
    browse: "Browse",
    compose: "Compose",
    learn: "Learn",
    train: "Train",
    settings: "Settings",
    feedback: "Feedback",
  };

  const DEVICE_MAP: Record<
    string,
    { name: string; w: number; h: number; category: DeviceCategory }
  > = {
    "iphone-se": { name: "iPhone SE", w: 375, h: 667, category: "phone" },
    "iphone-16-pro": {
      name: "iPhone 16 Pro",
      w: 393,
      h: 852,
      category: "phone",
    },
    "iphone-16-pro-max": {
      name: "iPhone 16 Pro Max",
      w: 430,
      h: 932,
      category: "phone",
    },
    "galaxy-s24": { name: "Galaxy S24", w: 360, h: 780, category: "phone" },
    "galaxy-s24-ultra": {
      name: "Galaxy S24 Ultra",
      w: 412,
      h: 915,
      category: "phone",
    },
    "ipad-mini": { name: "iPad Mini", w: 768, h: 1024, category: "tablet" },
    "ipad-air": { name: "iPad Air", w: 820, h: 1180, category: "tablet" },
    "desktop-hd": { name: "Desktop HD", w: 1366, h: 768, category: "desktop" },
    "desktop-fhd": {
      name: "Desktop FHD",
      w: 1920,
      h: 1080,
      category: "desktop",
    },
  };

  function getAspectRatio(slug: string): number {
    const d = DEVICE_MAP[slug];
    return d ? d.w / d.h : 0.5;
  }

  function getDeviceDims(slug: string): string {
    const d = DEVICE_MAP[slug];
    return d ? `${d.w}\u00D7${d.h}` : "";
  }

  function getCategoryColor(slug: string): string {
    const cat = DEVICE_MAP[slug]?.category;
    if (cat === "phone") return "#22c55e";
    if (cat === "tablet") return "#f59e0b";
    if (cat === "desktop") return "#3b82f6";
    return "#94a3b8";
  }

  function getCategoryLabel(slug: string): string {
    const cat = DEVICE_MAP[slug]?.category;
    if (cat === "phone") return "Phone";
    if (cat === "tablet") return "Tablet";
    if (cat === "desktop") return "Desktop";
    return "Unknown";
  }

  function formatRouteLabel(label: string): string {
    return label
      .replace(/--/g, " / ")
      .replace(/(^|\s)\w/g, (c) => c.toUpperCase());
  }

  function getTagById(tagId: string): MediaTag | undefined {
    return allTags.find((t) => t.id === tagId);
  }

  function handleCardClick(item: GalleryItem) {
    if (selectionMode) {
      onToggleSelection(item.id);
    } else {
      onOpenSpotlight(item);
    }
  }
</script>

<div class="module-sections">
  {#each [...moduleGroups.entries()] as [moduleId, routeMap], sectionIdx (moduleId)}
    {@const isCollapsed = collapsedModules[moduleId] ?? false}
    {@const routeCount = routeMap.size}
    {@const captureCount = [...routeMap.values()].reduce(
      (sum, arr) => sum + arr.length,
      0
    )}

    <section class="module-section" style="--section-i: {sectionIdx};">
      <button
        class="module-header"
        onclick={() => onToggleModuleCollapse(moduleId)}
        aria-expanded={!isCollapsed}
      >
        <i class="fas fa-chevron-right" class:expanded={!isCollapsed}></i>
        <span class="module-name">{MODULE_NAMES[moduleId] ?? moduleId}</span>
        <span class="module-stats"
          >{captureCount} captures, {routeCount} routes</span
        >
      </button>

      {#if !isCollapsed}
        <div class="route-sections">
          {#each [...routeMap.entries()] as [routeLabel, items] (routeLabel)}
            <div class="route-section">
              <h4 class="route-label">{formatRouteLabel(routeLabel)}</h4>
              <div
                class="device-row"
                style="grid-template-columns: repeat(auto-fill, minmax(min({columnMin}px, 100%), 1fr));"
              >
                {#each items as item, cardIdx (item.id)}
                  {@const aspect = getAspectRatio(item.deviceSlug)}
                  {@const isSelected = selectedIds.has(item.id)}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <button
                    class="capture-card"
                    class:selected={isSelected}
                    class:selection-mode={selectionMode}
                    style="--aspect: {aspect}; --card-i: {cardIdx};"
                    onclick={() => handleCardClick(item)}
                    oncontextmenu={(e) => onOpenTagPanel(item, e)}
                    ontouchstart={(e) => onStartLongPress(item, e)}
                    ontouchend={onCancelLongPress}
                    ontouchmove={onCancelLongPress}
                    ontouchcancel={onCancelLongPress}
                    aria-label="{selectionMode
                      ? isSelected
                        ? 'Deselect'
                        : 'Select'
                      : 'View'} {item.deviceName} screenshot of {formatRouteLabel(
                      item.routeLabel
                    )}"
                  >
                    <!-- Selection checkbox overlay -->
                    <div
                      class="selection-checkbox"
                      class:visible={selectionMode}
                    >
                      <div class="checkbox-inner" class:checked={isSelected}>
                        {#if isSelected}
                          <i class="fas fa-check"></i>
                        {/if}
                      </div>
                    </div>

                    <div class="screenshot-frame">
                      <img
                        src={item.imageUrl}
                        alt="{formatRouteLabel(
                          item.routeLabel
                        )} on {item.deviceName}"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <div class="card-footer">
                      <span
                        class="device-badge"
                        style="--badge-color: {getCategoryColor(
                          item.deviceSlug
                        )}"
                      >
                        {getCategoryLabel(item.deviceSlug)}
                      </span>
                      <span class="device-name">{item.deviceName}</span>
                      <span class="device-dims"
                        >{getDeviceDims(item.deviceSlug)}</span
                      >
                    </div>
                    {#if item.tagIds.length > 0}
                      <div class="card-tags">
                        {#each item.tagIds.slice(0, 3) as tagId (tagId)}
                          {@const tag = getTagById(tagId)}
                          {#if tag}
                            <TagChip
                              label={tag.name}
                              color={tag.color}
                              size="sm"
                            />
                          {/if}
                        {/each}
                        {#if item.tagIds.length > 3}
                          <span class="tag-overflow"
                            >+{item.tagIds.length - 3}</span
                          >
                        {/if}
                      </div>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/each}
</div>

<style>
  /* Module sections */
  .module-sections {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .module-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: slideUp var(--duration-normal)
      var(--ease-out, var(--ease-standard-out)) both;
    animation-delay: calc(var(--stagger-normal) * var(--section-i, 0));
  }

  .module-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    cursor: pointer;
    color: var(--theme-text, #fff);
    font-family: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    text-align: left;
    width: 100%;
    transition:
      transform var(--duration-instant) var(--ease-spring, var(--ease-spring)),
      background var(--duration-fast) var(--ease-out, var(--ease-standard-out));
  }

  .module-header:hover {
    transform: scale(var(--hover-scale-sm, 1.01));
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .module-header:active {
    transform: scale(var(--active-scale, 0.98));
  }

  .module-header i {
    font-size: 10px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    transition: transform var(--duration-fast)
      var(--ease-out, var(--ease-standard-out));
  }

  .module-header i.expanded {
    transform: rotate(90deg);
  }

  .module-header:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }

  .module-stats {
    margin-left: auto;
    font-size: var(--font-size-compact, 12px);
    font-weight: 400;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  /* Route sections */
  .route-sections {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-left: 12px;
  }

  .route-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .route-label {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text, #fff);
    padding-bottom: 4px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .device-row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
    gap: 10px;
    transition: grid-template-columns var(--duration-normal)
      var(--ease-out, var(--ease-standard-out));
  }

  /* Capture cards */
  .capture-card {
    position: relative;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    overflow: hidden;
    cursor: pointer;
    transition:
      transform var(--duration-instant) var(--ease-spring, var(--ease-spring)),
      border-color var(--duration-fast)
        var(--ease-out, var(--ease-standard-out)),
      box-shadow var(--duration-fast) var(--ease-out, var(--ease-standard-out));
    padding: 0;
    font-family: inherit;
    color: inherit;
    text-align: left;
    animation: popIn var(--duration-emphasis)
      var(--ease-spring, var(--ease-spring)) both;
    animation-delay: calc(var(--stagger-micro) * var(--card-i, 0));
  }

  .capture-card:hover {
    transform: scale(var(--hover-scale-md, 1.02))
      translateY(var(--hover-lift-sm, -1px));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }

  .capture-card:active {
    transform: scale(var(--active-scale, 0.98));
  }

  .capture-card.selected {
    border-color: var(--theme-accent, #3b82f6);
    box-shadow:
      0 0 0 2px
        color-mix(in srgb, var(--theme-accent, #3b82f6) 30%, transparent),
      0 4px 16px rgba(0, 0, 0, 0.3);
  }

  /* Selection checkbox */
  .selection-checkbox {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 2;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-fast)
      var(--ease-out, var(--ease-standard-out));
  }

  .selection-checkbox.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .capture-card.selection-mode:hover .selection-checkbox {
    opacity: 1;
  }

  .checkbox-inner {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: 2px solid rgba(255, 255, 255, 0.5);
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: #fff;
    transition:
      background var(--duration-fast) var(--ease-out, ease-out),
      border-color var(--duration-fast) var(--ease-out, ease-out),
      color var(--duration-fast) var(--ease-out, ease-out),
      opacity var(--duration-fast) var(--ease-out, ease-out),
      transform var(--duration-fast) var(--ease-out, ease-out),
      box-shadow var(--duration-fast) var(--ease-out, ease-out),
      width var(--duration-fast) var(--ease-out, ease-out),
      height var(--duration-fast) var(--ease-out, ease-out);
  }

  .checkbox-inner.checked {
    background: var(--theme-accent, #3b82f6);
    border-color: var(--theme-accent, #3b82f6);
  }

  .screenshot-frame {
    aspect-ratio: var(--aspect);
    overflow: hidden;
    background: #0a0a0f;
  }

  .screenshot-frame img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    display: block;
  }

  .card-footer {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    font-size: var(--font-size-compact, 12px);
  }

  .device-badge {
    padding: 2px 7px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--badge-color) 20%, transparent);
    color: var(--badge-color);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .device-name {
    color: var(--theme-text, #fff);
    font-weight: 500;
  }

  .device-dims {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    margin-left: auto;
  }

  /* Card tags */
  .card-tags {
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
    max-width: 70%;
    justify-content: flex-end;
    pointer-events: none;
  }

  .tag-overflow {
    display: flex;
    align-items: center;
    padding: 2px 6px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.7);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-compact, 12px);
  }

  @media (prefers-reduced-motion: reduce) {
    .capture-card,
    .module-section {
      animation: none;
    }
    .capture-card,
    .module-header,
    .module-header i,
    .selection-checkbox,
    .checkbox-inner {
      transition: none;
    }
    .capture-card:hover,
    .capture-card:active,
    .module-header:hover,
    .module-header:active {
      transform: none;
    }
  }
</style>
