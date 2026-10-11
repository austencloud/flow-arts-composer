import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

describe("SEO head contract", () => {
  it("gives every page using the shared primitive an accessible social image", () => {
    expect(read("src/lib/shared/components/Seo.svelte")).toContain(
      '<meta name="twitter:image:alt" content={ogImageAlt} />'
    );
  });

  const routes = [
    "src/routes/sequence/[id]/+page.svelte",
    "src/routes/q/[code]/+page.svelte",
    "src/routes/(public)/shop/[productId]/+page.svelte",
  ];

  for (const route of routes) {
    describe(route, () => {
      const src = read(route);
      it("uses either the complete shared SEO primitive or a complete direct head", () => {
        if (src.includes("<Seo")) {
          expect(src).toContain(
            'import Seo from "#lib/shared/components/Seo.svelte"'
          );
          expect(src).toContain("canonical=");
          return;
        }

        expect(src).toContain("<svelte:head>");
        expect(src).toContain("og:title");
        expect(src).toContain('rel="canonical"');
        expect(src).toContain("twitter:card");
      });
    });
  }

  it("sequence + q layouts keep ssr enabled", () => {
    expect(read("src/routes/sequence/+layout.ts")).toContain("ssr = true");
    expect(read("src/routes/q/+layout.ts")).toContain("ssr = true");
  });

  it("shop product page emits Product JSON-LD", () => {
    expect(read("src/routes/(public)/shop/[productId]/+page.svelte")).toContain(
      "application/ld+json"
    );
  });

  it("emits CreativeWork JSON-LD only for verified, indexable sequences", () => {
    const route = read("src/routes/sequence/[id]/+page.svelte");
    const builder = read("src/routes/sequence/[id]/sequence-seo.ts");

    expect(route).toContain('type="application/ld+json"');
    expect(route).toContain('replace(/</g, "\\\\u003c")');
    expect(builder).toContain('"@type": "CreativeWork"');
    expect(builder).toContain("jsonLd: indexable");
    expect(builder).not.toContain('"@type": "HowTo"');
  });

  it("gives Flow Arts Composer one canonical product identity", () => {
    const composer = read("src/routes/(public)/composer/+page.svelte");
    // f64350ce63 fused About into the complete Composer experience:
    // +page.svelte kept the SEO/JSON-LD identity below, but the marketing
    // lede copy moved into ComposerExperience, which +page.svelte now wraps.
    const composerExperience = read(
      "src/routes/(public)/composer/_components/ComposerExperience.svelte"
    );

    expect(composer).toContain(
      'import Seo from "#lib/shared/components/Seo.svelte"'
    );
    expect(composer).toContain(
      "Flow Arts Composer | Free Flow Arts Software for Choreography"
    );
    expect(composer).toContain("const SOFTWARE_ID = `${URL}#software`");
    expect(composer).toContain('"@type": "SoftwareApplication"');
    expect(composer).toContain('isPartOf: { "@id": WEBSITE_ID }');
    expect(composer).toContain('creator: { "@id": CREATOR_ID }');
    expect(composer).toContain(
      '"https://tkaflowarts.com/branding/composer-og-image.png"'
    );
    expect(composerExperience).toContain(
      "Choose the moves or generate a 16-count loop."
    );
    expect(composer).toContain(
      "Use cloud saves, publishing, following, and exports with a full account"
    );
    expect(composer).not.toContain("Practice modes and an interactive guide");
    expect(composer).not.toContain("noindex");
    expect(composer).not.toContain('"@type": "HowTo"');
    expect(composer).not.toContain(
      'alternateName: "The Kinetic Alphabet Composer"'
    );
  });

  it("keeps the Composer and sitewide social images separate at 1200 by 630", () => {
    const composerBuilder = read("scripts/build-og-image.mjs");
    const composerImage = readFileSync(
      resolve(process.cwd(), "static/branding/composer-og-image.png")
    );
    const siteImage = readFileSync(
      resolve(process.cwd(), "static/branding/og-image.png")
    );

    expect(composerBuilder).toContain("composer-og-image.html");
    expect(composerBuilder).toContain("composer-og-image.png");
    for (const image of [composerImage, siteImage]) {
      expect(image.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(image.readUInt32BE(16)).toBe(1200);
      expect(image.readUInt32BE(20)).toBe(630);
    }
  });

  it("connects the product, creator, article, organization, and website IDs", () => {
    const composer = read("src/routes/(public)/composer/+page.svelte");
    const about = read("src/routes/(public)/about/+page.svelte");
    const history = read("src/routes/(public)/roots/software/+page.svelte");

    expect(composer).toContain(
      'const CREATOR_ID = "https://tkaflowarts.com/about#austen-cloud"'
    );
    expect(about).toContain('"@type": "Person"');
    expect(about).toContain("const PERSON_ID = `${URL}#austen-cloud`");
    expect(history).toContain(
      'const PERSON_ID = "https://tkaflowarts.com/about#austen-cloud"'
    );
    expect(history).toContain('publisher: { "@id": ORGANIZATION_ID }');
    expect(history).toContain('isPartOf: { "@id": WEBSITE_ID }');
  });

  it("keeps the site and organization entities linked and removes fake site search", () => {
    const home = read("src/routes/+page.svelte");

    expect(home).toContain('"@id": "https://tkaflowarts.com/#website"');
    expect(home).toContain('"@id": "https://tkaflowarts.com/#organization"');
    expect(home).toContain(
      '"publisher": { "@id": "https://tkaflowarts.com/#organization" }'
    );
    expect(home).toContain(
      '"founder": { "@id": "https://tkaflowarts.com/about#austen-cloud" }'
    );
    expect(home).not.toContain('"@type": "SearchAction"');
    expect(home).not.toContain("search_term_string");
  });

  it("records product CTA and field performance events for the organic funnel", () => {
    // f64350ce63 fused About into the complete Composer experience:
    // +page.svelte now only wraps ComposerExperience, which owns the hero CTA
    // analytics call this test guards.
    const composer = read(
      "src/routes/(public)/composer/_components/ComposerExperience.svelte"
    );
    const posthog = read("src/lib/shared/analytics/services/posthog.ts");
    const layout = read("src/routes/+layout.svelte");

    // ComposerExperience now also renders on /about (the fused page), so a
    // hardcoded "composer" literal would mislabel About's events. The CTA
    // tags itself with the live SvelteKit route id instead — see
    // analyticsRoute() in analytics-context.ts — which still resolves to the
    // composer surface for this route and stays correct for both.
    expect(composer).toContain(
      'import { analyticsRoute } from "#lib/shared/analytics/analytics-context.js";'
    );
    expect(composer).toContain("page: analyticsRoute()");
    expect(composer).toContain('cta_type: "open_composer"');
    expect(posthog).toContain("posthog.init");
    expect(posthog).toContain("capture_performance:");
    expect(posthog).toContain("web_vitals: captureEnabled");
    expect(posthog).toContain('["LCP", "INP", "CLS"]');
    expect(layout).toContain('import("#lib/shared/analytics/web-vitals.js")');
  });
});
