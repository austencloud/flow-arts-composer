<script lang="ts">
  import PlayableArchive from "../../(public)/history/_components/archive/PlayableArchive.svelte";
</script>

<svelte:head>
  <title>Flow Arts Knowledge Archive prototype</title>
  <meta
    name="description"
    content="A sourced, playable chronology of flow arts notation, movement languages, teaching, and current research."
  />
  <meta name="robots" content="noindex" />
</svelte:head>

<main class="prototype-viewport">
  <PlayableArchive />
</main>

<style>
  .prototype-viewport {
    position: relative;
    height: 100dvh;
    overflow: hidden;
    background: oklch(0.115 0.008 270);
    color: oklch(0.9 0.02 270);
  }

  .prototype-viewport::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 100;
    pointer-events: none;
    opacity: 0.05;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  :global(body:has(.prototype-viewport)) {
    overflow: hidden;
  }

  @media (max-width: 760px), (max-height: 560px) {
    .prototype-viewport {
      height: auto;
      min-height: 100dvh;
      overflow: visible;
    }

    :global(body:has(.prototype-viewport)) {
      overflow: auto;
    }
  }

  @media (min-width: 700px) and (max-height: 560px) {
    .prototype-viewport {
      height: 100dvh;
      min-height: 0;
      overflow: hidden;
    }

    :global(body:has(.prototype-viewport)) {
      overflow: hidden;
    }
  }
  /* the first row clears a phone's status bar; nothing moves when --safe-top is 0 */
  .prototype-viewport {
    border-top: var(--safe-top) solid transparent;
  }
</style>
