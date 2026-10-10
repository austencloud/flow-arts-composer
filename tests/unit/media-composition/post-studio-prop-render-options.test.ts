import { describe, expect, it } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { withPostStudioPropType } from "#lib/shared/share/components/post-studio/post-studio-prop-render-options.js";

describe("withPostStudioPropType", () => {
  it("pins one prop into every live and exported card override", () => {
    const result = withPostStudioPropType(
      {
        addWord: false,
        visibilityOverrides: {
          darkMode: true,
          showQRCode: true,
          leftPropType: PropType.STAFF,
          rightPropType: PropType.CLUB,
        },
      },
      PropType.FAN
    );

    expect(result.addWord).toBe(false);
    expect(result.propTypeOverride).toBe(PropType.FAN);
    expect(result.leftPropTypeOverride).toBe(PropType.FAN);
    expect(result.rightPropTypeOverride).toBe(PropType.FAN);
    expect(result.visibilityOverrides).toMatchObject({
      darkMode: true,
      showQRCode: true,
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
    });
  });
});
