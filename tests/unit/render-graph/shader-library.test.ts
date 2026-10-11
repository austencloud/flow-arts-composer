import { afterEach, describe, expect, it, vi } from "vitest";
import { ShaderLibrary } from "#lib/shared/render-graph/services/shader-library.js";

const COMPLETION_STATUS_KHR = 0x91b1;
const LINK_STATUS = 0x8b82;
const COMPILE_STATUS = 0x8b81;
const NAMES = ["decay", "composite", "trail-mesh"] as const;

interface FakeShader {
  type: number;
}
interface FakeProgram {
  shaders: FakeShader[];
}

/**
 * A WebGL2 stand-in that records every call which would wait for the driver
 * (status, info-log and location reads) and lets a test decide when the
 * driver has finished compiling.
 */
function fakeGl(
  options: { parallel?: boolean; brokenFragment?: boolean } = {}
) {
  const { parallel = true, brokenFragment = false } = options;
  const waits: string[] = [];
  const finished = new Set<FakeProgram>();
  const programs: FakeProgram[] = [];
  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    LINK_STATUS,
    COMPILE_STATUS,
    getExtension: (name: string) =>
      parallel && name === "KHR_parallel_shader_compile"
        ? { COMPLETION_STATUS_KHR }
        : null,
    createShader: (type: number): FakeShader => ({ type }),
    shaderSource: () => {},
    compileShader: () => {},
    createProgram: (): FakeProgram => {
      const program: FakeProgram = { shaders: [] };
      programs.push(program);
      return program;
    },
    attachShader: (program: FakeProgram, shader: FakeShader) => {
      program.shaders.push(shader);
    },
    linkProgram: () => {},
    deleteShader: () => {},
    deleteProgram: () => {},
    getProgramParameter: (program: FakeProgram, pname: number) => {
      // The completion flag is the one read that never waits.
      if (pname === COMPLETION_STATUS_KHR) return finished.has(program);
      waits.push("LINK_STATUS");
      return !brokenFragment;
    },
    getShaderParameter: (shader: FakeShader) => {
      waits.push("COMPILE_STATUS");
      return !(brokenFragment && shader.type === gl.FRAGMENT_SHADER);
    },
    getShaderInfoLog: () => "bad fragment",
    getProgramInfoLog: () => "link log",
    getAttribLocation: (_program: FakeProgram, name: string) => {
      waits.push(`attrib:${name}`);
      return 0;
    },
    getUniformLocation: (_program: FakeProgram, name: string) => {
      waits.push(`uniform:${name}`);
      return { name };
    },
  };
  return {
    gl: gl as unknown as WebGL2RenderingContext,
    waits,
    finishAll: () => programs.forEach((program) => finished.add(program)),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ShaderLibrary background compiles", () => {
  it("sends every compile without reading anything that waits for the driver", () => {
    const { gl, waits } = fakeGl();
    new ShaderLibrary(gl).compileInBackground(NAMES);
    expect(waits).toEqual([]);
  });

  it("checks each program only after the driver reports it finished", async () => {
    vi.useFakeTimers();
    const { gl, waits, finishAll } = fakeGl();
    const library = new ShaderLibrary(gl);
    library.compileInBackground(NAMES);

    let settled = false;
    void library.settle().then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(50);
    expect(settled).toBe(false);
    expect(waits).toEqual([]);

    finishAll();
    await vi.advanceTimersByTimeAsync(50);
    expect(settled).toBe(true);
    expect(waits.filter((w) => w === "LINK_STATUS")).toHaveLength(NAMES.length);

    // Settled programs come from the cache with no further driver reads.
    const reads = waits.length;
    expect(library.get("trail-mesh").attribs).toHaveProperty("a_position", 0);
    expect(waits).toHaveLength(reads);
  });

  it("still checks every program when the driver cannot compile in parallel", async () => {
    const { gl, waits } = fakeGl({ parallel: false });
    const library = new ShaderLibrary(gl);
    library.compileInBackground(NAMES);
    await library.settle();
    expect(waits.filter((w) => w === "LINK_STATUS")).toHaveLength(NAMES.length);
  });

  it("rejects with the failing shader's compile log, as a synchronous compile threw", async () => {
    const { gl, finishAll } = fakeGl({ brokenFragment: true });
    const library = new ShaderLibrary(gl);
    library.compileInBackground(NAMES);
    finishAll();
    await expect(library.settle()).rejects.toThrow(
      'ShaderLibrary: compile failed for "decay.frag": bad fragment'
    );
  });

  it("stops waiting once disposed", async () => {
    vi.useFakeTimers();
    const { gl } = fakeGl();
    const library = new ShaderLibrary(gl);
    library.compileInBackground(NAMES);
    const settling = library.settle();
    library.dispose();
    await vi.advanceTimersByTimeAsync(50);
    await expect(settling).resolves.toBeUndefined();
  });
});
