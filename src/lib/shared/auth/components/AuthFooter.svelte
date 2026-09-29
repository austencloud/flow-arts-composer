<!--
  AuthFooter.svelte - Authentication Sheet Footer

  Footer with Terms of Service and Privacy Policy links.
  On mobile (<768px): Opens bottom sheets
  On desktop (≥768px): Navigates to /terms or /privacy pages
-->
<script lang="ts">
  import LegalSheet from "../../legal/components/LegalSheet.svelte";
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte";

  // Local sheet state
  let sheetOpen = $state(false);
  let sheetType = $state<"terms" | "privacy">("terms");

  const MOBILE_BREAKPOINT = 768;

  function handleTermsClick(e: MouseEvent) {
    if (
      typeof window !== "undefined" &&
      window.innerWidth < MOBILE_BREAKPOINT
    ) {
      e.preventDefault();
      sheetType = "terms";
      sheetOpen = true;
    }
  }

  function handlePrivacyClick(e: MouseEvent) {
    if (
      typeof window !== "undefined" &&
      window.innerWidth < MOBILE_BREAKPOINT
    ) {
      e.preventDefault();
      sheetType = "privacy";
      sheetOpen = true;
    }
  }

  function closeSheet() {
    sheetOpen = false;
  }
</script>

<footer class="auth-footer">
  <p class="auth-footer__text">
    {t("auth_footer_agree")}
    <LinkChip size="inline" href="/terms" onclick={handleTermsClick}
      >{t("auth_footer_terms")}</LinkChip
    >
    {t("auth_footer_and")}
    <LinkChip size="inline" href="/privacy" onclick={handlePrivacyClick}
      >{t("auth_footer_privacy")}</LinkChip
    >
  </p>
</footer>

<LegalSheet isOpen={sheetOpen} type={sheetType} onClose={closeSheet} />

<style>
  .auth-footer {
    padding: 16px 24px;
    border-top: 1px solid var(--theme-stroke, var(--theme-stroke));
    background: color-mix(in srgb, var(--theme-shadow) 20%, transparent);
    flex-shrink: 0;
  }

  .auth-footer__text {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
    margin: 0;
    text-align: center;
    line-height: 1.6;
  }

  @media (max-width: 480px) {
    .auth-footer {
      padding: 12px 16px;
    }

    .auth-footer__text {
      font-size: var(--font-size-compact);
    }
  }

  @media (max-height: 700px) {
    .auth-footer {
      padding: 11px 16px;
    }
  }

  /* iPhone SE 2/3 and smaller - hide footer to prevent scrolling */
  @media (max-height: 700px) {
    .auth-footer {
      display: none;
    }
  }

  @media (prefers-contrast: high) {
    .auth-footer {
      border-color: white;
    }
  }
</style>
