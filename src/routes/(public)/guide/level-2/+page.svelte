<script lang="ts">
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
</script>

<GuideSeo
  kind="Course"
  title={tDynamic("guide_level2_seo_title")}
  description={tDynamic("guide_level2_seo_description")}
  path="/guide/level-2"
  breadcrumbs={[
    { name: "Home", path: "/" },
    { name: "Guide", path: "/guide" },
    { name: "Level 2", path: "/guide/level-2" },
  ]}
/>

<div class="landing">
  <h1>The Kinetic Alphabet</h1>
  <p class="subtitle">{tDynamic("guide_level2_subtitle")}</p>
  <p class="byline">{tDynamic("guide_level2_byline")}</p>

  <section class="intro">
    <p>{tDynamic("guide_level2_intro")}</p>
  </section>

  <nav class="toc" aria-label={tDynamic("guide_level2_toc")}>
    <h2>{tDynamic("guide_level2_chapters")}</h2>
    <ol>
      <li>
        <a href="/guide/level-2/turns">
          <strong>{tDynamic("guide_level2_chapter1_title")}</strong>
          <span>{tDynamic("guide_level2_chapter1_description")}</span>
        </a>
      </li>
      <li>
        <a href="/guide/level-2/double-turns">
          <strong>{tDynamic("guide_level2_chapter2_title")}</strong>
          <span>{tDynamic("guide_level2_chapter2_description")}</span>
        </a>
      </li>
    </ol>
  </nav>

  <section class="download">
    <h2>{tDynamic("guide_level2_pdf_version")}</h2>
    <p>
      <LinkChip href="/guides/level-2.pdf" download
        >{tDynamic("guide_level2_download_pdf")}</LinkChip
      >
    </p>
  </section>
</div>

<style>
  .landing {
    /* rem (not the old 600px) so the landing rides guide.css's >=1680px root
       ramp with the rest of the shell; 42rem also gives the chapter cards a
       little more room at every size. */
    max-width: 42rem;
    margin: 0 auto;
    padding-top: 1.5rem;
    text-align: center;
  }

  /* Title in the guide's calligraphic script - parity with the hub's hero and
     the level-1 topic heroes, instead of the generic Inter h1 the shared
     .guide-content rule applies. */
  .landing h1 {
    font-family: var(--guide-script, "Cormorant Garamond", Georgia, serif);
    font-weight: var(--guide-script-weight, 700);
    font-variation-settings: normal;
    letter-spacing: 0;
    line-height: 0.95;
    font-size: clamp(3rem, 2rem + 2vw, 4.6rem);
    padding: 1.5rem 0 0.5rem;
  }

  /* The level-2 layout renders on the dark guide scroller background
     (.guide-layout is oklch(0.13 0.015 270)), so all colors here must be
     dark-theme values - the old #666/#888/#e5e5e5 set was written for a white
     page and was near-invisible. */
  .subtitle {
    font-size: 1.2rem;
    color: oklch(0.68 0.02 270);
    margin-bottom: 0.5rem;
  }

  .byline {
    font-size: 0.95rem;
    color: oklch(0.58 0.02 270);
    margin-bottom: 2rem;
  }

  .intro, .download {
    text-align: left;
    margin: 2rem 0;
  }

  .toc {
    text-align: left;
    margin: 2rem 0;
  }

  .toc ol {
    list-style: none;
    padding: 0;
  }

  .toc li {
    margin-bottom: 1rem;
  }

  .toc a {
    display: block;
    padding: 1rem;
    background: oklch(0.18 0.02 270 / 0.6);
    border: 1px solid oklch(0.45 0.04 270 / 0.35);
    border-radius: 8px;
    text-decoration: none;
    color: inherit;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .toc a:hover {
    border-color: #4ea7e8;
    box-shadow: 0 2px 8px rgba(78, 167, 232, 0.25);
  }

  .toc span {
    display: block;
    font-size: 0.9rem;
    color: oklch(0.68 0.02 270);
    margin-top: 0.25rem;
  }
</style>
