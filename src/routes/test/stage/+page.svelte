<script lang="ts">
  /**
   * Stage harness.
   *
   * StageModule mounted on its own, outside the app shell. The module builds
   * its own viewer context and choreography document, so nothing but a
   * full-viewport box is needed to run it. This is the surface to iterate on
   * the Stage against while the shell is unavailable; the shipping route is
   * /stage.
   *
   * The shortcut coordinator is the one thing the module cannot build for
   * itself. It lives in the app shell, which a /test route never renders, so
   * without it the window listener behind every shortcut in the app — Ctrl+Z
   * included — never starts and the harness silently swallows every key.
   */
  import { onMount } from "svelte";
  import KeyboardShortcutCoordinator from "#lib/shared/keyboard/coordinators/KeyboardShortcutCoordinator.svelte";
  import StageModule from "#lib/features/stage/StageModule.svelte";

  // The boot bar in app.html waits for the app layout to report 100%, and a
  // /test route never runs that layout, so without this the splash sits over
  // the harness until its 15s safety net fires.
  onMount(() => {
    (window as unknown as { __tkaLoadProgress?: (p: number) => void })
      .__tkaLoadProgress?.(100);
  });
</script>

<svelte:head><title>Stage harness</title></svelte:head>

<KeyboardShortcutCoordinator />

<div class="harness">
  <StageModule />
</div>

<style>
  .harness {
    position: fixed;
    inset: 0;
    overflow: hidden;
  }

  :global(body) {
    margin: 0;
    background: #05060b;
  }
</style>
