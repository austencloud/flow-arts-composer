<!--
  The bar that turns a page's text into editable blocks and saves them to its
  copy.json. A page mounts it through LazyMount with active={dev}, so this and
  CopyTextEditor stay out of production bundles.
-->
<script lang="ts">
  import { page } from "$app/state";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import { copyEditSession as session } from "./copy-edit-session.svelte";
  import CopyTextEditor from "./CopyTextEditor.svelte";
  import { getActivePageCopies } from "./page-copy.svelte";

  const storageKey = $derived(`copy-edit:on:${page.url.pathname}`);

  function readRemembered(key: string): boolean {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }

  // svelte-ignore state_referenced_locally
  let editing = $state(readRemembered(storageKey));

  function toggle(): void {
    editing = !editing;
    try {
      localStorage.setItem(storageKey, editing ? "1" : "0");
    } catch {
      // Private mode only loses the memory of the toggle.
    }
  }

  $effect(() => {
    for (const copy of getActivePageCopies()) {
      copy.editor = editing ? CopyTextEditor : null;
    }
  });

  // The app's global Save shortcut (data-save-shortcut) is only mounted inside
  // MainInterface, and public pages sit outside it, so the bar listens itself.
  function onWindowKeydown(event: KeyboardEvent): void {
    if (!editing || event.key.toLowerCase() !== "s") return;
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    event.preventDefault();
    if (!event.repeat) void session.save();
  }

  const clean = $derived(session.changeCount === 0);
  const countLabel = $derived.by(() => {
    if (session.changeCount === 1) return "1 change";
    if (session.changeCount > 1) return `${session.changeCount} changes`;
    return session.justSaved ? "Saved" : "No changes";
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="copy-edit-bar" role="region" aria-label="Copy editing">
  <FilterChipBase
    label="Edit copy"
    mode="toggle"
    active={editing}
    onclick={toggle}
  />
  <span class="count" role="status">{countLabel}</span>
  <PanelButton
    variant="primary"
    disabled={clean || session.saving}
    ariaBusy={session.saving}
    onclick={() => session.save()}
  >
    Save changes
  </PanelButton>
  <PanelButton
    variant="quiet"
    disabled={clean || session.saving}
    onclick={() => session.discard()}
  >
    Discard
  </PanelButton>
  {#if session.error}
    <p class="error" role="alert" transition:growFade>{session.error}</p>
  {/if}
</div>

<style>
  .copy-edit-bar {
    position: fixed;
    inset-block-end: 16px;
    inset-inline-start: 50%;
    translate: -50% 0;
    z-index: var(--z-overlay);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    inline-size: max-content;
    max-inline-size: calc(100vw - 16px);
    box-sizing: border-box;
    padding: 8px 12px;
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 24px;
    background: var(--theme-panel-bg);
    box-shadow: var(--theme-shadow);
    color: var(--theme-text);
  }

  /* Wide enough for "12 changes", so the buttons hold still as the count moves. */
  .count {
    min-inline-size: 10ch;
    text-align: center;
    font-size: var(--font-size-compact);
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim);
  }

  .error {
    flex-basis: 100%;
    margin: 0;
    text-align: center;
    font-size: var(--font-size-compact);
    color: var(--semantic-error);
  }
</style>
