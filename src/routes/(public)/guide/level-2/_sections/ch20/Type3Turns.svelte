<script lang="ts">
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
</script>

<GuideSection id="type-3-turns" title="Type 3: Cross-Shift (1-Turn)">
  <div class="section-body">
    <p>
      Type 3 hybrids combine a shift with a dash. When we consult PADS, we find that a shift is higher than a dash, therefore:
    </p>

    <p>
      For Type 3, high = shift and low = dash. This includes W-, X-, Y-, Z-, Σ-, Δ-, Θ-, and Ω-.
    </p>

    <!-- TODO: add diagram - Z-Dash High-One (affects the shift only) -->

    <p>
      Take note of this strange position at the halfway point. There is a hand-to-end relationship between the left hand and the right staff's pinky end. It is important to pass through this position for the timing to be accurate.
    </p>

    <p>
      Now let's add 1 turn to the dash, leaving the shifting hand unmodified. This creates a rotational relationship, so we'll need to use Same-dots and Opp-dots.
    </p>

    <!-- TODO: add diagram - Z-Dash Same Low-One -->
    <!-- TODO: add diagram - Z-Dash Opp Low-One -->

    <p>
      The halfway position holds the key for executing cross-shifts with accurate timing. Though unfamiliar now, these centric positions will be thoroughly deconstructed later on.
    </p>

    <p>
      When writing code, put the dash after the letter and before the parentheses. E.g. Z-(s,0,1)
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
