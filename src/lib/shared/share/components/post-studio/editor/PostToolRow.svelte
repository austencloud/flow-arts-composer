<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import {
    isPanelTool,
    type PostPanelToolId,
    type PostToolId,
  } from "./post-editor-tools";
  import { TOOL_ICON, toolLabel } from "./post-editor-labels";

  /**
   * The editor's one row of tools: an icon over a short name, the way phone
   * editors lay them out. A panel tool opens its panel; the rest act at once.
   * Beside a side panel the row works like tabs, so the tool whose panel is
   * on screen reads as pressed.
   */
  interface Props {
    tools: readonly PostToolId[];
    /**
     * The panel beside the row on a wide screen. `null` on a phone, where an
     * open panel takes the row's place.
     */
    shown?: PostPanelToolId | null;
    isDisabled: (id: PostToolId) => boolean;
    onpick: (id: PostToolId) => void;
  }

  let { tools, shown = null, isDisabled, onpick }: Props = $props();

  const KEYS: Partial<Record<PostToolId, string>> = {
    back: "Escape",
    split: "S",
    duplicate: "Control+D",
    delete: "Delete",
  };

  function titleFor(id: PostToolId): string {
    switch (id) {
      case "back":
        return `${toolLabel(id)} (Esc)`;
      case "split":
        return t("post_editor_split_hint");
      case "beats":
        return t("post_editor_beats_hint");
      case "template":
        return t("post_editor_use_omega_template_hint");
      default:
        return toolLabel(id);
    }
  }
</script>

<div class="tool-row" role="group" aria-label={t("post_editor_tools")}>
  {#each tools as id (id)}
    <button
      type="button"
      class="tool"
      data-tool={id}
      disabled={isDisabled(id)}
      aria-pressed={shown !== null && isPanelTool(id)
        ? shown === id
        : undefined}
      aria-keyshortcuts={KEYS[id]}
      title={titleFor(id)}
      onclick={() => onpick(id)}
    >
      <i class="fa-solid {TOOL_ICON[id]}" aria-hidden="true"></i>
      <span class="label">{toolLabel(id)}</span>
    </button>
  {/each}
</div>

<style>
  /* A phone scrolls the row sideways; a wide screen centers it, and still
     scrolls from its first tool when a long row runs out of room. */
  .tool-row {
    display: flex;
    justify-content: safe center;
    gap: 0.375rem;
    min-width: 0;
    padding: 0.25rem 0.125rem;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
  }

  .tool {
    display: grid;
    flex: none;
    justify-items: center;
    align-content: center;
    gap: 0.25rem;
    box-sizing: border-box;
    min-width: 3.75rem;
    min-height: 3.5rem;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.75rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .tool i {
    font-size: 1.125rem;
    line-height: 1;
  }

  .label {
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 1.1;
    white-space: nowrap;
  }

  @media (hover: hover) {
    .tool:hover:not(:disabled) {
      border-color: var(--theme-stroke-strong, #6b6a7a);
      background: var(--theme-card-hover-bg);
    }
  }

  /* Pressed reads by a heavier ring and a filled tile, not by hue alone. */
  .tool[aria-pressed="true"] {
    border-color: var(--theme-accent, #d4813a);
    background: color-mix(
      in srgb,
      var(--theme-accent, #d4813a) 22%,
      var(--theme-card-bg, #1c1b24)
    );
    box-shadow: inset 0 0 0 1px var(--theme-accent, #d4813a);
  }

  .tool[aria-pressed="true"] i {
    color: var(--theme-accent, #d4813a);
  }

  .tool:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 2px;
  }

  .tool:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  @media (forced-colors: active) {
    .tool {
      border-color: ButtonText;
      color: ButtonText;
      background: ButtonFace;
    }

    .tool[aria-pressed="true"] {
      outline: 2px solid Highlight;
      outline-offset: -4px;
    }

    .tool[aria-pressed="true"] i {
      color: Highlight;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tool {
      transition: none;
    }
  }
</style>
