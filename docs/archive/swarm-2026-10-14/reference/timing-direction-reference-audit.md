# Timing and direction reference audit

September 5, 2026. Scope: the public hub, its six mode articles, and the existing
[historical evidence ledger](../../../reference/timing-direction-history.md). This is a local
implementation audit, not a ranking report or a new inventorship investigation.

## Findings and this pass

| Finding                                                                                                                                  | Action                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| All six articles already have distinct definitions, examples, placement/timing distinctions, historical sources, and five sibling links. | Preserve the existing explanations and attribution limits.                                                                                          |
| The hub advertises six articles in its structured data but exposes only the selected article as an HTML link.                            | Add a compact, server-rendered Mode guides index below the existing introduction. Keep article buttons out of the six animation tiles.              |
| Routes already inherit prerendering, have self-canonicals, appear in the sitemap, and are permitted by robots.txt.                       | Preserve these owners. Check server-rendered HTML for every mode, including without executing JavaScript.                                           |
| The route is public in the root layout but absent from both domain classification and the early document bootstrap.                      | Add its prefix in both places. Regression-test all seven paths so visitors avoid app initialization and its boot curtain.                           |
| Reference pages link to advanced TKA lessons, but not directly to the dedicated timing-and-direction lesson.                             | Add the dedicated lesson as the primary teaching link. Retain the advanced links as TKA follow-ons.                                                 |
| Most external teaching resources in the ledger are absent from the articles.                                                             | Add a separate learning-resources section with named providers and scope notes.                                                                     |
| Article JSON-LD omits the sources shown on the page.                                                                                     | Derive citations from the same source records. Give the article an ID and canonical mainEntityOfPage. Escape script-bound JSON, following GuideSeo. |
| The hub uses the article Open Graph type despite being a collection.                                                                     | Use the existing Seo component's website type.                                                                                                      |

No publication dates, review dates, ratings, endorsements, or videos were
invented for structured data. Historical usage remains distinct from invention.

## External resources checked

The linked pages were read on September 5, 2026. These are live links, not
archival snapshots. FAI's pages contain YouTube embeds; playback of those
external embeds was not tested.

- FAI: [Together-Same](https://flowartsinstitute.com/portfolio-item/together-time-same-direction/),
  [Together-Opposite](https://flowartsinstitute.com/portfolio-item/together-time-opposite-direction/),
  [Split-Same](https://flowartsinstitute.com/portfolio-item/split-time-same-direction/),
  [Split-Opposite](https://flowartsinstitute.com/portfolio-item/split-time-opposite-direction/).
  Each is a matching short introduction. No quarter-mode URL was fabricated.
- [Noel Yee's VTG overview](https://noelyee.com/instruction/vulcan-tech-gospel/)
  explains the four-mode framework and links to fan and hoop teaching. Link
  previews explicitly say it covers together and split timing.
- [DrexFactor's third-order quarter-time chase](https://drexfactor.com/weirdscience/2011/11/16/drexs_tech_poi_blog_209_third_order_quarter_time_chase)
  retains its written explanation. The page reports missing Flash content.
  The article preview makes that limitation visible.
- [In Depth Move Families](https://www.homeofpoi.com/us/community/forums/topics/899386/In-Depth-Move-Families):
  AlienJon's November 20, 2009 post discusses phase, lead choice, and mirror
  symmetry. The Quarter-Opposite resource preview tells readers which post to find.

Search implementation guidance:
[Google's crawlable links guidance](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
and [Article structured data guidance](https://developers.google.com/search/docs/appearance/structured-data/article).
This work creates crawlable links and descriptive metadata. It does not guarantee
indexing, rich results, or rankings.

## Contract with the interactive lesson

- The lesson owns interactive teaching. This pass does not change its UX,
  sequences, or curriculum.
- The reference hub stays at /timing-and-direction. Articles stay at
  /timing-and-direction/{together|split|quarter}-time-{same|opposite}-direction.
- MODE_ORDER and MODE_FAMILY_ID remain the identity owners. Existing
  HandPathReferenceCard timing/direction pairs map to those stable URLs.
- Historical sources and learningResources are separate editorial fields.
  The former supports claims; the latter tells readers where to continue.
- Do not import all article prose into the lesson just to construct a route.

## Verification

- All 18 focused article, navigation, state, and public-bootstrap tests pass.
- Svelte check reports zero errors and warnings.
- Server HTML exposes all six guide links without JavaScript. All six articles
  return 200 with matching canonicals, structured citations, visible definitions,
  five sibling links, and the dedicated lesson link. An unknown mode returns 404.
- The hub and Quarter-Same article were inspected at all seven viewport tiers,
  from 375 × 667 through 3840 × 2160. No horizontal overflow was found. The guide
  index also fits a 720-pixel reflow viewport; this is not a native browser zoom test.
- Keyboard navigation from a hub guide to its article and from the article to
  the lesson works. Production prerender output and external video playback were
  not tested.

## Next gaps requiring editorial or production evidence

- Review a small set of practical transitions and non-poi examples with teachers
  before adding instructional prose. The current examples are predominantly poi.
- Review ambiguous aliases before making them prominent. “Quarter time” alone
  does not specify a direction, and a historical synonym needs context.
- Locate working quarter-mode videos and verify their content and playback.
  Do not present a legacy index or missing embed as a working tutorial.
- The existing ledger preserves claims, dates, and source URLs, not complete
  immutable copies of every community page. Its recent VTG4 chronology was not
  revalidated in this pass.
- Production deployment, Search Console inspection, indexing status, impressions,
  and ranking comparisons remain unverified. This pass makes no production or
  search-performance claim.
