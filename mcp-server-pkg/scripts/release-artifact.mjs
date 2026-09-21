import { createHash } from "node:crypto";

export function artifactIntegrity(bytes) {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

export function assertVerifiedArtifact(bytes, receipt, commit) {
  if (receipt.commit !== commit || !receipt.parityPassed) {
    throw new Error(
      "Release verification is missing or belongs to another commit."
    );
  }
  if (artifactIntegrity(bytes) !== receipt.integrity) {
    throw new Error("The release archive changed after parity verification.");
  }
}
