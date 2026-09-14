import { ORIGINAL_SHAPE_MATRIX_URL } from "$lib/shared/shape-matrix/app/shape-engine-identity";

/**
 * The /notation catalog — a chronological record of systems for writing flow
 * arts down.
 *
 * Sourcing rules (docs/superpowers/specs/2026-07-26-notation-catalog-design.md):
 * every `records` line traces to a primary that was actually read, no acronym is
 * expanded without one, and no date is guessed. If a fact cannot be sourced it
 * does not appear — which is why some rows are shorter than others, and why
 * Transition Theory has no row.
 *
 * The rule against claiming a relationship between entries has ONE exception,
 * added 2026-07-28: Lorq Nichols and the Vulcan Tech Gospel. That one is not an
 * inference from structural similarity — it is documented from both sides, and
 * the evidence is cited on the `lorq` entry. Everything else on this page stays
 * silent about influence, because silence is the honest default when the only
 * argument is that two systems look alike.
 *
 * The Home of Poi threads are behind a Cloudflare challenge that blocks every
 * automated client, and no homeofpoi.com forum topic has ever been captured by
 * the Wayback Machine. They were read in a browser and archived verbatim to
 * E:\flow-arts-wiki\content\sources\homeofpoi\ — that archive, not memory, is
 * what these lines rest on.
 */

export interface CatalogSource {
  label: string;
  href: string;
}

export interface CatalogVideo {
  id: string;
  title: string;
  creator: string;
  year: string;
  note: string;
}

export interface CatalogSubWork {
  name: string;
  note: string;
}

export interface CatalogEntry {
  id: string;
  /** Display string. "2009", "c. 2010", "2012–" — rendered as written. */
  year: string;
  /** Ordering only. Never rendered. */
  sortYear: number;
  system: string;
  people: string;
  /** The one sourced line: what the system records. Never how to use it. */
  records: string;
  subWorks?: CatalogSubWork[];
  sources: CatalogSource[];
  videos?: CatalogVideo[];
  /** A destination must say whether it is an original work or our explanation. */
  explore?: CatalogSource & { kind: "original" | "explanation" | "tool" };
  /** Present-day applications are separate from the historical work. */
  applications?: (CatalogSource & {
    role: "product" | "tool";
    description: string;
  })[];
}

const HOP_CAPS =
  "https://www.homeofpoi.com/en/community/forums/topics/891193/What-are-CAP-s";
const DREX_MATH_CAPS = "https://drexfactor.com/reference/math_caps";
const HOP_QFT =
  "https://www.homeofpoi.com/us/community/forums/topics/932537/A-Beginner-s-Guide-to-Prop-QFT-Notation";

export const NOTATION_CATALOG: CatalogEntry[] = [
  {
    id: "caps",
    year: "2009",
    sortYear: 2009,
    system: "Continuous Assembly Patterns",
    people: "Damien, posting as French_Saltimbanque, on the Home of Poi forums",
    // Alien Jon in-thread: "taking basic 'poi geometry' building blocks or
    // fractional piece of other moves with simpler symmetry and assembling them
    // together into more complexly layered moves."
    records:
      "Parts of different moves joined into a repeating pattern. In the original forum discussion, Alien Jon describes CAPs as a way to build movement from smaller pieces.",
    explore: {
      kind: "explanation",
      label: "See CAPs explained",
      href: "/notation/caps#what-is",
    },
    sources: [{ label: "Original 2009 forum discussion", href: HOP_CAPS }],
  },
  {
    id: "trochoid",
    year: "2009",
    sortYear: 2009.1,
    system: "The trochoid model",
    people:
      "Zaltymbunk, of Angers, France. Danny_, in Brighton, independently modelled the same problem using the ground as a reference. Zaltymbunk used the arm.",
    // Verbatim from the archived thread: "The patterns will be defined in the
    // following way : Theta1 Theta2 ; Rho1 Rho2", plus the later division term.
    records:
      "The model describes a pattern with two turn counts and two radii: Theta1 Theta2 ; Rho1 Rho2. A division term specifies a fraction of the cycle. It also includes a wrap table, a condition for cycloids, and rules for which patterns are physically possible.",
    explore: {
      kind: "explanation",
      label: "See the model explained",
      href: "/notation/caps#math",
    },
    sources: [
      {
        label: "Zaltymbunk's model, preserved by DrexFactor",
        href: DREX_MATH_CAPS,
      },
      { label: "Original 2009 forum discussion", href: HOP_CAPS },
    ],
  },
  {
    id: "vtg",
    year: "2010",
    sortYear: 2010,
    system: "Vulcan Tech Gospel",
    // The V.1 contents page supplies the printed chapter bylines. Yee's own
    // retrospective adds Jordan Campbell to the people who developed
    // Transition Theory, even though Campbell is absent from that byline:
    // https://noelyee.com/vulcan-tech-gospel-1-vtg-1-2011/
    //
    // Lorq Nichols is NOT in V.1 — zero occurrences in the whole document. He
    // enters the lineage afterward, via Book of P.H.A.T. and Yee's own 2015 app
    // credits; see the `lorq` entry. Do not add him to this line.
    people:
      "Noel Yee compiled VTG 1, with chapters by Brian Thompson, David “Tankboy” Cantor, Maiki Nope, Ben Drexler, and Yee. Jordan Campbell also worked with Yee and Cantor on Transition Theory.",
    // Yee's own site: "The first goal of VTG is to help the user to understand
    // the variety of flower patterns available in a given arm and prop timing
    // and direction. The second is to teach the user how to transition between
    // patterns within a given timing and direction." Volume 1's ten shapes are
    // from Yee's own walkthrough video.
    records:
      "Illustrated guides and apps for flower patterns and the transitions between them. VTG 1 starts with ten minimal beat shapes for two hands. VTG 3 uses a grid to compare the timing and direction of hands and props. VTG 4 adds quarter timing and quarter placement through SpiroAnim.",
    explore: {
      kind: "original",
      label: "Open the VTG 3 web app",
      href: "https://vtg-v3.web.app/",
    },
    subWorks: [
      {
        name: "VTG 1",
        note: "Dated 2010 and released in 2011. Five chapters by five authors.",
      },
      {
        name: "VTG #2",
        note: "Cantor and Yee’s October 2011 guide extends the one-to-one case to three-to-three.",
      },
      {
        name: "Book of P.H.A.T. Volume 1",
        note: "Written and illustrated by Lorq Nichols, with Brian Thompson, David Cantor, and Noel Yee. The Shape Matrix appears on page 32.",
      },
      {
        name: "VTG 3: grid and document · 2019",
        note: "A six-by-six grid of movement snapshots. Each pattern has separate labels for hand and prop timing and direction. The document, marked Draft #1, credits Yee with inspiration from Cantor and Cassie McKenney.",
      },
      {
        name: "VTG 3: phone and web apps",
        note: "Michael Caden Pike (MCP) and Yee made the grid into an app with animations, transitions, and quizzes at 1:1, 1:3, and 1:5. The Android app was available by July 2019. You can also use the web version.",
      },
      {
        name: "VTG 4 / SpiroAnim · 2026",
        note: "Announced by the VTG Crew on August 29, 2026. Mentive’s SpiroAnim builds on the VTG 3 grid with quarter timing, quarter placement and additional ratios. Mentive credits the underlying concepts to other practitioners and describes his contribution as defining, exploring and visualizing them.",
      },
    ],
    sources: [
      {
        label: "The Vulcan Tech Gospel, on Noel Yee's site",
        href: "https://noelyee.com/instruction/vulcan-tech-gospel/",
      },
      {
        label: "Noel Yee’s 2019 retrospective and VTG 3 announcement",
        href: "https://noelyee.com/vulcan-tech-gospel-1-vtg-1-2011/",
      },
      {
        label: "VTG 3 original document · Draft #1",
        href: "https://drive.google.com/file/d/11jlw3ezJ4aSzH5zwlaM5_2mtOYy4U3WX/view",
      },
      {
        label: "VTG 3 Android app · Michael Caden Pike (MCP)",
        href: "https://play.google.com/store/apps/details?hl=en_US&id=net.firestaff.mcp.VTGv3",
      },
      {
        label: "VTG 3 web app",
        href: "https://vtg-v3.web.app/",
      },
      {
        label: "VTG 3 grid in SpiroAnim · Instagram, August 27, 2026",
        href: "https://www.instagram.com/vulcantechgospel/p/Dci0r-Mve05/",
      },
      {
        label: "VTG 4 announcement · Instagram, August 29, 2026",
        href: "https://www.instagram.com/vulcantechgospel/p/DcoQATwFrUA/",
      },
      {
        label: "Mentive’s attribution of the underlying concepts",
        href: "https://www.instagram.com/p/DcoQATwFrUA/c/17953419501233426/",
      },
      {
        label: "SpiroAnim’s VTG 4 reference and interactive grids",
        href: "https://spiroanim.com/vtg4/",
      },
    ],
  },
  {
    id: "nine-square",
    year: "c. 2010",
    sortYear: 2010.5,
    system: "9-Square Theory",
    people: "Charlie Cushing",
    records:
      "A nine-point grid for exploring poi movement, with a specified poi length and set of planes. Cushing’s eleven-part lesson series covers timing and direction, then works through topics including stalls and footwork.",
    sources: [
      {
        label: "Charlie's 9-square theory, all eleven parts",
        href: "https://www.youtube.com/playlist?list=PLDE05D5E593C54AED",
      },
    ],
    videos: [
      {
        id: "J_jpE31_9DE",
        title: "Charlie's 9-Square Theory Introduction for Poi",
        creator: "Charlie Cushing",
        year: "",
        note: "An introduction to the series.",
      },
      {
        id: "VfqPBoVCt-0",
        title: "#1: Poi Length, Planes, 9-Square Introduction",
        creator: "Charlie Cushing",
        year: "",
        note: "How poi length and planes relate to the grid.",
      },
      {
        id: "nGwLdHSDokI",
        title: "#2: Direction, Timing, and Poly-Timing in 9-Square",
        creator: "Charlie Cushing",
        year: "",
        note: "",
      },
      {
        id: "Lh5wtTddhEE",
        title: "#3: Polyrhythmic Hybrids and Timing Changes",
        creator: "Charlie Cushing",
        year: "",
        note: "",
      },
    ],
  },
  {
    id: "qft",
    year: "2011",
    sortYear: 2011,
    system: "QFT Notation",
    people:
      "Charlie Cushing developed the concept, and Ben Drexler wrote the primer. Alien Jon and Noel Yee gave feedback on Cushing and Drexler’s class at Kinetic Fire Festival.",
    // The primer is the only public document that expands the acronym, so the
    // expansion ships: "Charlie's Quantized Field Theory for poi and one of its
    // applications: notation for props."
    records:
      "QFT divides a circle into eight positions. It records a prop’s starting and ending positions, along with its direction of travel at each end. The full formula is a,b(h(±x±y±z)h'){Class}a',b'.",
    sources: [
      { label: "The primer, on the Home of Poi forums", href: HOP_QFT },
      // The same primer on Drex's own blog. Listed because it is the copy whose
      // diagrams still load — the forum's images are all dead placeholders now.
      {
        label: "The primer with diagrams, on DrexFactor",
        href: "https://drexfactor.com/weirdscience/2011/05/18/beginners_guide_poi_qft_notation",
      },
    ],
    explore: {
      kind: "tool",
      label: "Explore QFT in the interactive viewer",
      href: "/notation/qft",
    },
  },
  {
    id: "lorq",
    year: "2012–",
    sortYear: 2012,
    system: "Lorq Nichols' catalogs",
    people: "Lorq Nichols, publishing as Spin Science",
    // Publication facts only. The Book of P.H.A.T. contents page places the
    // Shape Matrix on page 32. Yee's 2015 app page lists "VTG Authors: Noel
    // Yee, David Cantor, Brian Thompson, Lorq Nichols." Neither fact is used to
    // make a claim about influence or chronology between entries.
    records:
      "Nichols’ printed grids catalog pairs of driving styles and combinations of arm paths with club shapes. The Shape Matrix appears on page 32 of Vulcan Tech Gospel Book of P.H.A.T. Volume 1. Noel Yee's 2015 app credits list Nichols with Yee, David Cantor, and Brian Thompson under “VTG Authors.”",
    subWorks: [
      {
        name: "144 Shape Matrix",
        note: "Pairs twelve driving styles with twelve. Nichols calls it “a multiplication table for tricks.”",
      },
      { name: "324 Patterns", note: "A catalog of combinations of arm paths and club shapes." },
      {
        name: "27 Arm Paths",
        note: "Three axes, three planes, nine arm positions, and the transitions between them.",
      },
      {
        name: "Tech Tiles / Book of P.H.A.T.",
        note: "Published as Vulcan Tech Gospel Book of P.H.A.T. Volume 1, with Brian Thompson, David Cantor, and Noel Yee.",
      },
      {
        name: "Position Matrix",
        note: "A 2013 catalog of 1:1 club flowers and their transitions, made with Brian Thompson and David Cantor.",
      },
    ],
    // The original publication uses HTTP: its HTTPS certificate is expired.
    sources: [
      {
        label: "Book of P.H.A.T.",
        href: "https://sirlorq.wordpress.com/tech-tiles/",
      },
      {
        label: "324 Patterns",
        href: "https://sirlorq.wordpress.com/324-patterns/",
      },
      { label: "LORQ:TECH", href: "https://www.youtube.com/user/SirLorq" },
      {
        label: "144 Shape Matrix, 2014 rework",
        href: ORIGINAL_SHAPE_MATRIX_URL,
      },
    ],
    explore: {
      kind: "original",
      label: "View Lorq’s original 144 Shape Matrix",
      href: ORIGINAL_SHAPE_MATRIX_URL,
    },
  },
  {
    id: "poinotation",
    year: "2016",
    sortYear: 2016,
    system: "PoiNotation",
    people: "Tiffany Fong",
    records: "A text format for recording poi movement in a form that software can read.",
    sources: [
      {
        label: "PoiNotation on GitHub",
        href: "https://github.com/tiffanyfong/PoiNotation",
      },
    ],
  },
  {
    id: "tka",
    year: "2022",
    sortYear: 2022,
    system: "The Kinetic Alphabet",
    people: "Austen Cloud",
    records:
      "A visual notation that uses letters and pictographs to record flow arts movement. Sequences form words that can be read and shared.",
    sources: [{ label: "The Kinetic Alphabet guide", href: "/guide" }],
    explore: {
      kind: "explanation",
      label: "Read the notation guide",
      href: "/guide",
    },
    applications: [
      {
        role: "product",
        label: "Flow Arts Composer",
        href: "/create",
        description:
          "Austen Cloud’s main application for The Kinetic Alphabet. Build a sequence, watch it animate, then save it or share it.",
      },
      {
        role: "tool",
        label: "Shape Engine",
        href: "/shape-engine",
        description:
          "Austen Cloud’s tool for exploring VTG and TKA with timing and direction. It is part of Flow Arts Composer and also opens on its own. Its matrix extends Lorq Nichols’ approach of pairing movements.",
      },
    ],
  },
];
