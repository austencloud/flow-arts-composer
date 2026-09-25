<!--
  TemplatePatternGrid.svelte

  Grid display of rotation direction pattern templates with category filtering.
  Supports both mobile (segmented control) and desktop (grouped display) layouts.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import {
    getTemplatesForStepCount,
    getCategoryInfo,
    type TemplateCategory,
    type RotationDirectionTemplateDefinition,
  } from "../../../domain/templates/rotation-direction-templates";

  interface Props {
    stepCount: number;
    isMobile: boolean;
    onApplyTemplate: (template: RotationDirectionTemplateDefinition) => void;
  }

  let { stepCount, isMobile, onApplyTemplate }: Props = $props();

  // Initialize with default - $effect below will sync with isMobile immediately
  let categoryFilter = $state<TemplateCategory | "all">("all");

  // Get all templates for the beat count, excluding uniform (handled separately)
  const allTemplates = $derived(getTemplatesForStepCount(stepCount));
  const nonUniformTemplates = $derived(
    allTemplates.filter((t) => t.category !== "uniform")
  );
  const filteredTemplates = $derived(
    categoryFilter === "all"
      ? nonUniformTemplates
      : nonUniformTemplates.filter((t) => t.category === categoryFilter)
  );

  // Reset filter when mobile state changes
  $effect(() => {
    categoryFilter = isMobile ? "alternating" : "all";
  });
</script>

{#if nonUniformTemplates.length > 0}
  <div class="templates-section">
    <div class="templates-header">
      <h3>{t("create_ui_patterns")}</h3>
      <div class="category-filter" class:mobile-segmented={isMobile}>
        {#if !isMobile}
          <button
            class="filter-btn"
            class:active={categoryFilter === "all"}
            onclick={() => (categoryFilter = "all")}
          >
            All
          </button>
        {/if}
        {#each ["alternating", "split-hand", "split-half"] as category}
          {@const info = getCategoryInfo(category as TemplateCategory)}
          {@const hasTemplates = nonUniformTemplates.some(
            (t) => t.category === category
          )}
          {#if hasTemplates}
            <button
              class="filter-btn"
              class:active={categoryFilter === category}
              onclick={() => (categoryFilter = category as TemplateCategory)}
              style="--filter-color: {info.color}"
            >
              <span class="category-dot" style="background: {info.color}"
              ></span>
              {info.label}
            </button>
          {/if}
        {/each}
      </div>
    </div>

    <!-- Desktop grouped display when "All" selected -->
    {#if !isMobile && categoryFilter === "all"}
      <div class="grouped-patterns">
        {#each ["alternating", "split-hand", "split-half"] as category}
          {@const groupTemplates = nonUniformTemplates.filter(
            (t) => t.category === category
          )}
          {@const categoryInfo = getCategoryInfo(category as TemplateCategory)}
          {#if groupTemplates.length > 0}
            <div class="category-group">
              <div
                class="group-header"
                style="--group-color: {categoryInfo.color}"
              >
                <span class="group-dot" style="background: {categoryInfo.color}"
                ></span>
                <span class="group-label">{categoryInfo.label}</span>
              </div>
              <div class="patterns-list">
                {#each groupTemplates as template}
                  <div
                    class="pattern-item template"
                    style="--glass-color: {categoryInfo.color}"
                    onclick={() => onApplyTemplate(template)}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onApplyTemplate(template);
                      }
                    }}
                  >
                    <div class="pattern-info">
                      <span class="pattern-name">{template.name}</span>
                      <span class="pattern-desc">{template.description}</span>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {:else}
      <!-- Regular filtered display (mobile always, desktop when filter selected) -->
      <div class="patterns-list" class:mobile-compact={isMobile}>
        {#each filteredTemplates as template}
          {@const categoryInfo = getCategoryInfo(template.category)}
          <div
            class="pattern-item template"
            style="--glass-color: {categoryInfo.color}"
            onclick={() => onApplyTemplate(template)}
            role="button"
            tabindex="0"
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onApplyTemplate(template);
              }
            }}
          >
            <div class="pattern-info">
              <span class="pattern-name">{template.name}</span>
              {#if !isMobile}
                <span class="pattern-desc">{template.description}</span>
              {/if}
            </div>
          </div>
        {/each}

        {#if filteredTemplates.length === 0}
          <p class="empty-filter-message">
            No {categoryFilter} patterns available
          </p>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .templates-section {
    margin-bottom: 24px;
  }

  .templates-header {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 12px;
  }

  .templates-section h3 {
    font-size: 0.85rem;
    font-weight: 500;
    margin: 0;
    color: var(--theme-text-muted, var(--theme-text-dim));
  }

  /* Category filter */
  .category-filter {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .filter-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    font-size: 0.75rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 16px;
    color: var(--theme-text-muted, var(--theme-text-dim));
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .filter-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .filter-btn.active {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
    border-color: var(--filter-color, rgba(255, 255, 255, 0.3));
  }

  .category-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  /* Mobile segmented control styling */
  .category-filter.mobile-segmented {
    display: flex;
    gap: 0;
    background: var(--theme-card-bg);
    border-radius: 8px;
    padding: 3px;
    border: 1px solid var(--theme-stroke);
  }

  .category-filter.mobile-segmented .filter-btn {
    flex: 1;
    min-height: var(--min-touch-target, 44px);
    border: none;
    border-radius: 6px;
    padding: 6px 4px;
    font-size: var(--font-size-compact, 12px);
    gap: 3px;
    justify-content: center;
  }

  .category-filter.mobile-segmented .filter-btn.active {
    background: var(--filter-color, var(--theme-accent));
    color: white;
  }

  .category-filter.mobile-segmented .category-dot {
    width: 6px;
    height: 6px;
  }

  /* Desktop grouped patterns display */
  .grouped-patterns {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .category-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid
      color-mix(in srgb, var(--group-color, #fff) 25%, transparent);
  }

  .group-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .group-label {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--theme-text-muted);
  }

  /* Patterns list */
  .patterns-list {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    container-type: inline-size;
  }

  @container (min-width: 300px) {
    .patterns-list {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @container (min-width: 450px) {
    .patterns-list {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .pattern-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    position: relative;
    padding: 12px;
    min-height: 60px;
    background: var(--theme-card-bg);
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    user-select: none;
  }

  .pattern-item:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: rgba(245, 158, 11, 0.4);
  }

  .pattern-item.template {
    background: color-mix(in srgb, var(--glass-color, #fff) 8%, transparent);
    border: 1px solid
      color-mix(in srgb, var(--glass-color, #fff) 20%, transparent);
  }

  .pattern-item.template:hover {
    background: color-mix(in srgb, var(--glass-color, #fff) 15%, transparent);
    border-color: color-mix(in srgb, var(--glass-color, #fff) 40%, transparent);
  }

  .pattern-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }

  .pattern-name {
    font-weight: 500;
    font-size: 0.9rem;
    line-height: 1.3;
  }

  .pattern-desc {
    font-size: 0.75rem;
    color: var(--theme-text-muted, var(--theme-text-dim));
    line-height: 1.4;
  }

  .empty-filter-message {
    text-align: center;
    color: var(--theme-text-dim);
    padding: 16px;
    font-size: 0.85rem;
    grid-column: 1 / -1;
  }

  /* Mobile compact grid */
  .patterns-list.mobile-compact {
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  .patterns-list.mobile-compact .pattern-item {
    padding: 10px;
    min-height: 44px;
  }

  .patterns-list.mobile-compact .pattern-name {
    font-size: 0.8rem;
  }
</style>
