/**
 * Where the renderer's art comes from. Paths are relative to the package's
 * assets/ folder, written with forward slashes: "images/props/staff.svg".
 */
export interface ArtSource {
  /** Text of the file at this path, or null when it does not exist. */
  read(path: string): Promise<string | null>;
  /** Present on sources that can answer at once, such as the disk. */
  readSync?(path: string): string | null;
}

/** A path this render has not seen yet. */
export const MISSING: unique symbol = Symbol("missing art");

/**
 * The renderer's synchronous view of a source. A disk source answers at once;
 * any other source records what a pass asked for, and `fill` fetches it
 * before the next pass.
 */
export class ArtCache {
  private readonly known = new Map<string, string | null>();
  readonly misses = new Set<string>();

  constructor(private readonly source: ArtSource) {}

  get(path: string): string | null | typeof MISSING {
    if (this.known.has(path)) return this.known.get(path) ?? null;
    if (this.source.readSync) {
      const text = this.source.readSync(path);
      this.known.set(path, text);
      return text;
    }
    this.misses.add(path);
    return MISSING;
  }

  /** Text at a path, treating art not fetched yet the same as absent art. */
  text(path: string): string | null {
    const value = this.get(path);
    return value === MISSING ? null : value;
  }

  async fill(): Promise<void> {
    const paths = [...this.misses];
    this.misses.clear();
    const texts = await Promise.all(paths.map((path) => this.source.read(path)));
    paths.forEach((path, i) => this.known.set(path, texts[i] ?? null));
  }
}

const caches = new WeakMap<ArtSource, ArtCache>();

/** One cache per source, so art fetched once stays fetched across renders. */
export function cacheFor(source: ArtSource): ArtCache {
  let cache = caches.get(source);
  if (!cache) {
    cache = new ArtCache(source);
    caches.set(source, cache);
  }
  return cache;
}

/** Reads art from a folder on disk. Node only. */
export async function fsArtSource(root: string): Promise<ArtSource> {
  const fs = await import("node:fs");
  const base = root.replace(/[\\/]+$/, "");
  const readSync = (path: string): string | null => {
    try {
      return fs.readFileSync(`${base}/${path}`, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  return { readSync, read: async (path) => readSync(path) };
}

/** Fetches art from a base URL. A 404 is absent art; any other failure throws. */
export function urlArtSource(base: string | URL): ArtSource {
  const root = new URL(base);
  if (!root.pathname.endsWith("/")) root.pathname += "/";
  return {
    async read(path) {
      const url = new URL(path.split("/").map(encodeURIComponent).join("/"), root);
      const response = await fetch(url);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Pictograph art ${path}: HTTP ${response.status}`);
      return response.text();
    },
  };
}

let defaultSource: ArtSource | null = null;

/** The art that ships inside this package, served by the consuming app's bundler. */
export function defaultArtSource(): ArtSource {
  defaultSource ??= urlArtSource(new URL("../assets/", import.meta.url));
  return defaultSource;
}
