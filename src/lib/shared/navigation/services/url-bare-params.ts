/**
 * Keeps bare address flags bare.
 *
 * Some addresses carry a flag with no value, such as `?mandala` for the By
 * mandala wall. `URLSearchParams` writes every pair back as `key=value`, so a
 * writer that sets or deletes any other parameter turns `?mandala` into
 * `?mandala=`. Both read back the same, but the address should stay as it was
 * written. A key that is bare in the current address and still empty in the
 * destination is written bare again; everything else is left alone.
 */

function decodeKey(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

function bareKeys(search: string): Set<string> {
  const keys = new Set<string>();
  for (const pair of search.replace(/^\?/, "").split("&")) {
    if (pair && !pair.includes("=")) keys.add(decodeKey(pair));
  }
  return keys;
}

export function keepBareParams(currentHref: string, destination: URL): URL {
  const current = new URL(currentHref);
  if (destination.origin !== current.origin) return destination;
  const bare = bareKeys(current.search);
  if (bare.size === 0) return destination;

  const search = destination.search.replace(/^\?/, "");
  if (!search) return destination;
  const next = search
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      const emptyValue = eq > 0 && eq === pair.length - 1;
      return emptyValue && bare.has(decodeKey(pair.slice(0, eq)))
        ? pair.slice(0, eq)
        : pair;
    })
    .join("&");
  if (next === search) return destination;

  const url = new URL(destination.href);
  url.search = next;
  return url;
}
