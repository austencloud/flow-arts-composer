<script lang="ts">
  /**
   * Tuning harness for the FAQ list layout. Renders the exact component the
   * /faq page ships, in the site's dark context. Judge it per tier by
   * resizing the viewport: ≤600 phone (full-width doors) · desktop reading
   * column · ≥2200 4K scale-up.
   */
  import FaqInterview from "#lib/shared/landing/components/FaqInterview.svelte";
</script>

<svelte:head>
  <title>FAQ layout — tuning</title>
</svelte:head>

<div class="page">
  <FaqInterview />
</div>

<style>
  /* Approximate the public pages' dark cosmic context so the layout is
     judged in situ, not on a white void. */
  .page {
    min-height: 100vh;
    padding: 88px 1.5rem 5rem;
    background: linear-gradient(180deg, #0a0c18 0%, #10122a 55%, #0a0c18 100%);
    color: #ffffff;
    font-family: "Inter", system-ui, -apple-system, sans-serif;
    line-height: 1.6;
  }
</style>
