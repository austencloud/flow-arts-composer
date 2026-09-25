<script lang="ts">
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
</script>

<GuideSection id="glyphs-pads" title="Glyphs / PADS">
  <div class="section-body">
    <p>
      A glyph is a letter combined with other characters, such as numbers or symbols.
    </p>

    <p>
      To the right of each letter, there are two slots: high and low. These slots contain numbers that indicate turns.
    </p>

    <p>
      <em>Update May 2025:</em> TKA software now handles the placement of these numbers, so it's less important that you learn this. Don't sweat it. Focus on the motions.
    </p>

    <p>
      In a hybrid, motion types are different and must be disambiguated. These rules indicate where to place numbers:
    </p>

    <ul>
      <li><strong>High:</strong> Pro, Anti, Dash</li>
      <li><strong>Low:</strong> Static</li>
    </ul>

    <p>
      The motion that is higher on the list is indicated by the high slot. Remember the order with the acronym <strong>PADS</strong>, for Pro, Anti, Dash, Static.
    </p>

    <p>
      The letters S and T have another factor, leading/following. In their case, leading is high and following is low.
    </p>

    <p>There are five hybrids, each shown below in their corresponding high/low slots:</p>

    <ul>
      <li><strong class="type-dual-shift">Type 1 Dual-Shift</strong> (Pro/Anti): C, F, I, L, O, R, U, V</li>
      <li><strong class="type-dual-shift">Type 2 Shift</strong> (Leading/Following): S, T</li>
      <li><strong class="type-shift">Type 3 Cross-Shift</strong> (Shift/Static): W, X, Y, Z, Σ, Δ, Θ, Ω</li>
      <li><strong class="type-cross-shift">Type 4 Dash</strong> (Shift/Dash): W-, X-, Y-, Z-, Σ-, Δ-, Θ-, Ω-</li>
      <li><strong class="type-dash">Type 5</strong> (Dash/Static): Φ, Ψ, Λ</li>
    </ul>

    <p>
      The remaining letters have combinations of the same motion type. For these, put left in the high slot and right in the low slot.
    </p>

    <p>
      These letters include: A, B, D, E, G, H, J, K, M, N, P, Q, S, T, Φ-, Ψ-, α, β, Γ
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
  .section-body :global(ul) {
    margin: 0 auto 1.1rem;
  }
  .section-body :global(p:last-child),
  .section-body :global(ul:last-child) {
    margin-bottom: 0;
  }
</style>
