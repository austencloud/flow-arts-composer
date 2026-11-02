/**
 * The script-tag build: one file that puts the engine on `window` for a page
 * with no bundler (the Poi Mirror demo). The app's design tokens come along,
 * as they do for the native Shape Engine app.
 */
import "../../../src/app.css";
import * as domain from "@tka/shape-domain";
import { letterFor, propsElementFor, realizationFor } from "./bridge.js";
import { mountElementStrip, mountShapeEngine } from "./mount.svelte.js";

const api = {
  mountShapeEngine,
  mountElementStrip,
  propsElementFor,
  letterFor,
  realizationFor,
  domain,
};

declare global {
  interface Window {
    TkaShapeEngine: typeof api;
  }
}

window.TkaShapeEngine = api;
