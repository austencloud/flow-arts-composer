<script lang="ts">
  import { featureFlagService } from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";
  import { TUTORIAL_SCRIPTS } from "./_data/tutorial-scripts";

  const groups = $derived(() => {
    const order: string[] = [];
    const byPart = new Map<string, typeof TUTORIAL_SCRIPTS>();
    for (const script of TUTORIAL_SCRIPTS) {
      if (!byPart.has(script.part)) {
        byPart.set(script.part, []);
        order.push(script.part);
      }
      byPart.get(script.part)!.push(script);
    }
    return order.map((part) => ({ part, scripts: byPart.get(part)! }));
  });

  function slotCount(script: (typeof TUTORIAL_SCRIPTS)[number]): number {
    return script.blocks.filter((b) => b.kind === "slot").length;
  }
</script>

{#if featureFlagService.isAdmin}
  <div class="tutorial-planner">
    <header class="planner-header">
      <h1>Tutorial Planner</h1>
      <p>Scripts 12–38, read-only preview of the generated voiceover content.</p>
    </header>

    {#each groups() as group (group.part)}
      <section class="part-group">
        <h2>{group.part}</h2>
        <div class="script-list">
          {#each group.scripts as script (script.id)}
            <a class="script-row" href="/admin/tutorials/{script.id}">
              <span class="script-number">{script.number}</span>
              <span class="script-title">{script.title}</span>
              <span class="script-runtime">{script.targetRuntime}</span>
              <span class="script-slots">{slotCount(script)} slots</span>
            </a>
          {/each}
        </div>
      </section>
    {/each}
  </div>
{:else}
  <p class="not-authorized">Not authorized.</p>
{/if}

<style>
  .tutorial-planner {
    max-width: 900px;
    margin: 0 auto;
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    color: var(--theme-text);
  }

  .planner-header h1 {
    margin: 0 0 var(--spacing-xs);
  }

  .planner-header p {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .part-group h2 {
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    margin: 0 0 var(--spacing-sm);
  }

  .script-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .script-row {
    display: grid;
    grid-template-columns: 2.5rem 1fr auto auto;
    align-items: center;
    gap: var(--spacing-md);
    min-height: 44px;
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--theme-border);
    background: var(--theme-surface);
    color: var(--theme-text);
    text-decoration: none;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }

  .script-row:hover,
  .script-row:focus-visible {
    background: var(--theme-surface-hover, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-border-strong, rgba(255, 255, 255, 0.3));
  }

  .script-number {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .script-title {
    font-weight: 500;
  }

  .script-runtime {
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .script-slots {
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
    padding: 2px 8px;
    border-radius: var(--radius-full, 999px);
    background: var(--theme-surface-hover, rgba(255, 255, 255, 0.08));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    white-space: nowrap;
  }

  .not-authorized {
    padding: var(--spacing-lg);
    text-align: center;
    color: var(--theme-text);
  }
</style>
