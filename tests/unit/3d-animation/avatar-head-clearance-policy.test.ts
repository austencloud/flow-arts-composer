import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(
  process.cwd(),
  "node_modules/@austencloud/scene-3d"
);

const animatorSource = readFileSync(
  resolve(packageRoot, "src/lib/services/implementations/AvatarAnimator.ts"),
  "utf8"
);

const animatorRuntime = readFileSync(
  resolve(packageRoot, "dist/lib/services/implementations/AvatarAnimator.js"),
  "utf8"
);

const spineTwisterSource = readFileSync(
  resolve(packageRoot, "src/lib/services/implementations/SpineTwister.ts"),
  "utf8"
);

const avatarComponentSource = readFileSync(
  resolve(packageRoot, "src/lib/components/Avatar3D.svelte"),
  "utf8"
);

const avatarComponentRuntime = readFileSync(
  resolve(packageRoot, "dist/lib/components/Avatar3D.svelte"),
  "utf8"
);

describe("avatar head-clearance policy", () => {
  it("keeps unreachable arm targets from pulling the spine into their path", () => {
    expect(animatorSource).toContain("const MAX_REACH_LEAN = 0");
    expect(animatorRuntime).toContain("const MAX_REACH_LEAN = 0");
    expect(animatorSource).toContain(
      "const ARM_CLEARANCE_REACH_RATIOS = [0.92, 0.84, 0.76, 0.68, 0.6]"
    );
    expect(animatorRuntime).toContain(
      "const ARM_CLEARANCE_REACH_RATIOS = [0.92, 0.84, 0.76, 0.68, 0.6]"
    );
    expect(spineTwisterSource).toContain("const MAX_FORWARD_PITCH = 0");
  });

  it.each([
    ["source", animatorSource],
    ["runtime", animatorRuntime],
  ])(
    "lets the elbow solver own arm-to-face clearance in the %s build",
    (_label, animator) => {
      expect(animator).not.toContain("MAX_FOREARM_HEAD_DODGE");
      expect(animator).not.toContain("FOREARM_DODGE_ENGAGE_DISTANCE");
      expect(animator).not.toContain("forearmDodgeEnabled");
      expect(animator).not.toContain("evaluateForearm");
    }
  );

  it("retains staff-driven head avoidance", () => {
    const methodStart = animatorSource.indexOf("private applyHeadDodge(");
    const methodEnd = animatorSource.indexOf(
      "private applyWorldHeadDodge(",
      methodStart
    );
    const method = animatorSource.slice(methodStart, methodEnd);

    expect(methodStart).toBeGreaterThan(-1);
    expect(methodEnd).toBeGreaterThan(methodStart);
    expect(method).toContain("this.headThreats.length");
    expect(method).toContain("targetAngle = bestFactor * MAX_HEAD_DODGE");
    expect(method).not.toContain("getLeftArmChain");
    expect(method).not.toContain("getRightArmChain");
  });

  it.each([
    ["source", animatorSource],
    ["runtime", animatorRuntime],
  ])(
    "does not phase-lag the interpolated stance track in %s",
    (_label, animator) => {
      expect(animator).toContain(
        "this.stanceYawSmoothedRad = this.stanceYawTargetRad"
      );
      expect(animator).not.toMatch(
        /this\.stanceYawSmoothedRad \+=\s*\(this\.stanceYawTargetRad/
      );
      expect(animator).toContain(
        "const stanceTrackActive = maxIKWeight > 0.001"
      );
      expect(animator).toContain(
        "const stanceCorrectionActive = Math.abs(stanceYawCorrectionRad) > 0.001"
      );
    }
  );

  it.each([
    ["source", animatorSource],
    ["runtime", animatorRuntime],
  ])(
    "keeps the stance baseline stable across rendered frames in %s",
    (_label, animator) => {
      expect(animator).toContain("refreshStanceReferenceForward(state");
      expect(animator).toContain("_stanceReferenceRoot");
      expect(animator).toContain("_stanceReferenceLocalForward");
      expect(animator).toContain("root !== this._stanceReferenceRoot");
      expect(animator).toContain("this.refreshStanceReferenceForward(state)");
      expect(animator).not.toMatch(
        /this\.refreshBodyFrame\(state, leftChain, rightChain\);\s*this\._stanceReferenceForward\.copy/
      );
    }
  );

  it.each([
    ["source", animatorSource],
    ["runtime", animatorRuntime],
  ])("retries only measured body intersections in %s", (_label, animator) => {
    expect(animator).toMatch(/this\.solveArmWithBodyClearance\(\s*"left"/);
    expect(animator).toMatch(/this\.solveArmWithBodyClearance\(\s*"right"/);
    expect(animator).toContain("this.armClearsBody(chain, context)");
    expect(animator).toContain("this.armBodyClearanceMargin(chain, context)");
    expect(animator).toContain(
      "this.solveArmAtClearPole(chain, target, context)"
    );
    expect(animator).toContain("this.rememberClearArmRoute(");
    expect(animator).toMatch(
      /!this\.armClearsBody\(leftChain, leftClearanceContext\)/
    );
    expect(animator).toMatch(
      /!this\.armClearsBody\(rightChain, rightClearanceContext\)/
    );
    expect(animator).not.toContain("limitArmExtensionForClearance");
  });

  it.each([
    ["source", avatarComponentSource],
    ["runtime", avatarComponentRuntime],
  ])(
    "measures upper arms from their real chain roots in %s",
    (_label, component) => {
      expect(component).toContain(
        "leftChain.root.getWorldPosition(_boneVecs.leftShoulder)"
      );
      expect(component).toContain(
        "rightChain.root.getWorldPosition(_boneVecs.rightShoulder)"
      );
    }
  );

  it.each([
    ["source", animatorSource],
    ["runtime", animatorRuntime],
  ])(
    "builds the solver face envelope from real arm roots in %s",
    (_label, animator) => {
      expect(animator).toContain(
        'leftChain?.root ?? state.bones.get("LeftShoulder")'
      );
      expect(animator).toContain(
        'rightChain?.root ?? state.bones.get("RightShoulder")'
      );
      expect(animator).toMatch(
        /applyReachEscalation\("left"[\s\S]{0,300}refreshFaceClearanceCenter/
      );
      expect(animator).toMatch(
        /applyReachEscalation\("right"[\s\S]{0,300}refreshFaceClearanceCenter/
      );
    }
  );
});
