<!--
  ViewerOverflowMenu.svelte

  Secondary sequence-viewer actions. Bits UI owns menu focus, keyboard
  focus, outside-click dismissal, and viewport collision handling.

  One narrow list. Settings never sit open inside it: each group is a row
  with a summary and a chevron that swaps the popover to that group's own
  screen, with a back arrow (.claude/rules/no-page-scroll.md, "controls drill
  down"). The Download video screen's File and Show boxes in
  PostShareSheet.svelte are the same pattern.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Popover } from "bits-ui";
  import { tick, type Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import MotionColorChips from "#lib/shared/components/MotionColorChips.svelte";
  import LabeledColorPairPicker from "#lib/shared/ui/components/LabeledColorPairPicker.svelte";
  import { randomCoolWarmPair } from "#lib/shared/ui/color-temperature.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { resolveViewerCustomColorPair } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import { getMotionColor } from "#lib/shared/utils/svg-color-utils.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import {
    getSettings,
    updateSetting,
  } from "#lib/shared/application/state/app-state.svelte.js";
  import {
    shareTarget,
    saveActionLabel,
  } from "#lib/shared/mobile/share-action.svelte.js";

  type OverflowOpenReason = "trigger" | "item" | "backdrop" | "escape" | "tab";
  type MenuScreen = "menu" | "motion" | "colors";

  interface Props {
    isPublished?: boolean;
    onCopyLink?: () => void;
    linkCopied?: boolean;
    onPropsOpen?: () => void;
    /** The Props row's whole label, for hosts that do not pass a summary. */
    propsLabel?: string;
    /** The current props by name ("Double Staff"), shown dim at the row's end. */
    propsSummary?: string;
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
    onAddToCollection?: () => void;
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
    propsLabel,
    propsSummary,
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
    onAddToCollection,
    onRemix,
    onSendTo,
    remixLabel,
    onDownload,
    downloadBusy = false,
    onOpenApp,
    openAppLabel,
    onGuideAction,
    guideActionLabel,
    motionVisibility,
    onOpenChange,
  }: Props = $props();

  let isOpen = $state(false);
  let pendingCloseReason: Exclude<OverflowOpenReason, "trigger"> = "backdrop";
  let screen = $state<MenuScreen>("menu");
  let contentEl = $state<HTMLElement | null>(null);
  let diceButton = $state<HTMLButtonElement | null>(null);
  let resetButton = $state<HTMLButtonElement | null>(null);

  const menuAlign = $derived(
    align === "left" ? "start" : align === "right" ? "end" : "center"
  );

  function asButtonAttributes(props: unknown): HTMLButtonAttributes {
    return props as HTMLButtonAttributes;
  }

  function handleOpenChange(nextOpen: boolean): void {
    const reason = nextOpen ? "trigger" : pendingCloseReason;
    isOpen = nextOpen;
    // Always reopen on the list, whichever screen it was closed from.
    if (!nextOpen) screen = "menu";
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

  /** Focus a control on the screen now showing. The leaving screen stays in
      the DOM through its fade but is inert, so it is skipped. */
  async function focusOnShownScreen(selector: string): Promise<void> {
    await tick();
    contentEl
      ?.querySelector<HTMLElement>(`.layer:not([inert]) ${selector}`)
      ?.focus({ preventScroll: true });
  }

  function openScreen(next: Exclude<MenuScreen, "menu">): void {
    screen = next;
    void focusOnShownScreen(".drill-back");
  }

  // Back lands on the row that opened the screen, not the top of the list,
  // so a keyboard user carries on from where they were.
  function backToMenu(): void {
    const from = screen;
    screen = "menu";
    void focusOnShownScreen(`[data-drill="${from}"]`);
  }

  const darkMode = $derived(getSettings().darkMode ?? true);
  const primaryColors = $derived(getSettings().primaryPropColors ?? null);
  const palette = $derived(
    resolveViewerCustomColorPair(primaryColors, {
      left: getMotionColor(HandSide.LEFT, darkMode ? "dark" : "light"),
      right: getMotionColor(HandSide.RIGHT, darkMode ? "dark" : "light"),
    })
  );

  function setPrimaryColors(
    colors: { left: string; right: string } | null
  ): void {
    updateSetting("primaryPropColors", colors);
  }

  // Reset disables itself, and a disabled button drops focus to the page.
  // Hand it to the dice beside it instead.
  function resetColors(): void {
    const hadFocus = document.activeElement === resetButton;
    setPrimaryColors(null);
    if (hadFocus) void tick().then(() => diceButton?.focus());
  }

  const motionSummary = $derived.by(() => {
    if (!motionVisibility) return "";
    const { showLeft, showRight } = motionVisibility;
    if (showLeft && showRight) return t("viewer_ui_motion_both");
    return showLeft
      ? t("viewer_ui_motion_left_only")
      : t("viewer_ui_motion_right_only");
  });

  // Ways out of the viewer lead the menu, and the app is the one primary
  // action: a scanner never found "Open Flow Arts Composer" when it sat
  // under the settings.
  const leadItems = $derived.by((): MenuItem[] => {
    const items: MenuItem[] = [];
    if (onOpenApp) {
      items.push({
        label: openAppLabel ?? t("viewer_ui_open_app"),
        icon: "fa-compass",
        action: onOpenApp,
        className: "primary",
      });
    }
    if (onGuideAction) {
      items.push({
        label: guideActionLabel ?? t("viewer_ui_see_guide"),
        icon: "fa-book-open",
        action: onGuideAction,
      });
    }
    return items;
  });

  const actionItems = $derived.by((): MenuItem[] => {
    const items: MenuItem[] = [];

    if (onFavoriteToggle) {
      items.push({
        label: isFavorite ? t("viewer_ui_unfavorite") : t("viewer_ui_favorite"),
        icon: "fa-heart",
        action: onFavoriteToggle,
        className: isFavorite ? "favorited" : undefined,
      });
    }
    if (onSave && !isSaved) {
      items.push({
        label: isSaving ? t("viewer_ui_saving") : t("viewer_ui_save"),
        icon: isSaving ? "fa-spinner fa-spin" : "fa-bookmark",
        action: onSave,
        className: isSaving ? "saving" : undefined,
        disabled: isSaving,
      });
    }
    if (onAddToCollection) {
      items.push({
        label: t("browse_audit_add_to_collection"),
        icon: "fa-folder-plus",
        action: onAddToCollection,
      });
    }
    if (onRemix) {
      items.push({
        label: remixLabel ?? t("viewer_ui_remix"),
        icon: "fa-pen-to-square",
        action: onRemix,
      });
    }
    if (onSendTo) {
      items.push({
        label: t("viewer_ui_send_sequence"),
        icon: "fa-paper-plane",
        action: onSendTo,
      });
    }
    if (onDownload) {
      items.push({
        label: downloadBusy ? t("viewer_ui_preparing") : saveActionLabel(),
        icon: downloadBusy
          ? "fa-spinner fa-spin"
          : shareTarget.isMobile
            ? "fa-share-nodes"
            : "fa-download",
        action: onDownload,
        disabled: downloadBusy,
      });
    }
    if (onPracticeToggle) {
      items.push({
        label: practiceActive
          ? t("viewer_ui_stop_practice")
          : t("viewer_ui_practice_mode"),
        icon: practiceActive ? "fa-stop" : "fa-dumbbell",
        action: onPracticeToggle,
        className: practiceActive ? "practice-active" : undefined,
        dividerBefore: items.length > 0,
      });
    }
    if (onVideoUpload) {
      items.push({
        label: t("viewer_ui_upload_video_title"),
        icon: "fa-video",
        action: onVideoUpload,
      });
    }

    return items;
  });

  const ownerItems = $derived.by((): MenuItem[] => {
    const items: MenuItem[] = [];
    if (onCopyLink) {
      items.push({
        label: linkCopied ? t("viewer_ui_copied") : t("viewer_ui_copy_link"),
        icon: linkCopied ? "fa-check" : "fa-link",
        action: onCopyLink,
        className: linkCopied ? "copied" : undefined,
      });
    }
    if (onPublish || onUnpublish) {
      items.push({
        label: isPublished
          ? t("viewer_ui_make_private")
          : t("viewer_ui_make_public"),
        icon: isPublished ? "fa-eye-slash" : "fa-eye",
        action: (isPublished ? onUnpublish : onPublish) ?? (() => {}),
      });
    }
    if (onDeleteRequest) {
      items.push({
        label: t("viewer_ui_delete"),
        icon: "fa-trash",
        action: onDeleteRequest,
        className: "delete",
      });
    }
    return items;
  });

  // A host that names the props gets "Props" plus the name; an older host's
  // full label still reads on its own.
  const propsRowLabel = $derived(
    propsSummary ? t("viewer_ui_props") : (propsLabel ?? t("viewer_ui_props"))
  );

  // Dividers go only between groups that are actually there.
  const sections = $derived({
    lead: leadItems.length > 0,
    actions: actionItems.length > 0,
    display: !!motionVisibility || !!onPropsOpen,
    owner: ownerItems.length > 0,
  });
  const hasMenu = $derived(Object.values(sections).some(Boolean));
  const shouldRender = $derived(hasMenu || !!trigger);
</script>

{#snippet menuButton(item: MenuItem)}
  <button
    type="button"
    class="viewer-overflow-item {item.className ?? ''}"
    disabled={item.disabled}
    onclick={() => handleItemSelect(item.action)}
  >
    <i class="fas {item.icon}" aria-hidden="true"></i>
    <span>{item.label}</span>
  </button>
{/snippet}

{#snippet drillRow(
  id: string,
  icon: string,
  label: string,
  onclick: () => void,
  summary: Snippet
)}
  <button
    type="button"
    class="viewer-overflow-item drill-row"
    data-drill={id}
    {onclick}
  >
    <i class="fas {icon}" aria-hidden="true"></i>
    <span class="drill-label">{label}</span>
    <span class="drill-summary">{@render summary()}</span>
    <i class="fas fa-chevron-right drill-chevron" aria-hidden="true"></i>
  </button>
{/snippet}

{#snippet motionSummaryText()}
  <span class="drill-summary-text">{motionSummary}</span>
{/snippet}

{#snippet colorsSummary()}
  <span class="drill-swatches" aria-hidden="true">
    <span style:background={palette.left}></span>
    <span style:background={palette.right}></span>
  </span>
  <span class="drill-summary-text"
    >{primaryColors
      ? t("viewer_ui_custom")
      : t("viewer_ui_prop_colors_default")}</span
  >
{/snippet}

{#snippet propsSummaryText()}
  {#if propsSummary}
    <span class="drill-summary-text">{propsSummary}</span>
  {/if}
{/snippet}

{#snippet screenHeader(title: string, actions?: Snippet)}
  <div class="drill-header">
    <button
      type="button"
      class="viewer-overflow-item drill-back"
      aria-label={t("common_back")}
      onclick={backToMenu}
    >
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
    </button>
    <span class="drill-title">{title}</span>
    {#if actions}<span class="drill-actions">{@render actions()}</span>{/if}
  </div>
{/snippet}

{#snippet menuScreen()}
  {#each leadItems as item}
    {@render menuButton(item)}
  {/each}

  {#if sections.actions}
    {#if sections.lead}<hr class="viewer-overflow-divider" />{/if}
    {#each actionItems as item}
      {#if item.dividerBefore}
        <hr class="viewer-overflow-divider" />
      {/if}
      {@render menuButton(item)}
    {/each}
  {/if}

  {#if sections.display}
    {#if sections.lead || sections.actions}
      <hr class="viewer-overflow-divider" />
    {/if}
    <span class="group-label">{t("viewer_ui_display")}</span>
    {#if motionVisibility}
      {@render drillRow(
        "motion",
        "fa-eye",
        t("viewer_ui_motion"),
        () => openScreen("motion"),
        motionSummaryText
      )}
      {@render drillRow(
        "colors",
        "fa-palette",
        t("settings_prop_colors"),
        () => openScreen("colors"),
        colorsSummary
      )}
    {/if}
    {#if onPropsOpen}
      {@const openProps = onPropsOpen}
      <!-- The viewing control is its own sheet, so this row closes the menu
           first. It still looks like a drill row because it opens a screen. -->
      {@render drillRow(
        "props",
        "fa-wand-magic-sparkles",
        propsRowLabel,
        () => handleItemSelect(openProps),
        propsSummaryText
      )}
    {/if}
  {/if}

  {#if sections.owner}
    {#if sections.lead || sections.actions || sections.display}
      <hr class="viewer-overflow-divider" />
    {/if}
    {#each ownerItems as item}
      {@render menuButton(item)}
    {/each}
  {/if}
{/snippet}

{#snippet colorActions()}
  <button
    type="button"
    class="viewer-overflow-item drill-icon"
    bind:this={diceButton}
    aria-label={t("settings_random_prop_colors")}
    title={t("settings_random_prop_colors")}
    onclick={() => setPrimaryColors(randomCoolWarmPair(palette, darkMode))}
  >
    <i class="fas fa-dice" aria-hidden="true"></i>
  </button>
  <button
    type="button"
    class="viewer-overflow-item drill-icon"
    bind:this={resetButton}
    aria-label={t("settings_use_default_colors")}
    title={t("settings_use_default_colors")}
    disabled={!primaryColors}
    onclick={resetColors}
  >
    <i class="fas fa-rotate-left" aria-hidden="true"></i>
  </button>
{/snippet}

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
              aria-label={t("viewer_ui_more_actions")}
            >
              {#if trigger}
                {@render trigger({ isOpen, hasMenu })}
              {:else}
                <i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>
                {#if showLabel}<span>{t("viewer_ui_more")}</span>{/if}
              {/if}
            </button>
          {/snippet}
        </Popover.Trigger>

        <!-- The sequence viewer drawer already owns scroll locking. Keep this
             menu inside that boundary and opt out of Bits UI's nested body
             lock, which would disable pointer events on the trigger itself. -->
        <Popover.Portal disabled>
          <Popover.Content
            bind:ref={contentEl}
            preventScroll={false}
            side={dropDown ? "bottom" : "top"}
            align={menuAlign}
            sideOffset={8}
            collisionPadding={12}
            class="viewer-overflow-popover"
            aria-label={t("viewer_ui_more_actions")}
          >
            <!-- The list and a settings screen differ a lot in height, so the
                 box eases between them instead of jumping. -->
            <Crossfade key={screen} duration={DURATION.normal} animateHeight>
              {#if screen === "motion" && motionVisibility}
                <div class="drill-screen">
                  {@render screenHeader(t("viewer_ui_motion"))}
                  <div class="drill-body motion-body">
                    <MotionColorChips
                      showLeft={motionVisibility.showLeft}
                      showRight={motionVisibility.showRight}
                      onToggleLeft={motionVisibility.onToggleLeft}
                      onToggleRight={motionVisibility.onToggleRight}
                      showVisibilityIcons
                    />
                  </div>
                </div>
              {:else if screen === "colors"}
                <div class="drill-screen colors-screen">
                  {@render screenHeader(
                    t("settings_prop_colors"),
                    colorActions
                  )}
                  <div class="drill-body">
                    <LabeledColorPairPicker
                      left={palette.left}
                      right={palette.right}
                      valueLabel="name"
                      showPairPreview={false}
                      valueNames={primaryColors
                        ? undefined
                        : {
                            left: t("viewer_ui_prop_colors_default"),
                            right: t("viewer_ui_prop_colors_default"),
                          }}
                      onchange={(hand, value) =>
                        setPrimaryColors({ ...palette, [hand]: value })}
                      onswap={() =>
                        setPrimaryColors({
                          ...palette,
                          left: palette.right,
                          right: palette.left,
                        })}
                    />
                  </div>
                </div>
              {:else}
                <div class="menu-screen">{@render menuScreen()}</div>
              {/if}
            </Crossfade>
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
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
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
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.76));
  }

  .overflow-trigger.header-variant.labelled-trigger {
    width: auto;
    gap: 8px;
    padding-inline: 12px;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
  }

  /* One fixed width for every screen, so swapping the list for a settings
     screen never changes the popover's width. */
  :global(.viewer-overflow-popover) {
    box-sizing: border-box;
    z-index: var(--z-dropdown, 1000);
    width: min(20rem, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    /* Bits UI measures the room between the trigger and the screen edge, so
       the menu grows to its full length and scrolls only when it truly can't
       fit. */
    max-height: var(--bits-popover-content-available-height, 85dvh);
    overflow-y: auto;
    padding: 4px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 12px);
    background: var(--surface-panel-opaque);
    outline: none;
    transform-origin: var(--bits-popover-content-transform-origin);
  }

  :global(.viewer-overflow-popover[data-state="open"]) {
    animation: viewer-overflow-enter var(--duration-fast) var(--ease-out) both;
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

  /* The one primary action: the whole row tinted with a full border, never
     a strip on one edge. */
  :global(.viewer-overflow-item.primary) {
    border: 1px solid color-mix(in srgb, var(--theme-accent) 40%, transparent);
    background: color-mix(in srgb, var(--theme-accent) 16%, transparent);
    color: var(--theme-text);
    font-weight: 700;
  }

  :global(.viewer-overflow-item.primary:is(:hover, :focus-visible)) {
    border-color: color-mix(in srgb, var(--theme-accent) 55%, transparent);
    background: color-mix(in srgb, var(--theme-accent) 22%, transparent);
    color: var(--theme-text);
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

  .group-label {
    display: block;
    padding: 6px 12px 2px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
  }

  /* Label, then the current value dim at the far end, then a chevron that
     says the row opens a screen. The summary gives way first when space
     runs out. */
  .drill-label {
    flex: 0 0 auto;
  }

  .drill-summary {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    min-width: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: 13px;
    font-weight: 500;
  }

  .drill-summary-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .drill-swatches {
    display: flex;
    flex: 0 0 auto;
    gap: 3px;
  }

  .drill-swatches span {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--theme-text, #fff) 25%, transparent);
  }

  .viewer-overflow-item .drill-chevron {
    width: auto;
    flex: 0 0 auto;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: 12px;
  }

  .drill-header {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: var(--min-touch-target, 44px);
  }

  /* An open color editor can outgrow a short screen, and the popover's
     fallback scroll would carry Back away with it. Pinning the header keeps
     the way out in reach; the opaque panel fill stops rows showing through. */
  .colors-screen .drill-header {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface-panel-opaque);
  }

  /* Back, dice and reset are all the same bare 44px square, so the header's
     actions read as quietly as its back arrow. */
  .viewer-overflow-item:is(.drill-back, .drill-icon) {
    flex: 0 0 auto;
    width: var(--min-touch-target, 44px);
    justify-content: center;
    padding: 0;
  }

  .drill-title {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .drill-actions {
    display: flex;
    flex: 0 0 auto;
  }

  .drill-body {
    padding: 8px;
  }

  .motion-body :global(.motion-color-chips) {
    width: 100%;
  }

  .motion-body :global(.chip) {
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
