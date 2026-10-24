<!--
  The one navigation bar across Browse.

  BrowseModule renders it once above the screen Crossfade, so it never moves
  or fades when the content under it changes. The trail comes from the route
  owner (Browse > group > destination > type or name); back is the crumb
  before the current one. Screens add their own pieces through
  BrowseHeaderSlot: a late-loading name, action pills, a selection toolbar
  that takes the whole bar over, and a tint.

  Fixed logical size (the 4K rule): 44px controls, 64px tall, 56px compact.
-->
<script lang="ts">
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import { handleModuleHome } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import { tryGetBrowseNavigationContext } from "#lib/shared/browse/context/browse-navigation-context.js";
  import { tryGetBrowseHeaderContext } from "#lib/shared/browse/context/browse-header-context.js";
  import {
    browseBackCrumb,
    buildBrowseTrail,
    type BrowseCrumbTarget,
    type BrowseGroupId,
  } from "#lib/shared/browse/navigation/browse-trail.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  let { compact = false }: { compact?: boolean } = $props();

  const navigation = tryGetBrowseNavigationContext();
  const header = tryGetBrowseHeaderContext();

  const trail = $derived(
    buildBrowseTrail({
      location: navigation?.currentLocation ?? null,
      homeOpen: navigationState.isModuleHomeOpen("browse"),
      leafLabel: header?.leaf ?? null,
    })
  );
  const current = $derived(trail[trail.length - 1]);
  const earlier = $derived(trail.slice(0, -1));
  const back = $derived(browseBackCrumb(trail));
  const toolbar = $derived(header?.toolbar ?? null);
  const actions = $derived(header?.actions ?? null);
  const leafContent = $derived(header?.leafContent ?? null);
  const accent = $derived(header?.accent ?? null);

  // Browse home mounts through its own Crossfade, so the group heading is not
  // there on the frame the crumb is pressed. Look for it over a few frames.
  function scrollToGroup(group: BrowseGroupId, attempts = 12): void {
    if (typeof document === "undefined") return;
    const heading = document.getElementById(`${group}-title`);
    if (heading) {
      heading.scrollIntoView({ block: "start" });
      return;
    }
    if (attempts > 0) {
      requestAnimationFrame(() => scrollToGroup(group, attempts - 1));
    }
  }

  function open(target: BrowseCrumbTarget | null): void {
    if (!target) return;
    if (target.kind === "home") {
      handleModuleHome("browse", "workspace");
      if (target.group) scrollToGroup(target.group);
      return;
    }
    navigation?.navigateTo(target.location);
  }
</script>

<div
  class="browse-header"
  class:compact
  style:--header-accent={accent ?? "var(--theme-accent)"}
>
  <Crossfade key={toolbar ? "toolbar" : "trail"} duration={DURATION.fast} fill>
    {#if toolbar}
      <div class="toolbar-layer">
        {@render toolbar()}
      </div>
    {:else}
      <div class="trail-row">
        <!-- The back box keeps its space on Browse home so the trail never
             shifts sideways when it appears. -->
        <div class="back-slot">
          {#if back}
            <PanelButton
              variant="secondary"
              ariaLabel={t("browse_verified_back_to", {
                destination: back.label,
              })}
              title={t("browse_verified_back_to", { destination: back.label })}
              onclick={() => open(back.target)}
            >
              <i class="fas fa-chevron-left" aria-hidden="true"></i>
            </PanelButton>
          {/if}
        </div>

        <nav class="trail" aria-label={t("module_browse")}>
          <ol class="crumbs">
            {#each earlier as crumb (crumb.id)}
              <li class="crumb crumb-earlier">
                {#if crumb.target}
                  <PanelButton
                    variant="quiet"
                    onclick={() => open(crumb.target)}
                  >
                    {crumb.label}
                  </PanelButton>
                {:else}
                  <span class="crumb-text">{crumb.label}</span>
                {/if}
                <i
                  class="fas fa-chevron-right crumb-separator"
                  aria-hidden="true"
                ></i>
              </li>
            {/each}
            <li class="crumb crumb-current" aria-current="page">
              {#if leafContent}
                <div class="leaf-editor">{@render leafContent()}</div>
              {:else if current}
                <Crossfade key={current.label} duration={DURATION.fast}>
                  <h1 class="current-label" class:pending={!current.label}>
                    {current.label}
                  </h1>
                </Crossfade>
              {/if}
            </li>
          </ol>
        </nav>

        <div class="actions">
          {#if actions}
            {@render actions()}
          {/if}
        </div>
      </div>
    {/if}
  </Crossfade>
</div>

<style>
  .browse-header {
    position: relative;
    flex: 0 0 auto;
    height: 64px;
    container: browse-header / inline-size;
    border-bottom: 1px solid
      color-mix(in srgb, var(--theme-text, #fff) 10%, transparent);
    background: color-mix(
      in srgb,
      var(--theme-background, #090b16) 88%,
      transparent
    );
  }

  .browse-header.compact {
    height: 56px;
  }

  .toolbar-layer,
  .trail-row {
    display: flex;
    align-items: center;
    height: 100%;
    min-width: 0;
  }

  .toolbar-layer > :global(*) {
    width: 100%;
  }

  .trail-row {
    gap: 10px;
    padding: 0 clamp(12px, 2cqi, 28px);
  }

  .compact .trail-row {
    gap: 6px;
    padding-inline: 8px;
  }

  .back-slot {
    display: flex;
    flex: 0 0 44px;
    width: 44px;
    height: 44px;
  }

  .back-slot :global(.panel-btn) {
    width: 44px;
    padding: 0;
  }

  .trail {
    flex: 1 1 auto;
    min-width: 0;
  }

  .crumbs {
    display: flex;
    align-items: center;
    gap: 2px;
    margin: 0;
    padding: 0;
    min-width: 0;
    list-style: none;
  }

  .crumb {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
    min-width: 0;
  }

  .crumb-current {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
  }

  .crumb-earlier :global(.panel-btn) {
    padding-inline: 12px;
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    white-space: nowrap;
  }

  .crumb-earlier :global(.panel-btn:hover) {
    color: var(--theme-text, #fff);
  }

  .crumb-text {
    padding: 0 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font-weight: 600;
    white-space: nowrap;
  }

  .crumb-separator {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .current-label {
    margin: 0;
    padding: 0 10px;
    min-height: 44px;
    display: flex;
    align-items: center;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-md, 16px);
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* A name still loading keeps its slot so the row does not jump. */
  .current-label.pending {
    min-width: 8ch;
  }

  .leaf-editor {
    display: flex;
    align-items: center;
    min-width: min(100%, 18rem);
    max-width: 28rem;
    height: 44px;
  }

  .leaf-editor :global(input) {
    width: 100%;
    height: 44px;
    padding: 0 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid
      color-mix(in srgb, var(--header-accent) 45%, transparent);
    border-radius: 12px;
    color: var(--theme-text, #fff);
    font-family: inherit;
    font-size: var(--font-size-sm, 14px);
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex: 0 0 auto;
    gap: 10px;
  }

  .compact .actions {
    gap: 6px;
  }

  .compact .crumb-earlier {
    display: none;
  }
</style>
