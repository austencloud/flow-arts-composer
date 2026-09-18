/**
 * TKA Supported Prop Types
 *
 * TKA supports both STATIC PROPS (staff, fans, clubs) and MOMENTUM-BASED PROPS (poi).
 * Momentum-based props use physics constraints to limit valid motions and transitions.
 *
 * Static props are held and manipulated directly by the performer.
 * Momentum props swing freely and are affected by gravity.
 *
 * This is the single source of truth for ALL prop types in the application.
 * Each enum value corresponds to an available prop SVG file in /images/props/
 */
export enum PropType {
  STAFF = "staff",
  SIMPLESTAFF = "simple_staff",
  BIGSTAFF = "bigstaff",
  STAFF2 = "staff_v2",
  // An LED baton: braided shaft, clear tubes, and a frosted cap over the light
  // capsule at each end. Staff family — same reach, same two tracked ends — but
  // its tracked tips sit at the cap centers, where the light actually is, so the
  // LED/fire/trail emitters come out of the caps instead of off the rims.
  CAPSULE_BATON = "capsule_baton",
  // A kevlar fire double staff: 16mm anodized tube, overgrip across the middle,
  // and a monkey-fist wick at each end. Staff family — same reach, same two
  // tracked ends — but its tracked tips sit at the wick centers, where the fuel
  // is, so fire and trails come off the burning part instead of the far rim.
  FIRE_DOUBLE_STAFF = "fire_double_staff",

  CLUB = "club",
  // The original flat 2D scan. It shares Club's physical geometry but remains
  // selectable as a visual build beside the regular material-rendered club.
  CLASSIC_CLUB = "classic_club",
  BIGCLUB = "bigclub",

  FAN = "fan",
  BIGFAN = "bigfan",

  TRIAD = "triad",
  BIGTRIAD = "bigtriad",

  MINIHOOP = "minihoop",
  BIGHOOP = "bighoop",
  // Bowed equilateral frame of 5/8in hoop tubing; a mini hoop variant.
  TRIANGLE = "triangle",

  BUUGENG = "buugeng",
  BIGBUUGENG = "bigbuugeng",

  TRIGENG = "trigeng",

  HAND = "hand",

  TRIQUETRA = "triquetra",
  TRIQUETRA2 = "triquetra2",

  SWORD = "sword",

  // === ENERGY FAMILY (premium cosmetics) ===
  // Two paid prop styles that follow their physical parent in every registry:
  // Energy Saber spins exactly like a sword, Energy Staff exactly like a staff.
  // They are deliberately NOT variants of those parents — the variant cycle
  // (getNextVariation) has no access gate, so listing them there would hand a
  // paid prop out for free on any surface offering a variant toggle.
  // Access lives in PREMIUM_COSMETIC_PROP_TYPES (prop-type-display-registry.ts).
  ENERGY_SABER = "energy_saber",
  ENERGY_STAFF = "energy_staff",

  CHICKEN = "chicken",
  BIGCHICKEN = "bigchicken",

  GUITAR = "guitar",
  UKULELE = "ukulele",

  DOUBLESTAR = "doublestar",
  BIGDOUBLESTAR = "bigdoublestar",

  EIGHTRINGS = "eightrings",
  BIGEIGHTRINGS = "bigeightrings",

  CONTACTBALL = "contactball",
  BIGCONTACTBALL = "bigcontactball",
  DOUBLECONTACTBALL = "doublecontactball",
  BIGDOUBLECONTACTBALL = "bigdoublecontactball",

  QUIAD = "quiad",

  TORCH = "torch",
  BIGTORCH = "bigtorch",

  // === POI FAMILY (Momentum-based) ===
  // Poi uses physics constraints - see PoiConstraintValidator
  // Render asset: static/images/props/pictograph/poi.svg - knob gripped at
  // viewBox center, ball sticks out (club-style single-ended geometry).
  POI = "poi",
}
