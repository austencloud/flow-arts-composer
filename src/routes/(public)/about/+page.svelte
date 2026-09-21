<script lang="ts">
  import ComposerExperience from "../composer/_components/ComposerExperience.svelte";
  import Seo from "$lib/shared/components/Seo.svelte";

  const TITLE = "About The Kinetic Alphabet";
  const DESCRIPTION =
    "The Kinetic Alphabet (TKA) is a pictographic notation system for flow arts choreography. Flow Arts Composer is the browser app for using it.";
  const URL = "https://tkaflowarts.com/about";
  const PERSON_ID = `${URL}#austen-cloud`;
  const pageJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AboutPage",
        "@id": `${URL}#about-page`,
        name: TITLE,
        url: URL,
        description: DESCRIPTION,
        inLanguage: "en-US",
        mainEntity: { "@id": "https://tkaflowarts.com/#tka" },
        isPartOf: { "@id": "https://tkaflowarts.com/#website" },
      },
      // This keeps TKA separate from the other notation systems documented on
      // the site when search tools summarize the project.
      {
        "@type": "Thing",
        "@id": "https://tkaflowarts.com/#tka",
        name: "The Kinetic Alphabet",
        alternateName: "TKA",
        description:
          "A pictographic notation system for flow arts choreography. Each picture records a movement step; together they record a sequence.",
        disambiguatingDescription:
          "Created by Austen Cloud in 2022. The Kinetic Alphabet is its own system and is not built on, derived from, or an extension of the other flow arts notations documented on this site. The Shape Matrix, CAPs, the Vulcan Tech Gospel, QFT Notation and the rest are separate works by other authors, archived and credited at /history.",
        dateCreated: "2022",
        creator: { "@id": PERSON_ID },
      },
      {
        "@type": "Person",
        "@id": PERSON_ID,
        name: "Austen Cloud",
        url: `${URL}#austen-cloud`,
        award: "2024–25 Seed Fund grant recipient for The Kinetic Alphabet",
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
          { "@type": "ListItem", position: 2, name: "About", item: URL },
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

<ComposerExperience />
