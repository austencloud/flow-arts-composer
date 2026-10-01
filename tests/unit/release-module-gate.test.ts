import { describe, it, expect } from "vitest";
// @ts-expect-error — plain .mjs script module, no type declarations
import {
  parseProductionModules,
  parseGuestModuleAccess,
  parseModuleTabs,
  parseConventional,
  resolveModule,
  resolveSurface,
  resolveAudience,
  matchDenylist,
  classifyCommit,
  gateCommits,
  auditChangelogEntries,
  toPublicChangelog,
  DARK_DENYLIST,
} from "../../scripts/lib/release-module-gate.mjs";

// A miniature stand-in for environment-features.ts, exercising the shapes the
// parser must survive: bare keys, a quoted hyphenated key, trailing comments.
const FIXTURE_SOURCE = `
export const PRODUCTION_MODULES: Record<ModuleId, boolean> = {
  create: true,
  browse: true,
  learn: false, // Unreleased
  mandala: false, // unreleased
  shop: true, // link-out
  settings: true,
  "hand-paths": false, // graduated from Lab
};
`;

const GUEST_ACCESS_SOURCE = `
const GUEST_MODULE_ACCESS: Record<string, string[]> = {
  create: ["assemble", "construct", "generate"],
  browse: ["gallery", "library"],
  settings: ["language"],
};
`;

const TAB_DEFINITIONS_SOURCE = `
export const CREATE_TABS: Section[] = [
  { id: "assemble", label: "Assemble" },
  { id: "construct", label: "Construct" },
  { id: "generate", label: "Generate" },
  { id: "fuse", label: "Fuse" },
];
export const BROWSE_TABS: Section[] = [
  { id: "gallery", label: "Gallery" },
  { id: "library", label: "Library" },
  { id: "collections", label: "Collections" },
];
export const SETTINGS_TABS: Section[] = [
  { id: "language", label: "Language" },
  { id: "profile", label: "Profile" },
];
`;

describe("parseProductionModules", () => {
  it("extracts the boolean map, including quoted/hyphenated keys and comments", () => {
    const map = parseProductionModules(FIXTURE_SOURCE);
    expect(map).toEqual({
      create: true,
      browse: true,
      learn: false,
      mandala: false,
      shop: true,
      settings: true,
      "hand-paths": false,
    });
  });

  it("throws when the map is absent", () => {
    expect(() => parseProductionModules("no map here")).toThrow();
  });
});

describe("parseGuestModuleAccess", () => {
  it("extracts the guest-visible tabs for each module", () => {
    expect(parseGuestModuleAccess(GUEST_ACCESS_SOURCE)).toEqual({
      create: ["assemble", "construct", "generate"],
      browse: ["gallery", "library"],
      settings: ["language"],
    });
  });

  it("throws when the access map is absent", () => {
    expect(() => parseGuestModuleAccess("no access map here")).toThrow();
  });
});

describe("parseModuleTabs", () => {
  it("extracts registered Create, Browse, and Settings tab ids", () => {
    expect(parseModuleTabs(TAB_DEFINITIONS_SOURCE)).toEqual({
      create: ["assemble", "construct", "generate", "fuse"],
      browse: ["gallery", "library", "collections"],
      settings: ["language", "profile"],
    });
  });

  it("throws when a required tab registry is absent", () => {
    expect(() => parseModuleTabs("export const CREATE_TABS = [];")).toThrow();
  });
});

describe("parseConventional", () => {
  it("pulls type + scope", () => {
    expect(parseConventional("feat(play): arcade")).toEqual({
      type: "feat",
      scope: "play",
    });
  });
  it("handles a breaking-change bang and missing scope", () => {
    expect(parseConventional("fix!: drop legacy")).toEqual({
      type: "fix",
      scope: null,
    });
  });
  it("returns nulls for a non-conventional subject", () => {
    expect(parseConventional("random words")).toEqual({
      type: null,
      scope: null,
    });
  });
});

const PM = parseProductionModules(FIXTURE_SOURCE);

describe("resolveModule", () => {
  it("maps a learn-family scope via the alias table", () => {
    expect(resolveModule({ scope: "guide" }, PM)).toBe("learn");
  });
  it("uses a scope that is itself a module id", () => {
    expect(resolveModule({ scope: "mandala" }, PM)).toBe("mandala");
  });
  it("falls back to the feature dir when scope is unknown", () => {
    expect(
      resolveModule(
        { scope: "misc", files: ["src/lib/features/mandala/foo.ts"] },
        PM
      )
    ).toBe("mandala");
  });
  it("aliases the store dir to the shop module", () => {
    expect(
      resolveModule(
        { scope: null, files: ["src/lib/features/store/BuyButton.svelte"] },
        PM
      )
    ).toBe("shop");
  });
  it("returns null for shared/infra with no resolvable module", () => {
    expect(
      resolveModule({ scope: "auth", files: ["src/lib/shared/auth/x.ts"] }, PM)
    ).toBeNull();
  });

  it("maps the Fuse scope and feature directory back to Create", () => {
    expect(
      resolveModule(
        {
          scope: "fuse",
          files: ["src/lib/features/fuse/FuseTab.svelte"],
        },
        PM
      )
    ).toBe("create");
  });

  it("does NOT gate a cross-cutting commit that also edits shared/ (the export-sweep false positive)", () => {
    // `feat(export): Share...` touches mandala + shared export infra that live
    // surfaces use — scope resolves nothing, but the shared/ files mean it's
    // cross-cutting, so it must stay shown.
    expect(
      resolveModule(
        {
          scope: "export",
          files: [
            "src/lib/features/mandala/Export.svelte",
            "src/lib/shared/video-export/save.ts",
          ],
        },
        PM
      )
    ).toBeNull();
  });

  it("does NOT gate when the feature footprint includes a live module", () => {
    expect(
      resolveModule(
        {
          scope: "misc",
          files: [
            "src/lib/features/mandala/a.ts",
            "src/lib/features/browse/b.ts",
          ],
        },
        PM
      )
    ).toBeNull();
  });

  it("still gates a scope-named dark module even when it edits shared/", () => {
    // Scope is authoritative — a mandala-scoped commit is mandala work.
    expect(
      resolveModule(
        {
          scope: "mandala",
          files: ["src/lib/shared/foundation/x.ts"],
        },
        PM
      )
    ).toBe("mandala");
  });
});

describe("resolveSurface", () => {
  it("resolves a tab-specific scope before looking at files", () => {
    expect(
      resolveSurface({
        scope: "fuse",
        files: ["src/lib/features/create/construct/OptionPicker.svelte"],
      })
    ).toEqual({ module: "create", tab: "fuse" });
  });

  it("resolves an unambiguous feature path", () => {
    expect(
      resolveSurface({
        scope: "ui",
        files: ["src/lib/features/create/construct/OptionPicker.svelte"],
      })
    ).toEqual({ module: "create", tab: "construct" });
  });

  it("returns null when paths span more than one tab", () => {
    expect(
      resolveSurface({
        scope: "ui",
        files: [
          "src/lib/features/create/construct/OptionPicker.svelte",
          "src/lib/features/fuse/FuseTab.svelte",
        ],
      })
    ).toBeNull();
  });
});

describe("resolveAudience", () => {
  const guestAccess = parseGuestModuleAccess(GUEST_ACCESS_SOURCE);

  it("distinguishes guest-visible Construct from account-only Fuse", () => {
    expect(
      resolveAudience({ module: "create", tab: "construct" }, PM, guestAccess)
    ).toBe("guest");
    expect(
      resolveAudience({ module: "create", tab: "fuse" }, PM, guestAccess)
    ).toBe("account");
  });

  it("marks a mixed-access module for manual tab review", () => {
    expect(resolveAudience({ module: "create" }, PM, guestAccess)).toBe(
      "mixed"
    );
  });

  it("keeps disabled modules unreleased", () => {
    expect(resolveAudience({ module: "mandala" }, PM, guestAccess)).toBe(
      "unreleased"
    );
  });
});

describe("matchDenylist", () => {
  it("flags the shop LOOP listing by subject", () => {
    const hit = matchDenylist({
      subject: "feat(shop): LOOP deck configurator",
      files: [],
    });
    expect(hit?.label).toMatch(/LOOP/);
  });
  it("flags by path prefix too", () => {
    const hit = matchDenylist({
      subject: "feat(shop): tidy",
      files: ["src/lib/features/store/LoopDeckConfiguratorPage.svelte"],
    });
    expect(hit?.label).toMatch(/LOOP/);
  });
  it("does not flag ordinary shop storefront work", () => {
    expect(
      matchDenylist({ subject: "fix(shop): preorder card rail", files: [] })
    ).toBeNull();
  });
});

describe("classifyCommit", () => {
  const guestModuleAccess = parseGuestModuleAccess(GUEST_ACCESS_SOURCE);
  const ctx = { productionModules: PM, guestModuleAccess };

  it("gates a not-yet-released module (play -> learn)", () => {
    const c = classifyCommit({ subject: "feat(play): arcade hub" }, ctx);
    expect(c.module).toBe("learn");
    expect(c.released).toBe(false);
  });

  it("shows a live module", () => {
    const c = classifyCommit({ subject: "fix(browse): thumbnail" }, ctx);
    expect(c.released).toBe(true);
    expect(c.audience).toBe("mixed");
  });

  it("marks Fuse as released but sign-in required", () => {
    const c = classifyCommit(
      {
        subject: "feat(fuse): rebuild the workspace",
        files: ["src/lib/features/fuse/FuseTab.svelte"],
      },
      ctx
    );
    expect(c.released).toBe(true);
    expect(c.module).toBe("create");
    expect(c.tab).toBe("fuse");
    expect(c.audience).toBe("account");
  });

  it("gates the dark shop LOOP sub-feature even though shop is live", () => {
    const c = classifyCommit(
      { subject: "feat(shop): LOOP board recipes" },
      ctx
    );
    expect(c.released).toBe(false);
    expect(c.darkReason).toMatch(/LOOP/);
  });

  it("leaves shared/infra ungated (null)", () => {
    const c = classifyCommit({ subject: "refactor(export): move type" }, ctx);
    expect(c.module).toBeNull();
    expect(c.released).toBeNull();
  });
});

describe("gateCommits", () => {
  it("splits dark, guest-visible, account-only, and unresolved visibility", () => {
    const commits = [
      { subject: "feat(play): arcade" }, // dark: learn
      { subject: "fix(gallery): x" }, // guest-visible
      { subject: "feat(fuse): rebuild" }, // account-only
      { subject: "feat(shop): LOOP deck" }, // dark: denylist
      { subject: "chore(auth): y" }, // unknown -> shown
    ];
    const { flagged, shown, guestVisible, accountOnly, needsAudienceReview } =
      gateCommits(commits, {
        productionModules: PM,
        guestModuleAccess: parseGuestModuleAccess(GUEST_ACCESS_SOURCE),
      });
    expect(flagged.map((c) => c.subject)).toEqual([
      "feat(play): arcade",
      "feat(shop): LOOP deck",
    ]);
    expect(shown.map((c) => c.subject)).toEqual([
      "fix(gallery): x",
      "feat(fuse): rebuild",
      "chore(auth): y",
    ]);
    expect(guestVisible.map((c) => c.subject)).toEqual(["fix(gallery): x"]);
    expect(accountOnly.map((c) => c.subject)).toEqual(["feat(fuse): rebuild"]);
    expect(needsAudienceReview.map((c) => c.subject)).toEqual([
      "chore(auth): y",
    ]);
  });
});

describe("auditChangelogEntries", () => {
  const ctx = {
    productionModules: PM,
    guestModuleAccess: parseGuestModuleAccess(GUEST_ACCESS_SOURCE),
    moduleTabs: parseModuleTabs(TAB_DEFINITIONS_SOURCE),
  };

  it("accepts guest-visible copy tied to a guest tab", () => {
    const result = auditChangelogEntries(
      [
        {
          category: "improved",
          text: "Sequence-building controls stay available on narrow screens.",
          audience: "guest",
          surface: { module: "create", tab: "construct" },
        },
      ],
      ctx
    );
    expect(result.errors).toEqual([]);
    expect(result.guestCount).toBe(1);
  });

  it("accepts guest language notes using the default tab registry", () => {
    const result = auditChangelogEntries(
      [
        {
          category: "fixed",
          text: "Regional language choices no longer fall back to English.",
          audience: "guest",
          surface: { module: "settings", tab: "language" },
        },
      ],
      ctx
    );
    expect(result.errors).toEqual([]);
    expect(result.guestCount).toBe(1);
  });

  it("accepts account-only copy that says the sign-in requirement", () => {
    const result = auditChangelogEntries(
      [
        {
          category: "improved",
          text: "After signing in, combine two saved sequences in Fuse.",
          audience: "account",
          surface: { module: "create", tab: "fuse" },
        },
      ],
      ctx
    );
    expect(result.errors).toEqual([]);
    expect(result.accountCount).toBe(1);
  });

  it("accepts an account-gated action inside a guest-visible tab", () => {
    const result = auditChangelogEntries(
      [
        {
          category: "added",
          text: "Save generator setups after signing in.",
          audience: "account",
          surface: { module: "create", tab: "generate" },
        },
      ],
      ctx
    );
    expect(result.errors).toEqual([]);
    expect(result.accountCount).toBe(1);
  });

  it("rejects Fuse copy labeled as guest-visible", () => {
    const result = auditChangelogEntries(
      [
        {
          category: "improved",
          text: "Combine two saved sequences in Fuse.",
          audience: "guest",
          surface: { module: "create", tab: "fuse" },
        },
      ],
      ctx
    );
    expect(result.errors.map((issue) => issue.message)).toContain(
      'Entry 1 says audience "guest", but create/fuse is "account"'
    );
  });

  it("rejects account-only copy that hides the restriction", () => {
    const result = auditChangelogEntries(
      [
        {
          category: "added",
          text: "Messages can include a sequence or image.",
          audience: "account",
          surface: "global",
        },
      ],
      ctx
    );
    expect(result.errors.map((issue) => issue.message)).toContain(
      'Entry 1 is account-only but its text does not say "account" or "signed in"'
    );
  });

  it("rejects disabled modules and unknown tabs", () => {
    const result = auditChangelogEntries(
      [
        {
          category: "added",
          text: "Create mandalas.",
          audience: "guest",
          surface: { module: "mandala" },
        },
        {
          category: "fixed",
          text: "The Fuze workspace opens.",
          audience: "account",
          surface: { module: "create", tab: "fuze" },
        },
      ],
      ctx
    );
    expect(result.errors.map((issue) => issue.message)).toContain(
      'Entry 1 names unreleased module "mandala"'
    );
    expect(result.errors.map((issue) => issue.message)).toContain(
      'Entry 2 names unknown create tab "fuze"'
    );
  });

  it("requires a tab for modules with mixed guest access", () => {
    const result = auditChangelogEntries(
      [
        {
          category: "improved",
          text: "Create has a new layout.",
          audience: "guest",
          surface: { module: "create" },
        },
      ],
      ctx
    );
    expect(result.errors.map((issue) => issue.message)).toContain(
      'Entry 1 must name a tab because "create" mixes guest and account-only tabs'
    );
  });
});

describe("toPublicChangelog", () => {
  it("strips private audience and surface metadata", () => {
    expect(
      toPublicChangelog([
        {
          category: "fixed",
          text: "Saved sequences open from your Library.",
          audience: "guest",
          surface: { module: "browse", tab: "library" },
        },
      ])
    ).toEqual([
      {
        category: "fixed",
        text: "Saved sequences open from your Library.",
      },
    ]);
  });
});

describe("DARK_DENYLIST", () => {
  it("ships a shop LOOP entry seeded", () => {
    expect(DARK_DENYLIST.some((r) => /LOOP/.test(r.label))).toBe(true);
  });
});
