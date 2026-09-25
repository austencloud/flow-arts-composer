<script lang="ts">
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
</script>

<GuideSection id="codex-pages" title="Codex Pages">
  <div class="section-body">
    <p>
      Reference grids showing all letters at each turn combination.
    </p>

    <h3>1|0, 0|1, 1|1</h3>
    <!-- TODO: add codex page grids for 1-turn combinations -->

    <h3>2|0, 0|2, 2|1, 1|2, 2|2</h3>
    <!-- TODO: add codex page grids for 2-turn combinations -->
  </div>
</GuideSection>

<style>
  /* GuideSection owns text width; these rules set paragraph rhythm. */
  .section-body :global(p) {
    margin: 0 auto 1.1rem;
    text-align: center;
    text-wrap: balance;
  }
  .section-body :global(p:last-child) {
    margin-bottom: 0;
  }
  .section-body :global(h3) {
    text-align: center;
    text-wrap: balance;
    margin: 1.75rem 0 0.35rem;
  }
</style>
