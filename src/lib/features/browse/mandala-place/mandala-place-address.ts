/**
 * Where the By mandala place is, written into the page address so a reload,
 * a shared link or the viewer's back lands on the same screen.
 *
 *   ?mandala                 the wall of all mandalas
 *   ?mandala=<family value>  one mandala's page
 *   &seq=<sequence id>       the chosen row on that page
 *
 * Every other parameter is left as it was.
 */

export interface MandalaAddress {
  open: boolean;
  familyValue: string | null;
  sequenceId: string | null;
}

const MANDALA_PARAM = "mandala";
const SEQUENCE_PARAM = "seq";

export function readMandalaAddress(url: URL): MandalaAddress {
  const params = url.searchParams;
  if (!params.has(MANDALA_PARAM)) {
    return { open: false, familyValue: null, sequenceId: null };
  }
  const familyValue = params.get(MANDALA_PARAM) || null;
  // A chosen row means nothing without the mandala it belongs to.
  const sequenceId = familyValue ? params.get(SEQUENCE_PARAM) || null : null;
  return { open: true, familyValue, sequenceId };
}

export function mandalaAddress(base: URL, state: MandalaAddress): URL {
  const url = new URL(base.href);
  const params = url.searchParams;
  params.delete(MANDALA_PARAM);
  params.delete(SEQUENCE_PARAM);
  if (state.open) {
    params.set(MANDALA_PARAM, state.familyValue ?? "");
    if (state.familyValue && state.sequenceId) params.set(SEQUENCE_PARAM, state.sequenceId);
  }
  // URLSearchParams writes the wall as "mandala="; the bare "?mandala" reads
  // better and both read back the same.
  url.search = params
    .toString()
    .split("&")
    .map((pair) => (pair === `${MANDALA_PARAM}=` ? MANDALA_PARAM : pair))
    .join("&");
  return url;
}
