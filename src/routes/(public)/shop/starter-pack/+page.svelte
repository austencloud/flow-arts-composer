<script lang="ts">
  // Nav + cosmic background come from the (public)/shop +layout.svelte.
  import StarterPackPage from "$lib/features/store/StarterPackPage.svelte";
  import Seo from "$lib/shared/components/Seo.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<Seo
  title="The Starter Pack | Flow Arts Composer"
  description="Everything to start TKA in one box: the Timing & Direction trilogy, a mixed LOOP deck, the book, deck boxes, and a waterproof card holder."
  canonical="https://tkaflowarts.com/shop/starter-pack"
/>

<StarterPackPage seedProducts={data.products} />
