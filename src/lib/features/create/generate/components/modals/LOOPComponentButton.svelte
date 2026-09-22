<!--
LOOPComponentButton.svelte - Individual LOOP component selection button
Displays a selectable button for a single LOOP transformation type
Shows description in Quick Apply mode, compact in Build Combo mode
-->
<script lang="ts">
  import FontAwesomeIcon from "$lib/shared/foundation/ui/FontAwesomeIcon.svelte";
  import type { LOOPComponentInfo } from "$lib/features/create/generate/shared/domain/constants/loop-components";
  import type { Snippet } from "svelte";

  let {
    componentInfo,
    isMultiSelectMode = false,
    isSelected = false,
    isDisabled = false,
    isLocked = false,
    disabledReason,
    showDescription = false,
    compactOnMobile = false,
    isExpanded = false,
    expandedContent,
    expandedContentId,
    showConfigureAction = false,
    onConfigure,
    onClick,
  } = $props<{
    componentInfo: LOOPComponentInfo;
    isMultiSelectMode?: boolean;
    isSelected?: boolean;
    isDisabled?: boolean;
    /** Guest-gated: still clickable, but tapping routes to sign-up. */
    isLocked?: boolean;
    /** Shown as the tooltip and spoken in the label while disabled. */
    disabledReason?: string;
    showDescription?: boolean;
    /** Keep list detail on desktop, then use the compact grid treatment on phones. */
    compactOnMobile?: boolean;
    /** Keep component-specific controls visually attached to their card. */
    isExpanded?: boolean;
    expandedContent?: Snippet;
    expandedContentId?: string;
    /** Separate settings affordance for compact mobile picker tiles. */
    showConfigureAction?: boolean;
    onConfigure?: () => void;
    onClick: () => void;
  }>();

  // Reactive destructure - updates when componentInfo changes
  const label = $derived(componentInfo.label);
  const description = $derived(componentInfo.description);
  const icon = $derived(componentInfo.icon);
  const color = $derived(componentInfo.color);
</script>

<div
  class="loop-component-shell"
  class:expanded={isExpanded && !!expandedContent}
  class:with-configure-action={showConfigureAction}
  data-component={componentInfo.component}
  data-expanded={isExpanded}
  style="--component-color: {color};"
>
  <button
    class="loop-component-button"
    class:selected={isSelected}
    class:multi-select={isMultiSelectMode}
    class:with-description={showDescription}
    class:compact-on-mobile={compactOnMobile}
    class:locked={isLocked}
    onclick={onClick}
    disabled={isDisabled}
    title={isDisabled ? disabledReason : undefined}
    aria-expanded={expandedContent ? isExpanded : undefined}
    aria-controls={expandedContent ? expandedContentId : undefined}
    aria-label="{label} - {description} - {isDisabled
      ? (disabledReason ?? 'not compatible with current selection')
      : isLocked
        ? 'locked, sign up to unlock'
        : isSelected
          ? 'selected'
          : 'not selected'}"
  >
    <div class="button-content">
      <div class="loop-component-icon">
        <FontAwesomeIcon {icon} size="1em" />
      </div>
      <div class="text-content">
        <span class="loop-component-label">{label}</span>
        {#if showDescription}
          <span class="loop-component-description">{description}</span>
        {/if}
      </div>
    </div>

    <div class="check-badge" class:visible={isSelected} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
      >
        <polyline points="6,12 10,16 18,8"></polyline>
      </svg>
    </div>

    {#if isLocked && !isSelected}
      <div class="lock-badge" aria-hidden="true">
        <FontAwesomeIcon icon="fas fa-lock" size="0.7em" />
      </div>
    {/if}
  </button>

  {#if showConfigureAction && onConfigure}
    <button
      type="button"
      class="configure-button"
      data-configure-component={componentInfo.component}
      onclick={onConfigure}
      aria-label="Configure {label}"
    >
      <span class="configure-button-visual" aria-hidden="true">
        <FontAwesomeIcon icon="fas fa-sliders" size="0.85em" />
      </span>
    </button>
  {/if}

  {#if expandedContent}
    <div
      class="component-expansion-clip"
      class:open={isExpanded}
      aria-hidden={!isExpanded}
      inert={!isExpanded ? true : undefined}
    >
      <div class="component-expansion-crop">
        <div class="component-expansion" id={expandedContentId}>
          {@render expandedContent()}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .loop-component-shell {
    --expansion-duration: var(
      --loop-expansion-duration,
      var(--duration-dramatic)
    );
    --expansion-easing: var(--loop-expansion-easing, var(--ease-out));

    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
    background: transparent;
    border: 2px solid transparent;
    border-radius: 12px;
    transition:
      background var(--expansion-duration) var(--expansion-easing),
      border-color var(--expansion-duration) var(--expansion-easing),
      box-shadow var(--expansion-duration) var(--expansion-easing);
    position: relative;
  }

  .loop-component-button {
    position: relative;
    display: flex;
    flex: 1 1 64px;
    align-items: center;
    justify-content: center;
    min-height: 64px;
    padding: 12px;

    background: color-mix(
      in srgb,
      var(--component-color) 15%,
      rgba(30, 30, 50, 0.9)
    );
    border: 2px solid
      color-mix(in srgb, var(--component-color) 50%, transparent);
    border-radius: 12px;
    cursor: pointer;
    color: var(--theme-text, white);
    transition:
      background var(--expansion-duration) var(--expansion-easing),
      border-color var(--expansion-duration) var(--expansion-easing),
      border-radius var(--expansion-duration) var(--expansion-easing),
      box-shadow var(--expansion-duration) var(--expansion-easing),
      transform var(--duration-normal) var(--expansion-easing),
      opacity var(--duration-normal) ease,
      filter var(--duration-normal) ease;
    width: 100%;
    height: auto;
  }

  /* Component-specific choices belong to the component that owns them. The
     outer shell keeps one continuous card while its button remains a valid
     standalone control (interactive children never nest inside a button). */
  .loop-component-shell.expanded {
    background: color-mix(
      in srgb,
      var(--component-color) 38%,
      var(--theme-panel-bg, rgba(30, 30, 50, 0.95))
    );
    border-color: var(--component-color);
    box-shadow:
      inset 0 0 0 2px
        color-mix(in srgb, var(--component-color) 65%, transparent),
      0 0 20px color-mix(in srgb, var(--component-color) 45%, transparent);
  }

  .loop-component-shell.expanded .loop-component-button {
    background: transparent;
    border-color: transparent;
    border-radius: 10px 10px 0 0;
    box-shadow: none;
  }

  .loop-component-shell.expanded .loop-component-button:hover {
    background: color-mix(in srgb, var(--component-color) 16%, transparent);
    border-color: transparent;
    transform: none;
  }

  .loop-component-shell.expanded .loop-component-button:focus-visible {
    outline-color: var(--component-color);
    outline-offset: -3px;
  }

  .component-expansion {
    padding: 0 10px 10px;
  }

  /* The controls stay mounted so opening and closing can share one smooth
     height animation without dropping focus state or rebuilding snippets. */
  .component-expansion-clip {
    flex: 0 0 auto;
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    visibility: hidden;
    transition:
      grid-template-rows var(--expansion-duration) var(--expansion-easing),
      opacity var(--duration-fast) ease,
      visibility 0s linear var(--expansion-duration);
  }

  .component-expansion-clip.open {
    grid-template-rows: 1fr;
    opacity: 1;
    visibility: visible;
    transition:
      grid-template-rows var(--expansion-duration) var(--expansion-easing),
      opacity var(--duration-fast) ease var(--duration-instant),
      visibility 0s;
  }

  .component-expansion-crop {
    min-height: 0;
    overflow: hidden;
  }

  .loop-component-button:hover {
    background: color-mix(
      in srgb,
      var(--component-color) 25%,
      rgba(30, 30, 50, 0.95)
    );
    border-color: var(--component-color);
    transform: translateY(-1px);
  }

  .loop-component-button:active {
    transform: translateY(0) scale(0.98);
  }

  .loop-component-button:focus-visible {
    outline: 2px solid var(--theme-accent, rgba(139, 92, 246, 0.8));
    outline-offset: 2px;
  }

  /* No implemented combo contains this component alongside the current
     selection — visibly out of play, no hover invitation. */
  .loop-component-button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    filter: saturate(0.3);
  }

  .loop-component-button:disabled:hover {
    background: color-mix(
      in srgb,
      var(--component-color) 15%,
      rgba(30, 30, 50, 0.9)
    );
    border-color: color-mix(in srgb, var(--component-color) 50%, transparent);
    transform: none;
  }

  /* Strong, unmistakable selected state. Border stays 2px (no layout shift);
     the emphasis comes from an inset ring + outer glow (box-shadow only). */
  .loop-component-button.selected {
    background: color-mix(
      in srgb,
      var(--component-color) 45%,
      rgba(30, 30, 50, 0.95)
    );
    border-color: var(--component-color);
    box-shadow:
      inset 0 0 0 2px
        color-mix(in srgb, var(--component-color) 75%, transparent),
      0 0 20px color-mix(in srgb, var(--component-color) 55%, transparent);
  }

  /* Vertical layout (Build Combo mode - no description) */
  .button-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
  }

  .text-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  /* Horizontal layout (Quick Apply mode - with description) */
  .loop-component-button.with-description .button-content {
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 12px;
  }

  .loop-component-button.with-description .text-content {
    align-items: flex-start;
    flex: 1;
  }

  .loop-component-icon {
    font-size: 1.5rem;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .loop-component-button.with-description .loop-component-icon {
    font-size: 1.75rem;
    width: 48px;
    height: 48px;
    background: color-mix(in srgb, var(--component-color) 25%, transparent);
    border-radius: 10px;
  }

  .loop-component-label {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .loop-component-description {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    line-height: 1.3;
  }

  /* Guest-locked: muted like disabled, but stays interactive (tap -> sign-up). */
  .loop-component-button.locked {
    opacity: 0.55;
    filter: saturate(0.55);
  }

  .lock-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 22px;
    height: 22px;
    background: rgba(20, 20, 35, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text, white);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }

  .check-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 26px;
    height: 26px;
    background: var(--component-color);
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
    opacity: 0;
    transform: scale(0.72);
    pointer-events: none;
    transition:
      opacity var(--duration-normal) var(--expansion-easing),
      transform var(--expansion-duration) var(--expansion-easing);
  }

  .check-badge.visible {
    opacity: 1;
    transform: scale(1);
  }

  .check-badge svg {
    width: 16px;
    height: 16px;
    color: white;
  }

  /* The settings control is a sibling of the selection button, never an
     interactive child inside it. Its 44px hit area surrounds a compact visual
     badge so the tile stays readable on narrow phones. */
  .configure-button {
    position: absolute;
    z-index: 3;
    top: 0;
    right: 0;
    display: none;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--component-color);
    cursor: pointer;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
  }

  .configure-button-visual {
    display: flex;
    width: 24px;
    height: 24px;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, var(--component-color) 75%, white 25%);
    border-radius: 50%;
    background: color-mix(
      in srgb,
      var(--component-color) 28%,
      var(--theme-panel-bg, #18152a)
    );
    box-shadow: 0 0 8px
      color-mix(in srgb, var(--component-color) 55%, transparent);
    transition:
      transform var(--duration-fast) var(--ease-out),
      background var(--duration-fast) ease;
  }

  .configure-button:hover .configure-button-visual,
  .configure-button:focus-visible .configure-button-visual {
    transform: scale(1.08);
    background: color-mix(
      in srgb,
      var(--component-color) 46%,
      var(--theme-panel-bg, #18152a)
    );
  }

  .configure-button:focus-visible {
    outline: 2px solid var(--component-color);
    outline-offset: -4px;
    border-radius: 10px;
  }

  @media (max-width: 768px) {
    .configure-button {
      display: flex;
    }

    .loop-component-shell.with-configure-action .check-badge {
      display: none;
    }

    .loop-component-button.compact-on-mobile .button-content {
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .loop-component-button.compact-on-mobile .text-content {
      align-items: center;
    }

    .loop-component-button.compact-on-mobile .loop-component-icon {
      width: auto;
      height: auto;
      font-size: 1.5rem;
      background: transparent;
    }

    .loop-component-button.compact-on-mobile .loop-component-description {
      display: none;
    }
  }

  @media (min-width: 769px) and (max-width: 1023px) {
    :global(.loop-drawer-sheet[data-placement="bottom"]) .configure-button {
      display: flex;
    }

    :global(.loop-drawer-sheet[data-placement="bottom"])
      .loop-component-shell.with-configure-action
      .check-badge {
      display: none;
    }
  }

  @media (min-width: 769px) and (max-height: 700px) {
    :global(.loop-drawer-sheet[data-placement="right"]) .configure-button {
      display: flex;
    }

    :global(.loop-drawer-sheet[data-placement="right"])
      .loop-component-shell.with-configure-action
      .check-badge {
      display: none;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .loop-component-shell,
    .loop-component-button,
    .component-expansion-clip,
    .component-expansion-clip.open,
    .check-badge {
      transition: none;
    }
    .loop-component-button:hover,
    .loop-component-button:active {
      transform: none;
    }
  }
</style>
