/**
 * The Vulcan Tech Gospel's own chronology.
 *
 * VTG is not one document. It is a continuing project in numbered
 * installments, and VTG 1 is itself five chapters with five different authors.
 * The archive tile steps through those chapters; the detail view tells the
 * chronology.
 *
 * SOURCING — every line here traces to a page that was actually read, on the
 * same terms as `notation-catalog.ts`. Two primaries:
 *
 *   A. https://noelyee.com/vulcan-tech-gospel-1-vtg-1-2011/ — Yee's own
 *      chapter-by-chapter commentary on VTG 1, posted Feb 2, 2019.
 *   B. https://noelyee.com/vulcan-tech-gospel-2/ — the VTG #2 page, carrying
 *      Cantor and Yee's introduction and a dated release log.
 *   Later document, app and social-announcement sources are recorded in
 *   docs/reference/vtg-release-history.md and the archive ledger.
 *
 * The plates themselves were cropped from the PDFs those pages link to.
 *
 * Deliberately NOT here: any claim that VTG influenced or was influenced by
 * another system in the catalog. Lorq Nichols is credited on the 2015 app
 * alongside Yee, Cantor and Thompson, which is a real documented
 * collaboration — but the archive's rule is that entries state no relationship
 * to one another without Austen's call, so it stays out of the data.
 */

export interface VtgChapter {
  /** Basename under /images/notation/vtg/figures/ */
  figure: string;
  /** Chapter title as VTG V.1's own table of contents prints it. */
  title: string;
  /** Who made it, as Yee credits them. */
  people: string;
  /** Yee's commentary, quoted or closely paraphrased from primary A. */
  note: string;
}

/**
 * VTG 1's five chapters, in the order its table of contents lists them.
 *
 * The order is the document's, not ours. Note that this is NOT the order the
 * ideas were discovered in — Yee's commentary makes clear chapter 4 became the
 * seed of VTG 3, and chapter 5 was written last, in Philadelphia.
 */
export const VTG1_CHAPTERS: VtgChapter[] = [
  {
    figure: "transition-theory",
    title: "Transition Theory",
    // The V.1 contents page prints Yee and Cantor as the chapter byline. Yee's
    // later account also names Campbell: he says the theory was created with
    // Campbell and “deeply meditated on” with Campbell and Cantor.
    people: "Noel Yee, Jordan Campbell, and David “Tankboy” Cantor",
    note: "Yee credits Campbell and Cantor with developing the theory alongside him. Cantor drew the figure printed in V.1, where overlaying circles show transitions without the compound circle.",
  },
  {
    figure: "beat-shapes-page",
    title: "Minimal Beat Shapes",
    people: "Brian Thompson",
    note: "“First discovered and worked through by Brian Thompson.” Thompson built physical models to explore transitions between the patterns.",
  },
  {
    figure: "patterns-40-a",
    title: "Necessity of 40 Patterns",
    people: "Noel Yee",
    note: "Yee's “attempt to organize and settle a finite number of patterns for the VTG framework.”",
  },
  {
    figure: "trans-split-same",
    title: "Transitions Between Shapes",
    people: "David “Tankboy” Cantor",
    note: "Explores connections between patterns. In his 2019 retrospective, Yee traces VTG 3 back to this chapter.",
  },
  {
    figure: "hybrid-3d",
    title: "3-D Hybrid Shapes",
    people: "Maiki Nope, Ben Drexler and Noel Yee",
    note: "Written at Mike Icon and Jennifer Longo’s house in Philadelphia in winter 2011. Nope, Drexler, and Yee noticed that the patterns appeared as lines of different lengths from one angle. They used that observation to build the 3-D hybrids. One flow artist has this page as a tattoo.",
  },
];

export interface VtgEvent {
  /** Rendered as written. */
  when: string;
  what: string;
  /** True when the thing was announced but never actually shipped. */
  unshipped?: boolean;
}

/**
 * The project chronology, separate from the stepper's five VTG 1 plates.
 */
export const VTG_DECADE: VtgEvent[] = [
  {
    when: "2010",
    what: "VTG 1 written, across five chapters and at least six collaborators.",
  },
  {
    when: "2011",
    what: "VTG 1 released. Re-centred later that year by Aaron Poppie. Yee, looking back in 2019: “much of the nomenclature has changed drastically over the years.”",
  },
  {
    when: "4 Oct 2011",
    what: "VTG #2 chapter 1 and Index 1/3. The second gospel leaves the one-to-one case behind for “3 to 3 beats of the 4 petal antispin and the 2 petal spin.”",
  },
  { when: "10 Oct 2011", what: "Chapter 2 and Index 2/3." },
  { when: "22–27 Oct 2011", what: "Index 2/3 fixed, then Index 3/3. VTG #2 complete." },
  {
    when: "2015",
    what: "A Vulcan Tech Gospel Android app animated the 40 patterns in both 1:1 and 3:1.",
  },
  {
    when: "2019",
    what: "Yee announces “the tenth year of the Vulcan Tech Gospel Project and the release of the final installment VTG3,” and begins re-releasing the older chapters.",
  },
  {
    when: "2019 · VTG 3",
    what: "The public VTG 3 document is marked Draft #1. Its six-by-six snapshot grid labels the hands’ and props’ timing and direction separately. An Android app by Michael Caden Pike (MCP) and Yee was available by July, with animations, transitions and quizzes.",
  },
  {
    when: "27 August 2026",
    what: "The VTG Crew presents Mentive’s SpiroAnim translation of the VTG 3 grid into elemental terminology.",
  },
  {
    when: "29 August 2026 · VTG 4",
    what: "The VTG Crew announces Mentive’s SpiroAnim expansion as VTG 4, with quarter timing, quarter placement and additional ratios. Mentive’s reply credits the underlying concepts to other practitioners and describes his work as defining, exploring and visualizing them.",
  },
];

/** First documented year and latest verified activity, not a project end date. */
export const VTG_SPAN = { from: 2010, to: 2026 } as const;

/**
 * Which chapter is open, shared by every VtgChapterStepper on the page.
 *
 * The tile and the detail panel are two instances of the same component, and
 * the archive morphs one into the other with a paired `view-transition-name`.
 * If they held their own step, stepping to chapter 4 in the tile and then
 * opening the detail would morph chapter 4's plate into chapter 1's — a
 * content swap disguised as a transition. One shared position means the
 * artifact you were looking at is the artifact that flies into the panel.
 */
export const vtgChapter = $state({ index: 0 });
