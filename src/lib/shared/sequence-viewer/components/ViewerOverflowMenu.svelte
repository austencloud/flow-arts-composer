<!--
  ViewerOverflowMenu.svelte

  Secondary sequence-viewer actions. Bits UI owns menu focus, keyboard
  focus, outside-click dismissal, and viewport collision handling.
-->
<script lang="ts">
  import { Popover } from "bits-ui";
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import MotionColorChips from "$lib/shared/components/MotionColorChips.svelte";
  import PrimaryPropColorSettings from "$lib/shared/settings/components/tabs/prop-type/PrimaryPropColorSettings.svelte";
  import {
    getSettings,
    updateSetting,
  } from "$lib/shared/application/state/app-state.svelte";
  import {
    shareTarget,
    saveActionLabel,
  } from "$lib/shared/mobile/share-action.svelte";

  type OverflowOpenReason = "trigger" | "item" | "backdrop" | "escape" | "tab";

  interface Props {
    isPublished?: boolean;
    onCopyLink?: () => void;
    linkCopied?: boolean;
    onPropsOpen?: () => void;
    propsLabel?: string;
    onPublish?: () => void;
    onUnpublish?: () => void;
    onDeleteRequest?: () => void;
    practiceActive?: boolean;
    onPracticeToggle?: () => void;
    onVideoUpload?: () => void;
    variant?: "header" | "footer";
    dropDown?: boolean;
    align?: "left" | "right" | "center";
    showLabel?: boolean;
    trigger?: Snippet<[{ isOpen: boolean; hasMenu: boolean }]>;
    isFavorite?: boolean;
    onFavoriteToggle?: () => void;
    isSaved?: boolean;
    isSaving?: boolean;
    onSave?: () => void;
    onRemix?: () => void;
    onSendTo?: () => void;
    remixLabel?: string;
    onDownload?: () => void;
    downloadBusy?: boolean;
    onOpenApp?: () => void;
    openAppLabel?: string;
    onGuideAction?: () => void;
    guideActionLabel?: string;
    motionVisibility?: {
      showLeft: boolean;
      showRight: boolean;
      onToggleLeft: () => void;
      onToggleRight: () => void;
    };
    onOpenChange?: (open: boolean, reason: OverflowOpenReason) => void;
  }

  interface MenuItem {
    label: string;
    icon: string;
    action: () => void;
    className?: string;
    dividerBefore?: boolean;
    disabled?: boolean;
  }

  let {
    isPublished = false,
    onCopyLink,
    linkCopied = false,
    onPropsOpen,
    propsLabel = "Props",
    onPublish,
    onUnpublish,
    onDeleteRequest,
    practiceActive = false,
    onPracticeToggle,
    onVideoUpload,
    variant = "header",
    dropDown = false,
    align = "right",
    showLabel = false,
    trigger,
    isFavorite = false,
    onFavoriteToggle,
    isSaved = true,
    isSaving = false,
    onSave,
    onRemix,
    onSendTo,
    remixLabel = "Remix",
    onDownload,
    downloadBusy = false,
    onOpenApp,
    openAppLabel = "Open Flow Arts Composer",
    onGuideAction,
    guideActionLabel = "See it in the Guide",
    motionVisibility,
    onOpenChange,
  }: Props = $props();

  let isOpen = $state(false);
  let pendingCloseReason: Exclude<OverflowOpenReason, "trigger"> = "backdrop";

  const menuAlign = $derived(
    align === "left" ? "start" : align === "right" ? "end" : "center"
  );

  function asButtonAttributes(props: unknown): HTMLButtonAttributes {
    return props as HTMLButtonAttributes;
  }

  function handleOpenChange(nextOpen: boolean): void {
    const reason = nextOpen ? "trigger" : pendingCloseReason;
    isOpen = nextOpen;
    onOpenChange?.(nextOpen, reason);
    if (!nextOpen) pendingCloseReason = "backdrop";
  }

  function noteTriggerClick(): void {
    if (isOpen) pendingCloseReason = "backdrop";
  }

  function handleItemSelect(action: () => void): void {
    pendingCloseReason = "item";
    handleOpenChange(false);
    action();
  }

  const menuItems = $derived.by((): MenuItem[] => {
    const items: MenuItem[] = [];

    if (onFavoriteToggle) {
      items.push({
        label: isFavorite ? "Unfavorite" : "Favorite",
        icon: "fa-heart",
        action: onFavoriteToggle,
        className: isFavorite ? "favorited" : undefined,
      });
    }
    if (onSave && !isSaved) {
      items.push({
        label: isSaving ? "Saving…" : "Save",
        icon: isSaving ? "fa-spinner fa-spin" : "fa-bookmark",
        action: onSave,
        className: isSaving ? "saving" : undefined,
        disabled: isSaving,
      });
    }
    if (onRemix) {
      items.push({
        label: remixLabel,
        icon: "fa-pen-to-square",
        action: onRemix,
      });
    }
    if (onSendTo) {
      items.push({
        label: "Send sequence",
        icon: "fa-paper-plane",
        action: onSendTo,
      });
    }
    if (onDownload) {
      items.push({
        label: downloadBusy ? "Preparing…" : saveActionLabel(),
        icon: downloadBusy
          ? "fa-spinner fa-spin"
          : shareTarget.isMobile
            ? "fa-share-nodes"
            : "fa-download",
        action: onDownload,
        disabled: downloadBusy,
      });
    }
    if (onOpenApp) {
      items.push({
        label: openAppLabel,
        icon: "fa-compass",
        action: onOpenApp,
        dividerBefore: items.length > 0,
      });
    }
    if (onGuideAction) {
      items.push({
        label: guideActionLabel,
        icon: "fa-book-open",
        action: onGuideAction,
        dividerBefore: items.length > 0,
      });
    }
    if (onPracticeToggle) {
      items.push({
        label: practiceActive ? "Stop Practice" : "Practice Mode",
        icon: practiceActive ? "fa-stop" : "fa-dumbbell",
        action: onPracticeToggle,
        className: practiceActive ? "practice-active" : undefined,
        dividerBefore: items.length > 0,
      });
    }
    if (onVideoUpload) {
      items.push({
        label: "Upload Video",
        icon: "fa-video",
        action: onVideoUpload,
      });
    }
    if (onPropsOpen) {
      items.push({
        label: propsLabel,
        icon: "fa-wand-magic-sparkles",
        action: onPropsOpen,
        dividerBefore: items.length > 0,
      });
    }
    if (onCopyLink) {
      items.push({
        label: linkCopied ? "Copied!" : "Copy Link",
        icon: linkCopied ? "fa-check" : "fa-link",
        action: onCopyLink,
        className: linkCopied ? "copied" : undefined,
        dividerBefore: !onPropsOpen && items.length > 0,
      });
    }
    if (onPublish || onUnpublish) {
      items.push({
        label: isPublished ? "Make Private" : "Make Public",
        icon: isPublished ? "fa-eye-slash" : "fa-eye",
        action: (isPublished ? onUnpublish : onPublish) ?? (() => {}),
        dividerBefore: !(onPropsOpen || onCopyLink) && items.length > 0,
      });
    }
    if (onDeleteRequest) {
      items.push({
        label: "Delete",
        icon: "fa-trash",
        action: onDeleteRequest,
        className: "delete",
      });
    }

    return items;
  });

  const hasItems = $derived(menuItems.length > 0);
  const hasMenu = $derived(hasItems || !!motionVisibility);
  const shouldRender = $derived(hasMenu || !!trigger);
</script>

{#if shouldRender}
  <div class="overflow-wrapper" class:title-trigger={!!trigger}>
    {#if hasMenu}
      <Popover.Root open={isOpen} onOpenChange={handleOpenChange}>
        <Popover.Trigger onclick={noteTriggerClick}>
          {#snippet child({ props })}
            {@const triggerProps = asButtonAttributes(props)}
            <button
              {...triggerProps}
              type="button"
              class="overflow-trigger"
              class:header-variant={variant === "header" && !trigger}
              class:labelled-trigger={showLabel && !trigger}
              class:title-variant={!!trigger}
              aria-label="More actions"
            >
              {#if trigger}
                {@render trigger({ isOpen, hasMenu })}
              {:else}
                <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
                {#if showLabel}<span>More</span>{/if}
              {/if}
            </button>
          {/snippet}
        </Popover.Trigger>

        <!-- The sequence viewer drawer already owns scroll locking. Keep this
             menu inside that boundary and opt out of Bits UI's nested body
             lock, which would disable pointer events on the trigger itself. -->
        <Popover.Portal disabled>
          <Popover.Content
            preventScroll={false}
            side={dropDown ? "bottom" : "top"}
            align={menuAlign}
            sideOffset={8}
            collisionPadding={12}
            class="viewer-overflow-popover"
            aria-label="More actions"
          >
            {#if motionVisibility}
              <div class="motion-vis-section">
                <span class="motion-vis-label">Motion</span>
                <MotionColorChips
                  showLeft={motionVisibility.showLeft}
                  showRight={motionVisibility.showRight}
                  onToggleLeft={motionVisibility.onToggleLeft}
                  onToggleRight={motionVisibility.onToggleRight}
                  showVisibilityIcons
                />
                <PrimaryPropColorSettings
                  colors={getSettings().primaryPropColors}
                  darkMode={getSettings().darkMode}
                  onchange={(colors) =>
                    updateSetting("primaryPropColors", colors)}
                />
              </div>
              {#if hasItems}
                <hr class="viewer-overflow-divider" />
              {/if}
            {/if}

            {#each menuItems as item}
              {#if item.dividerBefore}
                <hr class="viewer-overflow-divider" />
              {/if}
              <button
                type="button"
                class="viewer-overflow-item {item.className ?? ''}"
                disabled={item.disabled}
                onclick={() => handleItemSelect(item.action)}
              >
                <i class="fas {item.icon}" aria-hidden="true"></i>
                <span>{item.label}</span>
              </button>
            {/each}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    {:else if trigger}
      <div class="overflow-trigger title-variant static">
        {@render trigger({ isOpen: false, hasMenu: false })}
      </div>
    {/if}
  </div>
{/if}

<style>
  .overflow-wrapper {
    position: relative;
  }

  .overflow-wrapper.title-trigger {
    max-width: 100%;
  }

  .overflow-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    font-size: 16px;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  @media (hover: hover) and (pointer: fine) {
    .overflow-trigger:hover {
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      color: var(--theme-text, white);
    }
  }

  .overflow-trigger:active {
    transform: scale(0.94);
    transition-duration: 0ms;
  }

  .overflow-trigger:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .overflow-trigger.title-variant {
    width: auto;
    height: auto;
    max-width: 100%;
    min-height: var(--min-touch-target, 44px);
    gap: 8px;
    padding: 2px 8px;
    border: none;
    border-radius: 10px;
    background: none;
    color: var(--theme-text, #fff);
  }

  @media (hover: hover) and (pointer: fine) {
    .overflow-trigger.title-variant:hover {
      background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
      color: var(--theme-text, #fff);
    }
  }

  .overflow-trigger.title-variant:active {
    transform: none;
  }

  .overflow-trigger.title-variant.static {
    cursor: default;
  }

  .overflow-trigger.title-variant.static:hover {
    background: none;
  }

  .overflow-trigger.header-variant {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--theme-text, #ffffff) 7%, transparent),
        transparent 72%
      ),
      var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    box-shadow:
      inset 0 1px 0
        color-mix(in srgb, var(--theme-text, #ffffff) 9%, transparent),
      0 2px 6px
        color-mix(in srgb, var(--theme-shadow, #000000) 32%, transparent);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.76));
  }

  .overflow-trigger.header-variant.labelled-trigger {
    width: auto;
    gap: 8px;
    padding-inline: 12px;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
  }

  :global(.viewer-overflow-popover) {
    z-index: var(--z-dropdown, 1000);
    min-width: 12rem;
    max-width: calc(100vw - 24px);
    max-height: min(70dvh, 32rem);
    overflow-y: auto;
    padding: 4px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 12px);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    box-shadow: 0 8px 32px var(--theme-shadow, rgba(0, 0, 0, 0.4));
    outline: none;
    transform-origin: var(--bits-popover-content-transform-origin);
  }

  :global(.viewer-overflow-popover[data-state="open"]) {
    animation: viewer-overflow-enter 150ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  :global(.viewer-overflow-item) {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    gap: 10px;
    padding: 0 12px;
    border: none;
    border-radius: var(--radius-sm, 8px);
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    cursor: pointer;
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    outline: none;
    user-select: none;
    white-space: nowrap;
  }

  :global(.viewer-overflow-item:is(:hover, :focus-visible)) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, white);
  }

  :global(.viewer-overflow-item:disabled) {
    cursor: not-allowed;
    opacity: 0.45;
  }

  :global(.viewer-overflow-item i) {
    width: 20px;
    flex: 0 0 20px;
    font-size: 14px;
    text-align: center;
  }

  :global(.viewer-overflow-item.delete) {
    color: var(--semantic-error, #ef4444);
  }

  :global(.viewer-overflow-item.delete:is(:hover, :focus-visible)) {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
    color: var(--semantic-error, #ef4444);
  }

  :global(.viewer-overflow-item.copied) {
    color: var(--semantic-success, #22c55e);
  }

  :global(.viewer-overflow-item.favorited) {
    color: var(--semantic-error, #ef4444);
  }

  :global(.viewer-overflow-item.saving) {
    color: var(--semantic-info, #38bdf8);
  }

  :global(.viewer-overflow-item.practice-active) {
    color: var(--semantic-error, #f87171);
  }

  :global(.viewer-overflow-divider) {
    border: 0;
    height: 1px;
    margin: 4px 8px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .motion-vis-section {
    box-sizing: border-box;
    width: min(320px, calc(100vw - 48px));
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 6px 8px 2px;
  }

  .motion-vis-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
  }

  .motion-vis-section :global(.motion-color-chips) {
    width: 100%;
  }

  .motion-vis-section :global(.chip) {
    flex: 1;
  }

  @keyframes viewer-overflow-enter {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-contrast: more) {
    .overflow-trigger,
    :global(.viewer-overflow-popover) {
      border-width: 2px;
    }
  }

  @media (forced-colors: active) {
    .overflow-trigger {
      border: 2px solid ButtonText;
      background: Canvas;
      color: ButtonText;
      forced-color-adjust: auto;
    }

    :global(.viewer-overflow-item) {
      color: ButtonText;
    }

    :global(.viewer-overflow-item:is(:hover, :focus-visible)) {
      background: Highlight;
      color: HighlightText;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .overflow-trigger {
      transition: none;
    }

    .overflow-trigger:active {
      transform: none;
    }

    :global(.viewer-overflow-popover[data-state="open"]) {
      animation: none;
    }
  }
</style>
