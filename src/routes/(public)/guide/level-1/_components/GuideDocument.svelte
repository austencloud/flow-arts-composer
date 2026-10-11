<script lang="ts">
  /**
   * The Level 1 guide as ONE ordered page sequence - the single source of truth
   * for what pages exist and in what order. Both the print route (stacked pages)
   * and the book route (StPageFlip scaled pages) render this, so the two can
   * never drift in contents or order.
   *
   * The caller supplies a `page` snippet that wraps each page's content however
   * it needs (a stacked GuidePage for print, a scaled flip page for the book).
   * GuideDocument owns the content + the front-matter styling; the wrapper owns
   * the page frame (header, number, sheet).
   */
  import type { Snippet, Component } from "svelte";
  import GuideCover from "./GuideCover.svelte";
  import GuideTOC from "./GuideTOC.svelte";
  import PagePlaceholder from "./PagePlaceholder.svelte";
  import ProofTextPage from "../_pages/ProofTextPage.svelte";
  import { GUIDE_BODY_PAGES, type GuidePageMeta } from "../_data/guide-manifest";
  import { PROOF_TEXT } from "../_data/proof-text";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { guideEdit, ptDrag, pt, editText, registerEditSource } from "../_data/guide-edit.svelte";
  import FlowFrame from "./FlowFrame.svelte";
  import { GUIDE_CONTENT, hasReflowContent } from "../_data/guide-content";

  let {
    page,
    coverTheme = "navy",
    built = {},
    frame = "sheet",
  }: {
    page: Snippet<[GuidePageMeta]>;
    coverTheme?: "navy" | "light";
    /** Built per-page components keyed by manifest id; rest render a placeholder. */
    built?: Record<string, Component>;
    /** Which frame the body pages render in. Flow only affects slugs in GUIDE_CONTENT. */
    frame?: "sheet" | "flow";
  } = $props();

  // ONE QR → the support page Austen owns (handles/methods can change without a
  // reprint). Kept identical to the original print front matter.
  const SUPPORT_QR = "/guide/level-1/images/_shared/qr-support.png";
  const SUPPORT_URL = "tkaflowarts.com/support";

  // ── Edit-mode offsets (pt) - every front-matter block drags/deletes ────────
  const S = 816 / 612;
  type Off = { x: number; y: number };
  const zero = (): Off => ({ x: 0, y: 0 });
  let FM = $state({
    ripple: zero(),
    drink: zero(),
    supportText: zero(),
    supportQr: zero(),
    readme: [zero(), zero(), zero(), zero(), zero(), zero(), zero()],
    toc: zero(),
  });
  const tf = (o: Off) => `transform: translate(${o.x * S}px, ${o.y * S}px)`;
  const off = (i: number): Off => FM.readme[i] ?? { x: 0, y: 0 };

  // Editable front-matter TEXT (separate from FM positions). html strings so the
  // support legend + sign-off keep their spans; edited via the editText action.
  let TX = $state({
    drink: "drink water",
    support:
      "<span class=\"ln\">If this guide helps you, you can support its development.</span>" +
      "<span class=\"ln\">Any amount is genuinely appreciated.</span>",
    readme: [
      t("guide_welcome_greeting"),
      t("guide_welcome_what"),
      "The Kinetic Alphabet is a fusion of elements from VTG (Vulcan Tech Gospel), siteswap (Juggling Notation), and musical notation. Although it can be introduced to beginners, it's designed for intermediate learners, bridging the gap between improvisation and choreography. Originally built for double staves, it can be applied to any dual wielded static prop like clubs, fans, triads, buugeng, and more.",
      t("guide_welcome_pictographs"),
      "This is a work-in-progress and is continually growing. Whether you fully embrace this system, draw inspiration from certain parts, or follow a different path altogether, I hope the ideas presented here contribute to your creative growth.",
      "I can't wait to see the unique choreography you'll create!",
      "With love,<br /><span class=\"rm-sig\">Austen Cloud</span>",
    ],
  });

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Front matter", () => {
      const flat: [string, Off][] = [
        ["ripple", FM.ripple],
        ["drink", FM.drink],
        ["supportText", FM.supportText],
        ["supportQr", FM.supportQr],
        ...FM.readme.map((o, i) => [`readme[${i}]`, o] as [string, Off]),
        ["toc", FM.toc],
      ];
      return flat.map(([k, o]) => `  ${k}: dx: ${r1(o.x)}, dy: ${r1(o.y)}`).join("\n");
    })
  );
</script>

<!-- Load the guide typefaces via a real <link> (robust) rather than relying on
     the @import in guide.css, which Vite can drop when bundling per route - that
     was making Tangerine fall back to Segoe Script on /print but not /book. -->
<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700&family=Tangerine:wght@400;700&display=swap"
  />
</svelte:head>

{#snippet coverContent()}
  <div class="cover-fill"><GuideCover theme={coverTheme} /></div>
{/snippet}

{#snippet drinkContent()}
  <div class="frontmatter">
    <div
      class="ripple drag"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === "fm-ripple"}
      style={tf(FM.ripple)}
      aria-hidden="true"
      use:ptDrag={pt("fm-ripple", "Ripple rings", FM.ripple)}
    >
      <span></span><span></span><span></span>
    </div>
    <p
      class="drink drag"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === "fm-drink"}
      style={tf(FM.drink)}
      use:ptDrag={pt("fm-drink", "drink water", FM.drink)}
      use:editText={{ id: "fm-drink", label: "drink water", get: () => TX.drink, set: (v) => (TX.drink = v), plain: true }}
    >{TX.drink}</p>
  </div>
{/snippet}

{#snippet supportContent()}
  <div class="frontmatter support">
    <p
      class="drag"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === "fm-support-text"}
      style={tf(FM.supportText)}
      use:ptDrag={pt("fm-support-text", "Support text", FM.supportText)}
      use:editText={{ id: "fm-support-text", label: "Support text", get: () => TX.support, set: (h) => (TX.support = h) }}
    >{@html TX.support}</p>
    <figure
      class="donate drag"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === "fm-support-qr"}
      style={tf(FM.supportQr)}
      use:ptDrag={pt("fm-support-qr", "Support QR", FM.supportQr)}
    >
      <img class="support-qr" src={SUPPORT_QR} alt="Scan to support: {SUPPORT_URL}" />
      <figcaption class="support-url">{SUPPORT_URL}</figcaption>
    </figure>
  </div>
{/snippet}

{#snippet readmeContent()}
  {#snippet rmP(i: number, cls: string)}
    <p
      class="{cls} drag"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `fm-readme-${i}`}
      style={tf(off(i))}
      use:ptDrag={pt(`fm-readme-${i}`, `Read Me ¶${i + 1}`, off(i))}
      use:editText={{ id: `fm-readme-${i}`, label: `Read Me ¶${i + 1}`, get: () => TX.readme[i] ?? "", set: (h) => (TX.readme[i] = h) }}
    >{@html TX.readme[i] ?? ""}</p>
  {/snippet}
  <div class="read-me">
    {@render rmP(0, "rm-greeting")}
    {@render rmP(1, "rm-lead")}
    {@render rmP(2, "")}
    {@render rmP(3, "")}
    {@render rmP(4, "")}
    {@render rmP(5, "")}
    {@render rmP(6, "sign-off")}
  </div>
{/snippet}

{#snippet tocContent()}
  <div
    class="toc-wrap drag"
    class:edit={guideEdit.on}
    class:selected={guideEdit.selectedId === "fm-toc"}
    style={tf(FM.toc)}
    use:ptDrag={pt("fm-toc", "Table of Contents", FM.toc)}
  >
    <GuideTOC />
  </div>
{/snippet}

<!-- Front matter (unnumbered), then the numbered body pages. ORDER IS CANONICAL. -->
{@render page({ kind: "cover", fullBleed: true, label: "p1: Cover", content: coverContent })}
{@render page({ kind: "drink", label: "p2: drink water", content: drinkContent })}
{@render page({ kind: "support", title: "Support the work", label: "p3: Support", content: supportContent })}
{@render page({ kind: "readme", title: "Read Me First", label: "p4: Read Me First", content: readmeContent })}
{@render page({ kind: "toc", title: "Table of Contents", label: "p5: Table of Contents", content: tocContent })}
{#each GUIDE_BODY_PAGES as entry, i}
  {@const isBuilt = !!built[entry.id]}
  {@const hasProof = !isBuilt && !!PROOF_TEXT[entry.id]}
  {#snippet bodyContent()}
    {@const Built = built[entry.id]}
    {@const reflow = GUIDE_CONTENT[entry.id]}
    {#if frame === "flow" && reflow}<FlowFrame content={reflow} />
    {:else if Built}<Built />
    {:else if PROOF_TEXT[entry.id]}<ProofTextPage id={entry.id} />
    {:else}<PagePlaceholder />{/if}
  {/snippet}
  <!-- A built page paints its own bespoke layout edge-to-edge; a proof-text page
       paints the original proof's text edge-to-edge. Both are fullBleed. The
       title normally comes from the manifest (entry.title) and is rendered by
       GuidePage, so a page's heading and its TOC row can never drift. A
       `selfTitled` page paints its own header(s) instead (multi-section pages),
       so GuidePage's single title is suppressed - the TOC still uses entry.title.
       Pages with neither built nor proof keep the standard placeholder. -->
  {@render page({
    kind: "body",
    title: entry.selfTitled ? undefined : entry.title,
    fullBleed: isBuilt || hasProof,
    pageNumber: i + 1,
    label: `body p${i + 1}: ${entry.title}`,
    content: bodyContent,
    reflowable: hasReflowContent(entry.id),
  })}
{/each}

<style>
  /* Cover - full-bleed GuideCover. aspect-ratio gives the box a concrete height
     (width × 11/8.5) so the cover's height:100% layout fills the page. */
  .cover-fill {
    width: 100%;
    aspect-ratio: 8.5 / 11;
  }

  /* Front-matter pages (white interior, ink-cheap). flex:1 + min-height:0 makes
     it fill the page body BELOW the header (not a fixed 9.4in that overflows the
     header and shoves content low), so content centres in the true remaining
     space - header pinned top, QR/text dead-centre under it. */
  .frontmatter {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 2.2rem;
  }
  .drink {
    font-family: "Fraunces", Georgia, serif;
    font-style: italic;
    font-variation-settings: "opsz" 144, "wght" 600, "WONK" 1;
    font-size: 2.8rem;
    color: #1a1a1a;
    margin: 0;
  }
  .ripple {
    position: relative;
    width: 120px;
    height: 120px;
  }
  .ripple span {
    position: absolute;
    inset: 0;
    margin: auto;
    border: 1px solid #b9b3cf;
    border-radius: 50%;
  }
  .ripple span:nth-child(1) { width: 40px; height: 40px; }
  .ripple span:nth-child(2) { width: 80px; height: 80px; opacity: 0.6; }
  .ripple span:nth-child(3) { width: 120px; height: 120px; opacity: 0.35; }

  .support p {
    max-width: 5.2in;
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 1.3rem;
    line-height: 1.6;
    color: #2a2a2a;
    margin: 0;
  }
  /* One QR → the support page Austen owns. No box, no per-method clutter. */
  .donate {
    margin: 1.1rem 0 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.7rem;
  }
  .support-qr {
    width: 1.9in;
    height: 1.9in;
  }
  .support-url {
    font-family: "Cormorant Garamond", Georgia, serif;
    font-style: italic;
    font-size: 1.3rem;
    letter-spacing: 0.01em;
    color: #2a2a2a;
  }
  /* Support page: centred sentence-per-line. :global - the .ln spans now live in
     an {@html} string, which Svelte's scoped CSS does not reach. */
  .support :global(.ln) {
    display: block;
  }

  /* ── Read Me First (authored letter, not a textbook block) ─────────────
     A framed column: margin:auto centres it in the page body so there's even
     breathing room top, bottom, and both sides - intentionally placed. */
  .read-me {
    max-width: 5.4in;
    margin: auto;
    padding: 0.2in 0.25in;
  }
  .read-me p {
    font-family: "Cormorant Garamond", Georgia, serif;
    font-size: 1.06rem;
    line-height: 1.56;
    color: #20202a;
    margin: 0 0 0.7rem;
    text-align: justify;
    hyphens: auto;
  }
  .rm-greeting {
    text-align: left !important;
    font-style: italic;
    margin-bottom: 0.9rem !important;
  }
  /* Fraunces drop cap on the opening paragraph. */
  .rm-lead::first-letter {
    font-family: "Fraunces", Georgia, serif;
    font-style: italic;
    font-variation-settings: "opsz" 144, "wght" 620, "WONK" 1;
    font-size: 3.6em;
    line-height: 0.74;
    float: left;
    margin: 0.04em 0.1em 0 0;
    color: #2342c9;
  }
  .sign-off {
    text-align: right;
    margin-top: 0.3in !important;
    line-height: 1.4;
  }
  /* :global - the sign-off .rm-sig span lives in an {@html} string (unscoped). */
  .read-me :global(.rm-sig) {
    font-family: "Fraunces", Georgia, serif;
    font-style: italic;
    font-variation-settings: "opsz" 144, "wght" 580, "WONK" 1;
    font-size: 1.7rem;
    color: #14142b;
  }

  /* Edit-mode affordances (drag/select any front-matter block). */
  .drag.edit {
    outline: 1px dashed rgba(55, 48, 163, 0.4);
    cursor: move;
  }
  .drag.selected {
    outline: 1.5px solid #3730a3;
    outline-offset: 1px;
  }
</style>
