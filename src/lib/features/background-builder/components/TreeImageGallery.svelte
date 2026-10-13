<script lang="ts">
  import type { TreeCategory, RenderedTree } from "@austencloud/backgrounds";

  interface Props {
    selectedCategory: TreeCategory | "all";
    onCategoryChange: (category: TreeCategory | "all") => void;
    onDeleteTree?: (imageFilename: string) => void;
    sceneTrees: RenderedTree[];
  }

  let { selectedCategory, onCategoryChange, onDeleteTree, sceneTrees }: Props =
    $props();

  const CATEGORIES: TreeCategory[] = [
    "pine",
    "fir",
    "spruce",
    "oak",
    "maple",
    "poplar",
    "willow",
    "dead",
  ];
  const BASE_PATH = "/images/trees/curated";

  interface TreeImageInfo {
    category: TreeCategory;
    filename: string;
    path: string;
    count: number;
  }

  // Build image list from scene trees
  function buildImageList(trees: RenderedTree[]): TreeImageInfo[] {
    const imageMap = new Map<string, TreeImageInfo>();

    for (const tree of trees) {
      if (!tree.imageFilename) continue;

      const existing = imageMap.get(tree.imageFilename);
      if (existing) {
        existing.count++;
      } else {
        imageMap.set(tree.imageFilename, {
          category: tree.type as TreeCategory,
          filename: tree.imageFilename,
          path: `${BASE_PATH}/${tree.imageFilename}`,
          count: 1,
        });
      }
    }

    return Array.from(imageMap.values());
  }

  let sceneImages = $derived(buildImageList(sceneTrees));

  let displayedImages = $derived(
    selectedCategory === "all"
      ? sceneImages
      : sceneImages.filter((img) => img.category === selectedCategory)
  );

  function getCategoryCounts(images: TreeImageInfo[]): Record<string, number> {
    const counts: Record<string, number> = { all: images.length };
    for (const cat of CATEGORIES) {
      counts[cat] = images.filter((img) => img.category === cat).length;
    }
    return counts;
  }

  let categoryCounts = $derived(getCategoryCounts(sceneImages));
</script>

<div class="tree-image-gallery">
  <!-- Category Filter -->
  <div class="category-filter">
    <button
      class="category-btn"
      class:active={selectedCategory === "all"}
      onclick={() => onCategoryChange("all")}
    >
      All ({categoryCounts.all})
    </button>
    {#each CATEGORIES as category}
      {#if categoryCounts[category] && categoryCounts[category] > 0}
        <button
          class="category-btn"
          class:active={selectedCategory === category}
          onclick={() => onCategoryChange(category)}
        >
          {category.charAt(0).toUpperCase() + category.slice(1)} ({categoryCounts[
            category
          ] ?? 0})
        </button>
      {/if}
    {/each}
  </div>

  <!-- Image Grid -->
  <div class="gallery-scroll themed-scrollbar">
    {#if displayedImages.length === 0}
      <div class="empty-state">
        No trees in scene. Go to Preview and click Regenerate.
      </div>
    {:else}
      <div class="image-grid large">
        {#each displayedImages as image (image.filename)}
          <div class="image-card">
            <div class="image-wrapper">
              <img src={image.path} alt={image.filename} loading="lazy" />
            </div>
            {#if onDeleteTree}
              <button
                class="delete-btn"
                onclick={() => onDeleteTree(image.filename)}
                title="Remove {image.count} tree(s) using this image"
              >
                <i class="fas fa-trash-alt"></i>
              </button>
            {/if}
            <div class="image-info">
              <span class="image-label">{image.filename}</span>
              {#if image.count > 1}
                <span class="tree-count">×{image.count}</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .tree-image-gallery {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1a1a2e;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    overflow: hidden;
  }

  .category-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 16px;
    background: rgba(0, 0, 0, 0.3);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .category-btn {
    padding: 8px 14px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #9ca3af;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard);
  }

  .category-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }

  .category-btn.active {
    background: linear-gradient(
      135deg,
      rgba(132, 204, 22, 0.3),
      rgba(163, 230, 53, 0.3)
    );
    border-color: rgba(163, 230, 53, 0.5);
    color: #a3e635;
  }

  .gallery-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .image-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 12px;
  }

  .image-grid.large {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 16px;
  }

  .image-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard),
      grid-template-columns var(--duration-normal) var(--ease-standard);
  }

  .image-card:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.12);
    transform: translateY(-2px);
  }

  .image-card:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: rgba(239, 68, 68, 0.9);
    border: none;
    border-radius: 6px;
    color: #ffffff;
    cursor: pointer;
    opacity: 0.7;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard),
      width var(--duration-fast) var(--ease-standard),
      height var(--duration-fast) var(--ease-standard);
    z-index: 1;
  }

  .delete-btn:hover {
    background: #ef4444;
    transform: scale(1.1);
  }

  .delete-btn:active {
    transform: scale(0.95);
  }

  .delete-btn:focus-visible {
    outline: 2px solid #f87171;
    outline-offset: 2px;
    opacity: 1;
  }

  .delete-btn i {
    font-size: 0.75rem;
  }

  .image-wrapper {
    width: 100%;
    aspect-ratio: 1 / 1.5;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(to bottom, #1e3a5f 0%, #0d1f33 100%);
    border-radius: 6px;
    overflow: hidden;
  }

  .image-wrapper img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    /* Invert the black silhouette so it's visible against dark background */
    filter: invert(1);
    opacity: 0.9;
  }

  .image-info {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 6px;
  }

  .image-label {
    font-size: var(--font-size-compact, 12px);
    font-family: monospace;
    color: #9ca3af;
    text-align: center;
    word-break: break-all;
  }

  .tree-count {
    padding: 2px 6px;
    background: color-mix(
      in srgb,
      var(--theme-success, #a3e635) 20%,
      transparent
    );
    border-radius: 8px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-success, #a3e635);
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: #6b7280;
    font-size: 0.9rem;
    text-align: center;
  }

  @media (max-width: 600px) {
    .image-grid {
      grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    }

    .image-grid.large {
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .category-btn,
    .image-card,
    .delete-btn {
      transition: none;
    }

    .image-card:hover {
      transform: none;
    }

    .delete-btn:hover,
    .delete-btn:active {
      transform: none;
    }
  }
</style>
