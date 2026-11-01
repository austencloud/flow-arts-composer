<script lang="ts">
  /**
   * /tunnel/4UMY-B7Y4: two performers stacked front and back. The address
   * names both sequences, front first, so a scan opens the pair instead of
   * one sequence with a guess at who started.
   */
  import { browser } from "$app/env";
  import { page } from "$app/state";
  import Seo from "#lib/shared/components/Seo.svelte";
  import SequencePageLoading from "../../sequence/[id]/SequencePageLoading.svelte";
  import { provideSequencePageLoading } from "../../sequence/[id]/sequence-page-loading.svelte.js";
  import { parsePartnerTunnelAddress } from "#lib/shared/sequence-viewer/tunnel/partner-tunnel.js";

  const pair = $derived(page.params.pair ?? "");
  const address = $derived(parsePartnerTunnelAddress(pair));

  const loading = provideSequencePageLoading();
  const loadingSession = browser ? loading.open() : null;

  // The codes are for the address, not for people; the page names itself
  // by what it is.
  const title = "Tunnel | Flow Arts Composer";
  const description =
    "Two performers in a tunnel, one in front and one behind. Watch them together or open either performer.";
</script>

<Seo
  {title}
  {description}
  canonical={`https://tkaflowarts.com/tunnel/${encodeURIComponent(pair)}`}
/>

{#if browser}
  {#await import("./TunnelViewerPage.svelte")}
    <div class="tunnel-route-loading">
      {#if loadingSession}
        <SequencePageLoading session={loadingSession} />
      {/if}
    </div>
  {:then { default: TunnelViewerPage }}
    {#key pair}
      <TunnelViewerPage {address} />
    {/key}
  {/await}
{/if}

<style>
  .tunnel-route-loading {
    position: relative;
    height: 100vh;
    height: 100dvh;
  }
</style>
