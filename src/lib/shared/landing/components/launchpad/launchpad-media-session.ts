/**
 * Which launchpad tiles' media modules have already loaded this page session.
 *
 * A return flight captures the homepage as soon as it is built, so a tile whose
 * module is cached mounts it in the first render instead of waiting its turn in
 * the grid's idle queue. Filled only from a client import, so it stays empty on
 * the server and on a first visit. Keyed by variant because the two grids could
 * reuse a tile id for different media.
 */
import type { Component } from "svelte";

const loaded = new Map<string, Component<any>>();

function keyFor(variant: string, tileId: string): string {
  return `${variant}:${tileId}`;
}

export function rememberTileMedia(
  variant: string,
  tileId: string,
  media: Component<any>
): void {
  loaded.set(keyFor(variant, tileId), media);
}

export function loadedTileMedia(
  variant: string,
  tileId: string
): Component<any> | null {
  return loaded.get(keyFor(variant, tileId)) ?? null;
}
