<!--
  RetroTabControl - Folder-style tab control with content area

  Renders Win95-style folder tabs at the top. The active tab is visually
  connected to the content area below (no bottom border on the active tab).
  Uses 98.css's tab styling as the base.

  The activeTab prop is bindable so parent components can control which
  tab is visible. Content is rendered via the children snippet slot.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    tabs,
    activeTab = $bindable(""),
    children,
  }: {
    tabs: { id: string; label: string }[];
    activeTab?: string;
    children?: Snippet;
  } = $props();

  function selectTab(id: string) {
    activeTab = id;
  }

  function handleKeydown(event: KeyboardEvent) {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    if (currentIndex === -1) return;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = (currentIndex + 1) % tabs.length;
      activeTab = tabs[next]!.id;
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const prev = (currentIndex - 1 + tabs.length) % tabs.length;
      activeTab = tabs[prev]!.id;
    }
  }
</script>

<div class="retro-tab-control">
  <!-- Tab strip -->
  <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
  <div class="retro-tab-strip" role="tablist" tabindex="0" onkeydown={handleKeydown}>
    {#each tabs as tab (tab.id)}
      <li
        class="retro-tab"
        class:active={tab.id === activeTab}
        role="tab"
        aria-selected={tab.id === activeTab}
        tabindex={tab.id === activeTab ? 0 : -1}
        onclick={() => selectTab(tab.id)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTab(tab.id); }}}
      >
        {tab.label}
      </li>
    {/each}
  </div>

  <!-- Content area -->
  <div class="retro-tab-body window" role="tabpanel">
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>

<style>
  .retro-tab-control {
    display: flex;
    flex-direction: column;
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    font-size: var(--retro-font-size, 11px);
  }

  /* Tab strip                                                           */
  .retro-tab-strip {
    display: flex;
    list-style: none;
    margin: 0;
    padding: 0 2px;
    gap: 0;
    position: relative;
    z-index: 1;
  }

  /* Individual tab                                                      */
  .retro-tab {
    padding: 2px 8px;
    margin: 0 -1px;
    cursor: default;
    user-select: none;
    white-space: nowrap;
    position: relative;
    background: var(--retro-button-face, #c0c0c0);
    border: 2px outset var(--retro-button-face, #c0c0c0);
    border-top-left-radius: 3px;
    border-top-right-radius: 3px;
    color: var(--retro-black, #000);
  }

  /* Its own rule: in one rule with the var() shorthand above, replays lose that shorthand. */
  .retro-tab {
    border-bottom: none;
  }

  .retro-tab:not(.active) {
    top: 2px;
    padding-bottom: 0;
    background: var(--retro-button-face, #c0c0c0);
  }

  .retro-tab.active {
    z-index: 2;
    padding-bottom: 4px;
    margin-bottom: -2px;
  }

  .retro-tab:focus-visible {
    outline: 1px dotted var(--retro-black, #000);
    outline-offset: -3px;
  }

  /* Content area below tabs                                             */
  .retro-tab-body {
    padding: var(--retro-padding-lg, 8px);
    min-height: 60px;
    position: relative;
  }
</style>
