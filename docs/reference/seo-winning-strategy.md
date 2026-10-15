# SEO strategy: make Flow Arts Composer the category reference

Updated 2026-07-20. This replaces the AI-search assumptions in the 2026-07-14
version while preserving the research decisions that still hold.

## The decision

`/composer` is the sole commercial owner of **flow arts software** on
tkaflowarts.com. `/roots/software` serves a different job: the sourced history
and current taxonomy of software used in flow arts.

Do not publish a second `/flow-arts-software` sales page. A duplicate would split
internal links, external links, and query signals. Reconsider the canonical URL
only if Search Console shows that `/composer` has no meaningful history and a
planned migration has a clear benefit.

The category statement should remain consistent anywhere the product is
described:

> Flow Arts Composer is flow arts software for composing, animating, and sharing
> choreography written with The Kinetic Alphabet.

Every claim in that sentence must stay true in the shipped product. Update the
statement everywhere if the product changes.

Google decides which page ranks first and whether an AI Overview appears. A bare
commercial query may never trigger an AI Overview. The practical target is a
strong classic result for the head term and citation eligibility for the useful
questions around it.

## What the earlier research established

The July 14 search sample found little demonstrated demand for the exact phrase
"flow arts notation." It also found more visible demand around tutorials,
practice tools, props, and choreography products. That supports two separate
jobs:

- **Category and entity:** Make The Kinetic Alphabet and Flow Arts Composer
  unambiguous through consistent naming, independent coverage, and accurate
  source pages.
- **Product discovery:** Reach people looking for software and practical help.
  Measure search impressions, qualified visits, and product activation.

The same research recorded several constraints that remain useful:

- Original product behavior and first-hand teaching material are harder to copy
  than rewritten definitions.
- Tutorial searches often favor video, so text alone is a weak format for those
  queries.
- A founder-led publishing plan needs a pace that can survive busy weeks.
- Links earned through real relationships and original data carry more meaning
  than bulk directory placement.

The July 16 software-cluster research found mixed results for "flow arts
software" and no clear choreography-software category owner in that sample. It
assigned the commercial phrase to `/composer` and the historical intent to
`/roots/software`. Treat that result as a dated baseline. Search results must be
sampled again before a major positioning or URL decision.

## The July 2026 generative-search correction

Google's current guidance says AI Overviews and AI Mode use the same indexing,
ranking, and quality systems that support Search. There is no separate AI SEO
layer to game.

The operating rules are:

- Write original material for people. First-hand expertise, evidence, and clear
  sourcing matter more than a passage-length formula.
- Use headings and concise answers when they help the reader. Google does not
  require 40-to-60-word chunks or any other AI-specific content shape.
- Keep important pages indexable, snippet-eligible, fast enough to use, and easy
  to understand without blocked assets.
- Use structured data only when it accurately describes visible page content or
  qualifies the page for a documented search feature. Schema is not an AI
  ranking boost.
- Skip `llms.txt`. Google does not require it for AI features.
- Avoid query-fanout page factories, mass doorway pages, AI-only rewrites, fake
  reviews, and planted third-party mentions.

Sources:

- [Succeeding in AI search](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [AI features and the website](https://developers.google.com/search/docs/appearance/ai-features)
- [Search generative AI controls](https://support.google.com/webmasters/answer/16908024?hl=en)
- [Generative AI performance report](https://support.google.com/webmasters/answer/16984139?hl=en)

## Page ownership

- **`/composer`:** Commercial category page with the product definition, real
  workflows, pricing, platform, limitations, release evidence, screenshots,
  video, and support.
- **`/roots/software`:** Informational reference with sourced history, a fair
  tool taxonomy, dated updates, author details, and corrections.
- **Homepage and About:** Entity support with consistent names, accurate creator
  information, and direct links to both owner pages.
- **Notation, guide, and glossary pages:** Authored explanations and examples
  that link to the relevant owner page.
- **Curated public sequence pages:** Product evidence and narrow discovery with
  server-rendered unique text, stable media, provenance, and useful next steps.

Private, temporary, and thin sequence pages should not enter the index. Public
sequence pages earn indexation only when they provide something a search visitor
can understand without opening the editor.

## Implementation order

### 1. Establish indexing truth

1. Keep `robots.txt` open to the CSS and JavaScript needed to understand public
   pages. Continue blocking private and utility routes.
2. Emit sitemap dates only when a source provides a real significant-update
   date. Omit unknown dates. Google ignores sitemap `priority` and `changefreq`.
3. Inspect `/composer` and `/roots/software` in Search Console after deployment.
   Record the selected canonical, crawl result, rendered resources, and indexing
   state.
4. Submit the current sitemap and request recrawling after meaningful changes.
5. In Search Console settings, keep generative AI inclusion enabled when the
   control is available. The rollout is gradual.
6. Treat `Google-Extended` as a separate control. It does not replace the Search
   Console setting for AI Overviews, AI Mode, and generative Discover.

This work is a recurring release check. No document should claim that technical
SEO is permanently finished.

### 2. Consolidate the product identity

1. Keep one canonical product name, one canonical URL, and the category statement
   above across visible copy, metadata, social profiles, and press material.
2. Make the page heading identify both the product and the category without
   repeating the phrase throughout the page.
3. Give Composer a dedicated product image and social card.
4. Connect `Organization`, `WebSite`, and `SoftwareApplication` data with stable
   identifiers. Include only verified properties.
5. Remove structured data that has no matching visible content or documented
   search use.

Wikidata is optional. Create an item only when independent reliable sources and
Wikidata policy support it. Every statement needs a source. An item does not
guarantee a Knowledge Panel, ranking gain, or AI citation.

### 3. Publish product proof

The product page should answer the questions a careful buyer asks before opening
the app:

- What does the software do?
- Who is it built for, and what knowledge does it assume?
- Which browsers or devices are supported?
- What costs money?
- What cannot it do yet?
- Where can a user find release notes, support, privacy details, and corrections?

Pair those answers with current screenshots and a short workflow video. Host a
stable watch page with a transcript. Add `VideoObject` data only when the visible
video, thumbnail, dates, and description match it.

### 4. Produce evidence other sites can cite

Three programs supply different kinds of proof:

**Case studies.** Document how named practitioners or teachers used Composer,
with permission. Include the starting problem, the workflow, an observable
result, and anything that did not work. Quotes remain exact and attributed.

**Original research.** Publish a recurring State of Flow Arts Software report.
Show the survey instrument, recruitment method, response count, analysis rules,
limitations, and anonymized data where consent allows. Correct errors publicly.

**Workflow video.** Record the product performing real tasks. Each major video
gets a stable page, transcript, useful stills, and links to the exact product
surface shown.

There is no content quota. One referenced report or case study is worth more than
twenty interchangeable keyword pages.

### 5. Earn independent reputation

Use the [off-page action kit](./seo-offpage-action-kit.md) to pursue:

- Direct source links from organizations and events that already mention TKA.
- Independent tutorials and reviews from people who used the product.
- Workshop pages, instructor resources, and partner references where Composer is
  genuinely part of the material.
- Editorial coverage of the research report, public case studies, or a notable
  release.

Community participation can create discovery and trust even when a platform adds
`nofollow` or `ugc` attributes. The attribute alone does not make a mention
valuable or worthless. Track relevance, referral visits, product activation, and
whether the reference helps a reader.

Never buy undisclosed links, demand exact-match anchor text, trade positive
reviews for access, seed fake discussions, or manufacture citations.

### 6. Build the public-artifact program carefully

Curated sequence pages can become durable product evidence when each page has:

- A stable canonical URL and server-rendered explanation.
- A useful image or preview with accurate alternative text.
- Authorship or source information where appropriate.
- Related educational links and a clear path into Composer.
- An explicit index decision.

Do not index private saves, duplicate variants, empty shells, or programmatic
pages created only to catch a query.

## Measurement

Capture a baseline before changing copy again.

### Search Console

Track the exact phrase and a defined query group:

- `flow arts software`
- `flow arts choreography software`
- `flow arts app`
- `flow arts notation`
- branded Composer and TKA queries

Review impressions, clicks, CTR, average position, selected canonical, and
country/device splits. Use the Generative AI performance report when it appears
in the property. Treat AI citations observed by hand as samples, not a stable
ranking report.

### Product analytics

Measure the organic path from product-page visit to an event that represents
real use. The event design should distinguish:

1. `/composer` viewed from organic search.
2. Composer opened.
3. A meaningful creation action completed.
4. Save or share completed.
5. Return use after the first session.

Choose the exact event definitions from shipped product behavior, then document
them beside the analytics implementation. Autocaptured clicks are not a
substitute for named activation events.

### Reputation ledger

Record the source page, target URL, editorial context, contact date, publication
date, referral visits, and downstream activation. Count independent reviews and
relevant referring domains, but keep the source quality visible. A raw link count
can hide a weak campaign.

Published sources that currently count live in `config/seo-measurement.json`.
The first recorded baseline is 2 independent sites mentioning The Kinetic
Alphabet, 0 Composer-specific sites, and 0 sites linking to TKA. The first
milestone is 5 independent sites, including 2 that describe Composer and 3 that
link to a useful TKA source page. These are campaign progress markers, not a
claim of market leadership.

## Review cadence

Run a monthly review while the campaign is active:

1. Check indexing and canonical selection.
2. Compare query-group movement against the baseline.
3. Review organic activation and return use.
4. Record newly earned coverage, corrections, and lost links.
5. Choose the next piece of evidence based on user questions and search data.

The campaign succeeds when the web has independent reasons to describe Flow Arts
Composer as flow arts software, and search visitors who find it become real
users. Repetition of the phrase is not the outcome.

## Project record

These files preserve the implementation history behind this strategy:

- [`2026-07-16-flow-arts-software-seo-design.md`](../superpowers/specs/shipped/2026-07-16-flow-arts-software-seo-design.md)
- [`2026-07-16-seo-a-plus-plan.md`](../superpowers/specs/audits/2026-07-16-seo-a-plus-plan.md)
- 2026-07-17 external search research backlog
