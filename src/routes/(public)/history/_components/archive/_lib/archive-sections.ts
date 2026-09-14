import type { CatalogSource } from "$lib/shared/notation/notation-catalog";
import { ARCHIVE_ENTRIES, type ArchiveEntry } from "./archive-ledger";

export interface ArchiveSection {
  id: string;
  label: string;
  title: string;
  description: string;
  kind: "work" | "product" | "tool" | "lesson";
  links: CatalogSource[];
}

// These are editorial associations, not text matches: similarly named releases
// must not accidentally acquire one another's announcements or credits.
const WORK_SOURCES: Record<string, { label: string; hrefs: string[] }> = {
  "VTG 1": {
    label: "VTG 1",
    hrefs: ["https://noelyee.com/instruction/vulcan-tech-gospel/"],
  },
  "VTG #2": {
    label: "VTG 2",
    hrefs: ["https://noelyee.com/instruction/vulcan-tech-gospel/"],
  },
  "Book of P.H.A.T. Volume 1": {
    label: "Book of P.H.A.T.",
    hrefs: ["https://sirlorq.wordpress.com/tech-tiles/"],
  },
  "VTG 3: grid and document · 2019": {
    label: "VTG 3 · grid",
    hrefs: [
      "https://drive.google.com/file/d/11jlw3ezJ4aSzH5zwlaM5_2mtOYy4U3WX/view",
      "https://noelyee.com/vulcan-tech-gospel-1-vtg-1-2011/",
      "https://www.instagram.com/vulcantechgospel/p/Dci0r-Mve05/",
    ],
  },
  "VTG 3: phone and web apps": {
    label: "VTG 3 · apps",
    hrefs: [
      "https://vtg-v3.web.app/",
      "https://play.google.com/store/apps/details?hl=en_US&id=net.firestaff.mcp.VTGv3",
    ],
  },
  "VTG 4 / SpiroAnim · 2026": {
    label: "VTG 4 / SpiroAnim",
    hrefs: [
      "https://spiroanim.com/vtg4/",
      "https://www.instagram.com/vulcantechgospel/p/DcoQATwFrUA/",
      "https://www.instagram.com/p/DcoQATwFrUA/c/17953419501233426/",
    ],
  },
  "144 Shape Matrix": { label: "144 Shape Matrix", hrefs: [] },
  "324 Patterns": {
    label: "324 Patterns",
    hrefs: ["https://sirlorq.wordpress.com/324-patterns/"],
  },
  "27 Arm Paths": {
    label: "27 Arm Paths",
    hrefs: [
      "https://sirlorq.wordpress.com/324-patterns/",
      "https://www.youtube.com/user/SirLorq",
    ],
  },
  "Tech Tiles / Book of P.H.A.T.": {
    label: "Tech Tiles / P.H.A.T.",
    hrefs: ["https://sirlorq.wordpress.com/tech-tiles/"],
  },
  "Position Matrix": {
    label: "Position Matrix",
    hrefs: ["https://sirlorq.wordpress.com/tech-tiles/"],
  },
};

const LESSON_LABELS: Record<string, string> = {
  J_jpE31_9DE: "Introduction",
  "VfqPBoVCt-0": "1 · Length & planes",
  nGwLdHSDokI: "2 · Timing & direction",
  Lh5wtTddhEE: "3 · Hybrids",
};

export function archiveSections(entry: ArchiveEntry): ArchiveSection[] {
  const catalog = entry.catalogEntry;
  if (!catalog) return [];
  const sources = ARCHIVE_ENTRIES.flatMap((record) => record.citations);
  return [
    ...(catalog.applications ?? []).map((app) => ({
      id: app.href,
      label: app.label,
      title: app.label,
      description: app.description,
      kind: app.role,
      links: [{ label: `Open ${app.label}`, href: app.href }],
    })),
    ...(catalog.subWorks ?? []).map((work) => {
      const association = WORK_SOURCES[work.name];
      const hrefs =
        work.name === "144 Shape Matrix" && catalog.explore
          ? [catalog.explore.href]
          : (association?.hrefs ?? []);
      return {
        id: work.name,
        label: association?.label ?? work.name,
        title: work.name,
        description: work.note,
        kind: "work" as const,
        links: hrefs.flatMap((href) => {
          const source = sources.find((source) => source.href === href);
          return source ? [source] : [];
        }),
      };
    }),
    ...(catalog.videos ?? []).map((video) => ({
      id: video.id,
      label: LESSON_LABELS[video.id] ?? video.title,
      title: video.title,
      kind: "lesson" as const,
      description: `${video.creator}${video.year ? ` · ${video.year}` : ""}${video.note ? `. ${video.note}` : ""}`,
      links: [
        {
          label: "Watch the original lesson",
          href: `https://www.youtube.com/watch?v=${video.id}`,
        },
      ],
    })),
  ];
}

export function archiveReadingSources(entry: ArchiveEntry) {
  const citations = [...entry.citations];
  const known = new Set(citations.map((citation) => citation.href));
  const archive = ARCHIVE_ENTRIES.flatMap((record) => record.citations);
  for (const section of archiveSections(entry)) {
    for (const link of section.links) {
      const citation = archive.find((source) => source.href === link.href);
      if (citation && !known.has(citation.href)) {
        citations.push(citation);
        known.add(citation.href);
      }
    }
  }
  return citations;
}
