import type { ArchiveEntry } from "./archive-ledger";

export interface ArchiveArtifactPresentation {
  kind: "original" | "demonstration" | "document";
  label: string;
  note: string;
}

const ARTIFACTS: Record<string, ArchiveArtifactPresentation> = {
  lorq: {
    kind: "original",
    label: "Original publication",
    note: "Lorq Nichols’ complete 144 Shape Matrix, in its 2014 rework. Select the sheet to visit his publication.",
  },
  vtg: {
    kind: "original",
    label: "From the original book",
    note: "Illustrations from Vulcan Tech Gospel V.1. Choose a chapter to see its diagram and authors.",
  },
  caps: {
    kind: "demonstration",
    label: "Interactive explanation",
    note: "Our animation of how smaller movements join into a Continuous Assembly Pattern.",
  },
  trochoid: {
    kind: "demonstration",
    label: "Interactive explanation",
    note: "Our diagrams of the trochoid model.",
  },
  "nine-square": {
    kind: "original",
    label: "From the original lessons",
    note: "Frames from Charlie Cushing’s video series. Choose a lesson to find its original video.",
  },
  qft: {
    kind: "demonstration",
    label: "Interactive explanation",
    note: "Our animation of QFT notation. Read the original primer under Sources.",
  },
  poinotation: {
    kind: "demonstration",
    label: "Notation example",
    note: "An example from PoiNotation’s documentation.",
  },
  tka: {
    kind: "demonstration",
    label: "Notation in motion",
    note: "An example playing in Flow Arts Composer. Sequences and props change automatically.",
  },
};

export function archiveArtifact(
  entry: ArchiveEntry
): ArchiveArtifactPresentation | null {
  if (entry.documents?.length)
    return {
      kind: "document",
      label: "Preserved documents",
      note: "Browse the original diagrams, or open a complete PDF.",
    };
  return ARTIFACTS[entry.id] ?? null;
}

export function entryFromArchiveHash(
  hash: string,
  entries: readonly ArchiveEntry[]
): ArchiveEntry | undefined {
  const prefix = "#archive-record-";
  if (!hash.startsWith(prefix)) return undefined;
  try {
    const id = decodeURIComponent(hash.slice(prefix.length));
    return entries.find((entry) => entry.id === id);
  } catch {
    return undefined;
  }
}

// A date on this timeline can refer to a surviving source, an export, or an
// author's retrospective. It must not become a claim about when a work was created.
export function archiveStructuredWorks(entries: readonly ArchiveEntry[]) {
  return entries.map((entry) => ({
    "@type": "CreativeWork",
    name: entry.title,
    description: entry.summary,
    url: `https://tkaflowarts.com/history#archive-record-${entry.id}`,
  }));
}
