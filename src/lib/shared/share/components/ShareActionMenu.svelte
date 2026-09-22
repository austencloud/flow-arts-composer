<script lang="ts">
  import { DropdownMenu, Portal } from "bits-ui";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import type { ShareActionMenuItem } from "$lib/shared/share/domain/models/share-action-menu";

  interface Props {
    open?: boolean;
    actions: readonly ShareActionMenuItem[];
    useMobileSheet?: boolean;
    disabled?: boolean;
    busy?: boolean;
    canOpen?: boolean;
    ariaLabel?: string;
    tooltip?: string;
    sheetTitle?: string;
    triggerIcon?: string;
    triggerLabel?: string;
    testId?: string;
    idBase?: string;
    menuSide?: "top" | "right" | "bottom" | "left";
    menuAlign?: "start" | "center" | "end";
    menuSideOffset?: number;
    /**
     * Keep the desktop menu within its current modal or drawer boundary.
     * Use this when document.body is outside the owning focus trap.
     */
    containDesktopMenu?: boolean;
    statusMessage?: string;
    /**
     * Skip the menu and run this on press, keeping the trigger's chrome, tooltip,
     * busy state and test id identical to the menu-backed surfaces.
     *
     * Every share entry point in the app now lands on the same sheet, so a menu
     * in front of it is a fork in a road with one destination. Austen
     * (2026-08-11): "there should not be two separate context menus when you
     * click share." `actions` stays required — a caller that has not yet been
     * unified still renders a menu.
     */
    onDirectOpen?: (() => void) | null;
    /**
     * For a direct trigger that opens and closes a panel: whether it is open.
     * Exposed as `aria-pressed` and drawn as a ring around the trigger.
     */
    pressed?: boolean;
    onTriggerClick?: () => void;
    onBlockedOpen?: () => void;
    onActionSelect: (actionId: string) => void;
  }

  let {
    open = $bindable(false),
    actions,
    useMobileSheet = false,
    disabled = false,
    busy = false,
    canOpen = true,
    ariaLabel = "Share",
    tooltip = ariaLabel,
    sheetTitle = ariaLabel,
    triggerIcon = "fa-share-nodes",
    triggerLabel,
    testId,
    idBase = "share-action",
    menuSide = "top",
    menuAlign = "end",
    menuSideOffset = 10,
    containDesktopMenu = false,
    statusMessage = "",
    onDirectOpen = null,
    pressed,
    onTriggerClick = () => {},
    onBlockedOpen = () => {},
    onActionSelect,
  }: Props = $props();

  const sheetTitleId = $derived(`${idBase}-sheet-title`);
  const triggerBusy = $derived(busy);

  function asButtonAttributes(props: unknown): HTMLButtonAttributes {
    return props as HTMLButtonAttributes;
  }

  function handleDirectTrigger(event: MouseEvent): void {
    if (event.currentTarget instanceof HTMLButtonElement) {
      event.currentTarget.focus({ preventScroll: true });
    }
    onTriggerClick();
    if (!canOpen) {
      onBlockedOpen();
      return;
    }
    if (onDirectOpen) {
      onDirectOpen();
      return;
    }
    open = true;
  }

  function handleMenuOpenChange(nextOpen: boolean): void {
    if (nextOpen && !canOpen) {
      onBlockedOpen();
      open = false;
      return;
    }
    open = nextOpen;
  }

  function handleActionSelect(action: ShareActionMenuItem): void {
    if (action.disabled) return;
    if (action.closeOnSelect !== false) open = false;
    onActionSelect(action.id);
  }

  function itemClass(action: ShareActionMenuItem): string {
    const classes = ["share-action-item"];
    if (action.tone && action.tone !== "default") classes.push(action.tone);
    return classes.join(" ");
  }
</script>

<div class="share-action-control">
  {#if useMobileSheet || !canOpen || onDirectOpen}
    <button
      type="button"
      class="share-action-trigger"
      title={tooltip}
      aria-label={ariaLabel}
      aria-busy={triggerBusy}
      aria-haspopup={useMobileSheet && canOpen && !onDirectOpen
        ? "dialog"
        : undefined}
      aria-expanded={useMobileSheet && canOpen && !onDirectOpen
        ? open
        : undefined}
      aria-pressed={onDirectOpen ? pressed : undefined}
      data-testid={testId}
      disabled={disabled || busy}
      onclick={handleDirectTrigger}
    >
      <i
        class="fa-solid {triggerBusy ? 'fa-spinner fa-spin' : triggerIcon}"
        aria-hidden="true"
      ></i>
      {#if triggerLabel}
        <span class="share-action-trigger-label" aria-hidden="true">
          {triggerLabel}
        </span>
      {/if}
    </button>

    {#if useMobileSheet && canOpen && !onDirectOpen}
      <Portal>
        <Drawer
          bind:isOpen={open}
          placement="bottom"
          closeOnBackdrop={true}
          closeOnEscape={true}
          dismissible={true}
          showHandle={true}
          focusContainerOnOpen={true}
          labelledBy={sheetTitleId}
          class="share-action-sheet"
          backdropClass="share-action-backdrop"
        >
          <div class="share-action-sheet-content">
            <header class="share-action-sheet-header">
              <h2 id={sheetTitleId}>{sheetTitle}</h2>
              <button
                type="button"
                class="share-action-close"
                aria-label="Close share options"
                onclick={() => (open = false)}
              >
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </header>

            <div class="share-action-sheet-actions">
              {#each actions as action, index (action.id)}
                {#if index > 0 && actions[index - 1]?.section !== action.section}
                  <div class="share-action-separator" role="separator"></div>
                {/if}
                <button
                  type="button"
                  class="share-action-sheet-item"
                  class:success={action.tone === "success"}
                  class:danger={action.tone === "danger"}
                  disabled={action.disabled}
                  aria-busy={action.busy}
                  onclick={() => handleActionSelect(action)}
                >
                  <i class="fa-solid {action.icon}" aria-hidden="true"></i>
                  <span>{action.label}</span>
                </button>
              {/each}
            </div>
          </div>
        </Drawer>
      </Portal>
    {/if}
  {:else}
    <DropdownMenu.Root {open} onOpenChange={handleMenuOpenChange}>
      <DropdownMenu.Trigger
        disabled={disabled || busy}
        onclick={onTriggerClick}
      >
        {#snippet child({ props })}
          {@const triggerProps = asButtonAttributes(props)}
          <button
            {...triggerProps}
            type="button"
            class="share-action-trigger"
            title={tooltip}
            aria-label={ariaLabel}
            aria-busy={triggerBusy}
            data-testid={testId}
          >
            <i
              class="fa-solid {triggerBusy
                ? 'fa-spinner fa-spin'
                : triggerIcon}"
              aria-hidden="true"
            ></i>
            {#if triggerLabel}
              <span class="share-action-trigger-label" aria-hidden="true">
                {triggerLabel}
              </span>
            {/if}
          </button>
        {/snippet}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal disabled={containDesktopMenu}>
        <DropdownMenu.Content
          side={menuSide}
          align={menuAlign}
          sideOffset={menuSideOffset}
          collisionPadding={12}
          class="share-action-menu"
          aria-label={ariaLabel}
        >
          {#each actions as action, index (action.id)}
            {#if index > 0 && actions[index - 1]?.section !== action.section}
              <DropdownMenu.Separator class="share-action-menu-separator" />
            {/if}
            <DropdownMenu.Item
              class={itemClass(action)}
              disabled={action.disabled}
              closeOnSelect={action.closeOnSelect !== false}
              textValue={action.label}
              onSelect={() => handleActionSelect(action)}
            >
              <i class="fa-solid {action.icon}" aria-hidden="true"></i>
              <span>{action.label}</span>
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  {/if}

  <span
    class="share-action-status"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    {statusMessage}
  </span>
</div>

<style>
  .share-action-control {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
  }

  :global(.share-action-trigger) {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: var(
      --share-trigger-width,
      var(--share-trigger-size, var(--min-touch-target, 44px))
    );
    height: var(--share-trigger-size, var(--min-touch-target, 44px));
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    gap: var(--share-trigger-gap, 0);
    padding-block: 0;
    padding-inline: var(--share-trigger-padding-inline, 0);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 38%, transparent);
    border-radius: var(--share-trigger-radius, 50%);
    background: linear-gradient(
      135deg,
      var(--theme-accent) 0%,
      color-mix(in srgb, var(--theme-accent) 78%, var(--theme-panel-bg)) 100%
    );
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--theme-accent) 35%, transparent);
    color: var(--theme-text-on-accent, white);
    cursor: pointer;
    font-size: var(--font-size-lg);
    transition:
      transform var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1),
      background var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease;
    -webkit-tap-highlight-color: transparent;
  }

  @media (hover: hover) {
    :global(.share-action-trigger:hover:not(:disabled)) {
      transform: scale(1.05);
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--theme-accent) 88%, white) 0%,
        var(--theme-accent) 100%
      );
      box-shadow: 0 6px 16px
        color-mix(in srgb, var(--theme-accent) 55%, transparent);
    }
  }

  :global(.share-action-trigger:active:not(:disabled)) {
    transform: scale(0.95);
    transition-duration: var(--duration-instant);
  }

  :global(.share-action-trigger[aria-pressed="true"]) {
    outline: 2px solid color-mix(in srgb, var(--theme-accent) 70%, white);
    outline-offset: 2px;
  }

  :global(.share-action-trigger:focus-visible) {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  :global(.share-action-trigger:disabled) {
    cursor: not-allowed;
    opacity: 0.45;
  }

  :global(.share-action-trigger i) {
    width: 1em;
    font-size: var(--font-size-lg);
    text-align: center;
  }

  .share-action-trigger-label {
    display: var(--share-trigger-label-display, none);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    line-height: 1;
    white-space: nowrap;
  }

  :global(.share-action-menu) {
    z-index: var(--z-dropdown);
    width: 15rem;
    max-width: calc(100vw - 24px);
    padding: 4px;
    border: 1px solid var(--theme-stroke-strong);
    border-radius: var(--radius-md, 12px);
    background: var(--theme-panel-bg);
    box-shadow:
      0 8px 24px var(--theme-shadow),
      0 2px 8px var(--theme-shadow);
    outline: none;
    transform-origin: var(--bits-dropdown-menu-content-transform-origin);
  }

  :global(.share-action-menu[data-state="open"]) {
    animation: share-action-menu-enter 150ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  :global(.share-action-item),
  .share-action-sheet-item {
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
    color: var(--theme-text);
    cursor: pointer;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    outline: none;
    text-align: left;
    user-select: none;
  }

  :global(.share-action-item[data-highlighted]),
  .share-action-sheet-item:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
  }

  :global(.share-action-item[data-disabled]),
  .share-action-sheet-item:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  :global(.share-action-item.success),
  .share-action-sheet-item.success {
    color: var(--semantic-success);
  }

  :global(.share-action-item.danger),
  .share-action-sheet-item.danger {
    color: var(--semantic-error);
  }

  :global(.share-action-item i),
  .share-action-sheet-item i {
    width: 20px;
    flex: 0 0 20px;
    color: var(--theme-accent);
    font-size: var(--font-size-sm);
    text-align: center;
  }

  :global(.share-action-item.success i),
  .share-action-sheet-item.success i {
    color: var(--semantic-success);
  }

  :global(.share-action-item.danger i),
  .share-action-sheet-item.danger i {
    color: var(--semantic-error);
  }

  :global(.share-action-menu-separator),
  .share-action-separator {
    height: 1px;
    margin: 4px 8px;
    background: var(--theme-stroke);
  }

  :global(.share-action-backdrop) {
    background: var(--backdrop-medium, rgba(0, 0, 0, 0.48));
  }

  :global(
    dialog.drawer-content.share-action-sheet[data-placement="bottom"]:not(
        .side-by-side-layout
      )
  ) {
    --sheet-bg:
      linear-gradient(
        var(--theme-panel-bg, rgba(0, 0, 0, 0.88)),
        var(--theme-panel-bg, rgba(0, 0, 0, 0.88))
      ),
      #0a0a14;
    --sheet-border: 1px solid var(--theme-stroke-strong);
    --sheet-shadow: 0 -12px 36px var(--theme-shadow);
    --sheet-max-height: min(70dvh, 34rem);
    box-sizing: border-box;
    width: min(30rem, 100%);
    max-width: 30rem;
    min-height: 0;
    margin-inline: auto;
  }

  .share-action-sheet-content {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .share-action-sheet-header {
    display: grid;
    grid-template-columns:
      var(--min-touch-target, 44px)
      minmax(0, 1fr)
      var(--min-touch-target, 44px);
    align-items: center;
    padding: 0 12px 8px;
  }

  .share-action-sheet-header h2 {
    grid-column: 2;
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-lg);
    font-weight: 650;
    text-align: center;
  }

  .share-action-close {
    grid-column: 3;
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke);
    border-radius: 50%;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
    font-size: var(--font-size-base);
  }

  .share-action-close:hover {
    border-color: var(--theme-stroke-strong);
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .share-action-close:focus-visible,
  .share-action-sheet-item:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .share-action-sheet-actions {
    display: flex;
    flex-direction: column;
    padding: 0 12px calc(12px + env(safe-area-inset-bottom, 0px));
  }

  .share-action-sheet-item {
    min-height: 52px;
  }

  .share-action-status {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @keyframes share-action-menu-enter {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (min-aspect-ratio: 17/10) and (max-height: 500px) {
    :global(
      dialog.drawer-content.share-action-sheet[data-placement="bottom"]:not(
          .side-by-side-layout
        )
    ) {
      --sheet-max-height: 96dvh;
    }

    .share-action-sheet-item {
      min-height: 48px;
    }
  }

  @media (prefers-contrast: more) {
    :global(.share-action-trigger) {
      border: 2px solid var(--theme-text);
      background: var(--theme-card-hover-bg);
      color: var(--theme-text);
      box-shadow: none;
    }

    :global(.share-action-menu),
    :global(.share-action-sheet[data-placement="bottom"]) {
      border-width: 2px;
    }
  }

  @media (forced-colors: active) {
    :global(.share-action-trigger),
    .share-action-close {
      border: 2px solid ButtonText;
      background: Canvas;
      box-shadow: none;
      color: ButtonText;
      forced-color-adjust: auto;
    }

    :global(.share-action-item),
    .share-action-sheet-item {
      color: ButtonText;
    }

    :global(.share-action-item[data-highlighted]),
    .share-action-sheet-item:hover:not(:disabled) {
      background: Highlight;
      color: HighlightText;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.share-action-trigger) {
      transition: none;
    }

    :global(.share-action-trigger:hover:not(:disabled)),
    :global(.share-action-trigger:active:not(:disabled)) {
      transform: none;
    }

    :global(.share-action-trigger .fa-spin),
    :global(.share-action-menu .fa-spin),
    .share-action-sheet-content .fa-spin {
      animation: none;
    }

    :global(.share-action-menu[data-state="open"]) {
      animation: none;
    }
  }
</style>
