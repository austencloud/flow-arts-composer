/**
 * The course switches lessons with shallow routing, which moves the address
 * bar and page.state but leaves page.url on the last real navigation. A head
 * that reads page.url keeps the previous lesson's title and canonical after
 * an in-app switch, and nothing on screen shows it.
 */
import { flushSync } from "svelte";
import { render } from "vitest-browser-svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "./__test-stubs__/CoursePageState.svelte";
import { getAvailableConcepts } from "../domain/concept-experience-registry";
import { buildConceptPath } from "../domain/concept-routes";
import { LANDING_DOMAIN } from "../../../../config/domains";

vi.mock("$app/env", () => ({
  browser: true,
  building: false,
  dev: false,
  version: "test",
}));

vi.mock("$app/state", () => import("./__test-stubs__/CoursePageState.svelte"));

vi.mock("../LearnTab.svelte", async () => ({
  default: (await import("./__test-stubs__/LearnTabStub.svelte")).default,
}));

import PublicConceptCourse from "./PublicConceptCourse.svelte";

const [firstLesson, secondLesson] = getAvailableConcepts();
const firstPath = buildConceptPath(firstLesson!.id);
const secondPath = buildConceptPath(secondLesson!.id);
let testRunnerHref = "";

function canonicalHref() {
  return document.head
    .querySelector('link[rel="canonical"]')
    ?.getAttribute("href");
}

function ogUrl() {
  return document.head
    .querySelector('meta[property="og:url"]')
    ?.getAttribute("content");
}

// What SvelteKit's shallow pushState does: the address bar moves, page.state
// is reassigned, and page.url keeps the last real navigation's URL.
function shallowPush(pathname: string) {
  history.pushState(history.state, "", pathname);
  page.state = {};
  flushSync();
}

// What SvelteKit's popstate handler does for a shallow history entry.
async function shallowBack() {
  const popped = new Promise((resolve) =>
    addEventListener("popstate", resolve, { once: true })
  );
  history.back();
  await popped;
  page.state = {};
  page.url = new URL(page.url.href);
  flushSync();
}

beforeEach(() => {
  testRunnerHref = location.href;
  history.replaceState(history.state, "", firstPath);
  page.url = new URL(firstPath, location.origin);
  page.state = {};
});

afterEach(() => {
  history.replaceState(history.state, "", testRunnerHref);
});

describe("PublicConceptCourse head", () => {
  it("follows an in-app lesson switch and Back", async () => {
    render(PublicConceptCourse);
    const firstTitle = document.title;
    expect(canonicalHref()).toBe(`${LANDING_DOMAIN}${firstPath}`);
    expect(firstTitle).toContain(firstLesson!.name);

    shallowPush(secondPath);
    expect(page.url.pathname).toBe(firstPath);
    expect(canonicalHref()).toBe(`${LANDING_DOMAIN}${secondPath}`);
    expect(ogUrl()).toBe(`${LANDING_DOMAIN}${secondPath}`);
    expect(document.title).toContain(secondLesson!.name);

    await shallowBack();
    expect(location.pathname).toBe(firstPath);
    expect(canonicalHref()).toBe(`${LANDING_DOMAIN}${firstPath}`);
    expect(document.title).toBe(firstTitle);
  });
});
