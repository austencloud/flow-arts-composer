<script lang="ts">
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
</script>

<GuideSection id="type-4-turns" title="Type 4: Dash (1-Turn)">
  <div class="section-body">
    <p>
      Type 4 hybrids combine a dash with a static motion. There is no shift involved. According to PADS, a dash is higher than a static motion.
    </p>

    <p>
      For Type 4, high = dash and low = static. This includes Φ, Ψ, and Λ.
    </p>

    <!-- TODO: add diagram - Phi-High-One (only one prop rotating, no rotational relationship) -->

    <!-- TODO: add diagram - Phi-Low-One (pause at halfway, hand-to-end relationship with left hand and right pinky end) -->

    <p>
      When typing the words for sequences containing greek symbols, it's easier to just type the word or its first three letters. E.g. "phi(0,1)". The corresponding symbol can easily be swapped in with a simple script. The short versions of the seven greek letters are "sig, del, the, om, phi, psi, lam"
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
