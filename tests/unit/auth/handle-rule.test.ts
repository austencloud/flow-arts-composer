import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateUsernameFormat } from "#lib/shared/auth/domain/models/username-validation.js";
import {
  HANDLE_PATTERN,
  RESERVED_HANDLES,
  handleBaseFromName,
  handleCandidates,
  isPlaceholderHandle,
} from "#lib/shared/auth/domain/models/handle-rule.js";
import * as server from "../../../firebase-functions/src/profiles/handleFromName";

const NAMES: Array<[string, string | null]> = [
  ["Jane Doe", "jane.doe"],
  ["  Mary-Jane   O'Neil ", "mary.jane.oneil"],
  ["Renée Müller", "renee.muller"],
  ["Łukasz Straße", "lukasz.strasse"],
  ["J.R. Smith", "j.r.smith"],
  ["__cool__dude__", "cool_dude"],
  ["李明", null],
  ["Анна", null],
  ["Al", null],
  ["🔥", null],
  ["jane@example.com", null],
  ["Admin", null],
  ["", null],
];

describe("handleBaseFromName", () => {
  it.each(NAMES)("%s gives %s", (name, expected) => {
    expect(handleBaseFromName(name)).toBe(expected);
  });

  it("gives nothing for a missing name", () => {
    expect(handleBaseFromName(null)).toBeNull();
    expect(handleBaseFromName(undefined)).toBeNull();
  });

  it("cuts a long name to the limit without a trailing separator", () => {
    const base = handleBaseFromName(`${"a".repeat(29)} bbbb`);
    expect(base).toBe("a".repeat(29));
    expect(base).toMatch(HANDLE_PATTERN);
  });
});

describe("handleCandidates", () => {
  it("tries the bare name first, then numbered ones", () => {
    const [first, second] = handleCandidates("Jane Doe", () => 0);
    expect(first).toBe("jane.doe");
    expect(second).toBe("jane.doe10");
  });

  it("gives a nameless account creator and four digits, never bare", () => {
    const candidates = handleCandidates(null, () => 0.5);
    expect(candidates[0]).toBe("creator5500");
    expect(candidates).not.toContain("creator");
    expect(isPlaceholderHandle(candidates[0])).toBe(true);
  });

  it("uses the same fallback for a name in another script", () => {
    expect(handleCandidates("李明")[0]).toMatch(/^creator\d{4}$/);
  });

  it("every candidate is a valid handle, including at the length limit", () => {
    const long = "x".repeat(40);
    for (const name of [long, "Jane Doe", "", `${"y".repeat(28)}.z`]) {
      for (const candidate of handleCandidates(name)) {
        expect(candidate).toMatch(HANDLE_PATTERN);
      }
    }
  });

  it("a name that fits but ends at a separator after cutting stays valid", () => {
    const candidates = handleCandidates(`${"a".repeat(27)}.bbbbbb`, () => 0);
    // Cut to 28 leaves a dangling dot, which goes before the digits are added.
    expect(candidates[1]).toBe(`${"a".repeat(27)}10`);
    expect(candidates[1]).toMatch(HANDLE_PATTERN);
  });
});

describe("isPlaceholderHandle", () => {
  it("knows only the exact placeholder shape", () => {
    expect(isPlaceholderHandle("creator1234")).toBe(true);
    expect(isPlaceholderHandle("creator")).toBe(false);
    expect(isPlaceholderHandle("creator12345")).toBe(false);
    expect(isPlaceholderHandle("jane")).toBe(false);
    expect(isPlaceholderHandle(undefined)).toBe(false);
  });
});

describe("the server's copy of the rule", () => {
  it.each(NAMES)("agrees on %s", (name, expected) => {
    expect(server.handleBaseFromName(name)).toBe(expected);
  });

  it("holds the same reserved list", () => {
    expect([...server.RESERVED_HANDLES].sort()).toEqual(
      [...RESERVED_HANDLES].sort()
    );
  });

  it("makes the same candidates from the same dice", () => {
    const dice = () => 0.25;
    const stripTime = (list: string[]) => list.slice(0, -1);
    for (const name of ["Jane Doe", "李明", "x".repeat(40)]) {
      expect(stripTime(server.handleCandidates(name, dice))).toEqual(
        stripTime(handleCandidates(name, dice))
      );
    }
  });
});

describe("the Firestore rules' copy of the reserved handles", () => {
  it("lists exactly RESERVED_HANDLES", () => {
    const rules = readFileSync(
      resolve(__dirname, "../../../firestore.rules"),
      "utf8"
    );
    const body = rules.match(
      /function isReservedHandle\(handle\)\s*\{\s*return handle in \[([\s\S]*?)\];/
    );
    expect(body, "isReservedHandle not found in firestore.rules").not.toBeNull();
    const listed = [...body![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...listed].sort()).toEqual([...RESERVED_HANDLES].sort());
  });
});

describe("validateUsernameFormat matches the rules' handle shape", () => {
  it.each([
    ["jane.doe", true],
    ["jane__doe", true],
    ["jane..doe", false],
    ["jane___doe", false],
    [".jane", false],
    ["jane_", false],
    ["admin", false],
  ])("%s valid: %s", (handle, valid) => {
    expect(validateUsernameFormat(handle).isValid).toBe(valid);
  });
});
