/**
 * Draws goo as lit liquid for the Canvas2D backend, the way the 3D goo's
 * glossy material does, on a WebGL2 canvas the caller then draws in.
 *
 * Every piece of liquid is a round cone: two circles joined by their
 * tangents, which covers a rope segment, a sphere (both ends equal) and a
 * stretched drop. Each is drawn as one quad whose fragment works out the
 * height of the swept sphere under the pixel, so it has a true rounded
 * surface and normal. Depth testing on that height merges overlapping
 * pieces the way intersecting 3D meshes merge: a rope and its bulb read as one
 * body with no seams.
 *
 * Shading follows the 3D goo's wet material: a dark studio with a tall warm
 * softbox behind, a soft window high in front, a small hard key and a lit
 * floor, reflected with Fresnel, a deep body color, the thin edge lit in its
 * own color, and Mercury as a mirror. A piece's `flat` squashes its bulge and
 * `tint` shades it toward the deep puddle color.
 */

/** Floats per piece: (ax, ay, bx, by) (ra, rb, flat, alpha) (depth, tint, -, -). */
export const GOO_PIECE_FLOATS = 12;

export interface GooLiquidShade {
  /** Linear RGB. */
  core: readonly [number, number, number];
  puddle: readonly [number, number, number];
  alpha: number;
  metal: number;
  glow: number;
}

/** A growable list of pieces in device pixels. */
export class GooPieces {
  data = new Float32Array(GOO_PIECE_FLOATS * 256);
  count = 0;

  clear(): void {
    this.count = 0;
  }

  push(
    ax: number,
    ay: number,
    ar: number,
    bx: number,
    by: number,
    br: number,
    flat: number,
    alpha: number,
    depth: number,
    tint: number
  ): void {
    if (!(ar > 0.05 || br > 0.05)) return;
    if ((this.count + 1) * GOO_PIECE_FLOATS > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    const o = this.count * GOO_PIECE_FLOATS;
    const d = this.data;
    d[o] = ax;
    d[o + 1] = ay;
    d[o + 2] = bx;
    d[o + 3] = by;
    d[o + 4] = Math.max(0, ar);
    d[o + 5] = Math.max(0, br);
    d[o + 6] = flat;
    d[o + 7] = alpha;
    d[o + 8] = depth;
    d[o + 9] = tint;
    d[o + 10] = 0;
    d[o + 11] = 0;
    this.count++;
  }
}

const VERTEX = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 iA;
layout(location = 2) in vec4 iB;
layout(location = 3) in vec4 iC;
uniform vec2 uView;
out vec2 vPos;
flat out vec4 vA;
flat out vec4 vB;
flat out vec4 vC;
void main() {
  vec2 a = iA.xy;
  vec2 b = iA.zw;
  vec2 axis = b - a;
  float len = length(axis);
  vec2 u = len > 1e-4 ? axis / len : vec2(1.0, 0.0);
  vec2 n = vec2(-u.y, u.x);
  float r = max(iB.x, iB.y) + 1.5;
  vec2 p = (a + b) * 0.5 + u * (aCorner.x * (len * 0.5 + r)) + n * (aCorner.y * r);
  vPos = p;
  vA = iA;
  vB = iB;
  vC = iC;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vPos;
flat in vec4 vA;
flat in vec4 vB;
flat in vec4 vC;
uniform vec3 uCore;
uniform vec3 uPuddle;
uniform float uAlpha;
uniform float uMetal;
uniform float uGlow;
out vec4 outColor;

float sixth(float x) {
  float x2 = x * x;
  return x2 * x2 * x2;
}

// Soft-edged box on the equirectangular studio map.
float box(float u, float v, float cu, float cv, float w, float h) {
  float du = abs(u - cu);
  du = min(du, 1.0 - du);
  return exp(-sixth(du / w)) * exp(-sixth((v - cv) / h));
}

// The 3D goo's night studio: a dim dome, a warm softbox behind, a cool one in
// front, and one small hard key high behind the left.
vec3 studio(vec3 d) {
  float u = atan(d.z, d.x) * 0.15915494 + 0.5;
  float v = asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5;
  float dome = pow(max(0.0, (v - 0.5) / 0.5), 1.2);
  float hz = (v - 0.52) / 0.03;
  float horizon = exp(-hz * hz);
  float warm = box(u, v, 0.26, 0.68, 0.018, 0.24);
  float cool = box(u, v, 0.9, 0.74, 0.06, 0.09);
  float key = box(u, v, 0.08, 0.8, 0.03, 0.04);
  // The lit floor below, which chrome mirrors as a pale lower half.
  float ground = 0.4 * smoothstep(0.5, 0.42, v) * (0.5 + 0.5 * smoothstep(0.1, 0.4, v));
  return vec3(
    ground + 0.02 + 0.1 * dome + 0.05 * horizon + 7.0 * warm + 9.0 * cool + 14.0 * key,
    ground + 0.024 + 0.12 * dome + 0.06 * horizon + 6.6 * warm + 10.0 * cool + 14.0 * key,
    ground + 0.035 + 0.17 * dome + 0.08 * horizon + 6.0 * warm + 11.0 * cool + 13.0 * key
  );
}

// Light the studio throws on a rough surface facing n.
vec3 irradiance(vec3 n) {
  vec3 cool = vec3(0.84, 0.95, 1.15) * 0.55 * max(0.0, dot(n, vec3(0.0, 0.59, 0.81)));
  vec3 key = vec3(1.0) * 0.35 * max(0.0, dot(n, vec3(-0.51, 0.81, -0.28)));
  vec3 warm = vec3(1.1, 1.0, 0.9) * 0.6 * max(0.0, dot(n, vec3(0.07, 0.55, -0.83)));
  vec3 dome = vec3(0.1, 0.12, 0.17) * (0.6 + 0.4 * n.y);
  return cool + key + warm + dome;
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 encode(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 a = vA.xy;
  vec2 b = vA.zw;
  float ra = vB.x;
  float rb = vB.y;
  // The sphere swept from a to b that rises highest under this pixel.
  vec2 axis = b - a;
  vec2 q = vPos - a;
  float dr = rb - ra;
  float den = dot(axis, axis) - dr * dr;
  float t = den > 1e-3 ? clamp((dot(q, axis) + ra * dr) / den, 0.0, 1.0) : (rb > ra ? 1.0 : 0.0);
  vec2 d = vPos - (a + axis * t);
  float r = ra + dr * t;
  float dist = length(d);
  float coverage = clamp(r - dist + 0.5, 0.0, 1.0);
  if (coverage <= 0.0) discard;
  float z = sqrt(max(r * r - dist * dist, 0.0));
  float flatness = vB.z;
  // Screen space has y down; the studio has y up and z toward the viewer.
  vec3 s = normalize(vec3(d * flatness, max(z, 1e-3)));
  vec3 n = vec3(s.x, -s.y, s.z);
  float facing = clamp(n.z, 0.0, 1.0);
  vec3 base = mix(uCore, uPuddle, vC.y);
  float metal = uMetal;

  vec3 env = studio(reflect(vec3(0.0, 0.0, -1.0), n));
  float fresnel = pow(1.0 - facing, 5.0);
  vec3 f0 = mix(vec3(0.04), base, metal);
  // The base layer, then the clear coat over it.
  vec3 spec = env * (f0 + (1.0 - f0) * fresnel);
  spec += env * (0.04 + 0.96 * fresnel) * 0.5 * (1.0 - metal);
  vec3 diffuse = base * irradiance(n) * (1.0 - metal);
  // Light skimming through thin liquid lights its edge in its own color.
  vec3 edge = base * pow(1.0 - facing, 3.0) * 0.45 * (1.0 - metal);
  vec3 glow = base * uGlow;

  // A view ray crosses more liquid through a bead's middle than its rim.
  float alpha = uAlpha * vB.w * mix(0.62, 1.0, facing);
  // Reflections ride on the surface, so transparency must not dim them.
  vec3 color = diffuse + edge + glow + spec / max(alpha, 0.35);
  color = encode(aces(color));
  alpha = min(1.0, alpha + 0.5 * dot(aces(spec), vec3(0.333))) * coverage;
  outColor = vec4(color * alpha, alpha);
  gl_FragDepth = clamp(vC.x - z * flatness / 16384.0, 0.0, 1.0);
}`;

export class GooLiquidGL {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private pieces: WebGLBuffer;
  private capacity = 0;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  /** A painter, or null when this context has no WebGL2. */
  static create(): GooLiquidGL | null {
    try {
      const canvas =
        typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(1, 1)
          : typeof document !== "undefined"
            ? document.createElement("canvas")
            : null;
      if (!canvas) return null;
      const gl = canvas.getContext("webgl2", {
        premultipliedAlpha: true,
        alpha: true,
        antialias: false,
        depth: true,
        preserveDrawingBuffer: true,
      }) as WebGL2RenderingContext | null;
      if (!gl) return null;
      return new GooLiquidGL(canvas, gl);
    } catch {
      return null;
    }
  }

  private constructor(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    gl: WebGL2RenderingContext
  ) {
    this.canvas = canvas;
    this.gl = gl;
    this.program = link(gl, VERTEX, FRAGMENT);
    for (const name of ["uView", "uCore", "uPuddle", "uAlpha", "uMetal", "uGlow"]) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.pieces = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pieces);
    const stride = GOO_PIECE_FLOATS * 4;
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, stride, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
  }

  get lost(): boolean {
    return this.gl.isContextLost();
  }

  /** Clear to transparent and draw `pieces`; the result is on `canvas`. */
  draw(width: number, height: number, pieces: GooPieces, shade: GooLiquidShade): void {
    const gl = this.gl;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (pieces.count === 0) return;

    gl.useProgram(this.program);
    const u = this.uniforms;
    gl.uniform2f(u.uView!, width, height);
    gl.uniform3f(u.uCore!, ...shade.core);
    gl.uniform3f(u.uPuddle!, ...shade.puddle);
    gl.uniform1f(u.uAlpha!, shade.alpha);
    gl.uniform1f(u.uMetal!, shade.metal);
    gl.uniform1f(u.uGlow!, shade.glow);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.pieces);
    const used = pieces.data.subarray(0, pieces.count * GOO_PIECE_FLOATS);
    if (used.byteLength > this.capacity) {
      this.capacity = pieces.data.byteLength;
      gl.bufferData(gl.ARRAY_BUFFER, this.capacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, used);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, pieces.count);
  }
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram()!;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`goo shader: ${gl.getShaderInfoLog(shader)}`);
    }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`goo shader: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

/** "#rrggbb" or "#rgb" to linear RGB; `fallback` when it does not parse. */
export function hexToLinear(
  hex: string,
  fallback: readonly [number, number, number] = [0.04, 0.2, 0.7]
): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [...fallback];
  let h = m[1]!;
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const channel = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel(0), channel(2), channel(4)];
}
