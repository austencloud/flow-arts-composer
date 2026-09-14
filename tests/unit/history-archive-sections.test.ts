import { describe, expect, it } from "vitest";
import { ARCHIVE_ENTRIES } from "../../src/routes/(public)/history/_components/archive/_lib/archive-ledger";
import {
  archiveReadingSources,
  archiveSections,
} from "../../src/routes/(public)/history/_components/archive/_lib/archive-sections";

const entry = (id: string) =>
  ARCHIVE_ENTRIES.find((record) => record.id === id)!;

describe("archive reading sections", () => {
  it("preserves every work, application and lesson with its complete account and a destination", () => {
    for (const record of ARCHIVE_ENTRIES) {
      const catalog = record.catalogEntry;
      const sections = archiveSections(record);
      expect(sections).toHaveLength(
        (catalog?.subWorks?.length ?? 0) +
          (catalog?.applications?.length ?? 0) +
          (catalog?.videos?.length ?? 0)
      );
      expect(new Set(sections.map((section) => section.id)).size).toBe(
        sections.length
      );
      for (const section of sections)
        expect(section.links.length).toBeGreaterThan(0);
      for (const work of catalog?.subWorks ?? []) {
        expect(
          sections.find((section) => section.title === work.name)?.description
        ).toBe(work.note);
      }
    }
  });

  it("keeps each VTG release connected to its own sources", () => {
    const sections = archiveSections(entry("vtg"));
    const grid = sections.find((section) => section.label === "VTG 3 · grid")!;
    const apps = sections.find((section) => section.label === "VTG 3 · apps")!;
    const v4 = sections.find(
      (section) => section.label === "VTG 4 / SpiroAnim"
    )!;
    expect(
      grid.links.some((link) => link.href.includes("drive.google.com"))
    ).toBe(true);
    expect(apps.links.map((link) => link.href)).toContain(
      "https://vtg-v3.web.app/"
    );
    expect(v4.links.map((link) => link.href)).toContain(
      "https://www.instagram.com/vulcantechgospel/p/DcoQATwFrUA/"
    );
    expect(
      v4.links.some((link) => link.href.includes("17953419501233426"))
    ).toBe(true);
    expect(
      v4.links.some((link) => apps.links.some((app) => app.href === link.href))
    ).toBe(false);
  });

  it("retains all citations and includes shared publications once", () => {
    for (const record of ARCHIVE_ENTRIES) {
      const sources = archiveReadingSources(record);
      for (const citation of record.citations)
        expect(sources).toContainEqual(citation);
      expect(new Set(sources.map((source) => source.href)).size).toBe(
        sources.length
      );
    }
    expect(
      archiveReadingSources(entry("vtg")).some(
        (source) => source.href === "https://sirlorq.wordpress.com/tech-tiles/"
      )
    ).toBe(true);
  });

  it("leads with Composer and preserves the distinction between Austen's tool and Lorq's original", () => {
    expect(archiveSections(entry("tka"))[0]).toMatchObject({
      title: "Flow Arts Composer",
      kind: "product",
    });
    expect(archiveSections(entry("tka"))[1]).toMatchObject({
      title: "Shape Engine",
      kind: "tool",
    });
    expect(
      archiveSections(entry("lorq"))
        .flatMap((section) => section.links)
        .some((link) => link.href === "/shape-engine")
    ).toBe(false);
  });
});
