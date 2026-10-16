const HEX = /^[a-f0-9]{64}$/;

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Cannot hash an undefined value");
  return encoded;
}

export async function sha256(bytes) {
  const data =
    typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function buildId(build) {
  return sha256(
    stableStringify({
      sourceCommit: build.sourceCommit,
      sourceSHA256: build.sourceSHA256,
      outputSHA256: build.outputSHA256,
    })
  );
}

export async function validateCaptureProvenance(
  capture,
  {
    expectedBuildId,
    expectedSequence,
    expectedMotionOptions,
    expectedRig,
    expectedProps,
    expectedClock,
  } = {}
) {
  const p = capture?.provenance;
  const bad = (part) => {
    throw new Error(`Capture provenance ${part} is missing or stale`);
  };
  if (p?.schema !== "tka-performance-capture-v1") bad("schema");
  if (
    !p.build ||
    !HEX.test(p.build.id) ||
    !p.build.sourceCommit ||
    !HEX.test(p.build.sourceSHA256) ||
    !HEX.test(p.build.outputSHA256) ||
    p.build.id !== (await buildId(p.build)) ||
    (expectedBuildId && p.build.id !== expectedBuildId)
  )
    bad("build");
  if (
    !capture.sequence ||
    !HEX.test(p.sequenceSHA256) ||
    p.sequenceSHA256 !== (await sha256(stableStringify(capture.sequence))) ||
    (expectedSequence &&
      p.sequenceSHA256 !== (await sha256(stableStringify(expectedSequence))))
  )
    bad("sequence");
  if (
    !p.rig ||
    p.rig.characterId !== capture.character ||
    !p.rig.sourcePath ||
    !HEX.test(p.rig.sourceSHA256) ||
    (expectedRig && stableStringify(p.rig) !== stableStringify(expectedRig))
  )
    bad("rig");
  if (
    !p.props ||
    p.props.family !== capture.propType ||
    !HEX.test(p.props.buildSHA256) ||
    !Array.isArray(p.props.assets) ||
    p.props.assets.some((asset) => !asset.path || !HEX.test(asset.sha256)) ||
    (expectedProps &&
      stableStringify(p.props) !== stableStringify(expectedProps))
  )
    bad("props");
  const options = p.motionOptions;
  if (
    !options ||
    options.bodyClearance !== null ||
    options.enableLocomotion !== true ||
    options.enableFootPlanting !== true ||
    options.playbackSpeed !== 1 ||
    options.phaseOffsetSteps !== 0 ||
    options.showEffects !== false ||
    (expectedMotionOptions &&
      stableStringify(options) !== stableStringify(expectedMotionOptions))
  )
    bad("motion options");
  const clock = p.clock;
  if (
    !clock ||
    clock.fps !== capture.fps ||
    clock.frameCount !== capture.frames?.length ||
    clock.scoreUnitsPerSecond !== capture.scoreUnitsPerSecond ||
    clock.loopClosure !== "first-frame-at-duration" ||
    (expectedClock && stableStringify(clock) !== stableStringify(expectedClock))
  )
    bad("clock");
  return p;
}
