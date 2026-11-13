/**
 * Where the By mandala place is, written into the page address so a reload,
 * a shared link or the viewer's back lands on the same screen.
 *
 *   ?mandala      the mandala levels, at the level he last applied or 1
 *   ?mandala=3    the same screen with the slider on level 3
 *
 * An older link to one family (`?mandala=<shape key>~<id>`, often with
 * `&seq=`) opens the levels at their start; writing the address drops `seq`.
 * Every other parameter is left as it was.
 */
import { MANDALA_LEVEL_COUNT } from "#lib/shared/browse/services/sequence-density.js";

export interface MandalaAddress {
  open: boolean;
  /** The slider's level, 1 to MANDALA_LEVEL_COUNT; null when the address names none. */
  level: number | null;
}

const MANDALA_PARAM = "mandala";
/** The family page's chosen row, from before the levels; only ever removed. */
const OLD_SEQUENCE_PARAM = "seq";

function readLevel(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const level = Number(raw);
  return level >= 1 && level <= MANDALA_LEVEL_COUNT ? level : null;
}

export function readMandalaAddress(url: URL): MandalaAddress {
  const params = url.searchParams;
  if (!params.has(MANDALA_PARAM)) return { open: false, level: null };
  return { open: true, level: readLevel(params.get(MANDALA_PARAM)) };
}

export function mandalaAddress(base: URL, state: MandalaAddress): URL {
  const url = new URL(base.href);
  const params = url.searchParams;
  params.delete(MANDALA_PARAM);
  params.delete(OLD_SEQUENCE_PARAM);
  if (state.open) params.set(MANDALA_PARAM, state.level ? String(state.level) : "");
  // URLSearchParams writes a bare key as "mandala="; the bare "?mandala"
  // reads better and both read back the same.
  url.search = params
    .toString()
    .split("&")
    .map((pair) => (pair === `${MANDALA_PARAM}=` ? MANDALA_PARAM : pair))
    .join("&");
  return url;
}
