import { afterEach, expect, it, vi } from "vitest";
import { createEmptyPostProject } from "#lib/shared/media-composition/domain/post-project.js";

const account = vi.hoisted(() => ({ uid: "account-a" }));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  auth: {
    currentUser: {
      get uid() {
        return account.uid;
      },
      isAnonymous: false,
    },
  },
}));
vi.mock(
  "#lib/shared/sequence-viewer/services/sequence-data-provider.js",
  () => ({
    loadByIdentifier: vi.fn().mockResolvedValue(null),
  })
);

import { listPostProjects } from "#lib/features/post/services/post-workspace-projects.js";

afterEach(() => {
  account.uid = "account-a";
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("lists only this account's Studio archive without hiding ordinary legacy posts", async () => {
  localStorage.setItem("tka:post-studio:legacy-owner:v1", "account-a");
  const studio = createEmptyPostProject({
    sequenceId: "studio-arrangement:same",
    now: 4,
  });
  const ordinary = createEmptyPostProject({ sequenceId: "ordinary", now: 7 });
  const records = [
    {
      key: `tka:post-studio:project:v2:account:account-a:${studio.sequenceId}`,
      value: JSON.stringify(studio),
    },
    {
      key: `tka:post-studio:project:v2:account:account-b:${studio.sequenceId}`,
      value: JSON.stringify({ ...studio, updatedAt: 99 }),
    },
    {
      key: `tka:post-studio:project:v2:${studio.sequenceId}`,
      value: JSON.stringify({ ...studio, updatedAt: 100 }),
    },
    {
      key: `tka:post-studio:project:v2:${ordinary.sequenceId}`,
      value: JSON.stringify(ordinary),
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records }) })
  );

  const listed = await listPostProjects();
  expect(listed.projects).toEqual([
    expect.objectContaining({ sequenceId: "ordinary", updatedAt: 7 }),
    expect.objectContaining({ sequenceId: studio.sequenceId, updatedAt: 4 }),
  ]);
  account.uid = "account-b";
  const other = await listPostProjects();
  expect(
    other.projects.find((project) => project.sequenceId === studio.sequenceId)
      ?.updatedAt
  ).toBe(99);
});

it("shows an unclaimed guest Studio draft so the first account can claim it", async () => {
  const studio = createEmptyPostProject({
    sequenceId: "studio-arrangement:guest",
    now: 8,
  });
  localStorage.setItem(
    `tka:post-studio:project:v2:${studio.sequenceId}`,
    JSON.stringify(studio)
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ records: [] })))
  );

  const listed = await listPostProjects();
  expect(listed.projects).toContainEqual(
    expect.objectContaining({ sequenceId: studio.sequenceId })
  );
});
