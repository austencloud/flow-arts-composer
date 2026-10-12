<script lang="ts">
  /**
   * BeyondVtgPanel - card list of what TKA covers beyond VTG.
   */

  import { BEYOND_VTG_ITEMS } from "../domain/vtg-pattern-data";
</script>

<div class="beyond-grid">
  {#each BEYOND_VTG_ITEMS as item (item.title)}
    <div class="beyond-card">
      <div class="card-icon">
        <i class="fas {item.icon}" aria-hidden="true"></i>
      </div>
      <div class="card-content">
        <h3>{item.title}</h3>
        <p>{item.description}</p>
        <span class="tka-feature">{item.tkaFeature}</span>
      </div>
    </div>
  {/each}
</div>

<style>
  .beyond-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0.75rem;
  }

  .beyond-card {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: 10px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    transition: border-color var(--duration-fast) var(--ease-standard);
  }

  .beyond-card:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .card-icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: var(--theme-accent-bg, rgba(34, 211, 238, 0.1));
    color: var(--theme-accent, #22d3ee);
    font-size: 1rem;
  }

  .card-content {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  h3 {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  p {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, #888);
    line-height: 1.4;
  }

  .tka-feature {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    background: var(--theme-accent-bg, rgba(34, 211, 238, 0.1));
    color: var(--theme-accent, #22d3ee);
    align-self: flex-start;
  }

  @media (prefers-reduced-motion: reduce) {
    .beyond-card {
      transition: none;
    }
  }
</style>
