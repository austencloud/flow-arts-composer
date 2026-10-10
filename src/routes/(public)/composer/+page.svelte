<script lang="ts">
  import ComposerExperience from "./_components/ComposerExperience.svelte";
  import ComposerGlide from "./_glide/ComposerGlide.svelte";
  import { createGlideMemory } from "./_glide/glide-memory";
  import Seo from "#lib/shared/components/Seo.svelte";

  const glideMemory = createGlideMemory();
  export const snapshot = glideMemory.snapshot;

  const TITLE = "Flow Arts Composer | Free Flow Arts Software for Choreography";
  const DESCRIPTION =
    "Flow Arts Composer is free flow arts software for building, animating, saving, and sharing choreography in your browser with The Kinetic Alphabet.";
  const URL = "https://tkaflowarts.com/composer";
  const ORGANIZATION_ID = "https://tkaflowarts.com/#organization";
  const WEBSITE_ID = "https://tkaflowarts.com/#website";
  const CREATOR_ID = "https://tkaflowarts.com/about#austen-cloud";
  const SOFTWARE_ID = `${URL}#software`;
  const COMPOSER_IMAGE =
    "https://tkaflowarts.com/branding/composer-og-image.png";
  const softwareJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_ID,
    name: "Flow Arts Composer",
    description: DESCRIPTION,
    url: URL,
    mainEntityOfPage: URL,
    applicationCategory: "EducationalApplication",
    keywords:
      "flow arts software, flow arts choreography software, flow arts app",
    operatingSystem: "Web browser",
    image: COMPOSER_IMAGE,
    inLanguage: "en-US",
    isAccessibleForFree: true,
    featureList: [
      "Build sequences step by step with valid next options",
      "Generate a 16-step sequence from a prepared movement recipe",
      "Animate sequences with pictographs beside the motion",
      "Multiply sequences into tunnels of two, four, or eight copies",
      "View sequences in 3D on supported larger screens",
      "Save up to three sequences on the current device as a guest",
      "Browse public sequences in the Community Gallery",
      "Use cloud saves, publishing, following, and exports with a full account",
    ],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: "https://tkaflowarts.com/create",
    },
    author: { "@id": ORGANIZATION_ID },
    creator: { "@id": CREATOR_ID },
    publisher: { "@id": ORGANIZATION_ID },
    isPartOf: { "@id": WEBSITE_ID },
  }).replace(/</g, "\\u003c");

  const breadcrumbJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://tkaflowarts.com/",
      },
      { "@type": "ListItem", position: 2, name: "Composer", item: URL },
    ],
  }).replace(/</g, "\\u003c");
</script>

<Seo
  title={TITLE}
  description={DESCRIPTION}
  canonical={URL}
  ogImage={COMPOSER_IMAGE}
  ogImageAlt="Flow Arts Composer, flow arts software for choreography"
>
  {@html `<script type="application/ld+json">${softwareJsonLd}</script>`}
  {@html `<script type="application/ld+json">${breadcrumbJsonLd}</script>`}
</Seo>

<ComposerGlide memory={glideMemory}><ComposerExperience /></ComposerGlide>
