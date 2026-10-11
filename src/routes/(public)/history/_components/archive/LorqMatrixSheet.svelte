<script lang="ts">
  import { ORIGINAL_SHAPE_MATRIX_URL } from "#lib/shared/shape-matrix/app/shape-engine-identity.js";
  let { active = false }: { active?: boolean } = $props();
</script>

<figure class="lorq-sheet" class:active>
  <a
    class="sheet"
    href={ORIGINAL_SHAPE_MATRIX_URL}
    target="_blank"
    rel="noopener noreferrer"
    aria-label="View Lorq Nichols’ original 144 Shape Matrix publication"
  >
    <img
      src="/notation/lorq-144-shape-matrix.webp"
      width="2550"
      height="3300"
      alt="Lorq Nichols’ original 144 Shape Matrix: twelve even-petaled driving styles paired across a grid, with 1:1, 1:3 and 1:5 families and his original credit panel."
    />
  </a>
  <figcaption>Lorq Nichols · 144 Shape Matrix · 2014 rework</figcaption>
</figure>

<style>
  .lorq-sheet {
    margin: 0;
    width: 100%;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 0.5rem;
    padding: clamp(0.5rem, 2cqi, 1rem);
    box-sizing: border-box;
  }
  .sheet {
    display: flex;
    min-height: 0;
    min-width: 0;
    justify-content: center;
  }
  .sheet:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 3px;
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  figcaption {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    text-align: center;
    text-wrap: balance;
  }
</style>
