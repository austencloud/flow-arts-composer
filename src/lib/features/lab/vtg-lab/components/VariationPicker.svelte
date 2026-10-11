<script lang="ts">
  import ChoreoCard from "#lib/features/choreo-card/components/ChoreoCard.svelte";
  import CardInspectModal from "#lib/features/choreo-card/components/CardInspectModal.svelte";
  import { resolveVariationSequence, bakeVariationFront, type StyleVariation, type LabGridMode, type StartOriPair } from "../services/resolve-rotation-style-matrices";
  import { portal } from "#lib/features/create/generate/components/modals/portal.js";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  interface Props {
    variations: StyleVariation[];
    turnPattern: string; // "blue|red"
    accent: string;
    grid: LabGridMode;
    startOri: StartOriPair;
    onClose: () => void;
  }
  const { variations, turnPattern, accent, grid, startOri, onClose }: Props = $props();

  interface ResolvedVariation {
    v: StyleVariation;
    seq: SequenceData;
    frontUrl: string;
  }

  let cards = $state<ResolvedVariation[]>([]);
  let loading = $state(true);
  let inspected = $state<ResolvedVariation | null>(null);
  // Count of variations whose sequence couldn't resolve or bake. Surfaced (note +
  // toast) so a partial grid isn't silently shorter than the variation count.
  let failedCount = $state(0);

  // Resolve every variation's real sequence at this turn pattern, then bake the
  // actual timing/direction deck-card front (elemental stripe frame + tint + QR +
  // mandala) so the user picks by looking at the colored deck card, not a plain
  // white render. Fill by index so the grid order stays the modeTag order even as
  // bakes finish out of order.
  $effect(() => {
    const tp = turnPattern;
    const ori = startOri;
    loading = true;
    cards = [];
    failedCount = 0;
    let cancelled = false;
    let failures = 0;
    const slots: (ResolvedVariation | null)[] = variations.map(() => null);

    Promise.all(
      variations.map(async (v, i) => {
        try {
          const seq = await resolveVariationSequence(v.seedId, tp, grid, ori);
          if (cancelled) return;
          if (!seq) {
            failures++;
            return;
          }
          const frontUrl = await bakeVariationFront(seq, v.familyId);
          if (cancelled) return;
          slots[i] = { v, seq, frontUrl };
          if (tp === turnPattern) cards = slots.filter((s): s is ResolvedVariation => s !== null);
        } catch {
          // A variation that fails to resolve/bake is counted, not silently dropped.
          if (!cancelled) failures++;
        }
      }),
    ).finally(() => {
      if (tp === turnPattern && !cancelled) {
        loading = false;
        failedCount = failures;
        if (failures > 0) {
          showToast(
            `${failures} variation${failures === 1 ? "" : "s"} failed to render.`,
            "warning",
          );
        }
      }
    });

    return () => {
      cancelled = true;
    };
  });

  const leftTurns = $derived(turnPattern.split("|")[0]);
  const rightTurns = $derived(turnPattern.split("|")[1]);

  // Balanced columns off the full variation count (stable as bakes stream in) —
  // one row when they fit (≤8), otherwise split into even rows, never a lonely
  // 5-and-2. minmax(0,1fr) lets the cards shrink to share the row.
  const cols = $derived(
    variations.length <= 8
      ? Math.max(variations.length, 1)
      : Math.ceil(variations.length / Math.ceil(variations.length / 8)),
  );
</script>

{#if inspected}
  <!-- Drill one deeper into the full front+back card; pass the baked colored front
       so the side-by-side preview shows the elemental deck card, not a generic render. -->
  <CardInspectModal
    sequence={inspected.seq}
    frontImageUrl={inspected.frontUrl}
    onClose={() => (inspected = null)}
  />
{:else}
  <div
    class="backdrop"
    use:portal
    role="button"
    tabindex="-1"
    aria-label="Close"
    onclick={onClose}
    onkeydown={(e) => e.key === "Escape" && onClose()}
  >
    <div
      class="sheet"
      style="--accent: {accent};"
      role="dialog"
      aria-label="Pick a sequence"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === "Escape" && onClose()}
    >
      <header>
        <span class="turns">Blue {leftTurns} · Red {rightTurns} turns</span>
        <button class="x" onclick={onClose} aria-label="Close"><i class="fas fa-xmark"></i></button>
      </header>

      {#if loading && cards.length === 0}
        <div class="status" role="status">Rendering deck cards…</div>
      {:else if cards.length === 0}
        <div class="status" role="alert">
          {failedCount > 0
            ? `All ${failedCount} variation${failedCount === 1 ? "" : "s"} failed to render.`
            : "No sequences."}
        </div>
      {:else}
        {#if failedCount > 0}
          <div class="fail-note" role="alert">
            <i class="fas fa-triangle-exclamation"></i>
            {failedCount} variation{failedCount === 1 ? "" : "s"} failed to render and {failedCount === 1 ? "is" : "are"} not shown.
          </div>
        {/if}
        <div class="card-grid" style="grid-template-columns: repeat({cols}, minmax(0, 1fr));">
          {#each cards as c (c.v.seedId)}
            <button class="card-cell" onclick={() => (inspected = c)} aria-label="{c.v.word} ({c.v.modeTag}) — open full card">
              <div class="card-frame">
                <ChoreoCard sequence={c.seq} cardMode preRenderedImageUrl={c.frontUrl} />
              </div>
              <span class="cap"><strong>{c.v.word}</strong>{#if c.v.modeTag}<span class="tag">{c.v.modeTag}</span>{/if}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 1000);
    background: var(--theme-overlay-bg, rgba(4, 12, 18, 0.62));
    backdrop-filter: blur(3px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }
  .sheet {
    width: 96vw;
    max-height: 94vh;
    overflow-y: auto;
    background: var(--theme-surface, rgba(16, 28, 38, 0.97));
    border: 1px solid color-mix(in srgb, var(--accent) 40%, rgba(255, 255, 255, 0.1));
    border-radius: 18px;
    padding: 1.25rem 1.75rem 1.75rem;
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.5);
  }
  header {
    position: sticky;
    top: -0.2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
    padding-top: 0.2rem;
    background: linear-gradient(var(--theme-surface, rgba(16, 28, 38, 0.97)) 70%, transparent);
  }
  .turns {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--theme-text, #cfe6f2);
    font-variant-numeric: tabular-nums;
  }
  .fail-note {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    padding: 0.6rem 0.85rem;
    border-radius: 10px;
    font-size: 0.85rem;
    color: var(--semantic-warning, #fbbf24);
    background: color-mix(in srgb, var(--semantic-warning, #fbbf24) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-warning, #fbbf24) 35%, transparent);
  }
  .x {
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    font-size: 1.05rem;
    padding: 0.25rem;
  }
  .x:hover { color: var(--theme-text, #fff); }
  .status { padding: 2.5rem; text-align: center; color: rgba(255, 255, 255, 0.55); font-size: 0.9rem; }

  .card-grid {
    display: grid;
    gap: 1.5rem;
  }
  .card-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem;
    border: 1px solid transparent;
    border-radius: 12px;
    background: transparent;
    cursor: pointer;
    transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease;
  }
  .card-cell:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .card-cell:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent) 70%, transparent);
    outline-offset: 2px;
  }
  .card-frame {
    width: 100%;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
  }
  .cap {
    display: inline-flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 1rem;
    letter-spacing: 0.05em;
    color: var(--theme-text, #fff);
  }
  .cap .tag { font-size: 0.85rem; opacity: 0.6; }
  @media (prefers-reduced-motion: reduce) {
    .card-cell { transition: none; }
  }
</style>
