<script lang="ts">
  import { page } from "$app/state";
  import { featureFlagService } from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";
  import { TUTORIAL_SCRIPTS, type PictographPick } from "../_data/tutorial-scripts";
  import { resolvePick } from "../_data/pictograph-resolver";
  import GuidePictograph from "../../../(public)/guide/level-1/_components/GuidePictograph.svelte";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

  const script = $derived(TUTORIAL_SCRIPTS.find((s) => s.id === page.params.id));

  const index = $derived(script ? TUTORIAL_SCRIPTS.indexOf(script) : -1);
  const prevScript = $derived(index > 0 ? TUTORIAL_SCRIPTS[index - 1] : undefined);
  const nextScript = $derived(
    index >= 0 && index < TUTORIAL_SCRIPTS.length - 1 ? TUTORIAL_SCRIPTS[index + 1] : undefined
  );

  // Resolved pictographs for the current script's picks, keyed by
  // `${blockIndex}-${pickIndex}`. Resolved once per script; a miss (no CSV
  // match for the letter) leaves the key absent so the template falls back
  // to a placeholder box instead of crashing.
  let resolved = $state<Map<string, PictographData | null>>(new Map());

  $effect(() => {
    const current = script;
    if (!current) return;
    let cancelled = false;
    const next = new Map<string, PictographData | null>();
    (async () => {
      for (let b = 0; b < current.blocks.length; b++) {
        const block = current.blocks[b];
        if (!block || block.kind !== "pictographs") continue;
        const picks = block.picks;
        for (let p = 0; p < picks.length; p++) {
          const pick: PictographPick | undefined = picks[p];
          if (!pick) continue;
          const data = await resolvePick(pick.letter, pick.variationIndex);
          if (cancelled) return;
          next.set(`${b}-${p}`, data);
        }
      }
      if (!cancelled) resolved = next;
    })();
    return () => {
      cancelled = true;
    };
  });
</script>

{#if featureFlagService.isAdmin}
  {#if script}
    <div class="tutorial-script">
      <a class="back-link" href="/admin/tutorials">&larr; All scripts</a>

      <header class="script-header">
        <span class="script-number">{script.number}</span>
        <h1>{script.title}</h1>
        <div class="script-meta">
          <span>{script.part}</span>
          <span class="dot">·</span>
          <span class="runtime">{script.targetRuntime}</span>
        </div>
        <p class="script-goal">{script.goal}</p>
      </header>

      <div class="blocks">
        {#each script.blocks as block, blockIndex (blockIndex)}
          {#if block.kind === "spoken"}
            <p class="block-spoken">{block.text}</p>
          {:else if block.kind === "cue"}
            <p class="block-cue">CUE — {block.text}</p>
          {:else if block.kind === "slot"}
            <div class="block-slot">
              <span class="slot-tag">AUSTEN</span>
              <p>{block.prompt}</p>
            </div>
          {:else if block.kind === "pictographs"}
            <div class="block-pictographs">
              {#each block.picks as pick, pickIndex (pickIndex)}
                {@const data = resolved.get(`${blockIndex}-${pickIndex}`)}
                <div class="pictograph-box">
                  {#if data}
                    <GuidePictograph {data} size="sm" bordered label={pick.caption ?? pick.letter} />
                  {:else}
                    <div class="pictograph-placeholder" title="No CSV match for letter {pick.letter}">
                      <span class="placeholder-letter">{pick.letter}</span>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      </div>

      <nav class="script-nav">
        {#if prevScript}
          <a class="nav-link" href="/admin/tutorials/{prevScript.id}">
            &larr; {prevScript.number}. {prevScript.title}
          </a>
        {:else}
          <span></span>
        {/if}
        {#if nextScript}
          <a class="nav-link" href="/admin/tutorials/{nextScript.id}">
            {nextScript.number}. {nextScript.title} &rarr;
          </a>
        {/if}
      </nav>
    </div>
  {:else}
    <p class="not-authorized">No script found for "{page.params.id}".</p>
  {/if}
{:else}
  <p class="not-authorized">Not authorized.</p>
{/if}

<style>
  .tutorial-script {
    max-width: 720px;
    margin: 0 auto;
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    color: var(--theme-text);
  }

  .back-link {
    align-self: flex-start;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--spacing-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--theme-border);
    background: var(--theme-surface);
    color: var(--theme-text);
    text-decoration: none;
  }

  .back-link:hover,
  .back-link:focus-visible {
    background: var(--theme-surface-hover, rgba(255, 255, 255, 0.06));
  }

  .script-header h1 {
    margin: var(--spacing-xs) 0;
  }

  .script-number {
    font-variant-numeric: tabular-nums;
    font-size: 0.85rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .script-meta {
    display: flex;
    gap: var(--spacing-xs);
    font-size: 0.85rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .script-meta .runtime {
    font-variant-numeric: tabular-nums;
  }

  .script-goal {
    font-style: italic;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    margin: var(--spacing-sm) 0 0;
  }

  .blocks {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .block-spoken {
    max-width: 66ch;
    line-height: 1.6;
    margin: 0;
  }

  .block-cue {
    margin: 0;
    font-family: var(--font-mono, monospace);
    font-size: 0.85rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .block-slot {
    border-left: 3px solid var(--color-warning, #e5a83d);
    background: var(--color-warning-tint, rgba(229, 168, 61, 0.1));
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    padding: var(--spacing-sm) var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .slot-tag {
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    font-weight: 700;
    color: var(--color-warning, #e5a83d);
  }

  .block-slot p {
    margin: 0;
  }

  .block-pictographs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-md);
  }

  .pictograph-box {
    width: 140px;
    height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pictograph-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--theme-border);
    border-radius: var(--radius-md);
    background: var(--theme-surface);
  }

  .placeholder-letter {
    font-size: 1.5rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .script-nav {
    display: flex;
    justify-content: space-between;
    gap: var(--spacing-md);
    padding-top: var(--spacing-md);
    border-top: 1px solid var(--theme-border);
  }

  .nav-link {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    padding: 0 var(--spacing-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--theme-border);
    background: var(--theme-surface);
    color: var(--theme-text);
    text-decoration: none;
  }

  .nav-link:hover,
  .nav-link:focus-visible {
    background: var(--theme-surface-hover, rgba(255, 255, 255, 0.06));
  }

  .not-authorized {
    padding: var(--spacing-lg);
    text-align: center;
    color: var(--theme-text);
  }
</style>
