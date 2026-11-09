/**
 * Every piece of text the engine shows. A host gives the engine its language
 * one of two ways: `setTranslator` hands over a translator function (the
 * Composer installs its `t` once, so the engine's display helpers follow the
 * Composer's language wherever they are called), or the `strings` prop on
 * `ShapeMatrixApp` and the mount functions hands over finished text. With
 * neither, the engine shows English.
 *
 * The state lives at module level rather than only in context: the engine's
 * template expressions and its plain `.ts` helpers (spoken turn labels, theory
 * captions) call `s()` outside component setup, where `getContext` is not
 * allowed. Reading runes keeps every caller reactive when the text changes.
 */
import { getContext, setContext } from "svelte";

/** English defaults, copied from the Composer's `messages/en.json`. */
export const ENGLISH = {
  shape_engine_about: "About",
  shape_engine_about_intro_after: ", also available as a standalone app.",
  shape_engine_about_intro_before: "Shape Engine is an independent exploration tool by",
  shape_engine_about_intro_middle: "It is part of",
  shape_engine_about_name: "About Shape Engine",
  shape_engine_about_subtitle: "Vulcan Tech Gospel, Lorq’s matrix, and Austen’s Shape Engine",
  shape_engine_against: "against",
  shape_engine_animation_failed: "Animation didn’t load.",
  shape_engine_animation_settings: "Animation settings",
  shape_engine_antispin: "antispin",
  shape_engine_attribution: "Shape Engine by Austen Cloud. Its rows and columns follow Lorq Nichols’ 144 Shape Matrix, published as Spin Science. Not an official Spin Science release.",
  shape_engine_axis_heading: "{axis} {unit} · Level {level}",
  shape_engine_axis_unit: "{axis} {unit}",
  shape_engine_axis_value: "{axis} value: {value}. Choose from every {unit} at this level",
  shape_engine_axis_value_short: "{axis} {unit} value",
  shape_engine_back: "Back",
  shape_engine_back_shape_matrix: "Back to the shape matrix",
  shape_engine_back_theory_matrix: "Back to the theory matrix",
  shape_engine_back_to_grid: "Back to grid",
  shape_engine_boundary_explanation: "Levels only name turn values down to a quarter turn. A ratio like 3:7 falls outside that ladder. The selected VTG mode still identifies its timing and direction, while the path retains the exact 3:7 ratio.",
  shape_engine_build_four: "Build your own 4×4",
  shape_engine_building_flowers: "Building flowers…",
  shape_engine_building_matrix: "Building the matrix…",
  shape_engine_cancel_link: "Cancel linking ratios",
  shape_engine_cell_pair: "left {left} over right {right}",
  shape_engine_choose_axis_unit: "Choose {axis} {unit}",
  shape_engine_choose_axis_value: "Choose {axis} {value}",
  shape_engine_choose_mode: "Choose a Shape Engine mode",
  shape_engine_choose_prop: "Choose a prop",
  shape_engine_close_customize: "Close customize",
  shape_engine_close_ratio_editor: "Close ratio editor",
  shape_engine_close_turn_editor: "Close level and turn editor",
  shape_engine_columns: "Columns",
  shape_engine_copy_link_failed: "Could not copy the link",
  shape_engine_crossing_announcement: "Crossing: left {crossing}.",
  shape_engine_current_grid_aria: "Current grid",
  shape_engine_customize: "Customize",
  shape_engine_customize_aria: "Customize the animation",
  shape_engine_customize_intro: "Every change plays live on the right, on the pair you chose.",
  shape_engine_customize_workspace_close: "Close the customize workspace",
  shape_engine_detail: "Detail",
  shape_engine_detail_aria: "Shape animation and element relationships",
  shape_engine_difficulty: "Difficulty",
  shape_engine_difficulty_help: "What the difficulty levels mean",
  shape_engine_difficulty_kicker: "Organizing by difficulty",
  shape_engine_difficulty_level: "Difficulty level",
  shape_engine_done: "Done",
  shape_engine_edit_ratios: "Edit ratios",
  shape_engine_edit_ratios_summary: "Edit ratios. Left {left} against right {right}.",
  shape_engine_edit_turns_summary: "Edit level and turns. Level {level}. Left {left}, right {right}.",
  shape_engine_editing_both: "Editing either changes both",
  shape_engine_element_air: "Air",
  shape_engine_element_earth: "Earth",
  shape_engine_element_fire: "Fire",
  shape_engine_element_moon: "Moon",
  shape_engine_element_sun: "Sun",
  shape_engine_element_water: "Water",
  shape_engine_exact_relationship: "Exact relationship",
  shape_engine_explore_levels: "Explore Levels 1–4",
  shape_engine_finding_result: "Finding result…",
  shape_engine_float: "Float",
  shape_engine_flower_float: "{ratio} {orientation} diamond · 0p",
  shape_engine_flower_label: "{ratio} {orientation} {grid} · {petals}p",
  shape_engine_grid_aria: "Shape matrix: left-hand flower rows by right-hand flower columns; activate a cell for its TKA realizations",
  shape_engine_grid_axes: "left rows by right columns",
  shape_engine_grid_box: "box",
  shape_engine_grid_columns: "Columns: {value}",
  shape_engine_grid_diamond: "diamond",
  shape_engine_grid_rows: "Rows: {value}",
  shape_engine_hand_cycles: "Hand cycles",
  shape_engine_hand_path_aria: "Hand path timing and direction",
  shape_engine_hand_relationship: "Hand relationship",
  shape_engine_hands: "Hands",
  shape_engine_in_viewer: "in viewer",
  shape_engine_independence_prose: "Austen built this app independently, including its prop selection, relationship solving, live animation, and pictograph readouts. It is not an official Spin Science release.",
  shape_engine_keep_sync: "Keep edits in sync",
  shape_engine_left: "Left",
  shape_engine_left_flower: "left {flower}",
  shape_engine_left_rows: "Left-hand rows",
  shape_engine_level: "Level",
  shape_engine_level_1_blurb: "Base paths with zero turns",
  shape_engine_level_1_name: "Base Motions",
  shape_engine_level_2_blurb: "Adds whole-turn possibilities",
  shape_engine_level_2_name: "Whole Turns",
  shape_engine_level_3_blurb: "Adds half turns and Float",
  shape_engine_level_3_name: "Half Turns + Float",
  shape_engine_level_4_blurb: "Adds finer quarter-turn increments",
  shape_engine_level_4_name: "Quarter Turns",
  shape_engine_level_and_turns: "Level and turns",
  shape_engine_level_matrix: "Level Matrix",
  shape_engine_levels: "Levels",
  shape_engine_levels_heading: "What the levels are",
  shape_engine_levels_prose: "Levels are a Kinetic Alphabet idea, and they are cumulative: each one keeps everything the level below it had and adds finer turn increments, so the grid gains rows and columns rather than trading them. A higher level does not make every pattern in it harder. It offers more to choose from.",
  shape_engine_link_column_to_row: "Link column ratio to the row ratio",
  shape_engine_link_copied: "Link copied",
  shape_engine_link_ratios: "Link ratios",
  shape_engine_link_ratios_aria: "Link row and column ratios",
  shape_engine_link_using_columns: "Link ratios using column ratio {ratio}",
  shape_engine_link_using_rows: "Link ratios using row ratio {ratio}",
  shape_engine_linked: "Linked",
  shape_engine_loading_animation: "Loading animation…",
  shape_engine_loading_pictographs: "Loading pictographs…",
  shape_engine_matrix: "Matrix",
  shape_engine_matrix_aria: "Shape matrix",
  shape_engine_matrix_failed: "The matrix could not be built.",
  shape_engine_mixed_prop_rates: "Mixed prop rates",
  shape_engine_mode_opp_short: "Opp",
  shape_engine_mode_opposite: "Opposite",
  shape_engine_mode_quarter: "Quarter",
  shape_engine_mode_same: "Same",
  shape_engine_mode_split: "Split",
  shape_engine_mode_tog_short: "Tog",
  shape_engine_mode_together: "Together",
  shape_engine_mode_unavailable: "unavailable for these flowers",
  shape_engine_more_options: "More Shape Engine options",
  shape_engine_name: "Shape Engine",
  shape_engine_new_grid_announcement: "New grid. Rows {rows}. Columns {columns}.",
  shape_engine_next_generic: "Next {label}",
  shape_engine_next_value: "Next {axis} value",
  shape_engine_no_flowers: "No flowers match the current filters.",
  shape_engine_no_prop_rotation: "No prop rotation",
  shape_engine_not_available: "Not available",
  shape_engine_notation: "Notation",
  shape_engine_notation_heading: "VTG ratios and TKA turns",
  shape_engine_notation_kicker: "Notation in this app",
  shape_engine_notation_prose: "Vulcan Tech Gospel (VTG) was developed by Noel Yee and spinners at the Vulcan Lofts in Oakland. The Level Matrix uses TKA turn values. The Ratio Playground uses exact whole-number spin ratios, including the VTG families {ratios}.",
  shape_engine_open: "Open",
  shape_engine_open_viewer_aria: "Open realization in viewer",
  shape_engine_options: "Shape Engine options",
  shape_engine_orientation_clock: "clock",
  shape_engine_orientation_counter: "counter",
  shape_engine_orientation_in: "in",
  shape_engine_orientation_out: "out",
  shape_engine_original_matrix: "Lorq Nichols’ original 144 Shape Matrix",
  shape_engine_over: "over",
  shape_engine_pause: "Pause",
  shape_engine_pause_theory_animation: "Pause theory animation",
  shape_engine_pick_cell: "Pick a cell",
  shape_engine_pick_crossing: "Pick a crossing",
  shape_engine_pictograph_timeline: "Pictograph timeline",
  shape_engine_pictographs_calibration: "Level 4 pictograph are in visual calibration.",
  shape_engine_pictographs_failed: "Pictographs didn’t load.",
  shape_engine_play: "Play",
  shape_engine_play_pause: "Play / Pause",
  shape_engine_play_theory_animation: "Play theory animation",
  shape_engine_playground: "Playground",
  shape_engine_previous_generic: "Previous {label}",
  shape_engine_previous_value: "Previous {axis} value",
  shape_engine_produces: "produces",
  shape_engine_prop_phase_choices: "Exact prop phase choices",
  shape_engine_prop_rotations: "Prop rotations",
  shape_engine_props: "Props",
  shape_engine_props_choose_phase: "Props · choose phase",
  shape_engine_props_summary: "Props: {detail} {label}",
  shape_engine_prospin: "prospin",
  shape_engine_ratio: "ratio",
  shape_engine_ratio_aria: "{axis} ratio",
  shape_engine_ratio_columns: "Columns {ratio}",
  shape_engine_ratio_decrease_hand: "Decrease {axis} hand cycles",
  shape_engine_ratio_decrease_prop: "Decrease {axis} prop rotations",
  shape_engine_ratio_editor_aria: "Ratio Playground editor. Enter whole numbers from 0 through 15.",
  shape_engine_ratio_hand_field: "{axis} hand cycles",
  shape_engine_ratio_increase_hand: "Increase {axis} hand cycles",
  shape_engine_ratio_increase_prop: "Increase {axis} prop rotations",
  shape_engine_ratio_invalid_zero: "A ratio needs a hand cycle or a prop rotation.",
  shape_engine_ratio_playground: "Ratio Playground",
  shape_engine_ratio_prop_field: "{axis} prop rotations",
  shape_engine_ratio_range: "Each number can be 0 through {max}.",
  shape_engine_ratio_rows: "Rows {ratio}",
  shape_engine_ratios: "Ratios",
  shape_engine_read_ratios: "Read ratios in TKA",
  shape_engine_realizations_aria: "Shape matrix realizations",
  shape_engine_relationship_announcement: "Relationship: {mode}, {relationship}.",
  shape_engine_relationship_aria: "Selected hand relationship and resulting prop relationship",
  shape_engine_resize_matrix_realization: "Resize matrix and realization",
  shape_engine_result: "Result",
  shape_engine_right: "Right",
  shape_engine_right_columns: "Right-hand columns",
  shape_engine_right_flower: "right {flower}",
  shape_engine_rows: "Rows",
  shape_engine_rows_columns: "Rows + columns",
  shape_engine_save: "Save",
  shape_engine_save_library_aria: "Save realization to library",
  shape_engine_selected_pair_aria: "Selected theory pair",
  shape_engine_sequence: "sequence",
  shape_engine_sequence_link_copied: "Sequence link copied",
  shape_engine_settings_display: "Display",
  shape_engine_settings_effects: "Effects",
  shape_engine_settings_effort: "Effort",
  shape_engine_settings_export: "Export",
  shape_engine_settings_for: "{name} settings",
  shape_engine_settings_grid: "Grid",
  shape_engine_settings_layers: "Layers",
  shape_engine_settings_playback: "Playback",
  shape_engine_shape_animation_controls: "Shape animation controls",
  shape_engine_share: "Share",
  shape_engine_share_sequence_aria: "Share realization sequence",
  shape_engine_share_this_view: "Share this view",
  shape_engine_solo_about: "About this flower",
  shape_engine_solo_anti: "{petals}-petal antispin flower",
  shape_engine_solo_anti_mode: "{petals}-petal {mode}-mode antispin flower",
  shape_engine_solo_extension: "Extension",
  shape_engine_solo_float_note: "The prop keeps its angle while the hand circles.",
  shape_engine_solo_hand_left: "Left hand",
  shape_engine_solo_hand_right: "Right hand",
  shape_engine_solo_left: "Play left {flower} on its own",
  shape_engine_solo_mode_box: "Petals at the four corners.",
  shape_engine_solo_mode_diamond: "Petals at the top, bottom and sides.",
  shape_engine_solo_picker: "Flowers for these turns",
  shape_engine_solo_pro: "{petals}-petal inspin flower",
  shape_engine_solo_pro_mode: "{petals}-petal {mode}-mode inspin flower",
  shape_engine_solo_reading_tka: "TKA",
  shape_engine_solo_reading_vtg: "VTG",
  shape_engine_solo_right: "Play right {flower} on its own",
  shape_engine_solo_rotate: "Rotate the grid",
  shape_engine_solo_tka_float: "float · {orientation}",
  shape_engine_solo_tka_value: "{style} · {turns}",
  shape_engine_source_after: ", created the original matrix. It pairs twelve driving styles for each hand into 144 combinations. Shape Engine takes inspiration from that row-and-column format.",
  shape_engine_source_before: "Lorq Nichols, publishing as",
  shape_engine_source_heading: "Lorq Nichols’ 144 Shape Matrix",
  shape_engine_source_kicker: "Source inspiration",
  shape_engine_spoken_ratio: "{value} ratio",
  shape_engine_spoken_turn_many: "{value} turns",
  shape_engine_spoken_turn_one: "{value} turn",
  shape_engine_surface_level_desc: "Level Matrix. Explore Levels 1 through 4.",
  shape_engine_surface_ratio_desc: "Ratio Playground. Build your own 4 by 4.",
  shape_engine_surprise_aria: "Surprise me with a new grid, crossing, and hand relationship",
  shape_engine_surprise_me: "Surprise me",
  shape_engine_surprise_title: "Pick a new grid, crossing, and hand relationship",
  shape_engine_theory_closes_many: "{ratio}, closes in {cycles} hand cycles",
  shape_engine_theory_closes_one: "{ratio}, closes in {cycles} hand cycle",
  shape_engine_theory_float: "{ratio} float {orientation}",
  shape_engine_theory_float_ratio: "{ratio}, float",
  shape_engine_theory_flower: "{ratio} {style} {orientation} · {petals}p",
  shape_engine_theory_hint: "Its two hands run here, in the pairing chosen above.",
  shape_engine_theory_matrix_aria: "Theory matrix",
  shape_engine_theory_stage_hint: "Its shape opens here. Each element traces it live.",
  shape_engine_theory_stationary: "{ratio} stationary hand",
  shape_engine_tka_turns: "TKA turns",
  shape_engine_to_library: "to library",
  shape_engine_toggle_animation: "Toggle the Shape Engine animation",
  shape_engine_trace_this: "Trace this",
  shape_engine_try_again: "Try again",
  shape_engine_turn: "turn",
  shape_engine_turn_label_system: "Turn label system",
  shape_engine_turns: "Turns",
  shape_engine_turns_aria: "Shape Matrix turn controls",
  shape_engine_turns_only_one: "Only value at Level 1",
  shape_engine_unavailable: "Unavailable",
  shape_engine_unlink_ratios: "Unlink row and column ratios",
  shape_engine_use_realization: "Use this realization",
  shape_engine_value_position: "{current} of {total}",
  shape_engine_view_original_matrix: "View Lorq Nichols’ 144 Shape Matrix",
  shape_engine_vtg_ratios: "VTG ratios",
  shape_engine_which_ratio: "Which ratio should both use?",
  shape_engine_why_no_letter_or_level: "Why no letter or level?",
  shape_engine_zero: "Zero",
} as const satisfies Record<string, string>;

export type ShapeEngineStringKey = keyof typeof ENGLISH;
export type ShapeEngineStrings = Record<ShapeEngineStringKey, string>;

const KEY = Symbol("shape-engine-strings");

export type ShapeEngineTranslator = (
  key: ShapeEngineStringKey,
  vars?: Record<string, string | number>
) => string;

let overrides = $state.raw<Partial<ShapeEngineStrings>>({});
let translator = $state.raw<ShapeEngineTranslator | null>(null);

/** Install (or with null, remove) the host's translator. */
export function setTranslator(next: ShapeEngineTranslator | null): void {
  translator = next;
}

/** Swap the host's finished text, for a host whose language changes after mount. */
export function setStrings(next?: Partial<ShapeEngineStrings>): ShapeEngineStrings {
  overrides = { ...next };
  // Spread `next`, not `overrides`: reading the rune here would make the
  // host's $effect.pre depend on what it just wrote, and loop.
  return { ...ENGLISH, ...next };
}

/** Call during component setup: sets the host's text and the context. */
export function provideStrings(next?: Partial<ShapeEngineStrings>): ShapeEngineStrings {
  const strings = setStrings(next);
  setContext(KEY, strings);
  return strings;
}

/** Call during component setup only. */
export function useStrings(): ShapeEngineStrings {
  return (
    getContext<ShapeEngineStrings | undefined>(KEY) ?? {
      ...ENGLISH,
      ...overrides,
    }
  );
}

/** Drop-in for the Composer's `t(key, params)` inside the engine. */
export function s(key: ShapeEngineStringKey, vars?: Record<string, string | number>): string {
  const given = overrides[key];
  if (given === undefined && translator) return translator(key, vars);
  let text: string = given ?? ENGLISH[key] ?? key;
  for (const [k, v] of Object.entries(vars ?? {})) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}
