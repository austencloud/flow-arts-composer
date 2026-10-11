import { describe, it, expect } from "vitest";
import { MAX_IMAGE_BYTES } from "#lib/shared/inbox/domain/image-attachment-limits.js";
import {
  validateIntake,
  screenDescriptors,
  safeName,
  MAX_INTAKE_BYTES,
  MAX_INTAKE_FILES,
  MAX_INTAKE_TEXT,
  MAX_INTAKE_TITLE,
  MAX_INTAKE_NAME,
} from "#lib/shared/share-intake/services/intake-validator.js";

// A control character these tests expect safeName/validateIntake to strip.
// Named rather than inlined: a raw control byte is invisible in an editor,
// survives a diff badly, and tooling silently rewrites it.
const BEL = String.fromCharCode(7);

function fileOf(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function descriptor(name: string, mimeType: string) {
  return { uri: `/cache/shared_files/${name}`, name, mimeType };
}

const reasons = (result: { problems: { reason: string }[] }) =>
  result.problems.map((p) => p.reason);

describe("intake limits", () => {
  it("uses the picker's byte cap rather than a second copy of it", () => {
    expect(MAX_INTAKE_BYTES).toBe(MAX_IMAGE_BYTES);
  });
});

describe("safeName", () => {
  it("strips any directory component", () => {
    expect(safeName("../../evil.png")).toBe("evil.png");
  });

  it("falls back for an all-dots basename", () => {
    expect(safeName("..")).toBe("shared-image");
    expect(safeName("...")).toBe("shared-image");
  });

  it("falls back for an empty or control-only name", () => {
    expect(safeName("")).toBe("shared-image");
    expect(safeName(`${BEL}${BEL}`)).toBe("shared-image");
  });

  it("caps a long name and keeps the extension", () => {
    const long = `${"a".repeat(400)}.png`;
    const result = safeName(long);
    expect(result.length).toBe(MAX_INTAKE_NAME);
    expect(result.endsWith(".png")).toBe(true);
  });
});

describe("screenDescriptors", () => {
  it("admits the allowed mime types", () => {
    const result = screenDescriptors([
      descriptor("a.png", "image/png"),
      descriptor("b.jpg", "image/jpeg"),
      descriptor("c.webp", "image/webp"),
    ]);
    expect(result.admitted).toHaveLength(3);
    expect(result.problems).toHaveLength(0);
  });

  it("rejects an unsupported type BEFORE anything reads its bytes", () => {
    const result = screenDescriptors([descriptor("a.heic", "image/heic")]);
    expect(result.admitted).toHaveLength(0);
    expect(reasons(result)).toEqual(["unsupported-type"]);
  });

  it("reports unsupported-type, not too-many, for an over-cap rejected type", () => {
    const files = [
      ...Array.from({ length: MAX_INTAKE_FILES }, (_, i) =>
        descriptor(`ok${i}.png`, "image/png")
      ),
      descriptor("late.heic", "image/heic"),
    ];
    const result = screenDescriptors(files);
    expect(result.admitted).toHaveLength(MAX_INTAKE_FILES);
    expect(reasons(result)).toEqual(["unsupported-type"]);
  });

  it("caps the count once the type check has passed", () => {
    const files = Array.from({ length: MAX_INTAKE_FILES + 3 }, (_, i) =>
      descriptor(`f${i}.png`, "image/png")
    );
    const result = screenDescriptors(files);
    expect(result.admitted).toHaveLength(MAX_INTAKE_FILES);
    expect(reasons(result)).toEqual(["too-many", "too-many", "too-many"]);
  });

  it("reports the sanitized name, not the raw one", () => {
    const result = screenDescriptors([descriptor("../../evil.heic", "image/heic")]);
    expect(result.problems[0].name).toBe("evil.heic");
  });
});

describe("validateIntake", () => {
  it("accepts a normal png", () => {
    const result = validateIntake({ files: [fileOf("a.png", "image/png", 100)] });
    expect(result.accepted).toHaveLength(1);
    expect(result.problems).toHaveLength(0);
  });

  it("rejects a zero-byte file", () => {
    const result = validateIntake({ files: [fileOf("empty.png", "image/png", 0)] });
    expect(reasons(result)).toEqual(["empty"]);
  });

  it("rejects a file over the byte cap", () => {
    const result = validateIntake({
      files: [fileOf("big.png", "image/png", MAX_INTAKE_BYTES + 1)],
    });
    expect(reasons(result)).toEqual(["too-large"]);
  });

  it("sanitizes the accepted file's name", () => {
    const result = validateIntake({
      files: [fileOf("../../evil.png", "image/png", 10)],
    });
    expect(result.accepted[0].name).toBe("evil.png");
    expect(result.accepted[0].type).toBe("image/png");
  });

  it("truncates text past the cap and says so", () => {
    const result = validateIntake({ files: [], text: "x".repeat(5000) });
    expect(result.text?.length).toBe(MAX_INTAKE_TEXT);
    expect(reasons(result)).toEqual(["text-truncated"]);
  });

  it("truncates the sender-controlled title past its own cap", () => {
    const result = validateIntake({ files: [], title: "t".repeat(5000) });
    expect(result.title?.length).toBe(MAX_INTAKE_TITLE);
    expect(reasons(result)).toEqual(["title-truncated"]);
  });

  it("leaves a short clean title alone and reports nothing", () => {
    // A DIFFERENT input from the control-character test below, on purpose.
    // An earlier revision shipped both tests with the same input, so one of
    // the two asserted nothing the other did not.
    const result = validateIntake({ files: [], title: "Shared photos" });
    expect(result.title).toBe("Shared photos");
    expect(result.problems).toHaveLength(0);
  });

  it("strips control characters out of the title without flagging a problem", () => {
    const result = validateIntake({ files: [], title: `Pho${BEL}tos` });
    expect(result.title).toBe("Photos");
    // Sanitizing is not worth reporting to the user; only truncation is.
    expect(result.problems).toHaveLength(0);
  });
});
