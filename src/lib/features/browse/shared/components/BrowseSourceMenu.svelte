<!--
  The desktop Browse row's Source menu: one button naming the pile you are
  browsing ("Everyone"), opening the same scope choices the scope bar shows
  as a chip strip on phones and tablets. The choices wrap inside the popover
  instead of running off the edge in a sideways strip.

  Composes the scope list owner (createBrowseScopeChips), FilterChipBase and
  a bits-ui Popover, as PropViewingControl does.
-->
<script lang="ts">
  import { Popover } from "bits-ui";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { scopeKey, type BrowseScope } from "#lib/shared/browse/navigation/browse-scope.js";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import {
    ALL_COLLECTIONS_KEY,
    createBrowseScopeChips,
  } from "../state/browse-scope-chips.svelte";

  let { scope }: { scope: BrowseScope | null } = $props();

  const scopes = createBrowseScopeChips(() => scope);
  let open = $state(false);
  let anchor = $state<HTMLElement | null>(null);
  const titleId = $props.id();

  const current = $derived(
    scopes.chips.find((chip) => scopeKey(chip.scope) === scopes.currentKey) ??
      null
  );
  const buttonLabel = $derived(
    current?.label ??
      (scopes.currentKey === ALL_COLLECTIONS_KEY
        ? t("browse_scope_all_collections")
        : t("browse_scope_nav"))
  );

  function pick(next: BrowseScope): void {
    open = false;
    scopes.choose(next);
  }

  function ignoreTriggerPress(event: Event): void {
    if (event.target instanceof Node && anchor?.contains(event.target)) {
      event.preventDefault();
    }
  }
</script>

<div class="source-anchor" bind:this={anchor}>
  <FilterChipBase
    mode="dropdown"
    popupRole="dialog"
    label={buttonLabel}
    icon={current?.icon ?? "fas fa-layer-group"}
    expanded={open}
    ariaLabel={`${t("browse_scope_nav")}: ${buttonLabel}`}
    onclick={() => (open = !open)}
    ondismiss={() => (open = false)}
  />
</div>

<Popover.Root bind:open>
  <Popover.Portal>
    <Popover.Content
      customAnchor={anchor}
      preventScroll={false}
      side="bottom"
      align="start"
      sideOffset={8}
      collisionPadding={12}
      class="browse-source-menu"
      aria-labelledby={titleId}
      onInteractOutside={ignoreTriggerPress}
    >
      <h2 id={titleId}>{t("browse_scope_nav")}</h2>
      <ul class="choices">
        {#each scopes.chips as chip, index (scopeKey(chip.scope))}
          {#if index === scopes.fixedCount && scopes.hasLibrarySession}
            <li>
              <FilterChipBase
                mode="action"
                size="sm"
                labelScale="readable"
                label={t("browse_scope_all_collections")}
                icon="fas fa-folder-open"
                current={scopes.currentKey === ALL_COLLECTIONS_KEY}
                onclick={() => {
                  open = false;
                  scopes.viewCollections();
                }}
              />
            </li>
          {/if}
          <li>
            <FilterChipBase
              mode="action"
              size="sm"
              labelScale="readable"
              label={chip.label}
              icon={chip.icon}
              current={scopeKey(chip.scope) === scopes.currentKey}
              onclick={() => pick(chip.scope)}
            />
          </li>
        {/each}
      </ul>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  .source-anchor {
    display: inline-flex;
    flex: 0 0 auto;
    min-width: 0;
  }
  .source-anchor :global(.chip-label) {
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.browse-source-menu) {
    box-sizing: border-box;
    z-index: var(--z-dropdown, 1000);
    width: min(30rem, calc(100vw - 24px));
    max-height: var(--bits-popover-content-available-height, 85dvh);
    /* scrolls: only in a window shorter than these choices, so every one stays in reach */
    overflow-y: auto;
    padding: 0.75rem;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 16px);
    background: var(--surface-panel-opaque);
    box-shadow: var(--shadow-lg, 0 18px 48px rgba(0, 0, 0, 0.45));
    outline: none;
    transform-origin: var(--bits-popover-content-transform-origin);
  }
  :global(.browse-source-menu[data-state="open"]) {
    animation: browse-source-menu-enter var(--duration-fast) var(--ease-out)
      both;
  }
  h2 {
    margin: 0 0 0.6rem;
    padding-inline: 0.25rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
  }
  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  @keyframes browse-source-menu-enter {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.browse-source-menu[data-state="open"]) {
      animation: none;
    }
  }
</style>
