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
    // A USER save surface: the user performed a save, so "no explicit choice"
    // means the product default, public.
    //
    // library-sync-retry.ts was removed from this list. It is not a save
    // surface — it is an unattended background pass that re-sends rows a user
    // saved earlier, and it carries each row's RECORDED visibility through
    // unchanged. Public intent recorded by any of the surfaces below still
    // syncs public. Its `?? "private"` applies only to a row that recorded no
    // visibility at all (pre-pendingSyncMetadata legacy), where there is no
    // user intent to default toward and publishing would invent one.
    // Behaviour is pinned by the live tests in
    // tests/unit/library/library-sync-retry-ownership.test.ts rather than by
    // matching source text here.
    const saveSurfaces = [
      "src/lib/features/create/shared/components/StandardWorkspaceLayout.svelte",
      "src/lib/features/create/shared/components/coordinators/VideoRecordCoordinator.svelte",
      "src/lib/features/browse/collections/components/ScanCardSheet.svelte",
      "src/lib/shared/sequence-viewer/state/library-action-handler.svelte.ts",
      "src/lib/features/retro/win95/adapters/notation-adapter.ts",
    ];

    for (const relativePath of saveSurfaces) {
      expect(read(relativePath), relativePath).not.toMatch(
        /visibility(?:\s*:\s*|\s*\?\?\s*)["']private["']/
      );
    }
  });
});
