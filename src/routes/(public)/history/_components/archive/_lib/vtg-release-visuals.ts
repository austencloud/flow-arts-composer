export interface VtgReleaseImage {
  id: string;
  label: string;
  src: string;
  alt: string;
  caption: string;
  href: string;
  linkLabel: string;
}

export interface VtgReleaseVisual {
  id: string;
  title: string;
  kind: "chapters" | "document" | "app";
  images: VtgReleaseImage[];
}

const imageRoot = "/images/history/vtg";
const vtg3Document =
  "https://drive.google.com/file/d/11jlw3ezJ4aSzH5zwlaM5_2mtOYy4U3WX/view";
const phatDocument =
  "https://sirlorq.wordpress.com/wp-content/uploads/2013/05/bop-manual-small.pdf";

// Each ID is the corresponding archive section ID. App captures illustrate
// the current interface; document previews preserve the published pages.
export const VTG_RELEASE_VISUALS: VtgReleaseVisual[] = [
  {
    id: "VTG 1",
    title: "VTG 1 · original chapters",
    kind: "chapters",
    images: [],
  },
  {
    id: "VTG #2",
    title: "VTG 2 · Index 1/3",
    kind: "document",
    images: [
      {
        id: "vtg2-index",
        label: "Index",
        src: `${imageRoot}/vtg2-index.webp`,
        alt: "VTG 2 Index 1/3 opening page, showing two-petal spin and four-petal antispin flowers and the original contributor credits",
        caption:
          "Opening page of VTG 2’s Index 1/3, from Noel Yee’s published PDF.",
        href: "https://noelyee.com/wp-content/uploads/2015/09/vtg2index.pdf",
        linkLabel: "Read the original index",
      },
    ],
  },
  {
    id: "Book of P.H.A.T. Volume 1",
    title: "Book of P.H.A.T. · original pages",
    kind: "document",
    images: [
      {
        id: "phat-cover",
        label: "Cover",
        src: `${imageRoot}/phat-cover.webp`,
        alt: "Book of P.H.A.T. Volume 1 cover, crediting Brian Thompson, David Cantor, Lorq Nichols, and Noel Yee, with illustration and text by Lorq Nichols",
        caption: "The cover of Lorq Nichols’ Book of P.H.A.T. Volume 1.",
        href: phatDocument,
        linkLabel: "Read the original book",
      },
      {
        id: "phat-shape-matrix",
        label: "Shape Matrix · p. 32",
        src: `${imageRoot}/phat-shape-matrix.webp`,
        alt: "Page 32 of Book of P.H.A.T., titled Shape Matrix: Left and Right Driving Style Combo",
        caption:
          "The Shape Matrix on page 32, with Nichols’ diagrams and explanatory text.",
        href: `${phatDocument}#page=32`,
        linkLabel: "Read page 32 in the book",
      },
    ],
  },
  {
    id: "VTG 3: grid and document · 2019",
    title: "VTG 3 · Draft #1 grids",
    kind: "document",
    images: ["1:1", "1:3", "1:5"].map((ratio, index) => ({
      id: `vtg3-grid-${ratio}`,
      label: ratio,
      src: `${imageRoot}/vtg3-grid-${ratio.replace(":", "-")}.webp`,
      alt: `The original VTG 3 ${ratio} snapshot grid, including credits to Noel Yee, David Cantor, and Cassie McKenney`,
      caption: `The ${ratio} grid on page ${index + 6} of VTG 3 Draft #1.`,
      href: vtg3Document,
      linkLabel: "Read the original draft",
    })),
  },
  {
    id: "VTG 3: phone and web apps",
    title: "VTG 3 · web app",
    kind: "app",
    images: [
      {
        id: "vtg3-app",
        label: "Web app",
        src: `${imageRoot}/vtg3-app.webp`,
        alt: "VTG 3 Flow Arts Resource web app showing its 1:5 pattern grid and playback controls",
        caption:
          "The VTG 3 web app at 1:5, captured September 8, 2026. App by Michael Caden Pike (MCP) and Noel Yee.",
        href: "https://vtg-v3.web.app/",
        linkLabel: "Open the VTG 3 web app",
      },
    ],
  },
  {
    id: "VTG 4 / SpiroAnim · 2026",
    title: "VTG 4 · SpiroAnim",
    kind: "app",
    images: [
      {
        id: "spiroanim-vtg4",
        label: "SpiroAnim",
        src: `${imageRoot}/spiroanim-vtg4.webp`,
        alt: "Mentive’s SpiroAnim app with Vulcan Tech Gospel 4 selected, its 1:3 grid beside a two-prop animation",
        caption:
          "Mentive’s SpiroAnim with VTG 4 selected, captured September 8, 2026.",
        href: "https://spiroanim.com/app",
        linkLabel: "Open SpiroAnim",
      },
    ],
  },
];

export function vtgReleaseVisual(sectionId: string): VtgReleaseVisual {
  const visual = VTG_RELEASE_VISUALS.find(
    (release) => release.id === sectionId
  );
  if (!visual) throw new Error(`Missing VTG release visual: ${sectionId}`);
  return visual;
}
