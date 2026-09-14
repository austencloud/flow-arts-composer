import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exec: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  write: vi.fn(),
  unlink: vi.fn(),
  exists: vi.fn(),
  read: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock("node:child_process", () => ({
  execFile: mocks.exec,
  default: { execFile: mocks.exec },
}));
vi.mock("node:fs", () => ({
  existsSync: mocks.exists,
  default: { existsSync: mocks.exists },
}));
vi.mock("node:fs/promises", () => {
  const functions = {
    mkdir: vi.fn(),
    open: mocks.open,
    readFile: mocks.read,
    unlink: mocks.unlink,
    writeFile: mocks.writeFile,
  };
  return { ...functions, default: functions };
});
import { GET, POST } from "./+server";

function event(
  origin = "https://localhost:5173",
  address = "::1",
  host = "https://localhost:5173",
  body?: unknown
) {
  const url = new URL(`${host}/test/character-playground/generate`);
  return {
    url,
    getClientAddress: () => address,
    request: new Request(url, {
      method: "POST",
      headers:
        body === undefined
          ? { origin }
          : { origin, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exists.mockReturnValue(true);
  mocks.open.mockResolvedValue({ close: mocks.close, writeFile: mocks.write });
  mocks.read.mockResolvedValue(
    JSON.stringify({ id: "intake-mpfb-42", seed: 42 })
  );
  mocks.exec.mockImplementation((_file, _args, _options, done) =>
    done(null, "", "")
  );
});

describe("local character generator boundary", () => {
  it("rejects a remote client before starting a process", async () => {
    await expect(POST(event(undefined, "192.168.1.4"))).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.exec).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests and non-local hostnames", async () => {
    await expect(POST(event("https://example.com"))).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      POST(event("https://example.com", "::1", "https://example.com"))
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("keeps viewing available when MPFB is not installed", async () => {
    mocks.exists.mockReturnValue(false);
    expect(await GET(event()).json()).toEqual({
      available: false,
      busy: false,
    });
    await expect(POST(event())).rejects.toMatchObject({ status: 503 });
    expect(mocks.exec).not.toHaveBeenCalled();
  });
  it("does not launch a second Blender job or remove its lock", async () => {
    mocks.open.mockRejectedValueOnce(
      Object.assign(new Error("busy"), { code: "EEXIST" })
    );
    await expect(POST(event())).rejects.toMatchObject({ status: 409 });
    expect(mocks.exec).not.toHaveBeenCalled();
    expect(mocks.unlink).not.toHaveBeenCalled();
  });
  it("returns the generated character and releases the owned lock", async () => {
    expect(await (await POST(event())).json()).toEqual({
      id: "intake-mpfb-42",
      seed: 42,
    });
    expect(mocks.exec).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.unlink).toHaveBeenCalledOnce();
  });
  it("only accepts bounded creator options and passes a file path to the job", async () => {
    const options = {
      presentation: "masculine",
      age: "middleage",
      height: 0.5,
      weight: 0.4,
      muscle: 0.6,
      proportions: 0.5,
      face: 0.7,
      hair: "short01",
      outfit: "male_casualsuit01",
    };
    await POST(event(undefined, undefined, undefined, options));
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("requested-options.json"),
      expect.any(String)
    );
    expect(JSON.parse(mocks.writeFile.mock.calls[0]?.[1] as string)).toEqual(
      options
    );
    const args = mocks.exec.mock.calls[0]?.[1] as string[];
    expect(args.some((arg) => arg.endsWith("requested-options.json"))).toBe(
      true
    );
  });
  it("rejects arbitrary generation input before writing a job file", async () => {
    await expect(
      POST(event(undefined, undefined, undefined, { output: "E:/anything" }))
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.exec).not.toHaveBeenCalled();
  });
  it("releases the lock after a failed generation so retry remains possible", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.exec.mockImplementationOnce((_file, _args, _options, done) =>
      done(new Error("Blender failed"))
    );
    await expect(POST(event())).rejects.toMatchObject({ status: 500 });
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.unlink).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
