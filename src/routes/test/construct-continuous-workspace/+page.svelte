<script lang="ts">
  import ConstructSection from "../../(public)/composer/_sections/ConstructSection.svelte";
</script>

<svelte:head>
  <title>Continuous Construct Workspace</title>
</svelte:head>

<main class="prototype-page">
  <header class="prototype-header">
    <h1>Continuous Construct</h1>
    <p>
      Build, play, seek, and undo in one workspace. Replacing a selected beat
      removes later moves so every continuation remains valid.
    </p>
  </header>

  <div class="prototype-stage">
    <ConstructSection presentationMode="continuous" />
  </div>
</main>

<style>
  .prototype-page {
    min-height: 100svh;
    padding: clamp(0.75rem, 1.5vw, 1.5rem);
    color: var(--theme-text, #f5f4ff);
    box-sizing: border-box;
  }

  .prototype-header {
    width: min(100%, 96rem);
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem 2rem;
    margin: 0 auto 0.75rem;
  }

  .prototype-header p,
  .prototype-header h1 {
    margin: 0;
  }

  .prototype-header h1 {
    flex: 0 0 auto;
    font-size: clamp(1.1rem, 1rem + 0.5vw, 1.5rem);
    line-height: 1.2;
  }

  .prototype-header p {
    max-width: 72ch;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
    text-align: right;
  }

  .prototype-stage {
    width: min(100%, 108rem);
    margin-inline: auto;
  }

  @media (max-width: 480px) {
    .prototype-page {
      padding: 1rem 0.5rem 2rem;
    }

    .prototype-header {
      display: block;
      padding-inline: 0.5rem;
      box-sizing: border-box;
    }

    .prototype-header p {
      margin-top: 0.35rem;
      text-align: left;
    }
  }
</style>
