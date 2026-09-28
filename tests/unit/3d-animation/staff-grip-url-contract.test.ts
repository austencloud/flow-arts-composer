/**
 * The staff-grip lab keeps its whole state in its URL, so every parameter it
 * writes has to survive the root layout, which strips route-scoped parameters
 * from every path that does not own them (url-parameter-policy.ts). A lab
 * parameter that shares a name with one of those loads once and then drops on
 * the next reload: `grid` did exactly that to the grid style.
 */
import { describe, expect, it } from "vitest";

import { pruneRouteScopedParams } from "$lib/shared/navigation/services/url-parameter-policy";

import { LAB_PARAM } from "../../../src/routes/test/staff-grip/lab-state.svelte";

describe("staff-grip lab URL", () => {
  it("keeps every lab parameter through the root layout's pruning", () => {
    const url = new URL("https://localhost:5173/test/staff-grip");
    for (const name of Object.values(LAB_PARAM)) {
      url.searchParams.set(name, "1");
    }
    const written = url.search;

    pruneRouteScopedParams(url, url.pathname);

    expect(url.search).toBe(written);
  });
});
