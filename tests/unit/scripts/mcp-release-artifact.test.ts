import { describe, expect, it } from "vitest";
import {
  artifactIntegrity,
  assertVerifiedArtifact,
} from "../../../mcp-server-pkg/scripts/release-artifact.mjs";

describe("verified MCP release archive", () => {
  const bytes = Buffer.from("the tested package");
  const receipt = {
    commit: "tested-commit",
    integrity: artifactIntegrity(bytes),
    parityPassed: true,
  };
  it("accepts only the tested bytes and commit", () => {
    expect(() =>
      assertVerifiedArtifact(bytes, receipt, "tested-commit")
    ).not.toThrow();
    expect(() =>
      assertVerifiedArtifact(
        Buffer.from("rebuilt package"),
        receipt,
        "tested-commit"
      )
    ).toThrow("changed");
    expect(() => assertVerifiedArtifact(bytes, receipt, "new-commit")).toThrow(
      "another commit"
    );
    expect(() =>
      assertVerifiedArtifact(
        bytes,
        { ...receipt, parityPassed: false },
        "tested-commit"
      )
    ).toThrow("verification");
  });
});
