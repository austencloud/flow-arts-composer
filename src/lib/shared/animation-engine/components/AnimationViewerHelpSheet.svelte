<!--
  AnimationViewerHelpSheet.svelte

  Responsive help panel showing animation viewer keyboard shortcuts and usage tips.
  - Desktop: Slides from right as a side panel
  - Mobile: Slides from bottom as a sheet
-->
<script lang="ts">
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { animationShortcutRegistrar } from "../services/animation-shortcut-registrar";
  const ANIMATION_SHORTCUTS = animationShortcutRegistrar.shortcuts;

  let {
    isOpen = $bindable(false),
    isSideBySideLayout = false,
    onClose = () => {},
  }: {
    isOpen?: boolean;
    isSideBySideLayout?: boolean;
    onClose?: () => void;
  } = $props();

  function handleClose() {
    isOpen = false;
    onClose();
  }

  // Responsive placement - right panel on desktop, bottom sheet on mobile
  const placement = $derived(isSideBySideLayout ? "right" : "bottom");

  // Snap points only apply to bottom placement
  const snapPoints = $derived(isSideBySideLayout ? undefined : ["65%", "90%"]);
</script>

<Drawer
  bind:isOpen
  {placement}
  {snapPoints}
  closeOnBackdrop={true}
  closeOnEscape={true}
  ariaLabel={t("animation_help_title")}
  showHandle={!isSideBySideLayout}
  class="help-sheet-drawer {isSideBySideLayout ? 'side-panel' : 'bottom-sheet'}"
>
  <div class="help-content">
    <header class="help-header">
      <div class="header-info">
        <h2 class="help-title">{t("animation_viewer_title")}</h2>
        <p class="help-subtitle">{t("animation_help_subtitle")}</p>
      </div>
      <button
        class="close-btn"
        onclick={handleClose}
        aria-label={t("animation_help_close")}
        type="button"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </header>

    <div class="help-body">
      <!-- Keyboard Shortcuts Section -->
      <section class="help-section">
        <h3 class="section-title">
          <i class="fas fa-keyboard" aria-hidden="true"></i>
          {t("keyboard_ui_title")}
        </h3>
        <div class="shortcuts-list">
          {#each ANIMATION_SHORTCUTS as shortcut}
            <div class="shortcut-item">
              <div class="shortcut-info">
                <span class="shortcut-label">{shortcut.label}</span>
                <span class="shortcut-desc">{shortcut.description}</span>
              </div>
              <kbd class="shortcut-key">{shortcut.key}</kbd>
            </div>
          {/each}
        </div>
      </section>

      <!-- Usage Tips Section -->
      <section class="help-section">
        <h3 class="section-title">
          <i class="fas fa-lightbulb" aria-hidden="true"></i>
          {t("animation_help_tips")}
        </h3>
        <ul class="tips-list">
          <li>
            {t("animation_help_step_tip")}
          </li>
          <li>{t("animation_help_visibility_tip")}</li>
          <li>{t("animation_help_tempo_tip")}</li>
          <li>{t("animation_help_trails_tip")}</li>
        </ul>
      </section>
    </div>
  </div>
</Drawer>

<style>
  /* Side panel (desktop) specific styles */
  :global(.help-sheet-drawer.side-panel[data-placement="right"]) {
    width: min(380px, 90vw);
    height: 100%;
  }

  .help-content {
    display: flex;
    flex-direction: column;
    padding: 0 20px 20px;
    min-width: 280px;
    max-height: 100%;
    height: 100%;
  }

  .help-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 16px 0;
    border-bottom: 1px solid var(--theme-stroke);
    margin-bottom: 16px;
    flex-shrink: 0;
  }

  .header-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .help-title {
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--theme-text);
    margin: 0;
  }

  .help-subtitle {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
    margin: 0;
  }

  .close-btn {
    width: var(--min-touch-target); /* WCAG AA touch target */
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    flex-shrink: 0;
  }

  .close-btn:hover {
    background: var(--theme-card-bg-hover, color-mix(in srgb, var(--theme-text) 10%, transparent));
    color: var(--theme-text);
  }

  .help-body {
    display: flex;
    flex-direction: column;
    gap: 24px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .help-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text);
    margin: 0;
  }

  .section-title i {
    font-size: var(--font-size-min, 14px);
    color: color-mix(in srgb, var(--theme-accent) 80%, transparent);
  }

  /* Shortcuts List */
  .shortcuts-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .shortcut-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    gap: 12px;
  }

  .shortcut-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .shortcut-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text);
  }

  .shortcut-desc {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
  }

  .shortcut-key {
    font-size: var(--font-size-compact, 12px);
    font-family: "SF Mono", "Monaco", "Inconsolata", "Roboto Mono", monospace;
    padding: 4px 8px;
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent);
    border-radius: 4px;
    color: var(--theme-accent);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Tips List */
  .tips-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tips-list li {
    position: relative;
    padding-left: 20px;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-dim);
    line-height: 1.5;
  }

  .tips-list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 8px;
    width: 6px;
    height: 6px;
    background: color-mix(in srgb, var(--theme-accent) 60%, transparent);
    border-radius: 50%;
  }

  /* Responsive */
  @media (max-width: 480px) {
    .help-content {
      padding: 0 16px 16px;
    }

    .shortcut-item {
      padding: 8px 10px;
    }

    .shortcut-desc {
      display: none;
    }
  }
</style>
