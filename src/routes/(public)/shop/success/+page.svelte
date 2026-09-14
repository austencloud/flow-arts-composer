<script lang="ts">
  // Nav + cosmic background come from +layout.svelte.
  import OrderConfirmation from "$lib/features/store/components/OrderConfirmation.svelte";
  import Seo from "$lib/shared/components/Seo.svelte";
</script>

<Seo
  title="Order Confirmed | Flow Arts Composer"
  description="Your Kinetic Alphabet order is confirmed. Details and next steps below."
  canonical="https://tkaflowarts.com/shop/success"
  noindex
/>

<OrderConfirmation />
