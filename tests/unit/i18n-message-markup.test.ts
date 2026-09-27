import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { toMessageSegments } from "../../src/lib/shared/i18n/message-markup";

const plain = (text: string) => ({
  kind: "text",
  text,
  strong: false,
  em: false,
});

describe("translated message markup", () => {
  it("turns strong, em, and line-break tags into styled segments", () => {
    expect(
      toMessageSegments(
        "One.<br>Two,<br/>three:<br /><strong><em>both</em> bold</strong> <em>italic</em>."
      )
    ).toEqual([
      plain("One."),
      { kind: "break" },
      plain("Two,"),
      { kind: "break" },
      plain("three:"),
      { kind: "break" },
      { kind: "text", text: "both", strong: true, em: true },
      { kind: "text", text: " bold", strong: true, em: false },
      plain(" "),
      { kind: "text", text: "italic", strong: false, em: true },
      plain("."),
    ]);
  });

  it("shows anything that is not an allowed tag as ordinary text", () => {
    const message =
      '<b>b</b> <em class="x">x <script>alert(1)</script> 1 < 2 <Strong>';
    expect(toMessageSegments(message)).toEqual([plain(message)]);
  });

  it("ignores a stray closing tag instead of inverting later emphasis", () => {
    expect(toMessageSegments("a</strong> b <strong>c</strong>")).toEqual([
      plain("a"),
      plain(" b "),
      { kind: "text", text: "c", strong: true, em: false },
    ]);
  });

  // A translation that drops or adds emphasis still reads fine, so nobody
  // notices. Every locale that translates a key must carry English's tags.
  it("keeps each translation's emphasis and line breaks in step with English", () => {
    const messagesDir = resolve(process.cwd(), "messages");
    const readLocale = (file: string) =>
      JSON.parse(readFileSync(resolve(messagesDir, file), "utf8")) as Record<
        string,
        string
      >;
    const tagsOf = (message: string) =>
      (message.match(/<\/?(?:strong|em)>|<br\s*\/?>/g) ?? [])
        .map((tag) => (tag.startsWith("<br") ? "<br>" : tag))
        .sort();

    const english = readLocale("en.json");
    const mismatches: string[] = [];
    for (const file of readdirSync(messagesDir).filter((name) =>
      name.endsWith(".json")
    )) {
      const locale = readLocale(file);
      for (const [key, message] of Object.entries(locale)) {
        const englishTags = tagsOf(english[key] ?? "");
        const localeTags = tagsOf(message);
        if (englishTags.length === 0 && localeTags.length === 0) continue;
        if (localeTags.join() !== englishTags.join()) {
          mismatches.push(`${file} ${key}`);
          continue;
        }
        let strongDepth = 0;
        let emDepth = 0;
        for (const tag of message.match(/<\/?(?:strong|em)>/g) ?? []) {
          const step = tag.startsWith("</") ? -1 : 1;
          if (tag.includes("strong")) strongDepth += step;
          else emDepth += step;
          if (strongDepth < 0 || emDepth < 0) break;
        }
        if (strongDepth !== 0 || emDepth !== 0) {
          mismatches.push(`${file} ${key} (unbalanced)`);
        }
      }
    }

    expect(mismatches).toEqual([]);
  });
});
