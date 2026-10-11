<!--
  ViewModeToggle - Segmented controls for switching browse view mode.

  Two control groups:
  1. Subject: Props / Hands (what layer to view)
  2. Left/Right hand chips (which motion(s) to show)

  The chips map to BrowseViewMode's granularity + hand fields:
  - Both active  -> granularity: "combined"
  - One active   -> granularity: "solo", hand: active performer hand
  - Last deactivated -> reactivate both (combined)
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { BrowseViewMode } from "#lib/shared/browse/domain/browse-view-mode.js";
  import MotionColorChips from "#lib/shared/components/MotionColorChips.svelte";

  interface Props {
    viewMode: BrowseViewMode;
    onViewModeChange: (mode: BrowseViewMode) => void;
  }

  let { viewMode, onViewModeChange }: Props = $props();

  const showLeft = $derived(
    viewMode.granularity === "combined" || viewMode.hand === "left"
  );
  const showRight = $derived(
    viewMode.granularity === "combined" || viewMode.hand === "right"
  );

  function setSubject(subject: BrowseViewMode["subject"]): void {
    if (subject === viewMode.subject) return;
    onViewModeChange({ ...viewMode, subject });
  }

  function toggleLeft(): void {
    if (showLeft && showRight) {
      // Both on → isolate the left hand.
      onViewModeChange({ ...viewMode, granularity: "solo", hand: "left" });
    } else {
      // Blue is either the solo one or the inactive one → show both
      onViewModeChange({ ...viewMode, granularity: "combined", hand: "left" });
    }
  }

  function toggleRight(): void {
    if (showLeft && showRight) {
      // Both on → isolate the right hand.
      onViewModeChange({ ...viewMode, granularity: "solo", hand: "right" });
    } else {
      // Red is either the solo one or the inactive one → show both
      onViewModeChange({ ...viewMode, granularity: "combined", hand: "left" });
    }
  }
</script>

<div
  class="view-mode-toggle"
  role="toolbar"
  aria-label={t("browse_ui_view_mode")}
>
  <!-- Subject toggle: Props / Hands -->
  <div
    class="toggle-group"
    role="radiogroup"
    aria-label={t("browse_ui_subject")}
  >
    <button
      class="toggle-chip"
      class:active={viewMode.subject === "props"}
      role="radio"
      aria-checked={viewMode.subject === "props"}
      onclick={() => setSubject("props")}
    >
      Props
    </button>
    <button
      class="toggle-chip"
      class:active={viewMode.subject === "hands"}
      role="radio"
      aria-checked={viewMode.subject === "hands"}
      onclick={() => setSubject("hands")}
    >
      Hands
    </button>
  </div>

  <!-- Left/Right color chips -->
  <MotionColorChips
    {showLeft}
    {showRight}
    onToggleLeft={toggleLeft}
    onToggleRight={toggleRight}
  />
</div>

<style>
  .view-mode-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: nowrap;
  }

  .toggle-group {
    display: flex;
    gap: 2px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    padding: 2px;
  }

  .toggle-chip {
    min-height: 32px;
    padding: 4px 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
  }

  .toggle-chip:hover {
    background: var(--theme-accent-subtle, rgba(99, 102, 241, 0.08));
    color: var(--theme-text, #fff);
  }

  .toggle-chip.active {
    background: var(--theme-accent-subtle, rgba(99, 102, 241, 0.12));
    color: var(--theme-accent, #6366f1);
  }

  .toggle-chip:focus-visible {
    outline: 2px solid var(--theme-text, #ffffff);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .toggle-chip {
      transition: none;
    }
  }
</style>
