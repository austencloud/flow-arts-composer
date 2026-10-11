<!--
  PremiumShowcase - Premium subscription page with optimized conversion flow

  Composed from small, focused primitives for effective AI-assisted development.
-->
<script lang="ts">
  import { createCheckoutSession } from "#lib/shared/subscription/services/subscription-manager.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { captureEvent } from "#lib/shared/analytics/services/posthog.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import type { HapticFeedback } from "../../../shared/application/services/haptic-feedback";
  import PremiumHero from "./PremiumHero.svelte";
  import PremiumCTA from "./PremiumCTA.svelte";
  import StickyPremiumCTA from "./StickyPremiumCTA.svelte";
  import PriceHighlight from "./PriceHighlight.svelte";
  import FeatureComparisonTable from "./FeatureComparisonTable.svelte";
  import EarlyAccessBanner from "./EarlyAccessBanner.svelte";
  import InfoCard from "./InfoCard.svelte";
  import TrustBadges from "./placeholders/social-proof/TrustBadges.svelte";
  import FAQ from "./placeholders/risk-reversal/FAQ.svelte";

  interface Props {
    onClose?: () => void;
    hapticService?: HapticFeedback | null;
  }

  let { onClose, hapticService = null }: Props = $props();

  let isLoading = $state(false);
  let checkoutError = $state<string | null>(null);

  // Public Stripe price id, not a credential — price ids ship in the client
  // checkout bundle by design. Env var lets it be swapped per environment.
  const PRICE_ID =
    import.meta.env.PUBLIC_STRIPE_PRICE_ID || "price_1SgbRTLZdzgHfpQbEp99bKp7";

  // Analytics tracking - sends to PostHog
  function trackEvent(event: string, properties?: Record<string, unknown>) {
    captureEvent(event, properties);
  }

  $effect(() => {
    // Track page view
    trackEvent("premium_page_viewed", {
      priceId: PRICE_ID,
    });

    return () => {
      // Cleanup if needed
    };
  });

  async function handleSubscribe(source: "desktop" | "mobile" = "desktop") {
    if (isLoading || !PRICE_ID) return;

    trackEvent("premium_cta_clicked", {
      source,
      priceId: PRICE_ID,
    });

    hapticService?.trigger("selection");
    isLoading = true;
    checkoutError = null;

    try {
      trackEvent("checkout_initiated", {
        source,
        priceId: PRICE_ID,
      });

      const checkoutUrl =
        await createCheckoutSession(PRICE_ID);

      trackEvent("checkout_redirect", {
        source,
        checkoutUrl: checkoutUrl.substring(0, 50) + "...", // Truncate for privacy
      });

      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("Failed to create checkout session:", error);

      trackEvent("checkout_error", {
        source,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      hapticService?.trigger("error");

      // Surface the failure: a silent paywall failure leaves the user with a
      // reset button and no idea what happened. Show both a toast and inline text.
      checkoutError = t('premium_checkout_error');
      toast.error(checkoutError);

      isLoading = false;
    }
  }

  const features = $derived([
    {
      name: t('premium_feature_sequence_generator'),
      icon: "fa-wand-magic-sparkles",
      free: t('premium_feature_daily_limit'),
      premium: t('premium_feature_unlimited'),
    },
    {
      name: t('premium_feature_compose_module'),
      icon: "fa-photo-film",
      free: t('premium_feature_not_available'),
      premium: t('premium_feature_full_access'),
    },
    {
      name: t('premium_feature_train_module'),
      icon: "fa-running",
      free: t('premium_feature_not_available'),
      premium: t('premium_feature_full_access'),
    },
  ]);
</script>

<div class="premium-showcase">
  <!-- Hero -->
  <PremiumHero
    title={t('premium_hero_title')}
    subtitle={t('premium_hero_subtitle')}
  />

  <!-- Price Highlight (Mobile Only) -->
  <PriceHighlight price={10} period={t('premium_period_month')} />

  <!-- Early Access Banner -->
  <div class="banner-section">
    <EarlyAccessBanner
      message={t('premium_early_access_message')}
    />
  </div>

  <!-- About TKA -->
  <section class="about-section">
    <InfoCard title={t('premium_about_title')}>
      <p>
        {t('premium_about_description')}
      </p>
      <p>
        {t('premium_about_support')}
      </p>
    </InfoCard>
  </section>

  <!-- Call to Action (Desktop) -->
  <section class="cta-section desktop-only">
    <PremiumCTA
      price={10}
      period={t('premium_period_month')}
      {isLoading}
      disabled={!PRICE_ID}
      onSubscribe={() => handleSubscribe("desktop")}
    />
    {#if checkoutError}
      <p class="checkout-error" role="alert">
        <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
        {checkoutError}
      </p>
    {/if}
    <p class="support-note">
      {t('premium_support_note')}
    </p>
  </section>

  <!-- Feature Comparison -->
  <section class="comparison-section">
    <h2>{t('premium_whats_included')}</h2>
    <FeatureComparisonTable {features} />
  </section>

  <!-- FAQ -->
  <section class="faq-section">
    <FAQ />
  </section>

  <!-- Trust Badges -->
  <section class="trust-section">
    <TrustBadges />
  </section>

  <!-- Close Button (for modal mode) -->
  {#if onClose}
    <button class="close-button" onclick={onClose} aria-label={t('premium_close')}>
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  {/if}
</div>

<!-- Sticky mobile CTA (hidden on desktop) -->
<StickyPremiumCTA
  price={10}
  period={t('premium_period_month')}
  {isLoading}
  disabled={!PRICE_ID}
  onSubscribe={() => handleSubscribe("mobile")}
/>

<style>
  .premium-showcase {
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
    padding: clamp(20px, 4vh, 40px) clamp(16px, 3vw, 24px);
    position: relative;
  }

  /* Add bottom padding on mobile for sticky CTA */
  @media (max-width: 767px) {
    .premium-showcase {
      padding-bottom: 100px; /* Space for sticky CTA */
    }

    .desktop-only {
      display: none;
    }
  }

  @media (min-width: 768px) {
    .desktop-only {
      display: block;
    }
  }

  .banner-section {
    margin-bottom: var(--spacing-md, 16px);
  }

  .about-section {
    margin-bottom: var(--spacing-lg, 24px);
  }

  .cta-section {
    margin-bottom: var(--spacing-lg, 24px);
  }

  .comparison-section {
    margin-bottom: var(--spacing-lg, 24px);
  }

  .faq-section {
    margin-bottom: var(--spacing-lg, 24px);
  }

  .trust-section {
    margin-bottom: var(--spacing-lg, 24px);
  }

  .comparison-section h2 {
    font-size: clamp(20px, 3vw, 28px);
    font-weight: 600;
    text-align: center;
    margin: 0 0 var(--spacing-md, 16px);
    color: var(--theme-text);
  }

  .support-note {
    text-align: center;
    font-size: var(--font-size-min);
    color: var(--theme-text-dim, var(--theme-text-dim));
    margin: var(--spacing-md, 16px) 0 0;
  }

  .checkout-error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs, 6px);
    text-align: center;
    font-size: var(--font-size-min);
    color: var(--semantic-error, #ef4444);
    margin: var(--spacing-md, 16px) 0 0;
  }

  .close-button {
    position: absolute;
    top: var(--spacing-md, 16px);
    right: var(--spacing-md, 16px);
    width: var(--alt-touch-target, 40px);
    height: var(--alt-touch-target, 40px);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 50%;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .close-button:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }
</style>
