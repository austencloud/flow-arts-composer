<!--
  ContextMenu - adapter over bits-ui DropdownMenu for right-click-at-cursor use.
  bits-ui provides keyboard nav, typeahead, focus management, viewport collision
  (via floating-ui). We position via `customAnchor` virtual element at (x, y)
  and preserve the original (menuState, items, onClose) public API so consumers
  don't change.

  bits-ui's shift only slides the menu along its alignment axis. On windows wide
  enough for the menu to fit beside the cursor, it sits on the cursor's right,
  top-aligned (drawn the same as bottom-start for a point anchor), so it can
  slide vertically and use the full window height on short screens; bottom
  could only flip upward and run off the top. Narrower windows use bottom, for
  submenus too (they open under their row instead of beside a menu with no room
  either side), so they can still slide sideways. sticky "always" drops limitShift so nothing
  is held past an edge, and the CSS caps height at bits-ui's available-height
  variable so a taller menu scrolls.
-->
<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import { innerWidth } from "svelte/reactivity/window";
  import type {
    ContextMenuEntry,
    ContextMenuItem,
    ContextMenuState,
  } from "./context-menu-types";
  import { isMenuItem, isSeparator, isHeader } from "./context-menu-types";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";

  let {
    menuState,
    items,
    onClose,
  }: {
    menuState: ContextMenuState;
    items: ContextMenuEntry[];
    onClose: (reason?: "item" | "outside" | "dismiss") => void;
  } = $props();

  let loadingItemId: string | null = $state(null);
  let pendingCloseReason: "item" | "outside" | "dismiss" = "dismiss";

  // Matches the max-width and collisionPadding below. At twice this width one
  // side of any cursor has room for the menu, so right/left flipping suffices.
  const MENU_MAX_WIDTH = 300;
  const COLLISION_PADDING = 8;
  // Read the window only while the menu is open. Reading innerWidth makes the
  // browser finish layout first, and a closed menu mounts with whatever hosts
  // it, so the first sequence's step grid paid that layout mid-mount.
  const menuSide = $derived(
    menuState.open &&
      (innerWidth.current ?? 0) >= 2 * (MENU_MAX_WIDTH + COLLISION_PADDING)
      ? "right"
      : "bottom"
  );

  // Virtual anchor for floating-ui; Measurable = { getBoundingClientRect }
  const anchor = $derived(
    menuState.open
      ? {
          getBoundingClientRect: () =>
            new DOMRect(
              (menuState as { open: true; x: number; y: number }).x,
              (menuState as { open: true; x: number; y: number }).y,
              0,
              0
            ),
        }
      : null
  );

  function handleOpenChange(open: boolean) {
    if (!open && menuState.open) {
      const reason = pendingCloseReason;
      pendingCloseReason = "dismiss";
      onClose(reason);
    }
  }

  // Dismiss on outside pointerdown (capture phase). onClose() triggers
  // synchronous $effect cleanup which removes blockOutsideClick, but touch
  // dispatches pointerup → click AFTER pointerdown. So dismissOnPointerDown
  // plants one-shot guards that outlive the $effect cleanup to swallow them.
  $effect(() => {
    if (!menuState.open) return;
    if (typeof document === "undefined") return;

    const blockOutsideClick = (ev: MouseEvent) => {
      const target = ev.target as Element | null;
      if (target?.closest(".ctx-menu-content")) return;
      ev.stopImmediatePropagation();
      ev.preventDefault();
    };

    const dismissOnPointerDown = (ev: PointerEvent) => {
      const target = ev.target as Element | null;
      if (target?.closest(".ctx-menu-content")) return;
      ev.stopImmediatePropagation();
      ev.preventDefault();

      const swallow = (e: Event) => {
        e.stopImmediatePropagation();
        e.preventDefault();
      };
      const opts = { capture: true, once: true } as const;
      document.addEventListener("pointerup", swallow, opts);
      document.addEventListener("click", swallow, opts);
      setTimeout(() => {
        document.removeEventListener("pointerup", swallow, { capture: true });
        document.removeEventListener("click", swallow, { capture: true });
      }, 800);

      getHapticFeedback().impact("light");
      pendingCloseReason = "outside";
      onClose("outside");
    };

    document.addEventListener("pointerdown", dismissOnPointerDown, {
      capture: true,
    });
    document.addEventListener("click", blockOutsideClick, { capture: true });

    return () => {
      document.removeEventListener("pointerdown", dismissOnPointerDown, {
        capture: true,
      });
      document.removeEventListener("click", blockOutsideClick, {
        capture: true,
      });
    };
  });

  async function runAction(item: ContextMenuItem, event: Event) {
    if (item.disabled) {
      event.preventDefault();
      return;
    }
    if (!item.action) return;
    // keepOpen means don't auto-close on select
    if (item.keepOpen) event.preventDefault();
    else pendingCloseReason = "item";

    getHapticFeedback().impact("medium");
    loadingItemId = item.id;
    try {
      await item.action();
    } finally {
      loadingItemId = null;
    }
  }

  /** Icon tint, and a turn for arrows the icon set has no diagonal glyph for. */
  function iconStyle(item: ContextMenuItem): string {
    const parts: string[] = [];
    if (item.iconColor) parts.push(`color: ${item.iconColor}`);
    if (item.iconRotate) parts.push(`transform: rotate(${item.iconRotate}deg)`);
    return parts.join("; ");
  }

  function checkedAccentStyle(item: ContextMenuItem): string {
    if (!item.checked || !item.iconColor) return "";
    return `background: color-mix(in srgb, ${item.iconColor} 12%, transparent);`;
  }
</script>

<!--
  Icon column: checked indicator + icon, dual-column, spinner, or spacer.
  Mirrors the original component's item rendering.
-->
{#snippet itemIcons(item: ContextMenuItem, loading: boolean)}
  {#if loading}
    <i class="fas fa-spinner fa-spin ctx-menu-icon" aria-hidden="true"></i>
  {:else if item.checked !== undefined && item.icon}
    <i
      class="fas ctx-menu-check"
      class:fa-check={item.checked}
      class:checked={item.checked}
      class:unchecked={!item.checked}
      aria-hidden="true"
    ></i>
    <i
      class="fas {item.icon} ctx-menu-icon"
      style={iconStyle(item)}
      aria-hidden="true"
    ></i>
  {:else if item.checked !== undefined}
    <i
      class="fas ctx-menu-icon"
      class:fa-check={item.checked}
      class:checked={item.checked}
      class:unchecked={!item.checked}
      aria-hidden="true"
    ></i>
  {:else if item.icon}
    <i
      class="fas {item.icon} ctx-menu-icon"
      style={iconStyle(item)}
      aria-hidden="true"
    ></i>
  {:else}
    <span class="ctx-menu-icon-spacer"></span>
  {/if}
{/snippet}

<DropdownMenu.Root open={menuState.open} onOpenChange={handleOpenChange}>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      customAnchor={anchor}
      side={menuSide}
      align="start"
      sideOffset={0}
      collisionPadding={COLLISION_PADDING}
      sticky="always"
      class="ctx-menu-content"
    >
      {#each items as entry, i (isMenuItem(entry) ? entry.id : `${entry.type}-${i}`)}
        {#if isSeparator(entry)}
          <DropdownMenu.Separator class="ctx-menu-separator" />
        {:else if isHeader(entry)}
          <div class="ctx-menu-header">{entry.label}</div>
        {:else if isMenuItem(entry)}
          {@const hasChildren = (entry.children?.length ?? 0) > 0}
          {@const isLoading = loadingItemId === entry.id}

          {#if hasChildren}
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger
                class="ctx-menu-item"
                style="--item-index: {i};"
                disabled={entry.disabled}
                openDelay={150}
              >
                {@render itemIcons(entry, isLoading)}
                {#if entry.rawIcon}
                  <span
                    class="ctx-menu-raw-icon"
                    style={entry.rawIconColor
                      ? `color: ${entry.rawIconColor}`
                      : ""}
                  >
                    {@html entry.rawIcon}
                  </span>
                {/if}
                <span class="ctx-menu-label">{entry.label}</span>
                <i
                  class="fas fa-chevron-right ctx-menu-chevron"
                  aria-hidden="true"
                ></i>
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent
                  class="ctx-menu-content ctx-submenu"
                  side={menuSide}
                  align="start"
                  sideOffset={4}
                  collisionPadding={COLLISION_PADDING}
                  sticky="always"
                >
                  {#each entry.children ?? [] as child, j (child.id)}
                    {@const childLoading = loadingItemId === child.id}
                    <DropdownMenu.Item
                      class={`ctx-menu-item${child.danger ? " danger" : ""}`}
                      style="--item-index: {j}; {checkedAccentStyle(child)}"
                      disabled={child.disabled || childLoading}
                      closeOnSelect={!child.keepOpen}
                      onSelect={(e) => runAction(child, e)}
                    >
                      {@render itemIcons(child, childLoading)}
                      <span class="ctx-menu-label">{child.label}</span>
                    </DropdownMenu.Item>
                  {/each}
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          {:else}
            <DropdownMenu.Item
              class={`ctx-menu-item${entry.danger ? " danger" : ""}`}
              style="--item-index: {i}; {checkedAccentStyle(entry)}"
              disabled={entry.disabled || isLoading}
              closeOnSelect={!entry.keepOpen}
              onSelect={(e) => runAction(entry, e)}
            >
              {@render itemIcons(entry, isLoading)}
              {#if entry.rawIcon}
                <span
                  class="ctx-menu-raw-icon"
                  style={entry.rawIconColor
                    ? `color: ${entry.rawIconColor}`
                    : ""}
                >
                  {@html entry.rawIcon}
                </span>
              {/if}
              <span class="ctx-menu-label">{entry.label}</span>
            </DropdownMenu.Item>
          {/if}
        {/if}
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  /*
    Styles must be :global because bits-ui portals the menu outside this
    component's scope, so Svelte's scoped-class hashes don't reach it.
  */
  :global(.ctx-menu-content) {
    position: relative;
    z-index: var(--z-dropdown);
    min-width: 200px;
    max-width: 300px;
    padding: 4px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    overflow-y: auto;
    overscroll-behavior: contain;
    max-height: var(--bits-floating-available-height, calc(100dvh - 16px));
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2))
      transparent;
    transform-origin: var(--bits-floating-transform-origin, top left);
    outline: none;
  }

  :global(.ctx-menu-content.ctx-submenu) {
    min-width: 160px;
    max-width: 260px;
    z-index: calc(var(--z-dropdown) + 1);
    /* On narrow windows a submenu opens over its parent, and the panel token
       is translucent, so blur the parent's labels instead of ghosting them. */
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  /* Entrance animation via bits-ui data-state */
  :global(.ctx-menu-content[data-state="open"]) {
    animation: ctx-menu-enter 180ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  :global(.ctx-menu-content.ctx-submenu[data-state="open"]) {
    animation: ctx-submenu-enter 160ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  @keyframes ctx-menu-enter {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes ctx-submenu-enter {
    from {
      opacity: 0;
      transform: translateX(-6px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes ctx-item-enter {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  :global(.ctx-menu-header) {
    padding: 6px 10px 4px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    margin-bottom: 2px;
  }

  :global(.ctx-menu-separator) {
    height: 1px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.06));
    margin: 3px 8px;
  }

  :global(.ctx-menu-item) {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    min-height: 44px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm, 14px);
    cursor: pointer;
    text-align: left;
    user-select: none;
    outline: none;
    animation: ctx-item-enter 160ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(var(--item-index, 0) * 30ms);
    transition:
      background 120ms ease,
      transform 120ms ease;
  }

  :global(.ctx-menu-item[data-highlighted]),
  :global(.ctx-menu-item[data-state="open"]) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
  }

  :global(.ctx-menu-item:active:not([data-disabled])) {
    transform: scale(0.97);
  }

  :global(.ctx-menu-item[data-disabled]) {
    opacity: 0.35;
    cursor: not-allowed;
  }

  :global(.ctx-menu-item.danger) {
    color: var(--semantic-error, #ef4444);
  }

  :global(.ctx-menu-item.danger[data-highlighted]) {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
  }

  :global(.ctx-menu-item:focus-visible) {
    outline: 2px solid var(--theme-accent, #a855f7);
    outline-offset: -2px;
  }

  :global(.ctx-menu-icon) {
    width: 16px;
    text-align: center;
    font-size: var(--font-size-compact, 12px);
    flex-shrink: 0;
  }

  :global(.ctx-menu-check) {
    width: 12px;
    text-align: center;
    font-size: 10px;
    flex-shrink: 0;
  }

  :global(.ctx-menu-check.checked),
  :global(.ctx-menu-icon.checked) {
    color: var(--semantic-success, #22c55e);
  }

  :global(.ctx-menu-check.unchecked),
  :global(.ctx-menu-icon.unchecked) {
    opacity: 0;
  }

  :global(.ctx-menu-icon-spacer) {
    width: 16px;
    flex-shrink: 0;
  }

  :global(.ctx-menu-raw-icon) {
    width: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-compact, 12px);
    flex-shrink: 0;
  }

  :global(.ctx-menu-raw-icon i),
  :global(.ctx-menu-raw-icon svg) {
    font-size: inherit;
    width: 16px;
    height: 16px;
  }

  :global(.ctx-menu-label) {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global(.ctx-menu-chevron) {
    font-size: var(--font-size-compact, 12px);
    opacity: 0.5;
    flex-shrink: 0;
    transition: transform 120ms ease;
  }

  :global(.ctx-menu-item[data-state="open"] .ctx-menu-chevron) {
    transform: translateX(2px);
    opacity: 0.8;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.ctx-menu-content[data-state="open"]),
    :global(.ctx-menu-content.ctx-submenu[data-state="open"]),
    :global(.ctx-menu-item) {
      animation: none;
    }
    :global(.ctx-menu-item),
    :global(.ctx-menu-chevron) {
      transition: none;
    }
  }
</style>
