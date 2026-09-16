<script lang="ts">
  /**
   * PlacementGroupsSection - Displays Alpha/Beta/Gamma placement pattern
   *
   * Shows the 8 + 8 = 16 binary synthesis pattern for grid placements.
   */
  import { PLACEMENT_GROUPS } from "../domain/content";
  import "./triad-palette.css";
</script>

<section class="placement-groups mf-triad-scope">
  <div class="container">
    <h2>Level 1: Grid Placements</h2>
    <p class="section-intro">
      The grid has <strong>32 unique placements</strong> for where both hands can be.
      These divide into three groups following the binary synthesis pattern.
    </p>

    <div class="groups-grid">
      {#each PLACEMENT_GROUPS as group}
        <div class="group-card" style="--accent: {group.color}">
          <div class="group-header">
            <span class="greek">{group.greek}</span>
            <span class="name">{group.name}</span>
            <span class="count">{group.count} placements</span>
          </div>
          <p class="description">{group.description}</p>
          <p class="relationship">{group.relationship}</p>
        </div>
      {/each}
    </div>

    <div class="pattern-visual">
      <div class="pattern-row">
        <div class="pattern-item thesis">
          <span class="greek">α</span>
          <span class="label">Alpha (8)</span>
          <span class="sublabel">Opposition</span>
        </div>
        <span class="operator">+</span>
        <div class="pattern-item antithesis">
          <span class="greek">β</span>
          <span class="label">Beta (8)</span>
          <span class="sublabel">Unison</span>
        </div>
        <span class="operator">=</span>
        <div class="pattern-item synthesis">
          <span class="greek">γ</span>
          <span class="label">Gamma (16)</span>
          <span class="sublabel">Fusion</span>
        </div>
      </div>

      <div class="insight">
        <p>
          Gamma has <strong>twice as many</strong> placements because it's the fusion.
          It contains two internal halves (1-8 and 9-16) that are themselves opposites of each other-
          mirroring the Alpha/Beta opposition <em>inside</em> itself.
        </p>
      </div>
    </div>
  </div>
</section>

<style>
  .placement-groups {
    padding: 80px 24px;
  }

  .container {
    max-width: 1000px;
    margin: 0 auto;
  }

  h2 {
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    margin-bottom: 1rem;
    text-align: center;
    font-weight: 600;
    line-height: 1.2;
    color: var(--theme-text, #fff);
  }

  .section-intro {
    text-align: center;
    font-size: 1.125rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    max-width: 600px;
    margin: 0 auto 2.5rem;
    line-height: 1.6;
  }

  .groups-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-bottom: 3rem;
  }

  .group-card {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    padding: 24px;
    transition: all var(--duration-normal) ease;
  }

  .group-card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
  }

  .group-header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 12px;
  }

  .greek {
    font-size: 2rem;
    font-weight: 600;
    color: var(--accent);
  }

  .name {
    font-size: 1.25rem;
    font-weight: 500;
    color: var(--theme-text, #fff);
  }

  .count {
    font-size: 0.875rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    margin-left: auto;
  }

  .description {
    color: var(--theme-text, #fff);
    margin-bottom: 8px;
    font-size: 0.9375rem;
  }

  .relationship {
    color: var(--accent);
    font-size: 0.875rem;
    font-weight: 500;
  }

  /* Pattern Visual */
  .pattern-visual {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 20px;
    padding: 32px;
  }

  .pattern-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 24px;
  }

  .pattern-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px 28px;
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    min-width: 120px;
  }

  .pattern-item .greek {
    font-size: 2.5rem;
    margin-bottom: 4px;
  }

  .pattern-item .label {
    font-weight: 500;
    color: var(--theme-text, #fff);
    font-size: 1rem;
  }

  .pattern-item .sublabel {
    font-size: 0.8125rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    margin-top: 4px;
  }

  .thesis {
    --accent: var(--mf-thesis);
  }

  .thesis .greek {
    color: var(--accent);
  }

  .antithesis {
    --accent: var(--mf-antithesis);
  }

  .antithesis .greek {
    color: var(--accent);
  }

  .synthesis {
    --accent: var(--mf-synthesis);
    padding: 24px 36px;
  }

  .synthesis .greek {
    color: var(--accent);
    font-size: 3rem;
  }

  .operator {
    font-size: 2rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-weight: 300;
  }

  .insight {
    text-align: center;
    padding: 20px;
    background: color-mix(in srgb, var(--mf-synthesis) 8%, transparent);
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--mf-synthesis) 20%, transparent);
  }

  .insight p {
    color: var(--theme-text, #fff);
    line-height: 1.7;
    margin: 0;
    font-size: 1rem;
  }

  @media (max-width: 768px) {
    .groups-grid {
      grid-template-columns: 1fr;
    }

    .pattern-row {
      gap: 12px;
    }

    .pattern-item {
      padding: 16px 20px;
      min-width: 100px;
    }

    .operator {
      font-size: 1.5rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .group-card {
      transition: none;
    }
    .group-card:hover {
      transform: none;
    }
  }
</style>
