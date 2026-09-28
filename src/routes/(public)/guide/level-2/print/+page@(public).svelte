<!--
  Printable Level 2 guide - mirrors level-1/print. Resets out of the level-2
  sidebar layout (`@(public)`) and stacks every page as a real 8.5×11 sheet.
  guide-print-mode + guide-print.css come from the shared level-1 styles so the
  two booklets print identically.
-->
<script lang="ts">
  import { t as translate } from "$lib/shared/i18n/i18n.svelte.js";
  import "../../level-1/_styles/guide.css";
  import "../../level-1/_styles/guide-print.css";
  import { setGuidePrintMode } from "../../level-1/_data/guide-data-context";
  import GuidePage from "../../level-1/_components/GuidePage.svelte";
  import type { GuidePageMeta } from "../../level-1/_data/guide-manifest";
  import Level2Document from "../_components/Level2Document.svelte";
  import { BUILT2 } from "../_data/built-pages";

  setGuidePrintMode();
</script>

<svelte:head>
  <title>{translate("guide_l2_print_document_title")}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#snippet printPage({ title, pageNumber, fullBleed, label, content }: GuidePageMeta)}
  <GuidePage {title} {pageNumber} {fullBleed} {label}>{@render content()}</GuidePage>
{/snippet}

<div class="guide-content guide-print-mode print-doc">
  <Level2Document built={BUILT2} page={printPage} />
</div>
