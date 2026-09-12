import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("public collection live propagation contract", () => {
  it("keeps the community collection state on a Firestore subscription", () => {
    const source = read(
      "src/lib/features/browse/collections/state/community-collections-state.svelte.ts"
    );

    expect(source).toContain("subscribeToAllPublicCollections");
    expect(source).not.toContain("getAllPublicCollections");
  });

  it("keeps foreign collection detail on a live document subscription", () => {
    const source = read(
      "src/lib/features/browse/collections/components/CollectionDetailView.svelte"
    );

    expect(source).toContain("subscribeToPublicCollection");
    expect(source).not.toContain("getUserPublicCollections");
  });

  it("offers every public collection in the Choreo community picker", () => {
    const source = read(
      "src/lib/features/library/components/collection-picker/CollectionChipsRow.svelte"
    );

    expect(source).toContain("communityCollectionsState.items");
    expect(source).not.toContain("followedCollectionsState.items");
  });
});

describe("collection-to-print contract", () => {
  it("bulk-adds a selected collection to Choreo", () => {
    const source = read(
      "src/lib/features/write/components/sheet/SheetBrowserDock.svelte"
    );

    expect(source).toContain("onAddCollection");
    expect(source).toContain("getCollectionSequences(collectionId)");
    expect(source).toContain("getUserCollectionSequences(");
  });

  it("renders exported sheet cells in light mode", () => {
    const source = read(
      "src/lib/features/write/services/sheet-pdf-exporter.ts"
    );

    expect(source).toContain('themeMode: "light"');
  });
});

describe("public-by-default save contract", () => {
  it("does not override sequence saves to private in user save surfaces", () => {
    const saveSurfaces = [
      "src/lib/features/create/shared/components/StandardWorkspaceLayout.svelte",
      "src/lib/features/create/shared/components/coordinators/VideoRecordCoordinator.svelte",
      "src/lib/features/browse/collections/components/ScanCardSheet.svelte",
      "src/lib/shared/sequence-viewer/state/library-action-handler.svelte.ts",
      "src/lib/features/retro/win95/adapters/notation-adapter.ts",
      "src/lib/features/library/services/library-sync-retry.ts",
    ];

    for (const relativePath of saveSurfaces) {
      expect(read(relativePath), relativePath).not.toMatch(
        /visibility(?:\s*:\s*|\s*\?\?\s*)["']private["']/
      );
    }
  });
});
