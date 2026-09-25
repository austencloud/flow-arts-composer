<script lang="ts">
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
</script>

<GuideSection id="type-6-turns" title="Type 6: Static (1-Turn)">
  <div class="section-body">
    <p>
      Finally, Type 6 letters have both hands remaining static. Both types are the same (static|static), so the number goes in the high slot by default.
    </p>

    <p>
      This includes α, β, and Γ.
    </p>

    <!-- TODO: add diagram - Alpha-One -->

    <p>
      Note that the arrow can follow the path of either the thumb end or pinky end. The optimal placement depends on context.
    </p>

    <!-- TODO: add diagram - Gamma-One opening (◌) / Gamma-One closing (◍) -->

    <p>
      These static single-turns are relatively simple. Next we'll look at dual-turns, in which both props are receiving a turn.
    </p>
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
</style>
