<script lang="ts">
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
</script>

<GuideSection id="type-5-turns" title="Type 5: Dual-Dash (1-Turn)">
  <div class="section-body">
    <p>
      In Type 5 motions, both hands are dashing, so there are no hybrids. Since they're the same type (dash|dash), the left goes in the high slot, and the right goes in the low slot.
    </p>

    <p>
      This includes Φ-, Ψ-, and Λ-.
    </p>

    <!-- TODO: add diagram - Psi-Dash-One -->

    <p>
      Remember, the high/low slots do not refer to left/right. Instead, their purpose is to differentiate two motion types. In Type 5, those motion types are the same (dash|dash).
    </p>

    <!-- TODO: add diagram - Lam-Dash-One opening (◌) / Lam-Dash-One closing (◍) -->

    <p>
      As always, pause at the halfway point to drill it into your muscle memory. This will ensure proper timing.
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
