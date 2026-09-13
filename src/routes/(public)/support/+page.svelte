<script lang="ts">
  /**
   * tkaflowarts.com/support — the "buy me a coffee" page.
   *
   * A general support page for the whole Kinetic Alphabet project, not just the
   * guide: the printed Level 1 guide carries ONE QR that points here, and the
   * site header links here too, so it has to read for someone who arrived from
   * the book AND for someone clicking "Support" in the nav. Stripe Checkout also
   * redirects back HERE (not the in-app modal) on success/cancel.
   *
   * The donation card itself lives in the shared SupportContent component, so
   * this route and the in-app SupportModal render the exact same UI from one
   * source. This route owns only the viewport-fit sizing of the card; the
   * cosmic background, SiteHeader AND SiteFooter all come from the persistent
   * MarketingChrome (root layout). The Stripe-return status banner is
   * route-only (the modal never receives the redirect).
   */
  import { page } from "$app/state";
  import SupportContent from "$lib/shared/support/components/SupportContent.svelte";

  // Stripe returns here on success/cancel.
  const justDonated = $derived(page.url.searchParams.get("donated") === "1");
  const checkoutCanceled = $derived(page.url.searchParams.get("canceled") === "1");
</script>

<svelte:head>
  <title>Support · The Kinetic Alphabet</title>
  <meta
    name="description"
    content="Flow Arts Composer is a continuously growing project with 4 years of development behind it. Donations help make this work possible."
  />
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="support-wrap">
  <main class="support">
    <SupportContent donated={justDonated} canceled={checkoutCanceled} />
  </main>
</div>

<style>
  .support-wrap {
    /* The card centres inside ONE dynamic viewport so a phone/tablet shows it
       with no scroll; the shared SiteFooter (MarketingChrome) follows below
       the fold like every other public page. dvh (not vh) tracks the mobile
       browser chrome so the bottom never hides behind the URL bar; the plain
       vh line is the fallback for engines without dvh. */
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .support {
    flex: 0 1 auto; /* size to the card; the wrap centres it as a group */
    min-height: 0; /* let the card shrink to fit instead of forcing page scroll */
    box-sizing: border-box;
    /* top clears the 64px fixed SiteHeader; bottom pad is breathing space below
       the card (the gap to the footer). */
    padding: clamp(70px, 8vh, 84px) 22px clamp(28px, 5vh, 52px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Tablet / landscape that's SHORTER than a desktop window (iPad landscape,
     short laptops). Trim the page padding so the full card fits the shorter
     height and the centred group stays balanced (no scroll, no void). */
  @media (min-width: 521px) and (max-height: 895px) {
    .support {
      padding: 70px 22px clamp(16px, 2.5vh, 30px);
    }
  }

  /* Small / old phones (iPhone SE, compact Androids ≤ ~690px tall): trim the
     chrome so the whole card still clears the fold. */
  @media (max-height: 690px) {
    .support {
      padding: 66px 22px clamp(20px, 3.5vh, 40px);
    }
  }

  /* SHORT + WIDE (≤540px tall, ≥640px wide): Z Fold folded LANDSCAPE and phones
     held sideways. SupportContent switches its card to a 2-column letter/controls
     grid here; the page just tightens its padding to match. */
  @media (max-height: 540px) and (min-width: 640px) {
    .support {
      padding: 70px 26px 14px; /* 70 clears the fixed header; tight bottom */
    }
  }

  /* 4K / ultrawide: the 480px donate card reads miniature on a 4K monitor.
     SupportContent is shared with the in-app modal, so scale it here at the
     route level (zoom is standardized and participates in layout, unlike
     transform) instead of forking the shared card's internals. */
  /* The old `zoom: 1.3` 4K hack scaled the entire subtree from viewport width.
     The shared card now keeps its normal logical size while the route shell
     supplies the surrounding composition. */

</style>
