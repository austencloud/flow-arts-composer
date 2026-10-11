<script lang="ts">
  import type { PinnedItem, PinnableContentType } from "#lib/shared/community/domain/models/pinned-item.js";

  let {
    pinnedItems = [],
    isOwnProfile,
  }: {
    pinnedItems: PinnedItem[];
    isOwnProfile: boolean;
  } = $props();

  const typeConfig: Record<PinnableContentType, { label: string; color: string; icon: string }> = {
    sequence: { label: "Sequence", color: "#3b82f6", icon: "fa-list" },
    composition: { label: "Composition", color: "#8b5cf6", icon: "fa-th" },
    mandala: { label: "Mandala", color: "#10b981", icon: "fa-circle-notch" },
    act: { label: "Act", color: "#f59e0b", icon: "fa-film" },
    collection: { label: "Collection", color: "#ec4899", icon: "fa-folder" },
  };

  const hasItems = $derived(pinnedItems.length > 0);
</script>

{#if hasItems}
  <section class="showcase" aria-label="Pinned showcase">
    <div class="showcase-header">
      <i class="fas fa-thumbtack" aria-hidden="true"></i>
      <span>Showcase</span>
    </div>
    <div class="showcase-strip">
      {#each pinnedItems as item (item.id)}
        {@const config = typeConfig[item.type]}
        <button class="showcase-card" style:--card-accent={config.color}>
          <div class="card-placeholder">
            <i class="fas {config.icon}" aria-hidden="true"></i>
          </div>
          <div class="type-badge">
            {config.label}
          </div>
        </button>
      {/each}
    </div>
  </section>
{:else if isOwnProfile}
  <section class="showcase showcase-empty" aria-label="Pinned showcase">
    <div class="empty-prompt">
      <i class="fas fa-thumbtack" aria-hidden="true"></i>
      <span>Pin your best work to showcase it here</span>
    </div>
  </section>
{/if}

<style>
  .showcase {
    container-type: inline-size;
    container-name: showcase;
    margin-bottom: 24px;
    width: 100%;
  }

  .showcase-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text-dim);
  }

  .showcase-header i {
    font-size: var(--font-size-compact);
  }

  .showcase-strip {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255,255,255,0.15)) transparent;
  }

  .showcase-card {
    flex: 0 0 200px;
    height: 160px;
    background: var(--theme-card-bg);
    border: 1px solid color-mix(in srgb, var(--card-accent) 25%, transparent);
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    position: relative;
    overflow: hidden;
  }

  .showcase-card:hover {
    border-color: color-mix(in srgb, var(--card-accent) 50%, transparent);
    background: var(--theme-card-hover-bg);
    transform: translateY(-2px);
    box-shadow: 0 4px 16px color-mix(in srgb, var(--card-accent) 15%, transparent);
  }

  .card-placeholder {
    font-size: 2rem;
    color: color-mix(in srgb, var(--card-accent) 30%, transparent);
  }

  .type-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: var(--font-size-xs, 11px);
    font-weight: 600;
    background: color-mix(in srgb, var(--card-accent) 20%, transparent);
    color: var(--card-accent);
    letter-spacing: 0.02em;
  }

  .showcase-empty {
    display: flex;
    justify-content: center;
  }

  .empty-prompt {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 24px;
    border: 1px dashed var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
  }

  .empty-prompt i {
    font-size: var(--font-size-sm);
    opacity: 0.6;
  }

  @container showcase (max-width: 640px) {
    .showcase-card {
      flex: 0 0 160px;
      height: 130px;
    }
  }

  @container showcase (min-width: 2000px) {
    .showcase-card {
      flex: 0 0 240px;
      height: 180px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .showcase-card {
      transition: none;
    }

    .showcase-card:hover {
      transform: none;
    }
  }
</style>
