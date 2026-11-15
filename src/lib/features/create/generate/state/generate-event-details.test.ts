import { describe, expect, it } from "vitest";
import { describeGenerateChoices } from "./generate-event-details";
import { GENERATE_DEFAULT_CONFIG } from "./generate-config.svelte";

const base = { ...GENERATE_DEFAULT_CONFIG };

describe("describeGenerateChoices", () => {
  it("reports an untouched config as default", () => {
    const details = describeGenerateChoices(base);
    expect(details.gen_is_default_config).toBe(true);
    expect(details.gen_settings_changed).toBe("");
  });

  it("lists exactly the keys that differ, sorted", () => {
    const details = describeGenerateChoices({
      ...base,
      level: 3,
      length: 16,
    });
    expect(details.gen_settings_changed).toBe("length,level");
    expect(details.gen_is_default_config).toBe(false);
    expect(details.gen_level).toBe(3);
  });

  it("leaves the LOOP fields out when LOOP is off", () => {
    const off = describeGenerateChoices({ ...base, loopEnabled: false });
    expect(off).not.toHaveProperty("gen_loop_type");
    expect(off).not.toHaveProperty("gen_loop_period");
    const on = describeGenerateChoices(base);
    expect(on.gen_loop_type).toBe(base.loopType);
    expect(on.gen_loop_period).toBe(base.period);
  });

  it("reduces start and end placements to short strings", () => {
    expect(describeGenerateChoices(base, {}).gen_start_position).toBe("any");
    expect(describeGenerateChoices(base, {}).gen_end_position).toBe("any");
    const picked = describeGenerateChoices(base, {
      blockedStartPlacements: ["gamma11", "alpha3"],
      endPlacements: ["beta5", "alpha1"],
    });
    expect(picked.gen_start_position).toBe("blocked:alpha3+gamma11");
    expect(picked.gen_end_position).toBe("alpha1+beta5");
    expect(describeGenerateChoices(base)).not.toHaveProperty(
      "gen_start_position"
    );
  });
});
