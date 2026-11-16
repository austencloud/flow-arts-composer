/**
 * Per-prop copy for /notation/props. Each entry says what carries over from
 * double staff and where that prop reaches the edge of the notation. Keep
 * claims to what the notation and the player actually do: no planned
 * features, and no lineage claims about other systems (see the About page).
 *
 * Text fields hold full message keys from the translation catalogue; the page
 * resolves them with t() at render so they follow a language switch.
 */

export const PROP_KEYS = ["staves", "clubs", "fans", "buugeng", "poi"] as const;
export type PropKey = (typeof PROP_KEYS)[number];

export interface PropEntry {
  /** Message key for the prop's name. */
  label: string;
  /** Message key: the one physical fact the translation turns on. */
  kind: string;
  /** Prop type id the demo player draws. */
  propType: string;
  /** Message key: caption under the demo while this prop is picked. */
  note: string;
  /** Message keys, one per paragraph. */
  paragraphs: string[];
}

export const PROPS: Record<PropKey, PropEntry> = {
  staves: {
    label: "site_prop_staves",
    kind: "site_props_page_staves_kind",
    propType: "staff",
    note: "site_props_page_staves_note",
    paragraphs: [
      "site_props_page_staves_p1",
      "site_props_page_staves_p2",
      "site_props_page_staves_p3",
      "site_props_page_staves_p4",
    ],
  },
  clubs: {
    label: "site_prop_clubs",
    kind: "site_props_page_clubs_kind",
    propType: "club",
    note: "site_props_page_clubs_note",
    paragraphs: ["site_props_page_clubs_p1", "site_props_page_clubs_p2"],
  },
  fans: {
    label: "site_prop_fans",
    kind: "site_props_page_fans_kind",
    propType: "fan",
    note: "site_props_page_fans_note",
    paragraphs: ["site_props_page_fans_p1", "site_props_page_fans_p2"],
  },
  buugeng: {
    label: "site_prop_buugeng",
    kind: "site_props_page_buugeng_kind",
    propType: "buugeng",
    note: "site_props_page_buugeng_note",
    paragraphs: ["site_props_page_buugeng_p1", "site_props_page_buugeng_p2"],
  },
  poi: {
    label: "site_prop_poi",
    kind: "site_props_page_poi_kind",
    propType: "poi",
    note: "site_props_page_poi_note",
    paragraphs: ["site_props_page_poi_p1", "site_props_page_poi_p2"],
  },
};

export function isPropKey(value: string): value is PropKey {
  return (PROP_KEYS as readonly string[]).includes(value);
}
