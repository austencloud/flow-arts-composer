<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import PostStudio from "$lib/shared/share/components/post-studio/PostStudio.svelte";
  import ToastContainer from "$lib/shared/toast/components/ToastContainer.svelte";
  import { KeyboardShortcutManager } from "$lib/shared/keyboard/services/keyboard-shortcut-manager";
  import { ShortcutRegistry } from "$lib/shared/keyboard/services/shortcut-registry";
  import { registerEditHistoryShortcuts } from "$lib/shared/keyboard/registration/register-edit-history-shortcuts";
  import { keyboardShortcutState } from "$lib/shared/keyboard/state/keyboard-shortcut-state.svelte";
  import type { PostProject } from "$lib/shared/media-composition/domain/post-project";
  import { createStudioArrangementFixture } from "./fixture";

  const fixture = createStudioArrangementFixture();
  let exportUrl = $state<string | null>(null);
  const editArrangementOnOpen = $derived(page.url.searchParams.get("edit") === "1");

  type FixtureProbe = {
    initialProject: PostProject;
    savedProject: PostProject | null;
    exportedBlob: Blob | null;
    exportUrl: string | null;
  };
  const probe: FixtureProbe = {
    initialProject: fixture.project,
    savedProject: null,
    exportedBlob: null,
    exportUrl: null,
  };

  onMount(() => {
    (window as unknown as { __tkaLoadProgress?: (p: number) => void }).__tkaLoadProgress?.(100);
    (window as unknown as { __studioArrangementFixture?: FixtureProbe }).__studioArrangementFixture = probe;
    const manager = new KeyboardShortcutManager(new ShortcutRegistry());
    registerEditHistoryShortcuts(manager, keyboardShortcutState.isMac);
    manager.initialize();
    return () => {
      manager.dispose();
      if (probe.exportUrl) URL.revokeObjectURL(probe.exportUrl);
      delete (window as unknown as { __studioArrangementFixture?: FixtureProbe }).__studioArrangementFixture;
    };
  });

  async function saveDraft(project: PostProject): Promise<null> {
    probe.savedProject = structuredClone(project);
    return null;
  }

  function exported(blob: Blob): void {
    if (probe.exportUrl) URL.revokeObjectURL(probe.exportUrl);
    exportUrl = URL.createObjectURL(blob);
    probe.exportedBlob = blob;
    probe.exportUrl = exportUrl;
  }
</script>

<svelte:head><title>Studio arrangement test harness</title></svelte:head>

<main class="harness">
  <PostStudio
    sequence={fixture.sequence}
    initialProject={fixture.project}
    {editArrangementOnOpen}
    onSaveDraft={saveDraft}
    cardPreviewUrl={null}
    animationPreviewUrl={null}
    onRequestAnimation={() => {}}
    onExported={exported}
  />
  {#if exportUrl}
    <a class="export-download" href={exportUrl} download="studio-arrangement-test.webm">Download test export</a>
  {/if}
</main>
<ToastContainer />

<style>
  :global(body) { margin: 0; background: #09090d; }
  .harness {
    position: relative;
    display: grid;
    align-items: stretch;
    width: 100%;
    height: 100dvh;
    padding: clamp(0.5rem, 1.5vw, 2rem);
    overflow: hidden;
    background: radial-gradient(circle at 12% 0%, rgba(87, 64, 180, 0.18), transparent 34rem), #09090d;
  }
  .export-download {
    position: absolute;
    right: 1.5rem;
    bottom: 1.5rem;
    z-index: 20;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: #fff;
    color: #111;
  }
</style>
