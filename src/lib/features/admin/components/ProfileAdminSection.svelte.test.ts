import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfileAdminSection from "./ProfileAdminSection.svelte";

const mocks = vi.hoisted(() => ({
  getIdToken: vi.fn().mockResolvedValue("token"),
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  auth: { currentUser: { getIdToken: mocks.getIdToken } },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function profile(id: string) {
  return {
    id,
    displayName: `User ${id}`,
    username: id,
    sequenceCount: 0,
    collectionCount: 0,
    followerCount: 0,
    followingCount: 0,
    joinedDate: new Date(),
    isFeatured: false,
    role: "user" as const,
    adminNotes: "",
  };
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ProfileAdminSection privileged transitions", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("ignores a contributor result from the previously rendered user", async () => {
    const oldLookup = deferred<Response>();
    const fetchMock = vi.fn((url: string) =>
      url.includes("/old")
        ? oldLookup.promise
        : Promise.resolve(json({ contributor: { active: false, id: null } }))
    );
    vi.stubGlobal("fetch", fetchMock);
    const screen = render(ProfileAdminSection, {
      userProfile: profile("old"),
      contributorActive: false,
    });
    await screen.rerender({
      userProfile: profile("new"),
      contributorActive: false,
    });
    await expect
      .element(page.getByRole("heading", { name: "Admin Controls" }))
      .toBeVisible();
    oldLookup.resolve(
      json({ contributor: { active: true, id: "old-contributor" } })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect
      .element(page.getByRole("button", { name: "Add as contributor" }))
      .toBeVisible();
  });

  it("queues edits made while an admin-notes save is pending", async () => {
    const firstSave = deferred<Response>();
    const patchBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") {
        return Promise.resolve(
          json({ contributor: { active: false, id: null } })
        );
      }
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      patchBodies.push(body);
      return patchBodies.length === 1
        ? firstSave.promise
        : Promise.resolve(json({ success: true }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(ProfileAdminSection, {
      userProfile: profile("notes"),
      contributorActive: false,
    });
    const notes = page.getByRole("textbox", { name: "Admin notes" });
    await notes.fill("first note");
    notes.element().blur();
    await expect.poll(() => patchBodies.length).toBe(1);
    await notes.fill("second note");
    firstSave.resolve(json({ success: true }));
    await expect.poll(() => patchBodies.length).toBe(2);
    expect(patchBodies).toEqual([
      { action: "profile", adminNotes: "first note" },
      { action: "profile", adminNotes: "second note" },
    ]);
  });

  it("coalesces a newer admin label while the first save is pending", async () => {
    const firstSave = deferred<Response>();
    const secondSave = deferred<Response>();
    const patchBodies: Array<Record<string, unknown>> = [];
    const onUserUpdated = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        if (!init?.method || init.method === "GET") {
          return Promise.resolve(
            json({ contributor: { active: false, id: null } })
          );
        }
        patchBodies.push(JSON.parse(String(init.body)));
        return patchBodies.length === 1
          ? firstSave.promise
          : secondSave.promise;
      })
    );
    const screen = render(ProfileAdminSection, {
      userProfile: profile("label"),
      contributorActive: false,
      onUserUpdated,
    });
    const label = page.getByLabelText("Known As");
    await label.fill("first label");
    label.element().blur();
    await expect.poll(() => patchBodies.length).toBe(1);
    await expect.element(page.getByText("Saving label")).toBeInTheDocument();
    await label.fill("newer label");

    firstSave.resolve(json({ success: true }));
    await expect.poll(() => patchBodies.length).toBe(2);
    expect(onUserUpdated).toHaveBeenLastCalledWith({
      adminLabel: "first label",
    });
    await screen.rerender({
      userProfile: { ...profile("label"), adminLabel: "first label" },
      onUserUpdated,
    });
    await expect.element(label).toHaveValue("newer label");
    secondSave.resolve(json({ success: true }));
    await expect.poll(() => onUserUpdated.mock.calls.length).toBeGreaterThan(1);
    expect(onUserUpdated).toHaveBeenLastCalledWith({
      adminLabel: "newer label",
    });
    expect(patchBodies).toEqual([
      { action: "profile", adminLabel: "first label" },
      { action: "profile", adminLabel: "newer label" },
    ]);
  });

  it("reports the authoritative disabled value returned by the server", async () => {
    const onUserUpdated = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        !init?.method || init.method === "GET"
          ? Promise.resolve(json({ contributor: { active: false, id: null } }))
          : Promise.resolve(json({ success: true, auth: { disabled: false } }))
      )
    );
    render(ProfileAdminSection, {
      userProfile: profile("status"),
      contributorActive: false,
      onUserUpdated,
    });
    await page.getByRole("button", { name: "Disable account" }).click();
    await page.getByRole("button", { name: "Confirm action" }).click();
    await expect.poll(() => onUserUpdated.mock.calls.length).toBe(1);
    expect(onUserUpdated).toHaveBeenCalledWith({ isDisabled: false });
  });

  it("ignores a completed mutation after switching to another user", async () => {
    const oldMutation = deferred<Response>();
    const onUserUpdated = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.includes("/old")
          ? oldMutation.promise
          : Promise.resolve(json({ success: true }))
      )
    );
    const screen = render(ProfileAdminSection, {
      userProfile: profile("old"),
      contributorActive: false,
      onUserUpdated,
    });
    await page.getByRole("button", { name: "Set role to Premium" }).click();

    await screen.rerender({
      userProfile: profile("new"),
      contributorActive: false,
      onUserUpdated,
    });
    oldMutation.resolve(json({ success: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onUserUpdated).not.toHaveBeenCalled();
    await expect
      .element(page.getByRole("heading", { name: "Admin Controls" }))
      .toBeVisible();
  });

  it("exposes the selected role to assistive technology", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: true })));
    render(ProfileAdminSection, {
      userProfile: { ...profile("role"), role: "tester" },
      contributorActive: false,
    });

    await expect
      .element(page.getByRole("button", { name: "Set role to Tester" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(page.getByRole("button", { name: "Set role to User" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("updates only the display name when an administrator renames a user", async () => {
    const onUserUpdated = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: true })));
    render(ProfileAdminSection, {
      userProfile: {
        ...profile("rename"),
        avatar: "https://provider.example/photo.jpg",
      },
      contributorActive: true,
      onUserUpdated,
    });
    await page.getByRole("button", { name: "Edit display name" }).click();
    await page.getByRole("textbox", { name: "Display name" }).fill("Renamed");
    await page.getByRole("button", { name: "Save" }).click();

    await expect.poll(() => onUserUpdated.mock.calls.length).toBe(1);
    expect(onUserUpdated).toHaveBeenCalledWith({ displayName: "Renamed" });
  });
});
