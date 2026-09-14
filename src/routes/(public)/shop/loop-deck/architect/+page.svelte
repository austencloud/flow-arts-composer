<script lang="ts">
  // Nav + cosmic background come from the (public)/shop +layout.svelte.
  import DeckArchitectPage from "$lib/features/store/DeckArchitectPage.svelte";
  import Seo from "$lib/shared/components/Seo.svelte";
</script>

<Seo
  title="The Deck Architect | Flow Arts Composer"
  description="Design your LOOP deck slice by slice: any flavor, level, length, and turn ceiling the engine can generate. 54 cards, built to your recipe."
  canonical="https://tkaflowarts.com/shop/loop-deck/architect"
/>

<DeckArchitectPage />
