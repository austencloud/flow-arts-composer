/**
 * Loads each world's scene module and reports a rejected download as that
 * world's failure.
 *
 * Without this, a scene chunk that failed to download (offline, a stale deploy)
 * left the incoming world preparing forever: nothing ever told the handoff, so
 * the picker tile spun with the old world still on screen.
 *
 * The browser caches a failed module specifier (whatwg/html#6768), so asking
 * for the same `import()` again returns the cached rejection without touching
 * the network. The loader remembers the URL that failed for each world and the
 * next request re-fetches it with a fresh query, which is how a second tap
 * after the network returns actually loads the scene.
 */
export interface EnvironmentModuleLoader<Key> {
  load<T>(
    key: Key,
    importer: () => Promise<T>,
    isStillWanted: () => boolean
  ): Promise<T>;
}

export function createEnvironmentModuleLoader<Key>(
  reportFailed: (message: string) => void,
  importUrl: (url: string) => Promise<unknown> = (url) =>
    import(/* @vite-ignore */ url)
): EnvironmentModuleLoader<Key> {
  const failedUrls = new Map<Key, string>();

  return {
    async load(key, importer, isStillWanted) {
      const failedUrl = failedUrls.get(key);
      try {
        const module =
          failedUrl === undefined
            ? await importer()
            : ((await importUrl(cacheBusted(failedUrl))) as Awaited<
                ReturnType<typeof importer>
              >);
        failedUrls.delete(key);
        return module;
      } catch (error) {
        // Keep the first URL that failed: a retry error names the cache-busted
        // one, and busting that again would stack queries.
        const url = failedUrl ?? failedModuleUrl(error);
        if (url !== undefined) failedUrls.set(key, url);
        // A world the viewer already moved on from must not mark its
        // replacement failed.
        if (isStillWanted()) {
          reportFailed("This scene couldn't load. Try again.");
        }
        throw error;
      }
    },
  };
}

/** The module URL in Chrome's and Firefox's dynamic-import rejection message. */
export function failedModuleUrl(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);
  return message.match(/(https?:\/\/[^\s)]+)/)?.[1];
}

function cacheBusted(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}t=${Date.now()}`;
}
