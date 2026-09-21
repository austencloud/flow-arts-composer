<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
</script>

<section
  id="austen-cloud"
  class="project-story"
  aria-labelledby="creator-title"
>
  <div class="creator-portrait">
    <img
      src="/images/austen-fire.webp"
      alt="Austen Cloud performing with fire props"
      width="2048"
      height="2396"
    />
  </div>
  <div class="creator-copy">
    <h2 id="creator-title">Austen Cloud</h2>
    <p>
      Austen Cloud created The Kinetic Alphabet in 2022 and develops Flow Arts
      Composer.
    </p>
    <div class="creator-links">
      <PanelButton href="mailto:support@tkaflowarts.com"
        >Email Austen</PanelButton
      >
      <PanelButton href="/history">Notation history</PanelButton>
    </div>
  </div>
</section>

<style>
  .project-story {
    display: grid;
    grid-template-columns: minmax(14rem, 0.72fr) minmax(0, 1.28fr);
    gap: clamp(2rem, 5vw, 80px);
    align-items: center;
    max-width: min(100%, 82rem);
    margin: 0 auto;
    padding: clamp(4rem, 6vw, 96px) 0 clamp(2rem, 4vw, 64px);
  }

  .creator-portrait {
    overflow: hidden;
    border-radius: 1.25rem;
    background: var(--theme-card-bg, oklch(0.2 0.025 270 / 0.75));
  }

  img {
    display: block;
    width: 100%;
    height: auto;
  }

  h2 {
    margin: 0 0 1rem;
    font-family: "Fraunces", Georgia, serif;
    font-size: clamp(2.5rem, 1.9rem + 2.6vw, 72px);
    font-style: italic;
    font-weight: 650;
    letter-spacing: -0.045em;
    line-height: 0.96;
  }

  p {
    max-width: 52ch;
    margin: 0.85rem 0 0;
    color: var(--theme-text-secondary, oklch(0.74 0.018 270));
    font-size: clamp(1rem, 0.97rem + 0.18vw, 1.12rem);
    line-height: 1.65;
  }

  .creator-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem 1.25rem;
    margin-top: 1.5rem;
  }

  @media (max-width: 48rem) {
    .project-story {
      grid-template-columns: minmax(0, 28rem);
      justify-content: center;
    }

    .creator-portrait {
      width: min(100%, 23rem);
    }
  }
</style>
