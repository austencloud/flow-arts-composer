<script lang="ts">
  import Seo from "$lib/shared/components/Seo.svelte";
  import "$lib/shared/landing/styles/public-editorial.css";
  import SoftwareSubmitForm from "$lib/shared/landing/components/SoftwareSubmitForm.svelte";
  import HistoryEra from "./_components/HistoryEra.svelte";
  import SoftwareGallery from "./_components/SoftwareGallery.svelte";

  const links = {
    vtgPlay:
      "https://play.google.com/store/apps/details?id=net.firestaff.mcp.VTGv3",
    vtgIos:
      "https://apps.apple.com/us/app/vtg-full-flow-arts-resource/id1468743063",
    poiLab:
      "https://play.google.com/store/apps/details?id=net.firestaff.mcp.poilab.full",
    doubleStaffLab:
      "https://play.google.com/store/apps/details?id=net.firestaff.mcp.doublestafflab.full",
    hoopLab:
      "https://play.google.com/store/apps/details?id=net.firestaff.mcp.hooplab.full",
    tuttingLab:
      "https://play.google.com/store/apps/details?id=net.firestaff.mcp.armcontrollab",
    spinScience: "https://sirlorq.wordpress.com/",
    sirLorq: "https://sirlorq.wordpress.com/tech-tiles/",
    visualSpinner: "https://infiniteperplexity.github.io/visual-spinner-3d/",
    visualSpinnerDemo:
      "https://infiniteperplexity.github.io/visual-spinner-3d/demo.html",
    visualSpinnerGithub:
      "https://github.com/infiniteperplexity/visual-spinner-3d",
    spiroAnim: "https://spiroanim.com/app",
    spiroAnimGithub: "https://github.com/rbgirard/spiroanim",
    arFlowArtsPlay:
      "https://play.google.com/store/apps/details?id=com.arflowartsreact",
    arFlowArtsIos: "https://apps.apple.com/us/app/arflowarts/id1517940593",
    fam: "https://www.flowartsmeetup.com/",
    poiNotation: "https://github.com/tiffanyfong/PoiNotation",
  };

  const vtgImages = [
    {
      src: "/roots/software/vtg-1.webp",
      alt: "Screenshot of the VTG app rendering a two-petal in-spin pattern",
      caption: "VTG app, Google Play listing",
      width: 800,
      height: 1256,
      shape: "phone" as const,
    },
    {
      src: "/roots/software/vtg-2.webp",
      alt: "Screenshot of the VTG app's timing and direction reference screen",
      caption: "Timing and direction reference",
      width: 800,
      height: 1413,
      shape: "phone" as const,
    },
  ];

  const paperImages = [
    {
      src: "/roots/software/spin-science.webp",
      alt: "Screenshot of the Spin Science website by Lorq Nichols",
      caption: "spinscience.xyz",
      width: 1734,
      height: 917,
      shape: "wide" as const,
    },
  ];

  const labImages = [
    {
      src: "/roots/software/poi-lab.webp",
      alt: "Screenshot of the Poi LAB Android app, from its Google Play listing",
      caption: "Poi LAB",
      width: 800,
      height: 1555,
      shape: "phone" as const,
    },
    {
      src: "/roots/software/double-staff-lab.webp",
      alt: "Screenshot of the Double Staff LAB Android app's pattern picker",
      caption: "Double Staff LAB",
      width: 800,
      height: 1499,
      shape: "phone" as const,
    },
    {
      src: "/roots/software/hoop-twinz-lab.webp",
      alt: "Screenshot of the Hoop Twinz LAB Android app, from its Google Play listing",
      caption: "Hoop Twinz LAB",
      width: 800,
      height: 1555,
      shape: "phone" as const,
    },
    {
      src: "/roots/software/tutting-lab.webp",
      alt: "Screenshot of the Arm Control Tutting Lab Android app, from its Google Play listing",
      caption: "Arm Control (Tutting) Lab",
      width: 800,
      height: 1594,
      shape: "phone" as const,
    },
  ];

  const visualSpinnerImages = [
    {
      src: "/roots/software/visualspinner3d-demo.webp",
      alt: "VisualSpinner3D demo with four control columns beside four colored props in the 3D renderer",
      caption:
        "The live demo's four independent prop lanes and shared renderer",
      width: 920,
      height: 600,
      shape: "wide" as const,
    },
  ];

  const spiroAnimImages = [
    {
      src: "/roots/software/spiroanim.webp",
      alt: "SpiroAnim showing animated cyan and green poi paths beside its Vulcan Tech Gospel concept matrix",
      caption: "SpiroAnim player and Vulcan Tech Gospel concept matrix",
      width: 1920,
      height: 1080,
      shape: "wide" as const,
    },
  ];

  const currentImages = [
    {
      src: "/roots/software/ar-flow-arts.webp",
      alt: "Screenshot of the AR Flow Arts app, from its Google Play listing",
      caption: "AR Flow Arts",
      width: 500,
      height: 1024,
      shape: "phone" as const,
    },
    {
      src: "/roots/software/flow-arts-meet-up.webp",
      alt: "Screenshot of the Flow Arts Meet Up website by Ty Roachford",
      caption: "flowartsmeetup.com",
      width: 1734,
      height: 917,
      shape: "wide" as const,
    },
  ];

  const composerImages = [
    {
      src: "/roots/software/flow-arts-composer.webp",
      alt: "Flow Arts Composer in Construct mode, showing alpha, beta, and gamma move presets on the eight-point grid",
      caption: "Flow Arts Composer, Construct mode",
      width: 1440,
      height: 900,
      shape: "wide" as const,
    },
  ];

  const eraLinks = [
    {
      href: "#printed-foundations",
      number: "01",
      title: "Printed foundations",
      detail: "Pattern maps before software",
    },
    {
      href: "#vtg-reference",
      number: "02",
      title: "Pocket references",
      detail: "VTG carried the vocabulary",
    },
    {
      href: "#lab-simulators",
      number: "03",
      title: "Dedicated simulators",
      detail: "The LAB family",
    },
    {
      href: "#browser-tools",
      number: "04",
      title: "Browser tools",
      detail: "Simulation becomes editable",
    },
    {
      href: "#current-ecosystem",
      number: "05",
      title: "Current ecosystem",
      detail: "Effects and gatherings",
    },
    {
      href: "#tka-chapter",
      number: "06",
      title: "Notation system",
      detail: "TKA supplies the grammar",
    },
    {
      href: "#flow-arts-composer",
      number: "07",
      title: "Current chapter",
      detail: "Composer becomes the studio",
    },
  ];

  const TITLE = "The History of Flow Arts Software | Flow Arts Composer";
  const DESCRIPTION =
    "Flow artists have been building software for over a decade: reference apps, spinning simulators, AR effects, and community platforms. Who built the tools, what they do, and where they are now.";
  const URL = "https://tkaflowarts.com/roots/software";
  const ARTICLE_ID = `${URL}#article`;
  const PERSON_ID = "https://tkaflowarts.com/about#austen-cloud";
  const ORGANIZATION_ID = "https://tkaflowarts.com/#organization";
  const WEBSITE_ID = "https://tkaflowarts.com/#website";

  const pageJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": ARTICLE_ID,
        headline: "The History of Flow Arts Software",
        url: URL,
        mainEntityOfPage: URL,
        description: DESCRIPTION,
        inLanguage: "en-US",
        datePublished: "2026-07-16",
        dateModified: "2026-09-01",
        image: "https://tkaflowarts.com/branding/og-image.png",
        author: { "@id": PERSON_ID },
        publisher: { "@id": ORGANIZATION_ID },
        isPartOf: { "@id": WEBSITE_ID },
        about: { "@id": `${URL}#flow-arts-composer` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${URL}#flow-arts-composer`,
        name: "Flow Arts Composer",
        url: "https://tkaflowarts.com/composer",
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web",
        description:
          "Browser software for writing, generating, animating, saving, and sharing flow arts choreography with The Kinetic Alphabet.",
        creator: { "@id": PERSON_ID },
        isPartOf: { "@id": WEBSITE_ID },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${URL}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://tkaflowarts.com/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Flow Arts History",
            item: "https://tkaflowarts.com/history",
          },
          {
            "@type": "ListItem",
            position: 3,
            name: "Software History",
            item: URL,
          },
        ],
      },
    ],
  }).replace(/</g, "\\u003c");
</script>

<Seo
  title={TITLE}
  description={DESCRIPTION}
  canonical={URL}
  ogType="article"
  ogImageAlt="The Kinetic Alphabet pictographs"
>
  {@html `<script type="application/ld+json">${pageJsonLd}</script>`}
</Seo>

<main class="editorial software-history">
  <article id="article">
    <header class="history-hero">
      <div class="hero-copy">
        <p class="hero-kicker">
          A living archive of tools made by flow artists
        </p>
        <h1>The History of Flow Arts Software</h1>
        <p class="hero-subtitle">
          Reference systems became pocket apps, simulators, editable browser
          workspaces, effects tools, and community infrastructure.
        </p>
      </div>

      <div class="hero-context">
        <p>
          Most of this software was built by practitioners who needed a tool and
          knew how to make one. This page follows that lineage and keeps working
          links to the projects that remain available.
        </p>
        <p class="article-meta">
          By <a href="/about#austen-cloud">Austen Cloud</a>
          <span aria-hidden="true">·</span>
          Published July 16, 2026
          <span aria-hidden="true">·</span>
          Updated September 1, 2026
        </p>
        <dl class="hero-facts">
          <div>
            <dt>8</dt>
            <dd>chapters</dd>
          </div>
          <div>
            <dt>12</dt>
            <dd>documentary screenshots</dd>
          </div>
          <div>
            <dt>Living</dt>
            <dd>links checked September 2026</dd>
          </div>
        </dl>
      </div>
    </header>

    <nav class="era-index" aria-label="Software history chapters">
      <div class="index-heading">
        <p class="index-kicker">Follow the lineage</p>
        <p class="index-note">Jump to an era, or read straight through.</p>
      </div>
      <div class="index-list themed-scrollbar">
        {#each eraLinks as era (era.href)}
          <a href={era.href}>
            <span class="index-number">{era.number}</span>
            <span class="index-copy"
              ><strong>{era.title}</strong><small>{era.detail}</small></span
            >
          </a>
        {/each}
      </div>
    </nav>

    <div class="timeline">
      <HistoryEra
        id="printed-foundations"
        number="01"
        period="Printed foundations"
        title="Pattern systems before the screen"
      >
        {#snippet children()}
          <div class="prose">
            <p>
              Not every tool was software. <strong>Lorq Nichols</strong> spent years
              mapping poi movement into printed systems through Spin Science: the
              Shape Matrix, 324 Patterns, the 144 Atomic Hybrids, the 9 Flower Families,
              and the Book of P.H.A.T., built with contributions from Brian Thompson,
              David “Tankboy” Cantor, and Noel Yee.
            </p>
            <p>
              Charts and posters do the same job a simulator does: they show the
              pattern space so an artist can map it. That visual grammar carries
              into the software that follows.
            </p>
            <div class="resource-row">
              <a
                href={links.spinScience}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>Spin Science</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
              <a
                href={links.sirLorq}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>Book of P.H.A.T. at Sir Lorq</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
            </div>
          </div>
        {/snippet}
        {#snippet media()}<SoftwareGallery
            label="Spin Science screenshot"
            images={paperImages}
            variant="wide"
          />{/snippet}
      </HistoryEra>

      <HistoryEra
        id="vtg-reference"
        number="02"
        period="Pocket reference"
        title="VTG carries a shared vocabulary"
      >
        {#snippet children()}
          <div class="prose">
            <p>
              Vulcan Tech Gospel gave flow artists a shared vocabulary for
              timing, direction, and motion type. The <strong>VTG app</strong> turned
              that framework into a pocket reference with animations, quizzes, and
              pattern layouts for staff, poi, clubs, hoops, fans, buugeng, and triads.
            </p>
            <p>
              The app has gone through multiple versions with different
              developers. The current release comes from Michael Caden Pike and
              Noel Yee, and remains available on both stores.
            </p>
            <div class="resource-row">
              <a
                href={links.vtgPlay}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>VTG on Google Play</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
              <a
                href={links.vtgIos}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>VTG on the App Store</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
            </div>
            <p class="context-link">
              For what VTG contributed to The Kinetic Alphabet itself, read the <a
                href="/history#archive-record-vtg"
                >VTG record in the history archive</a
              >.
            </p>
          </div>
        {/snippet}
        {#snippet media()}<SoftwareGallery
            label="VTG app screenshots"
            images={vtgImages}
            variant="phone"
          />{/snippet}
      </HistoryEra>

      <HistoryEra
        id="lab-simulators"
        number="03"
        period="Dedicated simulators · updated through 2024"
        title="The LAB family turns patterns into instruments"
      >
        {#snippet children()}
          <div class="prose">
            <p>
              Michael Caden Pike kept going. Over the years he shipped
              <strong>Poi LAB</strong>, <strong>Double Staff LAB</strong>,
              <strong>Hoop Twinz LAB</strong>, and the
              <strong>Arm Control (Tutting) Lab</strong>.
            </p>
            <p>
              Each one lets an artist program a move, watch it animate as 2D
              trails, slow it down, and share the pattern. Double Staff LAB
              alone ships more than a hundred patterns labeled in VTG terms or
              old-school names. All four remain downloadable.
            </p>
            <div class="resource-row">
              <a
                href={links.poiLab}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>Poi LAB</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
              <a
                href={links.doubleStaffLab}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>Double Staff LAB</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
              <a
                href={links.hoopLab}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>Hoop Twinz LAB</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
              <a
                href={links.tuttingLab}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>Tutting Lab</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
            </div>
          </div>
        {/snippet}
        {#snippet media()}<SoftwareGallery
            label="LAB simulator screenshots"
            images={labImages}
            variant="phone"
          />{/snippet}
      </HistoryEra>

      <HistoryEra
        id="browser-tools"
        number="04A"
        period="Browser simulator · published 2014 · last updated 2023"
        title="VisualSpinner3D puts prop simulation in the browser"
      >
        {#snippet children()}
          <div class="prose">
            <p>
              Glenn Wright's <strong>VisualSpinner3D</strong> put a general-purpose
              prop simulator in the browser. Its main demo exposes four independent
              prop lanes. For each one, an artist can choose the prop, motion plane,
              entry angle, orientation, spin direction, and move; the 3D view animates
              them together.
            </p>
            <p>
              The engine underneath is more open-ended than the demo. It builds
              each prop as an articulated chain, fits moves together, and can
              draw flowers, isolations, pendulums, C-CAPs, snakes, toroids,
              bend, twist, and arbitrary motion planes.
            </p>
            <p>
              The project's Git history begins in April 2014, with its latest
              commit in April 2023. The live demo remains online. Its model is
              kinematic: it draws authored paths rather than simulating forces,
              collisions, or the limits of a human body.
            </p>
            <div class="resource-row">
              <a
                href={links.visualSpinnerDemo}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>Open the four-prop demo</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
              <a
                href={links.visualSpinner}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>Project page</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
              <a
                href={links.visualSpinnerGithub}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>Source on GitHub</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
            </div>
          </div>
        {/snippet}
        {#snippet media()}<SoftwareGallery
            label="VisualSpinner3D demo screenshot"
            images={visualSpinnerImages}
            variant="wide"
          />{/snippet}
      </HistoryEra>

      <HistoryEra
        id="spiroanim"
        number="04B"
        period="Editable web workspace · public since 2026"
        title="SpiroAnim makes the model editable"
      >
        {#snippet children()}
          <div class="prose">
            <p>
              <strong>SpiroAnim</strong> is Mentive's browser workspace for advanced
              poi and staff concepts. Its animated player sits beside live generators
              for Vulcan Tech Gospel, Quarter Spacing, and Eight Step. Change a cell,
              speed ratio, grid, pattern option, or playback setting, and the movement
              redraws immediately.
            </p>
            <p>
              The project became public in 2026 after several years of
              development. It is open source, installable as a progressive web
              app, and designed to reopen offline after its first successful
              visit. A timeline and editor also handle patterns built outside
              the concept catalogs.
            </p>
            <div class="resource-row">
              <a
                href={links.spiroAnim}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>Open SpiroAnim</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
              <a
                href={links.spiroAnimGithub}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>Source on GitHub</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
            </div>
          </div>
        {/snippet}
        {#snippet media()}<SoftwareGallery
            label="SpiroAnim screenshot"
            images={spiroAnimImages}
            variant="wide"
          />{/snippet}
      </HistoryEra>

      <HistoryEra
        id="current-ecosystem"
        number="05"
        period="Current ecosystem"
        title="Effects and gatherings widen the job"
      >
        {#snippet children()}
          <div class="prose">
            <p>
              The current generation splits by purpose.
              <strong>AR Flow Arts</strong> by Ian Borukhovich overlays glowing trails
              and particle effects onto flow footage shot with a phone.
            </p>
            <p>
              <strong>Flow Arts Meet Up</strong> by Ty Roachford found real traction
              in the community: an app for finding jams, festivals, and other spinners
              nearby, with event listings and a vendor marketplace along the way.
            </p>
            <div class="resource-row">
              <a
                href={links.arFlowArtsPlay}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>AR Flow Arts for Android</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
              <a
                href={links.arFlowArtsIos}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>AR Flow Arts for iOS</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
              <a
                href={links.fam}
                target="_blank"
                rel="noopener noreferrer"
                class="resource-chip"
                ><span>Flow Arts Meet Up</span><i
                  class="fas fa-external-link-alt ext"
                  aria-hidden="true"
                ></i></a
              >
            </div>
          </div>
        {/snippet}
        {#snippet media()}<SoftwareGallery
            label="Current flow arts software screenshots"
            images={currentImages}
            variant="mixed"
          />{/snippet}
      </HistoryEra>

      <HistoryEra
        id="tka-chapter"
        number="06"
        period="The notation system"
        title="Where The Kinetic Alphabet fits"
      >
        {#snippet children()}
          <div class="prose">
            <p>
              These projects approach movement as references, catalogs,
              simulators, effects, or community infrastructure. In 2016, Tiffany
              Fong built PoiNotation, a Scala domain-specific language for
              writing poi moves as text. The source remains on
              <a
                href={links.poiNotation}
                target="_blank"
                rel="noopener noreferrer">GitHub</a
              >.
            </p>
            <p>
              TKA takes a different route: a pictograph for each beat and a
              pronounceable label for the sequence. That grammar now has a
              working studio of its own.
            </p>
          </div>
        {/snippet}
      </HistoryEra>

      <HistoryEra
        id="flow-arts-composer"
        number="07"
        period="Browser choreography platform · active development"
        title="Flow Arts Composer turns notation into a working studio"
      >
        {#snippet children()}
          <div class="prose">
            <p>
              <strong>Flow Arts Composer</strong> is Austen Cloud's browser-based
              workspace for The Kinetic Alphabet. An artist can construct a move,
              generate a longer sequence, and watch the same choreography as pictographs
              or animated props without translating it into another format.
            </p>
            <p>
              The work continues past the editor. Sequences can be saved to a
              personal library, published for other artists, and shared by link
              or QR code. Composer also imports SpiroAnim patterns, bringing
              that earlier tool's sequences into the same library.
            </p>
            <div class="resource-row">
              <a href="/composer" class="resource-chip">
                <span>About Flow Arts Composer</span>
              </a>
              <a href="/create" class="resource-chip">
                <span>Open the Composer</span>
              </a>
              <a href="/browse" class="resource-chip">
                <span>Browse public sequences</span>
              </a>
            </div>
          </div>
        {/snippet}
        {#snippet media()}<SoftwareGallery
            label="Flow Arts Composer screenshot"
            images={composerImages}
            variant="wide"
          />{/snippet}
      </HistoryEra>
    </div>

    <section class="contribution" id="submit">
      <div class="contribution-copy">
        <p class="index-kicker">Keep the archive honest</p>
        <h2>Add to this list</h2>
        <div class="prose">
          <p>
            Built flow arts software? Remember a tool this page is missing, or
            spotted a detail that is wrong? Submit it here. Every submission
            gets reviewed, and anything that belongs in the archive gets added
            with credit.
          </p>
          <p>Statuses on this page were last checked in September 2026.</p>
        </div>
      </div>
      <SoftwareSubmitForm source="roots-software" />
    </section>

    <div class="cta-card history-cta">
      <h3>Try the current chapter</h3>
      <p>Flow Arts Composer runs in your browser and costs nothing.</p>
      <a href="/create" class="cta-button"
        ><span>Open Flow Arts Composer</span><i
          class="fas fa-arrow-right"
          aria-hidden="true"
        ></i></a
      >
    </div>
  </article>
</main>

<style>
  .software-history {
    --history-card: color-mix(
      in oklch,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 86%,
      transparent
    );
  }

  .history-hero {
    display: grid;
    gap: clamp(2rem, 4vw, 5rem);
    align-items: center;
    min-height: min(54rem, calc(100svh - 7rem));
    padding-block: clamp(3rem, 6vw, 7rem);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .hero-copy,
  .hero-context {
    min-width: 0;
  }

  .hero-copy {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  .hero-kicker,
  .index-kicker {
    margin: 0;
    color: color-mix(
      in oklch,
      var(--theme-accent, #8b6cff) 76%,
      var(--theme-text, #fff)
    );
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 740;
    letter-spacing: 0.15em;
    line-height: 1.4;
    text-transform: uppercase;
  }

  h1 {
    max-inline-size: 14ch;
    margin: 0;
    color: var(--theme-text, #fff);
    font-family: var(--page-title-font, "Fraunces", Georgia, serif);
    font-size: clamp(3rem, 2rem + 3.1vw, 5.5rem);
    font-style: italic;
    font-variation-settings:
      "opsz" 144,
      "wght" 700,
      "SOFT" 0,
      "WONK" 1;
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 0.98;
  }

  .hero-subtitle {
    max-inline-size: 38rem;
    margin: 0;
    color: var(--theme-text-dim, #a7a8b5);
    font-size: clamp(1.1rem, 1rem + 0.35vw, 1.35rem);
    line-height: 1.6;
  }

  .hero-context {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: clamp(1.4rem, 2.5vw, 2.5rem);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-2026-xl, 24px);
    background: var(--history-card);
  }

  .hero-context > p {
    max-inline-size: 42rem;
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-md, 1rem);
    line-height: 1.72;
  }

  .hero-context .article-meta {
    color: var(--theme-text-dim, #a7a8b5);
    font-size: var(--font-size-sm, 0.875rem);
  }

  .article-meta a {
    color: color-mix(
      in oklch,
      var(--theme-accent, #8b6cff) 76%,
      var(--theme-text, #fff)
    );
  }
  .article-meta span {
    margin-inline: 0.35rem;
  }

  .hero-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1px;
    margin: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-2026-lg, 18px);
    background: var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .hero-facts div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.2rem;
    padding: 1rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .hero-facts dt {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-lg, 1.125rem);
    font-weight: 760;
    font-variant-numeric: tabular-nums;
  }

  .hero-facts dd {
    margin: 0;
    color: var(--theme-text-dim, #a7a8b5);
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.35;
  }

  .era-index {
    display: grid;
    gap: 1.25rem;
    padding-block: clamp(2rem, 4vw, 4rem);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .index-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem 1.5rem;
  }

  .index-note {
    margin: 0;
    color: var(--theme-text-dim, #a7a8b5);
    font-size: var(--font-size-sm, 0.875rem);
  }

  .index-list {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: min(78vw, 17rem);
    gap: var(--spacing-sm, 0.75rem);
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: inline proximity;
    scrollbar-gutter: stable;
    padding: 1px 0 var(--spacing-sm, 0.75rem);
  }

  .index-list a {
    display: flex;
    min-height: 5.5rem;
    align-items: flex-start;
    gap: 0.8rem;
    padding: 1rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-2026-md, 14px);
    background: var(--history-card);
    color: var(--theme-text, #fff);
    scroll-snap-align: start;
    text-decoration: none;
    transition:
      transform var(--transition-normal),
      border-color var(--transition-normal),
      background var(--transition-normal);
  }

  .index-list a:hover {
    transform: translateY(-2px);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.22));
    background: color-mix(
      in oklch,
      var(--theme-accent, #8b6cff) 9%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
  }

  .index-list a:focus-visible {
    outline: 3px solid
      color-mix(in oklch, var(--theme-accent, #8b6cff) 68%, transparent);
    outline-offset: 2px;
  }

  .index-number {
    color: color-mix(
      in oklch,
      var(--theme-accent, #8b6cff) 72%,
      var(--theme-text, #fff)
    );
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 760;
    font-variant-numeric: tabular-nums;
  }

  .index-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.25rem;
  }

  .index-copy strong {
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.3;
  }
  .index-copy small {
    color: var(--theme-text-dim, #a7a8b5);
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.35;
  }

  .timeline {
    padding-top: clamp(3.5rem, 6vw, 7rem);
  }
  .context-link {
    color: var(--theme-text-dim, #a7a8b5);
    font-size: var(--font-size-sm, 0.875rem);
  }

  .contribution {
    display: grid;
    gap: clamp(2rem, 4vw, 5rem);
    scroll-margin-top: 6rem;
    padding: clamp(1.5rem, 3vw, 3rem);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-2026-xl, 24px);
    background: var(--history-card);
  }

  .contribution-copy {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  .contribution h2 {
    max-inline-size: 14ch;
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: clamp(1.8rem, 1.45rem + 0.9vw, 2.6rem);
    letter-spacing: -0.025em;
    line-height: 1.08;
  }

  .history-cta {
    margin-top: clamp(3rem, 6vw, 6rem);
  }

  @media (min-width: 700px) {
    .index-list {
      grid-auto-flow: row;
      grid-auto-columns: initial;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      overflow: visible;
      padding-bottom: 0;
    }
  }

  @media (min-width: 1100px) {
    .history-hero {
      grid-template-columns: minmax(0, 1.08fr) minmax(24rem, 0.92fr);
    }
    .contribution {
      grid-template-columns: minmax(18rem, 0.78fr) minmax(24rem, 1.22fr);
      align-items: start;
    }
  }

  @media (min-width: 1680px) {
    .index-list {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .history-hero {
      min-height: auto;
      padding-block: 2.5rem 3rem;
    }
    .hero-facts {
      grid-template-columns: 1fr;
    }
    .article-meta span {
      margin-inline: 0.2rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .index-list a {
      transition: none;
    }
    .index-list a:hover {
      transform: none;
    }
  }
</style>
