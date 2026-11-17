import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetClientNavigation,
  hasNavigatedBetweenPages,
  noteClientNavigation,
} from "../client-navigation";

describe("client navigation record", () => {
  beforeEach(() => _resetClientNavigation());

  it("starts false: the first page of a visit was not reached in the app", () => {
    expect(hasNavigatedBetweenPages()).toBe(false);
  });

  // The root layout's own query cleanup and shallow writes stay on one page.
  it("ignores a navigation that stays on the same page", () => {
    noteClientNavigation("/sequence/ABC", "/sequence/ABC");
    noteClientNavigation(null, "/sequence/ABC");
    expect(hasNavigatedBetweenPages()).toBe(false);
  });

  it("records a move between pages", () => {
    noteClientNavigation("/browse/gallery", "/sequence/ABC");
    expect(hasNavigatedBetweenPages()).toBe(true);
  });
});
