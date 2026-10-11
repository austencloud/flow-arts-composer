import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
import type {
  GenerationDashChoice,
  GenerationStyleAxis,
} from "./generation-style";

type StyleOption = {
  readonly value: GenerationStyleAxis;
  readonly label: string;
  readonly hint: string;
};

type DashOption = {
  readonly value: GenerationDashChoice;
  readonly label: string;
  readonly hint: string;
};

// The values are saved with a recipe. Getters translate only the text, including
// when someone changes language while this panel is open.
export const GENERATION_STYLE_OPTIONS: readonly StyleOption[] = [
  {
    value: "smooth",
    get label() {
      return tDynamic("create_ui_style_smooth");
    },
    get hint() {
      return tDynamic("create_ui_reversal_hint_smooth");
    },
  },
  {
    value: "mixed",
    get label() {
      return tDynamic("create_ui_style_mixed");
    },
    get hint() {
      return tDynamic("create_ui_reversal_hint_mixed");
    },
  },
  {
    value: "choppy",
    get label() {
      return tDynamic("create_ui_style_choppy");
    },
    get hint() {
      return tDynamic("create_ui_reversal_hint_choppy");
    },
  },
];

export const GENERATION_DASH_OPTIONS: readonly DashOption[] = [
  {
    value: "no-dash",
    get label() {
      return tDynamic("create_ui_dash_low");
    },
    get hint() {
      return tDynamic("create_ui_dash_hint_low");
    },
  },
  {
    value: "mixed",
    get label() {
      return tDynamic("create_ui_style_mixed");
    },
    get hint() {
      return tDynamic("create_ui_dash_hint_mixed");
    },
  },
  {
    value: "prefer-dash",
    get label() {
      return tDynamic("create_ui_dash_high");
    },
    get hint() {
      return tDynamic("create_ui_dash_hint_high");
    },
  },
];
