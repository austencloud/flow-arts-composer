<!--
  PremiumHero - Hero section with developer photo and value proposition
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    photoUrl?: string;
    title: string;
    subtitle: string;
  }

  let { photoUrl = "/images/austen.jpg", title, subtitle }: Props = $props();

  function handleImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    const placeholder = img.nextElementSibling as HTMLElement;
    img.style.display = "none";
    placeholder.style.display = "flex";
  }
</script>

<div class="hero">
  <div class="developer-photo">
    <img src={photoUrl} alt={t('premium_hero_photo_alt')} onerror={handleImageError} />
    <div class="photo-placeholder">
      <i class="fas fa-user" aria-hidden="true"></i>
    </div>
  </div>
  <h1>{title}</h1>
  <p class="subtitle">{subtitle}</p>
</div>

<style>
  .hero {
    text-align: center;
    padding: var(--spacing-lg, 24px) 0;
  }

  .developer-photo {
    width: 120px;
    height: 120px;
    margin: 0 auto var(--spacing-lg, 24px);
    border-radius: 50%;
    overflow: hidden;
    border: 3px solid var(--theme-accent, var(--theme-accent));
    position: relative;
  }

  .developer-photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .photo-placeholder {
    display: none;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      135deg,
      var(--theme-accent) 0%,
      var(--theme-accent-strong) 100%
    );
    font-size: var(--font-size-3xl);
    color: white;
  }

  h1 {
    font-size: clamp(28px, 5vw, 42px);
    font-weight: 700;
    margin: 0 0 8px;
    color: var(--theme-text);
  }

  .subtitle {
    font-size: var(--font-size-min);
    color: var(--theme-text-dim, var(--theme-text-dim));
    margin: 0;
  }

  @media (max-width: 640px) {
    .hero {
      padding: var(--spacing-md, 16px) 0;
    }

    .developer-photo {
      width: 80px;
      height: 80px;
      margin-bottom: var(--spacing-md, 16px);
    }

    .photo-placeholder {
      font-size: var(--font-size-3xl);
    }

    h1 {
      font-size: clamp(22px, 5vw, 28px);
    }
  }
</style>
