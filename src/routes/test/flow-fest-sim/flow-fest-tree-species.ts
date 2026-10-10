/**
 * The tree species that stand on the Flow Fest site, as ez-tree parameter sets.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The forest used to be a handful of baked GLBs reused across every placement,
 * so a walk through the site read as the same four trees over and over. This
 * catalog replaces those assets with procedurally generated ones from
 * `@dgreenheck/ez-tree` (MIT). Each entry describes a real species that belongs
 * on an Ohio / Indiana border farm woodlot in mid-May, at full leaf-out, and
 * each is generated at several seeds so no two trees share a silhouette.
 *
 * WHAT THIS FILE IS NOT
 * ---------------------
 * It does not decide WHERE trees stand. Placement is derived from the LiDAR
 * canopy return and the registered orthophoto, and it stays in
 * `flow-fest-forest-ecology.ts`. This module only says what a placement RENDERS
 * once something has chosen a species for it. The per-instance species seam is
 * `FlowFestTreeSpeciesPlan` at the bottom of this file.
 *
 * CALIBRATION
 * -----------
 * `createForestRuntimeTreeInstances` scales every instance uniformly by
 * `renderedHeightMeters / sourceHeight`, so a generated tree's absolute size in
 * ez-tree units never reaches the screen. Only two ratios survive that scaling:
 *
 *   crownRadiusRatio = crownRadius(P95) / height   how wide the canopy reads
 *   trunkHeightRatio = clearBoleHeight  / height   how much bare trunk shows
 *
 * Those two numbers are therefore the entire apparent-scale contract with the
 * outgoing assets. Every form below carries the pair it must hit, measured off
 * the GLBs it replaces (see `scripts/geospatial/measure_flow_fest_trees.mjs`),
 * and `scripts/geospatial/build_flow_fest_eztree_species.ts` solves the ez-tree
 * parameters until the generated tree lands within tolerance.
 *
 * This module must stay free of `#lib` imports so the build script can load it
 * with `tsx` outside the SvelteKit graph.
 */

/** Leaf atlases shipped by ez-tree. Chosen for leaf SHAPE, not for the name. */
export type FlowFestLeafAtlas = "ash" | "aspen" | "oak" | "pine";

/** Bark atlases shipped by ez-tree. Chosen for bark CHARACTER, not the name. */
export type FlowFestBarkAtlas = "birch" | "oak" | "pine" | "willow";

/**
 * The ecological role a form fills. These are the four habitat sets the
 * placement logic already casts from, plus the standing-dead punctuation it
 * already rolls for.
 */
export type FlowFestTreeRole =
  | "stand"
  | "open"
  | "understory"
  | "damp"
  | "snag";

/** The subset of ez-tree's option tree a species form needs to describe. */
export interface FlowFestTreeShapeOptions {
  readonly type: "deciduous" | "evergreen";
  readonly bark: {
    readonly type: FlowFestBarkAtlas;
    readonly flatShading: boolean;
    readonly textured: boolean;
    readonly textureScale: { readonly x: number; readonly y: number };
  };
  readonly branch: {
    readonly levels: number;
    readonly angle: Readonly<Record<number, number>>;
    readonly children: Readonly<Record<number, number>>;
    readonly force: {
      readonly direction: { readonly x: number; readonly y: number; readonly z: number };
      readonly strength: number;
    };
    readonly gnarliness: Readonly<Record<number, number>>;
    readonly length: Readonly<Record<number, number>>;
    readonly radius: Readonly<Record<number, number>>;
    readonly sections: Readonly<Record<number, number>>;
    readonly segments: Readonly<Record<number, number>>;
    readonly start: Readonly<Record<number, number>>;
    readonly taper: Readonly<Record<number, number>>;
    readonly twist: Readonly<Record<number, number>>;
  };
  readonly leaves: {
    readonly type: FlowFestLeafAtlas;
    readonly billboard: "single" | "double";
    readonly angle: number;
    readonly count: number;
    readonly start: number;
    readonly size: number;
    readonly sizeVariance: number;
    readonly alphaTest: number;
  };
}

/**
 * The apparent-scale contract a generated form must satisfy. Both are
 * dimensionless ratios against the model's own height.
 */
export interface FlowFestTreeProportionTarget {
  /** crownRadius(P95) / height. Drives how wide the canopy reads. */
  readonly crownRadiusRatio: number;
  /** clearBoleHeight / height. Drives how much bare trunk stands beneath it. */
  readonly trunkHeightRatio: number;
}

/**
 * One growth form of one species. The same species grows differently in a
 * closed stand than it does alone in a fencerow, so form — not species — is the
 * unit that gets generated and calibrated.
 */
export interface FlowFestTreeForm {
  readonly formId: string;
  readonly role: FlowFestTreeRole;
  /** How many seeded variants of this form get baked. */
  readonly variants: number;
  /** Typical mature height in metres. Documentation, not a render input. */
  readonly matureHeightMeters: number;
  readonly target: FlowFestTreeProportionTarget;
  readonly shape: FlowFestTreeShapeOptions;
  /**
   * HSL offsets applied to the runtime's per-instance tint, so two species
   * sharing a leaf atlas still read as different trees. Consumed by
   * `FlowFestForestEcology.svelte`, which overwrites `material.color` and so is
   * the only place a species colour can survive.
   */
  readonly colorGrade: {
    readonly foliage: readonly [number, number, number];
    readonly bark: readonly [number, number, number];
  };
}

export interface FlowFestTreeSpecies {
  readonly speciesId: string;
  /** Name a person would use on site. */
  readonly commonName: string;
  readonly scientificName: string;
  /** Why this species is on the list for this site and this month. */
  readonly note: string;
  readonly forms: readonly FlowFestTreeForm[];
}

const DECIDUOUS_SECTIONS = { 0: 12, 1: 10, 2: 8, 3: 6 } as const;
const DECIDUOUS_SEGMENTS = { 0: 8, 1: 6, 2: 4, 3: 3 } as const;
const NO_TWIST = { 0: 0, 1: 0, 2: 0, 3: 0 } as const;

/**
 * The species roster.
 *
 * The brief proposed sugar maple, American beech, oak, black walnut, hickory,
 * Eastern redcedar, and a scrubby understory volunteer. Checking that against
 * what the placement logic actually casts found one gap and one extra need:
 *
 *  - The DAMP set (ground below 8.5 m, the wet hollow) had no wet-site species
 *    in the proposed list. The outgoing data filled that set with willows.
 *    American sycamore and silver maple are the two species that actually
 *    dominate an Ohio-valley bottomland, so both are here.
 *  - `chooseTreeFamily` explicitly rolls a 1.2% standing snag, which the
 *    outgoing data served with a dedicated dead-tree asset (0% foliage
 *    triangles). A snag form is therefore required, not decorative.
 *
 * Boxelder is the scrubby understory volunteer: a weedy, multi-stemmed,
 * short-boled maple that colonises disturbed farm edges throughout the region.
 *
 * The brief asked for ONE such volunteer, and one is what the first roster
 * shipped. Casting the real site then measured why that is not enough: this
 * woodlot is mostly closed canopy, so the placement pass produces 240 trees in
 * the short height class and 216 of them stand under a closed neighborhood.
 * With a single suppressed species that is 31% of every tree on the site
 * wearing one silhouette — precisely the ground-level repetition this catalog
 * replaced the reused GLBs to remove. American hophornbeam is the second one,
 * and it is the correct second one rather than a convenient one: it is the
 * characteristic shade-tolerant sub-canopy tree of Ohio and Indiana
 * beech-maple and oak-hickory woods, it occupies the same 8-12 m height class,
 * and its single slender stem is the opposite silhouette to boxelder's
 * sprawling multi-stem thicket.
 */
export const FLOW_FEST_TREE_SPECIES: readonly FlowFestTreeSpecies[] = [
  {
    speciesId: "sugar-maple",
    commonName: "Sugar maple",
    scientificName: "Acer saccharum",
    note: "The dominant canopy tree of the regional beech-maple woodlot. Dense, rounded crown at full leaf-out.",
    forms: [
      {
        formId: "sugar-maple-stand",
        role: "stand",
        variants: 4,
        matureHeightMeters: 22,
        target: { crownRadiusRatio: 0.28, trunkHeightRatio: 0.34 },
        colorGrade: { foliage: [0.012, 0.06, 0.01], bark: [-0.01, -0.04, -0.02] },
        shape: {
          type: "deciduous",
          bark: {
            type: "oak",
            flatShading: false,
            textured: true,
            textureScale: { x: 1, y: 9 },
          },
          branch: {
            levels: 3,
            angle: { 1: 52, 2: 45, 3: 34 },
            children: { 0: 9, 1: 5, 2: 3 },
            force: { direction: { x: 0, y: 1, z: 0 }, strength: -0.014 },
            gnarliness: { 0: 0.1, 1: 0.16, 2: 0.26, 3: 0.02 },
            length: { 0: 48, 1: 22.5, 2: 13.5, 3: 5.6 },
            radius: { 0: 2.8, 1: 0.68, 2: 0.66, 3: 0.66 },
            sections: DECIDUOUS_SECTIONS,
            segments: DECIDUOUS_SEGMENTS,
            start: { 1: 0.38, 2: 0.1, 3: 0 },
            taper: { 0: 0.74, 1: 0.44, 2: 0.7, 3: 0.7 },
            twist: NO_TWIST,
          },
          leaves: {
            type: "aspen",
            billboard: "double",
            angle: 28,
            count: 11,
            start: 0.14,
            size: 3.4,
            sizeVariance: 0.6,
            alphaTest: 0.42,
          },
        },
      },
    ],
  },
  {
    speciesId: "american-beech",
    commonName: "American beech",
    scientificName: "Fagus grandifolia",
    note: "Sugar maple's constant partner in this forest type. Smooth grey bole, layered horizontal branching.",
    forms: [
      {
        formId: "american-beech-stand",
        role: "stand",
        variants: 3,
        matureHeightMeters: 20,
        target: { crownRadiusRatio: 0.3, trunkHeightRatio: 0.3 },
        colorGrade: { foliage: [0.02, 0.02, 0.035], bark: [0.01, -0.12, 0.1] },
        shape: {
          type: "deciduous",
          bark: {
            type: "birch",
            flatShading: false,
            textured: true,
            textureScale: { x: 1, y: 7 },
          },
          branch: {
            levels: 3,
            angle: { 1: 68, 2: 58, 3: 40 },
            children: { 0: 8, 1: 6, 2: 3 },
            force: { direction: { x: 0, y: 1, z: 0 }, strength: -0.03 },
            gnarliness: { 0: 0.07, 1: 0.14, 2: 0.22, 3: 0.02 },
            length: { 0: 46, 1: 23.5, 2: 14, 3: 5.5 },
            radius: { 0: 2.5, 1: 0.62, 2: 0.62, 3: 0.62 },
            sections: DECIDUOUS_SECTIONS,
            segments: DECIDUOUS_SEGMENTS,
            start: { 1: 0.33, 2: 0.1, 3: 0 },
            taper: { 0: 0.7, 1: 0.4, 2: 0.7, 3: 0.7 },
            twist: NO_TWIST,
          },
          leaves: {
            type: "aspen",
            billboard: "double",
            angle: 22,
            count: 12,
            start: 0.12,
            size: 3.2,
            sizeVariance: 0.5,
            alphaTest: 0.42,
          },
        },
      },
    ],
  },
  {
    speciesId: "white-oak",
    commonName: "White oak",
    scientificName: "Quercus alba",
    note: "The oak the outgoing assets were built around. Kept, in both its forest and its open-grown form.",
    forms: [
      {
        formId: "white-oak-stand",
        role: "stand",
        variants: 3,
        matureHeightMeters: 24,
        target: { crownRadiusRatio: 0.27, trunkHeightRatio: 0.32 },
        colorGrade: { foliage: [-0.006, 0.02, -0.01], bark: [0.005, -0.05, 0.02] },
        shape: {
          type: "deciduous",
          bark: {
            type: "oak",
            flatShading: false,
            textured: true,
            textureScale: { x: 1, y: 10 },
          },
          branch: {
            levels: 3,
            angle: { 1: 54, 2: 43, 3: 32 },
            children: { 0: 9, 1: 5, 2: 3 },
            force: { direction: { x: 0, y: 1, z: 0 }, strength: -0.025 },
            gnarliness: { 0: 0.12, 1: 0.2, 2: 0.3, 3: 0.02 },
            length: { 0: 47.7, 1: 22, 2: 13.2, 3: 5.4 },
            radius: { 0: 3, 1: 0.7, 2: 0.7, 3: 0.7 },
            sections: DECIDUOUS_SECTIONS,
            segments: DECIDUOUS_SEGMENTS,
            start: { 1: 0.36, 2: 0.1, 3: 0 },
            taper: { 0: 0.73, 1: 0.42, 2: 0.7, 3: 0.7 },
            twist: NO_TWIST,
          },
          leaves: {
            type: "oak",
            billboard: "double",
            angle: 36,
            count: 10,
            start: 0.16,
            size: 4.2,
            sizeVariance: 0.7,
            alphaTest: 0.45,
          },
        },
      },
      {
        formId: "white-oak-open",
        role: "open",
        variants: 2,
        matureHeightMeters: 20,
        target: { crownRadiusRatio: 0.4, trunkHeightRatio: 0.22 },
        colorGrade: { foliage: [-0.01, 0.045, 0.005], bark: [0.005, -0.04, 0.03] },
        shape: {
          type: "deciduous",
          bark: {
            type: "oak",
            flatShading: false,
            textured: true,
            textureScale: { x: 1, y: 8 },
          },
          branch: {
            levels: 3,
            angle: { 1: 74, 2: 58, 3: 40 },
            children: { 0: 8, 1: 6, 2: 3 },
            force: { direction: { x: 0, y: 1, z: 0 }, strength: -0.006 },
            gnarliness: { 0: 0.16, 1: 0.26, 2: 0.34, 3: 0.03 },
            length: { 0: 40, 1: 24, 2: 15, 3: 6.2 },
            radius: { 0: 3.4, 1: 0.78, 2: 0.72, 3: 0.7 },
            sections: DECIDUOUS_SECTIONS,
            segments: DECIDUOUS_SEGMENTS,
            start: { 1: 0.24, 2: 0.1, 3: 0 },
            taper: { 0: 0.76, 1: 0.44, 2: 0.7, 3: 0.7 },
            twist: NO_TWIST,
          },
          leaves: {
            type: "oak",
            billboard: "double",
            angle: 40,
            count: 11,
            start: 0.12,
            size: 4.4,
            sizeVariance: 0.7,
            alphaTest: 0.45,
          },
        },
      },
    ],
  },
  {
    speciesId: "black-walnut",
    commonName: "Black walnut",
    scientificName: "Juglans nigra",
    note: "Farm-woodlot signature tree. Long clear bole, open pinnate foliage that lets light through.",
    forms: [
      {
        formId: "black-walnut-stand",
        role: "stand",
        variants: 3,
        matureHeightMeters: 21,
        target: { crownRadiusRatio: 0.26, trunkHeightRatio: 0.38 },
        colorGrade: { foliage: [0.008, -0.03, 0.02], bark: [0.01, -0.02, -0.06] },
        shape: {
          type: "deciduous",
          bark: {
            type: "oak",
            flatShading: false,
            textured: true,
            textureScale: { x: 1, y: 12 },
          },
          branch: {
            levels: 3,
            angle: { 1: 50, 2: 42, 3: 30 },
            children: { 0: 7, 1: 4, 2: 3 },
            force: { direction: { x: 0, y: 1, z: 0 }, strength: -0.02 },
            gnarliness: { 0: 0.08, 1: 0.15, 2: 0.24, 3: 0.02 },
            length: { 0: 50, 1: 20, 2: 12, 3: 5 },
            radius: { 0: 2.6, 1: 0.6, 2: 0.6, 3: 0.6 },
            sections: DECIDUOUS_SECTIONS,
            segments: DECIDUOUS_SEGMENTS,
            start: { 1: 0.42, 2: 0.12, 3: 0 },
            taper: { 0: 0.72, 1: 0.4, 2: 0.7, 3: 0.7 },
            twist: NO_TWIST,
          },
          leaves: {
            type: "ash",
            billboard: "double",
            angle: 26,
            count: 9,
            start: 0.2,
            size: 4.6,
            sizeVariance: 0.55,
            alphaTest: 0.4,
          },
        },
      },
      {
        formId: "black-walnut-open",
        role: "open",
        variants: 2,
        matureHeightMeters: 18,
        target: { crownRadiusRatio: 0.36, trunkHeightRatio: 0.26 },
        colorGrade: { foliage: [0.01, -0.02, 0.03], bark: [0.01, -0.02, -0.05] },
        shape: {
          type: "deciduous",
          bark: {
            type: "oak",
            flatShading: false,
            textured: true,
            textureScale: { x: 1, y: 10 },
          },
          branch: {
            levels: 3,
            angle: { 1: 68, 2: 54, 3: 36 },
            children: { 0: 7, 1: 5, 2: 3 },
            force: { direction: { x: 0, y: 1, z: 0 }, strength: -0.008 },
            gnarliness: { 0: 0.13, 1: 0.22, 2: 0.3, 3: 0.02 },
            length: { 0: 42, 1: 23, 2: 14, 3: 5.8 },
            radius: { 0: 2.9, 1: 0.68, 2: 0.64, 3: 0.62 },
            sections: DECIDUOUS_SECTIONS,
            segments: DECIDUOUS_SEGMENTS,
            start: { 1: 0.28, 2: 0.12, 3: 0 },
            taper: { 0: 0.74, 1: 0.42, 2: 0.7, 3: 0.7 },
            twist: NO_TWIST,
          },
          leaves: {
            type: "ash",
            billboard: "double",
            angle: 32,
            count: 10,
            start: 0.16,
            size: 4.8,
            sizeVariance: 0.6,
            alphaTest: 0.4,
          },
        },
      },
    ],
  },
  {
    speciesId: "shagbark-hickory",
    commonName: "Shagbark hickory",
    scientificName: "Carya ovata",
    note: "The narrowest crown in the stand. Shaggy plated bark reads at distance even on an instanced tree.",
    forms: [
      {
        formId: "shagbark-hickory-stand",
        role: "stand",
        variants: 3,
        matureHeightMeters: 20,
        target: { crownRadiusRatio: 0.23, trunkHeightRatio: 0.38 },
        colorGrade: { foliage: [0.02, -0.01, 0.0], bark: [0.0, -0.06, -0.04] },
        shape: {
          type: "deciduous",
          bark: {
            type: "pine",
            flatShading: false,
            textured: true,
            textureScale: { x: 1, y: 11 },
          },
          branch: {
            levels: 3,
            angle: { 1: 44, 2: 38, 3: 28 },
            children: { 0: 8, 1: 4, 2: 3 },
            force: { direction: { x: 0, y: 1, z: 0 }, strength: -0.026 },
            gnarliness: { 0: 0.07, 1: 0.13, 2: 0.22, 3: 0.02 },
            length: { 0: 52, 1: 18, 2: 11, 3: 4.6 },
            radius: { 0: 2.4, 1: 0.56, 2: 0.56, 3: 0.56 },
            sections: DECIDUOUS_SECTIONS,
            segments: DECIDUOUS_SEGMENTS,
            start: { 1: 0.42, 2: 0.12, 3: 0 },
            taper: { 0: 0.71, 1: 0.4, 2: 0.7, 3: 0.7 },
            twist: NO_TWIST,
          },
          leaves: {
            type: "ash",
            billboard: "double",
            angle: 24,
            count: 10,
            start: 0.22,
            size: 4.2,
            sizeVariance: 0.5,
            alphaTest: 0.42,
          },
        },
      },
    ],
  },
  {
    speciesId: "eastern-redcedar",
    commonName: "Eastern redcedar",
    scientificName: "Juniperus virginiana",
    note: "The one evergreen. Colonises open pasture edges across this county; a narrow dark cone among broadleaves.",
    forms: [
      {
        formId: "eastern-redcedar-open",
        role: "open",
        variants: 3,
        matureHeightMeters: 12,
        target: { crownRadiusRatio: 0.17, trunkHeightRatio: 0.06 },
        colorGrade: { foliage: [-0.02, -0.05, -0.1], bark: [0.02, -0.05, -0.05] },
        shape: {
          type: "evergreen",
          bark: {
            type: "willow",
            flatShading: false,
            textured: true,
            textureScale: { x: 1, y: 14 },
          },
          branch: {
            levels: 1,
            angle: { 1: 78, 2: 60, 3: 60 },
            children: { 0: 86, 1: 7, 2: 5 },
            force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.012 },
            gnarliness: { 0: 0.02, 1: 0.06, 2: 0.3, 3: 0.02 },
            length: { 0: 50, 1: 7.6, 2: 10, 3: 1 },
            radius: { 0: 1.5, 1: 0.6, 2: 0.7, 3: 0.7 },
            sections: { 0: 14, 1: 6, 2: 8, 3: 6 },
            segments: { 0: 7, 1: 4, 2: 4, 3: 3 },
            start: { 1: 0.06, 2: 0.3, 3: 0.3 },
            taper: { 0: 1, 1: 0.7, 2: 0.7, 3: 0.7 },
            twist: NO_TWIST,
          },
          leaves: {
            type: "pine",
            billboard: "double",
            angle: 14,
            count: 26,
            start: 0.05,
            size: 1.55,
            sizeVariance: 0.24,
            alphaTest: 0.3,
          },
        },
      },
    ],
  },
  {
    speciesId: "boxelder",
    commonName: "Boxelder",
    scientificName: "Acer negundo",
    note: "The scrubby volunteer. Multi-stemmed, almost no clear bole, fills the understory and every disturbed edge.",
    forms: [
      {
        formId: "boxelder-understory",
        role: "understory",
        variants: 4,
        matureHeightMeters: 11,
        target: { crownRadiusRatio: 0.46, trunkHeightRatio: 0.14 },
        colorGrade: { foliage: [0.03, 0.02, 0.06], bark: [0.0, -0.08, 0.0] },
        shape: {
          type: "deciduous",
          bark: {
            type: "willow",
            flatShading: false,
            textured: true,
            textureScale: { x: 1, y: 6 },
          },
          branch: {
            levels: 3,
            angle: { 1: 62, 2: 56, 3: 44 },
            children: { 0: 5, 1: 5, 2: 4 },
            force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.004 },
            gnarliness: { 0: 0.3, 1: 0.34, 2: 0.4, 3: 0.05 },
            length: { 0: 12, 1: 26, 2: 15, 3: 6 },
            radius: { 0: 1.5, 1: 0.72, 2: 0.68, 3: 0.66 },
            sections: { 0: 8, 1: 10, 2: 8, 3: 6 },
            segments: DECIDUOUS_SEGMENTS,
            start: { 1: 0.5, 2: 0.28, 3: 0.1 },
            taper: { 0: 0.4, 1: 0.5, 2: 0.7, 3: 0.7 },
            twist: NO_TWIST,
          },
          leaves: {
            type: "ash",
            billboard: "double",
            angle: 46,
            count: 8,
            start: 0.06,
            size: 3.0,
            sizeVariance: 0.7,
            alphaTest: 0.4,
          },
        },
      },
    ],
  },
  {
    speciesId: "hophornbeam",
    commonName: "American hophornbeam",
    scientificName: "Ostrya virginiana",
    note: "The shade-tolerant sub-canopy tree. One slender clear bole, a narrow rounded crown, and small leaves that read as fine texture under the closed canopy.",
    forms: [
      {
        formId: "hophornbeam-understory",
        role: "understory",
        variants: 4,
        matureHeightMeters: 11,
        // Deliberately the opposite silhouette to boxelder (0.46 / 0.14): a
        // single well-formed stem carrying a narrow crown, rather than a
        // sprawling multi-stem thicket. Two small trees that share a height
        // class have to differ in shape or the sub-canopy reads as one model.
        target: { crownRadiusRatio: 0.29, trunkHeightRatio: 0.22 },
        colorGrade: { foliage: [-0.01, -0.04, -0.05], bark: [0.005, -0.14, 0.04] },
        shape: {
          type: "deciduous",
          bark: {
            type: "oak",
            flatShading: false,
            textured: true,
            // Hophornbeam bark shreds into narrow vertical strips, so the
            // texture is stretched hard along the stem.
            textureScale: { x: 1, y: 11 },
          },
          branch: {
            levels: 3,
            angle: { 1: 44, 2: 40, 3: 32 },
            children: { 0: 6, 1: 4, 2: 3 },
            force: { direction: { x: 0, y: 1, z: 0 }, strength: -0.008 },
            gnarliness: { 0: 0.14, 1: 0.22, 2: 0.3, 3: 0.04 },
            length: { 0: 20, 1: 15, 2: 9, 3: 4 },
            radius: { 0: 1.5, 1: 0.62, 2: 0.62, 3: 0.62 },
            sections: DECIDUOUS_SECTIONS,
            segments: DECIDUOUS_SEGMENTS,
            start: { 1: 0.42, 2: 0.16, 3: 0.05 },
            taper: { 0: 0.66, 1: 0.46, 2: 0.7, 3: 0.7 },
            twist: NO_TWIST,
          },
          leaves: {
            type: "aspen",
            billboard: "double",
            angle: 40,
            count: 9,
            start: 0.1,
            size: 2.2,
            sizeVariance: 0.5,
            alphaTest: 0.4,
          },
        },
      },
    ],
  },
  {
    speciesId: "american-sycamore",
    commonName: "American sycamore",
    scientificName: "Platanus occidentalis",
    note: "The bottomland tree of the damp hollow. Pale mottled bole, very large lobed leaves, heavy limbs.",
    forms: [
      {
        formId: "american-sycamore-damp",
        role: "damp",
        variants: 3,
        matureHeightMeters: 25,
        target: { crownRadiusRatio: 0.33, trunkHeightRatio: 0.28 },
        colorGrade: { foliage: [0.005, 0.0, 0.045], bark: [0.01, -0.2, 0.16] },
        shape: {
          type: "deciduous",
          bark: {
            type: "birch",
            flatShading: false,
            textured: true,
            textureScale: { x: 1, y: 6 },
          },
          branch: {
            levels: 3,
            angle: { 1: 60, 2: 50, 3: 36 },
            children: { 0: 7, 1: 5, 2: 3 },
            force: { direction: { x: 0, y: 1, z: 0 }, strength: -0.016 },
            gnarliness: { 0: 0.14, 1: 0.24, 2: 0.32, 3: 0.03 },
            length: { 0: 46, 1: 23, 2: 14.5, 3: 6 },
            radius: { 0: 3.2, 1: 0.8, 2: 0.72, 3: 0.68 },
            sections: DECIDUOUS_SECTIONS,
            segments: DECIDUOUS_SEGMENTS,
            start: { 1: 0.32, 2: 0.1, 3: 0 },
            taper: { 0: 0.75, 1: 0.44, 2: 0.7, 3: 0.7 },
            twist: NO_TWIST,
          },
          leaves: {
            type: "oak",
            billboard: "double",
            angle: 34,
            count: 10,
            start: 0.14,
            size: 5.0,
            sizeVariance: 0.6,
            alphaTest: 0.45,
          },
        },
      },
    ],
  },
  {
    speciesId: "silver-maple",
    commonName: "Silver maple",
    scientificName: "Acer saccharinum",
    note: "The other bottomland maple. Wide arching limbs, deeply cut leaves that flash pale when the wind turns them.",
    forms: [
      {
        formId: "silver-maple-damp",
        role: "damp",
        variants: 3,
        matureHeightMeters: 22,
        target: { crownRadiusRatio: 0.38, trunkHeightRatio: 0.24 },
        colorGrade: { foliage: [0.0, -0.06, 0.07], bark: [0.0, -0.1, 0.04] },
        shape: {
          type: "deciduous",
          bark: {
            type: "willow",
            flatShading: false,
            textured: true,
            textureScale: { x: 1, y: 8 },
          },
          branch: {
            levels: 3,
            angle: { 1: 72, 2: 56, 3: 40 },
            children: { 0: 8, 1: 6, 2: 3 },
            force: { direction: { x: 0, y: 1, z: 0 }, strength: -0.004 },
            gnarliness: { 0: 0.18, 1: 0.28, 2: 0.34, 3: 0.03 },
            length: { 0: 42, 1: 24, 2: 15, 3: 6.4 },
            radius: { 0: 2.9, 1: 0.72, 2: 0.68, 3: 0.66 },
            sections: DECIDUOUS_SECTIONS,
            segments: DECIDUOUS_SEGMENTS,
            start: { 1: 0.26, 2: 0.1, 3: 0 },
            taper: { 0: 0.74, 1: 0.44, 2: 0.7, 3: 0.7 },
            twist: NO_TWIST,
          },
          leaves: {
            type: "oak",
            billboard: "double",
            angle: 42,
            count: 11,
            start: 0.1,
            size: 3.8,
            sizeVariance: 0.65,
            alphaTest: 0.42,
          },
        },
      },
    ],
  },
  {
    speciesId: "standing-snag",
    commonName: "Standing snag",
    scientificName: "—",
    note: "Dead standing trunk with the crown broken out. The placement logic rolls one about 1.2% of the time.",
    forms: [
      {
        formId: "standing-snag",
        role: "snag",
        variants: 2,
        matureHeightMeters: 16,
        target: { crownRadiusRatio: 0.3, trunkHeightRatio: 0 },
        colorGrade: { foliage: [0, 0, 0], bark: [0.0, -0.55, -0.06] },
        shape: {
          type: "deciduous",
          bark: {
            type: "pine",
            flatShading: false,
            textured: true,
            textureScale: { x: 1, y: 13 },
          },
          branch: {
            levels: 2,
            angle: { 1: 58, 2: 52, 3: 40 },
            children: { 0: 5, 1: 3, 2: 2 },
            force: { direction: { x: 0, y: 1, z: 0 }, strength: -0.03 },
            gnarliness: { 0: 0.1, 1: 0.24, 2: 0.3, 3: 0.02 },
            length: { 0: 44, 1: 14, 2: 7, 3: 3 },
            radius: { 0: 2.6, 1: 0.6, 2: 0.6, 3: 0.6 },
            sections: { 0: 10, 1: 6, 2: 5, 3: 4 },
            segments: DECIDUOUS_SEGMENTS,
            start: { 1: 0.55, 2: 0.3, 3: 0.3 },
            taper: { 0: 0.85, 1: 0.7, 2: 0.7, 3: 0.7 },
            twist: NO_TWIST,
          },
          leaves: {
            type: "aspen",
            billboard: "single",
            angle: 10,
            // A snag has no canopy. The generator drops the leaf primitive
            // entirely when this is zero, which is also what makes the snag the
            // cheapest family in the set.
            count: 0,
            start: 0,
            size: 1,
            sizeVariance: 0,
            alphaTest: 0.5,
          },
        },
      },
    ],
  },
];

/** Every generated family: one form at one seed. */
export interface FlowFestTreeFamilyPlan {
  readonly familyId: string;
  readonly speciesId: string;
  readonly formId: string;
  readonly role: FlowFestTreeRole;
  readonly variantIndex: number;
  readonly seed: number;
}

const VARIANT_LETTERS = "abcdefgh";

/**
 * Stable seed per variant. Derived from the family id so adding a species never
 * reshuffles the trees that were already baked.
 */
/**
 * Deterministic seed for one family. `attempt` exists because calibration can
 * fail on a particular seed: ez-tree's trunk wander is seed-driven, and a
 * strongly leaning trunk holds crownRadius/height above what the crown knob can
 * reach no matter how short the branches get. The seed is arbitrary, so the
 * build script walks attempts until one converges and records which it used.
 */
export function flowFestTreeFamilySeed(
  formId: string,
  variantIndex: number,
  attempt = 0
): number {
  let hash = 2166136261;
  const key = attempt === 0
    ? `${formId}:${variantIndex}`
    : `${formId}:${variantIndex}:${attempt}`;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  // ez-tree's RNG takes a positive integer seed.
  return (hash >>> 0) % 1_000_000 || 7;
}

function buildFamilyPlans(): readonly FlowFestTreeFamilyPlan[] {
  const plans: FlowFestTreeFamilyPlan[] = [];
  for (const species of FLOW_FEST_TREE_SPECIES) {
    for (const form of species.forms) {
      for (let index = 0; index < form.variants; index += 1) {
        const letter = VARIANT_LETTERS[index] ?? String(index);
        plans.push({
          familyId: `eztree-${form.formId}-${letter}`,
          speciesId: species.speciesId,
          formId: form.formId,
          role: form.role,
          variantIndex: index,
          seed: flowFestTreeFamilySeed(form.formId, index),
        });
      }
    }
  }
  return plans;
}

/** The complete generated family list, in a stable order. */
export const FLOW_FEST_TREE_FAMILY_PLANS = buildFamilyPlans();

const FORM_BY_ID = new Map<string, FlowFestTreeForm>();
const SPECIES_BY_FORM_ID = new Map<string, FlowFestTreeSpecies>();
for (const species of FLOW_FEST_TREE_SPECIES) {
  for (const form of species.forms) {
    FORM_BY_ID.set(form.formId, form);
    SPECIES_BY_FORM_ID.set(form.formId, species);
  }
}

export function flowFestTreeForm(formId: string): FlowFestTreeForm | undefined {
  return FORM_BY_ID.get(formId);
}

export function flowFestTreeSpeciesForForm(
  formId: string
): FlowFestTreeSpecies | undefined {
  return SPECIES_BY_FORM_ID.get(formId);
}

const FAMILY_PLAN_BY_ID = new Map(
  FLOW_FEST_TREE_FAMILY_PLANS.map((plan) => [plan.familyId, plan])
);

export function flowFestTreeFamilyPlan(
  familyId: string
): FlowFestTreeFamilyPlan | undefined {
  return FAMILY_PLAN_BY_ID.get(familyId);
}

/** Families belonging to one ecological role, in catalog order. */
export function flowFestTreeFamiliesForRole(
  role: FlowFestTreeRole
): readonly string[] {
  return FLOW_FEST_TREE_FAMILY_PLANS.filter((plan) => plan.role === role).map(
    (plan) => plan.familyId
  );
}

/** Families belonging to one species, in catalog order. */
export function flowFestTreeFamiliesForSpecies(
  speciesId: string
): readonly string[] {
  return FLOW_FEST_TREE_FAMILY_PLANS.filter(
    (plan) => plan.speciesId === speciesId
  ).map((plan) => plan.familyId);
}

/**
 * The per-family HSL grade the runtime applies on top of its per-instance tint.
 * Keyed by family id so `FlowFestForestEcology.svelte` can look it up directly.
 */
export const FLOW_FEST_TREE_COLOR_GRADES: Readonly<
  Record<string, { foliage: readonly [number, number, number]; bark: readonly [number, number, number] }>
> = Object.fromEntries(
  FLOW_FEST_TREE_FAMILY_PLANS.map((plan) => {
    const form = FORM_BY_ID.get(plan.formId);
    // Nudge each variant slightly so siblings of one species do not grade
    // identically. Deterministic, and small enough to stay in species.
    const drift = (plan.variantIndex - 1) * 0.012;
    return [
      plan.familyId,
      {
        foliage: [
          (form?.colorGrade.foliage[0] ?? 0) + drift * 0.5,
          (form?.colorGrade.foliage[1] ?? 0) + drift,
          (form?.colorGrade.foliage[2] ?? 0) - drift,
        ] as const,
        bark: form?.colorGrade.bark ?? ([0, 0, 0] as const),
      },
    ];
  })
);

/**
 * THE PER-INSTANCE SPECIES SEAM.
 *
 * The tree LAYOUT for the site is being derived separately over the registered
 * orthophoto: which species stands at which measured canopy peak, and how tall
 * its bole is. When that data lands, it arrives here — implement `resolve` and
 * hand the plan to `deriveFlowFestForestEcology(..., { speciesPlan })`.
 *
 * `resolve` returning `null` means "no opinion about this tree", and the
 * ecology falls back to its habitat casting. That is deliberate: a partial
 * layout (say, only the mapped specimen trees along the lane) can ship without
 * having to answer for every one of the thousands of interpreted canopy peaks.
 */
export interface FlowFestTreeSpeciesQuery {
  /** Index of the placement within the derived tree list. */
  readonly index: number;
  /** World-space position of the placement, in metres. */
  readonly x: number;
  readonly z: number;
  /** Terrain height under the placement, in metres. */
  readonly groundY: number;
  /** The height this tree will be rendered at, in metres. */
  readonly renderedHeightMeters: number;
}

export interface FlowFestTreeSpeciesAssignment {
  /**
   * A species id, a form id, or a family id. A species or form id picks a
   * variant deterministically from the placement; a family id pins the exact
   * generated model.
   */
  readonly speciesId: string;
  /**
   * Optional override for the clear bole, in metres. When absent the form's
   * calibrated `trunkHeightRatio` decides.
   */
  readonly trunkHeightMeters?: number;
}

export interface FlowFestTreeSpeciesPlan {
  readonly resolve: (
    query: FlowFestTreeSpeciesQuery
  ) => FlowFestTreeSpeciesAssignment | null;
}

/**
 * Turns whatever identifier the layout data supplies — species, form, or a
 * pinned family — into one generated family id.
 */
export function resolveFlowFestTreeFamilyId(
  identifier: string,
  variantSelector: number
): string | null {
  if (FAMILY_PLAN_BY_ID.has(identifier)) return identifier;

  const byForm = FLOW_FEST_TREE_FAMILY_PLANS.filter(
    (plan) => plan.formId === identifier
  );
  const candidates =
    byForm.length > 0
      ? byForm
      : FLOW_FEST_TREE_FAMILY_PLANS.filter(
          (plan) => plan.speciesId === identifier
        );
  if (candidates.length === 0) return null;

  const index = Math.abs(Math.trunc(variantSelector)) % candidates.length;
  return candidates[index]!.familyId;
}
