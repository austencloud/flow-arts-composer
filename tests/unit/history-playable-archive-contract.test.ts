import { describe, expect, it } from "vitest";
import { ARCHIVE_ENTRIES } from "../../src/routes/(public)/history/_components/archive/_lib/archive-ledger";
import {
  archiveArtifact,
  archiveStructuredWorks,
  entryFromArchiveHash,
} from "../../src/routes/(public)/history/_components/archive/_lib/archive-presentation";

const entry = (id: string) =>
  ARCHIVE_ENTRIES.find((record) => record.id === id)!;

describe("history entry links", () => {
  it("restores every entry by its shareable URL", () => {
    for (const record of ARCHIVE_ENTRIES) {
      expect(
        entryFromArchiveHash(`#archive-record-${record.id}`, ARCHIVE_ENTRIES)
      ).toBe(record);
    }
  });
  it("accepts encoded IDs without treating unknown or malformed fragments as records", () => {
    expect(entryFromArchiveHash("#archive-record-%74ka", ARCHIVE_ENTRIES)).toBe(
      entry("tka")
    );
    for (const hash of [
      "",
      "#about-this-archive",
      "#archive-record-missing",
      "#archive-record-%E0%A4%A",
    ]) {
      expect(entryFromArchiveHash(hash, ARCHIVE_ENTRIES)).toBeUndefined();
    }
  });
});

describe("history attribution", () => {
  it("distinguishes Lorq's publication and VTG book material from site-made demonstrations", () => {
    expect(archiveArtifact(entry("lorq"))?.kind).toBe("original");
    expect(archiveArtifact(entry("vtg"))?.kind).toBe("original");
    expect(archiveArtifact(entry("nine-square"))?.kind).toBe("original");
    for (const id of ["tka", "qft", "caps", "trochoid"]) {
      expect(archiveArtifact(entry(id))?.kind).toBe("demonstration");
    }
  });
  it("preserves documents without inventing artwork for text-only entries", () => {
    expect(archiveArtifact(entry("quarter-space-tech"))?.kind).toBe("document");
    expect(archiveArtifact(entry("modern-club-swinging"))).toBeNull();
    expect(archiveArtifact(entry("staff-science"))).toBeNull();
  });
  it("keeps TKA, Composer, and Shape Engine in their distinct roles", () => {
    const tka = entry("tka").catalogEntry!;
    expect(tka.explore).toMatchObject({ kind: "explanation", href: "/guide" });
    expect(
      tka.applications?.find((app) => app.role === "product")
    ).toMatchObject({ label: "Flow Arts Composer", href: "/create" });
    expect(tka.applications?.find((app) => app.role === "tool")).toMatchObject({
      label: "Shape Engine",
      href: "/shape-engine",
    });
    expect(entry("lorq").catalogEntry?.explore?.kind).toBe("original");
    expect(entry("lorq").catalogEntry?.applications).toBeUndefined();
  });
  it("does not turn observation dates or PDF export dates into creation dates in search metadata", () => {
    const works = archiveStructuredWorks(ARCHIVE_ENTRIES);
    expect(works).toHaveLength(ARCHIVE_ENTRIES.length);
    for (const work of works) {
      expect(work).not.toHaveProperty("dateCreated");
      expect(work).not.toHaveProperty("datePublished");
      expect(work.url).toMatch(
        /^https:\/\/tkaflowarts.com\/history#archive-record-/
      );
    }
  });
});
