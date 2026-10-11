<!--
  Settings subpage layout harness.

  Renders the real Keyboard shortcuts page, or the Release notes page with
  ?page=release, inside a shell the same height as the settings tab, so the
  shared subpage frame can be checked at every viewport without signing in.
  The back control only logs here; the shortcut coordinator registers the
  same shortcuts the app shell does.
-->
<script lang="ts">
  import { page } from "$app/state";
  import KeyboardShortcutCoordinator from "#lib/shared/keyboard/coordinators/KeyboardShortcutCoordinator.svelte";
  import ShortcutCenter from "#lib/shared/keyboard/components/ShortcutCenter.svelte";
  import ReleaseNotesTab from "#lib/shared/settings/components/tabs/ReleaseNotesTab.svelte";

  const showReleaseNotes = $derived(page.url.searchParams.get("page") === "release");
  const onBack = () => console.info("[settings-subpages harness] back");
</script>

<!-- Registers the app's shortcuts, as the app shell does. -->
<KeyboardShortcutCoordinator />

<main class="harness">
  <div class="body">
    <section class="panel">
      {#if showReleaseNotes}
        <ReleaseNotesTab backLabel="Preferences" {onBack} />
      {:else}
        <ShortcutCenter backLabel="Preferences" {onBack} />
      {/if}
    </section>
  </div>
</main>

<style>
  /* Mirrors SettingsModule's body and panel so heights behave the same. */
  .harness {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    overflow: hidden;
    background: #10141c;
  }

  .body {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-height: 0;
    padding: clamp(8px, 2vw, 16px);
    overflow-y: auto;
  }

  .panel {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 0;
    padding: clamp(6px, 1.5vw, 12px);
  }
</style>
