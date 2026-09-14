import type { ShapeMatrixAppPersistence } from "$lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte";
import { setCurrentPropType } from "./native-settings.svelte";
import {
  readShapeMatrixRouteState,
  writeShapeMatrixRouteState,
} from "../../../src/routes/(public)/shape-engine/_state/shape-matrix-url";

export const SHAPE_ENGINE_WEB_URL = "https://tkaflowarts.com/shape-engine";
const STORAGE_KEY = "shape-engine.view.v1";

export const persistence: ShapeMatrixAppPersistence = {
  restore() {
    try {
      const query = window.location.search || localStorage.getItem(STORAGE_KEY);
      return query ? readShapeMatrixRouteState(query) : null;
    } catch {
      return null;
    }
  },
  persist(snapshot) {
    void setCurrentPropType(snapshot.propType);
    const url = new URL(SHAPE_ENGINE_WEB_URL);
    writeShapeMatrixRouteState(url, snapshot);
    try {
      localStorage.setItem(STORAGE_KEY, url.search);
    } catch {
      // A full device should still allow exploring; only restoration is lost.
    }
  },
  link(snapshot) {
    const url = new URL(SHAPE_ENGINE_WEB_URL);
    writeShapeMatrixRouteState(url, snapshot);
    return url.href;
  },
};
