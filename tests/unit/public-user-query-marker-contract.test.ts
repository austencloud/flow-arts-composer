import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const occurrences = (text: string): number =>
  text.match(/publicProfileVersion/g)?.length ?? 0;

describe("public user query migration marker", () => {
  it("constrains every known browser-side top-level users list", () => {
    expect(
      occurrences(
        source("src/lib/shared/community/services/user-repository.ts")
      )
    ).toBe(8);
    expect(
      occurrences(
        source("src/lib/shared/user-search/services/user-searcher.ts")
      )
    ).toBe(2);
    expect(
      occurrences(
        source("src/lib/shared/debug/state/test-preview-state.svelte.ts")
      )
    ).toBe(1);
  });

  it("routes community setup owners through the constrained profile lookup", () => {
    // Setups no longer list users themselves; getVisibleOwnerProfiles carries
    // the publicProfileVersion constraint (counted in user-repository above).
    const setups = source(
      "src/lib/features/create/generate/services/favorite-config-repository.ts"
    );
    expect(setups).toContain("getVisibleOwnerProfiles(");
    expect(setups).not.toMatch(/collection\([^)]*["']users["']/);
    expect(setups).not.toMatch(/USERS_COLLECTION/);
  });

  it("stamps the marker only in the two browser profile creation paths", () => {
    // user-document-manager writes it on create, and re-stamps an existing doc
    // whose version disagrees with its account kind (a guest upgrading to 2, an
    // old guest doc moving to 0): the re-stamp write plus the read it compares
    // against. The create payload lives in public-profile-payload.ts so the
    // rules tests write the same object.
    expect(
      occurrences(
        source("src/lib/shared/auth/services/user-document-manager.ts")
      )
    ).toBe(2);
    expect(
      occurrences(source("src/lib/shared/auth/domain/public-profile-payload.ts"))
    ).toBe(1);
    expect(
      occurrences(
        source("src/lib/shared/library/services/library-repository.ts")
      )
    ).toBe(1);
  });
});
