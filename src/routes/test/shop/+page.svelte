<!--
  /test/shop — preview harness for the public Shop "Coming Soon" page (the real
  component, no mockup). The product editor lives in the Stripe Dashboard now,
  so there's no in-app editor to preview here.
-->
<script lang="ts">
  import ShopComingSoon from "#lib/features/store/components/ShopComingSoon.svelte";
</script>

<svelte:head><title>Shop preview | TKA test</title></svelte:head>

<ShopComingSoon />
