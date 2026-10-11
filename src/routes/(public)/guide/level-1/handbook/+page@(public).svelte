<!--
  New Level 1 handbook (pilot). One page so far, The Grid, composed from the
  shared topic record. Unlinked and noindex until Austen approves it; the
  faithful first-edition book stays at /guide/level-1/print.
-->
<script lang="ts">
  import GridHandbookPage from "../_topics/GridHandbookPage.svelte";
</script>

<svelte:head>
  <title>Level 1 Handbook (pilot)</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="handbook">
  <GridHandbookPage pageNumber={1} />
</main>

<style>
  .handbook {
    min-height: 100vh;
    padding: 2rem 1rem;
    background: #e9e7e1;
    display: grid;
    justify-content: center;
    align-content: start;
    overflow-x: auto;
  }
  .handbook :global(.handbook-page) {
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.18);
  }
  @media print {
    @page {
      size: letter;
      margin: 0;
    }
    .handbook {
      padding: 0;
      background: none;
    }
    .handbook :global(.handbook-page) {
      box-shadow: none;
    }
  }
</style>
