<script lang="ts">
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import SequencePickerModal from "$lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { Composition } from "$lib/shared/animation-engine/domain/compose-types";

  let { onopen }: { onopen: (id: string) => void } = $props();
  let owned = $state<Composition[]>([]);
  let legacy = $state<Composition[]>([]);
  let picker = $state(false);
  let loading = $state(true);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let hasTimeline = $state(false);

  $effect(() => {
    if (!authState.initialized) return;
    authState.user?.uid;
    let current = true;
    owned = [];
    legacy = [];
    loading = true;
    error = null;
    void import("../services/legacy-compose-timeline-import").then((service) => {
      if (current) hasTimeline = service.hasLegacyComposeTimeline();
    });
    void import("../services/studio-arrangement-projects")
      .then((service) => service.listStudioArrangements())
      .then((result) => { if (current) { owned = result.owned; legacy = result.legacy; } })
      .catch((cause) => { if (current) error = cause instanceof Error ? cause.message : "Arrangements could not be loaded."; })
      .finally(() => { if (current) loading = false; });
    return () => { current = false; };
  });

  async function openSaved(id: string, isLegacy = false): Promise<void> {
    busy = true;
    error = null;
    try {
      const { openCompositionInStudio } = await import("../services/studio-arrangement-projects");
      onopen(await openCompositionInStudio(id, { legacy: isLegacy }));
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "This arrangement could not be opened.";
    } finally { busy = false; }
  }

  async function create(sequence: SequenceData): Promise<void> {
    picker = false;
    busy = true;
    error = null;
    try {
      const { createStudioArrangement } = await import("../services/studio-arrangement-projects");
      onopen(await createStudioArrangement(sequence));
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "The arrangement could not be created.";
    } finally { busy = false; }
  }

  async function importTimeline(): Promise<void> {
    busy = true;
    error = null;
    try {
      const { importLegacyComposeTimeline } = await import("../services/legacy-compose-timeline-import");
      onopen(await importLegacyComposeTimeline());
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "The timeline could not be imported.";
    } finally { busy = false; }
  }
</script>

<section aria-label="Arrangements" class="arrangements">
  <div class="arrangement-heading">
    <div><h2>Arrangements</h2><p>Build a grid of sequences, then add music or export a video.</p></div>
    <button type="button" disabled={busy} onclick={() => picker = true}><i class="fas fa-plus" aria-hidden="true"></i> New arrangement</button>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if loading}<p class="status" role="status">Loading saved arrangements…</p>{/if}
  {#if busy}<p class="status" role="status">Opening arrangement…</p>{/if}
  {#if owned.length}
    <ul>{#each owned as composition (composition.id)}
      <li><button type="button" disabled={busy} onclick={() => openSaved(composition.id)}>
        <i class="fas fa-table-cells" aria-hidden="true"></i><strong>{composition.name}</strong>
        <span>{composition.layout.cols} × {composition.layout.rows}</span><span>Open in Studio</span>
      </button></li>
    {/each}</ul>
  {/if}
  {#if legacy.length}
    <h3>Older arrangements on this device</h3>
    <p>Choose one to import a copy into Studio. The original stays here.</p>
    <ul>{#each legacy as composition (composition.id)}
      <li><button type="button" disabled={busy} onclick={() => openSaved(composition.id, true)}>
        <i class="fas fa-table-cells" aria-hidden="true"></i><strong>{composition.name}</strong><span>Import copy</span>
      </button></li>
    {/each}</ul>
  {/if}
  {#if hasTimeline}
    <h3>Older Compose timeline</h3>
    <p>Import its animation clips as editable arrangements. The original stays on this device.</p>
    <button type="button" disabled={busy} onclick={importTimeline}>Import timeline copy</button>
  {/if}
</section>

<SequencePickerModal open={picker} onSelect={create} onClose={() => picker = false} />

<style>
  .arrangements { padding: 24px 0; border-bottom: 1px solid var(--theme-stroke); }
  .arrangement-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  h2 { margin: 0; font-size: 18px; } h3 { margin: 24px 0 6px; font-size: 15px; }
  p { margin: 6px 0; color: var(--theme-text-secondary); font-size: 13px; line-height: 1.5; }
  button { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 10px 12px; border: 1px solid var(--theme-stroke); border-radius: var(--border-radius-md); color: inherit; background: var(--theme-card-bg); cursor: pointer; }
  button:hover { background: var(--theme-card-hover-bg); } button:focus-visible { outline: 2px solid var(--theme-accent); outline-offset: 2px; }
  button:disabled { opacity: 0.6; cursor: progress; }
  ul { list-style: none; margin: 12px 0 0; padding: 0; }
  li button { width: 100%; text-align: left; border: 0; border-radius: 0; background: transparent; border-bottom: 1px solid var(--theme-stroke); }
  strong { flex: 1; overflow-wrap: anywhere; } li span { font-size: 12px; color: var(--theme-text-secondary); }
  .error { color: var(--semantic-error); } .status { min-height: 20px; }
</style>
