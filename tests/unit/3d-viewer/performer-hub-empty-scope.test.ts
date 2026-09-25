import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePerformerHubEmptyScope } from "$lib/shared/3d/components/controls/performer-hub-empty-scope";
import type { PerformerHubTab } from "$lib/shared/3d/components/controls/performer-hub-types";

const hubSource = readFileSync(
  resolve("src/lib/shared/3d/components/controls/PerformerHubDetail.svelte"),
  "utf8"
);
const headerSource = readFileSync(
  resolve(
    "src/lib/shared/3d/components/controls/PerformerIdentityHeader.svelte"
  ),
  "utf8"
);
const planesSource = readFileSync(
  resolve("src/lib/shared/3d/components/PlanesPopover.svelte"),
  "utf8"
);

const TABS: PerformerHubTab[] = [
  "character",
  "sequence",
  "prop",
  "planes",
  "effort",
  "effects",
];

describe("performer hub with no performers selected", () => {
  it("says nothing while any performer is selected", () => {
    for (const tab of TABS) {
      expect(resolvePerformerHubEmptyScope(tab, 1)).toBeNull();
      expect(resolvePerformerHubEmptyScope(tab, 3)).toBeNull();
    }
  });

  it("locks the prop picker and explains why", () => {
    expect(resolvePerformerHubEmptyScope("prop", 0)).toEqual({
      message: "Pick a performer to change props",
      locksTab: true,
    });
  });

  it("locks every tab whose controls only write to selected performers", () => {
    for (const tab of ["character", "sequence", "prop", "effort"] as const) {
      expect(resolvePerformerHubEmptyScope(tab, 0)?.locksTab).toBe(true);
    }
  });

  it("keeps scene-wide controls live on Planes and Effects", () => {
    expect(resolvePerformerHubEmptyScope("planes", 0)?.locksTab).toBe(false);
    expect(resolvePerformerHubEmptyScope("effects", 0)?.locksTab).toBe(false);
  });

  it("gives every tab a one-line header hint without em dashes", () => {
    for (const tab of TABS) {
      const message = resolvePerformerHubEmptyScope(tab, 0)?.message ?? "";
      expect(message.length).toBeGreaterThan(0);
      // The hint shares the header row with the Select all button.
      expect(message.length).toBeLessThanOrEqual(36);
      expect(message).not.toContain("—");
    }
  });

  it("makes a locked tab inert so no pick is silently dropped", () => {
    expect(hubSource).toContain(
      "resolvePerformerHubEmptyScope(activeTab, selectedPerformers.length)"
    );
    expect(hubSource).toContain("inert={emptyScope?.locksTab ?? false}");
  });

  it("states the empty selection in the header, not a second card", () => {
    expect(hubSource).toContain("emptyHint={emptyScope?.message ?? null}");
    expect(hubSource).toContain("onSelectAll={selectAllFromEmptyScope}");
    expect(hubSource).not.toContain('class="empty-scope"');
    expect(headerSource).toContain("{:else if selectedCount === 0}");
    expect(headerSource).toContain("No performers selected");
    expect(headerSource).toContain('role="status">{emptyHint}');
  });

  it("disables hand-plane chips when the scope is empty", () => {
    expect(planesSource).toContain(
      "const noScope = $derived(scopedPerformers.length === 0);"
    );
    expect(planesSource.match(/disabled=\{noScope\}/g)).toHaveLength(2);
  });
});
