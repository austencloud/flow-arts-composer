<script lang="ts">
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
</script>

<GuideSection id="type-2-turns" title="Type 2: Shift (1-Turn)">
  <div class="section-body">
    <p>
      Type 2 hybrids combine a shift and a static motion. These two motion types are different, so we use the high/low slots to differentiate them. To determine where they go, remember PADS. Because a shift (pro/anti) is higher than a static motion, we can confidently state that:
    </p>

    <p>
      For Type 2, high = shift and low = static. This includes W, X, Y, Z, Σ, Δ, Θ, and Ω.
    </p>

    <!-- TODO: add diagram - W-High-One (static hand is still, should be simple to execute) -->

    <p>
      Type 2 motions become more complex when we add turns to the static hand. Since this causes both props to rotate, it creates either a Same or Opposite relationship. To indicate this, add a dot above or below the letter. A same-dot goes above and an opp-dot goes below.
    </p>

    <!-- TODO: add diagram - W-Same Low-One (same-dot variant) -->
    <!-- TODO: add diagram - W-Opp Low-One (opp-dot variant) -->

    <p>
      You can also use (s) or (o) as parameters to indicate "same" or "opp". E.g. "W(s,0,1)"
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
