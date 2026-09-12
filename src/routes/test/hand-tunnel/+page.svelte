<!--
  Dev wrapper for the Hand Tunnel toy so it can be driven at a bare URL without
  the app shell. The real surface is Toys → Hand Tunnel; this route redirects
  outside dev like every /test/* page.
-->
<script lang="ts">
  import HandTunnelToy from "$lib/features/toys/tabs/hand-tunnel/HandTunnelToy.svelte";
</script>

<div class="page">
  <HandTunnelToy />
</div>

<style>
  .page {
    min-height: 100dvh;
    background: radial-gradient(circle at 50% 30%, #14141f 0%, #0a0a0f 70%);
    color: #e8e8f0;
    font-family: system-ui, sans-serif;
  }
</style>
