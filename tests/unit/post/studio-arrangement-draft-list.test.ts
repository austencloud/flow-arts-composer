import { afterEach, expect, it, vi } from "vitest";
import {
  createEmptyPostProject,
} from "#lib/shared/post-studio-plugin/index.js";
import { createArrangementProject } from "#lib/shared/media-composition/domain/post-arrangement-item.js";
import { validateArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";

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

import {
  listPostProjects,
  rememberPostSequence,
} from "#lib/features/post/services/post-workspace-projects.js";

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

it("summarizes an arrangement project's shown grid and populated cells", async () => {
  const layer = {
    sequence: { id: "seq", steps: [] },
    beatOffset: 0,
    propColors: { left: "#f00", right: "#00f" },
    transformStack: [],
  };
  const cell = (row: number, col: number, layers: (typeof layer)[]) => ({
    id: `cell-${row}-${col}`,
    row,
    col,
    layers,
    beatOffset: 0,
    colSpan: 1,
    rowSpan: 1,
    mediaType: "animation" as const,
  });
  const project = createArrangementProject(
    validateArrangementSnapshot({
      schemaVersion: 2,
      // Two populated cells show; the third sits outside the 2 × 2 grid.
      cells: [
        cell(0, 0, [layer]),
        cell(0, 1, []),
        cell(1, 1, [layer]),
        cell(3, 3, [layer]),
      ],
      gridRows: 2,
      gridCols: 2,
      bpm: 120,
      skipStartPlacement: true,
    }),
    "studio-arrangement:grid",
    5
  );
  localStorage.setItem(
    `tka:post-studio:project:v2:${project.sequenceId}`,
    JSON.stringify(project)
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ records: [] })))
  );

  const listed = await listPostProjects();
  expect(
    listed.projects.find((choice) => choice.sequenceId === project.sequenceId)
      ?.arrangement
  ).toEqual({ rows: 2, cols: 2, sequences: 2 });

  // Opening the project puts it in the recent list, which rebuilds its entry.
  rememberPostSequence({
    id: project.sequenceId,
    name: "Arrangement",
    word: "",
  } as unknown as Parameters<typeof rememberPostSequence>[0]);
  const reopened = await listPostProjects();
  expect(
    reopened.projects.find(
      (choice) => choice.sequenceId === project.sequenceId
    )
  ).toMatchObject({
    hasDraft: true,
    arrangement: { rows: 2, cols: 2, sequences: 2 },
  });
});
