import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectedTunnel } from "#lib/features/tunnel-collection/domain/tunnel-collection-types.js";
import type { PublicArtifactEnvelope } from "#lib/shared/artifact-revisions/domain/public-artifact.js";
import { DEFAULT_CONFIG } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import TunnelLibraryPicker from "./TunnelLibraryPicker.svelte";

const services = vi.hoisted(() => ({
  refreshTunnelPoster: vi.fn(),
  listPublicTunnelDiscovery: vi.fn(),
  hydratePublicTunnelDiscovery: vi.fn(),
}));

vi.mock(
  "#lib/features/tunnel-collection/services/tunnel-poster-refresh.js",
  () => ({ refreshTunnelPoster: services.refreshTunnelPoster })
);

vi.mock(
  "#lib/features/tunnel-collection/services/tunnel-public-discovery.js",
  () => ({
    listPublicTunnelDiscovery: services.listPublicTunnelDiscovery,
    hydratePublicTunnelDiscovery: services.hydratePublicTunnelDiscovery,
  })
);

function tunnel(
  id: string,
  name: string,
  savedAt: number,
  performers = 1
): CollectedTunnel {
  return {
    id,
    name,
    steps: [],
    poster: "data:image/webp;base64,AA",
    createdAt: savedAt - 10,
    currentRevisionCreatedAt: savedAt,
    posterRenderVersion: 1,
    composition: {
      version: 1,
      id,
      name,
      performers: Array.from({ length: performers }, (_, index) => ({
        id: `${id}-performer-${index}`,
        label: `Performer ${index + 1}`,
        source: {
          kind: "independent" as const,
          sequence: {
            id: `${id}-sequence-${index}`,
            name: "A",
            word: "A",
            steps: [],
          },
        },
        timing: { stepOffset: 0, speed: 1 },
      })),
      formation: { ...DEFAULT_CONFIG, fold: 4 },
      createdAt: savedAt - 10,
      updatedAt: savedAt,
    },
    snapshot: {
      version: 2,
      tunnel: {
        config: { ...DEFAULT_CONFIG, fold: 4 },
        gridVisible: false,
        colors: {
          mode: "hands",
          custom: { left: "#2e8bf0", right: "#ed1c24" },
        },
        section: "tunnel",
        presetRecipe: null,
      },
      effects: { activeEffect: "none" },
      effort: "continuous",
      paths: {
        pathShape: "arc",
        motionAwarePaths: false,
        leftPathLines: true,
        rightPathLines: true,
      },
      playback: { bpm: 60, playbackMode: "continuous" },
      props: { leftPropType: "staff", rightPropType: "staff" },
      trailRender: { mode: "off" },
    },
  } as unknown as CollectedTunnel;
}

describe("TunnelLibraryPicker", () => {
  beforeEach(() => {
    services.refreshTunnelPoster.mockReset().mockResolvedValue("refreshed");
    services.listPublicTunnelDiscovery.mockReset().mockResolvedValue([]);
    services.hydratePublicTunnelDiscovery
      .mockReset()
      .mockResolvedValue(undefined);
  });

  it("shows recent tunnels first with truthful authored and rendered counts", () => {
    const older = tunnel("old", "Older weave", 100, 1);
    const newer = tunnel("new", "Newest orbit", 200, 3);
    render(TunnelLibraryPicker, {
      items: [older, newer],
      activeTunnelId: "new",
      onSelect: vi.fn(),
      onOpenPublic: vi.fn(),
      onNew: vi.fn(),
      onManage: vi.fn(),
      onClose: vi.fn(),
    });

    const cards = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".tunnel-card")
    );
    expect(cards[0]?.getAttribute("aria-label")).toMatch(
      /Currently editing Newest orbit; 3 authored performers, 4 rendered instances/i
    );
    expect(cards[1]?.getAttribute("aria-label")).toMatch(
      /Edit Older weave; 1 authored performers, 4 rendered instances/i
    );
  });

  it("filters locally and returns the selected complete artifact", async () => {
    const orbit = tunnel("orbit", "Orbit study", 200);
    const weave = tunnel("weave", "Weave study", 100);
    const onSelect = vi.fn();
    render(TunnelLibraryPicker, {
      items: [orbit, weave],
      onSelect,
      onOpenPublic: vi.fn(),
      onNew: vi.fn(),
      onManage: vi.fn(),
      onClose: vi.fn(),
    });

    await page.getByPlaceholder("Name, prop, or formation").fill("weave");

    await expect
      .element(page.getByRole("button", { name: /Edit Orbit study/i }))
      .not.toBeInTheDocument();
    await page.getByRole("button", { name: /Edit Weave study/i }).click();
    expect(onSelect).toHaveBeenCalledWith(weave);
  });

  it("routes new and Browse management through explicit buttons", async () => {
    const onNew = vi.fn();
    const onManage = vi.fn();
    render(TunnelLibraryPicker, {
      items: [],
      onSelect: vi.fn(),
      onOpenPublic: vi.fn(),
      onNew,
      onManage,
      onClose: vi.fn(),
    });

    await page.getByRole("button", { name: "Start a new tunnel" }).click();
    await page
      .getByRole("button", { name: "Manage tunnels in Browse" })
      .click();
    expect(onNew).toHaveBeenCalledOnce();
    expect(onManage).toHaveBeenCalledOnce();
  });

  it("searches prop and formation metadata and supports explicit sorting", async () => {
    const staff = tunnel("staff", "Zulu", 100);
    const fans = tunnel("fans", "Alpha", 200);
    fans.snapshot.props = {
      leftPropType: "fan",
      rightPropType: "fan",
    } as typeof fans.snapshot.props;
    fans.snapshot.tunnel.config = {
      ...DEFAULT_CONFIG,
      fold: 8,
      mirror: true,
      speedOverrides: {},
    };

    render(TunnelLibraryPicker, {
      items: [staff, fans],
      onSelect: vi.fn(),
      onOpenPublic: vi.fn(),
      onNew: vi.fn(),
      onManage: vi.fn(),
      onClose: vi.fn(),
    });

    await page.getByPlaceholder("Name, prop, or formation").fill("mirror");
    await expect
      .element(page.getByRole("button", { name: /Alpha/i }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: /Zulu/i }))
      .not.toBeInTheDocument();

    await page.getByPlaceholder("Name, prop, or formation").fill("");
    await page.getByLabelText("Sort tunnels").selectOptions("name");
    const cards = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".tunnel-card")
    );
    expect(cards[0]?.getAttribute("aria-label")).toMatch(/Alpha/i);
  });

  it("automatically backfills an old poster without showing a permanent warning", async () => {
    const stale = tunnel("legacy", "Legacy orbit", 100);
    stale.posterRenderVersion = undefined;
    let finish!: (result: string) => void;
    services.refreshTunnelPoster.mockImplementation(
      () => new Promise((resolve) => (finish = resolve))
    );

    render(TunnelLibraryPicker, {
      items: [stale],
      active: true,
      onSelect: vi.fn(),
      onOpenPublic: vi.fn(),
      onNew: vi.fn(),
      onManage: vi.fn(),
      onClose: vi.fn(),
    });

    await vi.waitFor(() =>
      expect(services.refreshTunnelPoster).toHaveBeenCalledWith(stale)
    );
    await expect
      .element(page.getByText("Building a better preview"))
      .toBeInTheDocument();
    expect(document.body.textContent).not.toContain(
      "Saved preview may be outdated"
    );
    finish("refreshed");
  });

  it("discovers public tunnels and opens them through the public handoff", async () => {
    const published = tunnel("public-1", "Community spiral", 300, 2);
    published.snapshot.props = {
      leftPropType: "fan",
      rightPropType: "club",
    } as typeof published.snapshot.props;
    const envelope: PublicArtifactEnvelope = {
      artifactId: "public-1",
      artifactType: "tunnel",
      ownerId: "artist-1",
      ownerDisplayName: "Flow Artist",
      title: "Community spiral",
      posterUrl: "https://example.com/poster.webp",
      currentRevisionId: "v1_" + "a".repeat(64),
      currentContentDigest: "a".repeat(64),
      publishedAt: new Date(200),
      updatedAt: new Date(300),
      schemaVersion: 1,
    };
    services.listPublicTunnelDiscovery.mockResolvedValue([
      { envelope, tunnel: null },
    ]);
    services.hydratePublicTunnelDiscovery.mockImplementation(
      async (
        _entries: unknown[],
        onHydrated: (entry: unknown, index: number) => void
      ) => {
        onHydrated({ envelope, tunnel: published }, 0);
      }
    );
    const onOpenPublic = vi.fn();

    render(TunnelLibraryPicker, {
      items: [],
      active: true,
      onSelect: vi.fn(),
      onOpenPublic,
      onNew: vi.fn(),
      onManage: vi.fn(),
      onClose: vi.fn(),
    });

    await page.getByRole("tab", { name: /Explore public tunnels/i }).click();
    await expect
      .element(
        page.getByRole("button", {
          name: /View public tunnel Community spiral.*Left Fan.*Right Club/i,
        })
      )
      .toBeInTheDocument();
    await page
      .getByRole("button", { name: /View public tunnel Community spiral/i })
      .click();
    expect(onOpenPublic).toHaveBeenCalledWith(envelope);
  });
});
