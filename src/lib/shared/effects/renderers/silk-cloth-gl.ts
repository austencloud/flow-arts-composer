/**
 * Draws Silk cloth for the Canvas2D backend on a WebGL2 canvas the caller
 * then draws in, the way goo-liquid-gl does for Goo.
 *
 * The cloth arrives as triangles in device pixels, already sorted far to
 * near. Color, opacity and the surface normal are blended across each
 * triangle and the fabric is lit per pixel, so light runs smoothly over the
 * folds, the fading tail has no seams, and edges are multisampled. A fold of
 * see-through silk shows the layer behind it, as in the 3D view.
 */

/** Floats per vertex: (x, y) (nx, ny, nz) (body rgb) (sheen rgb) alpha. */
export const SILK_GL_VERTEX_FLOATS = 12;

export interface SilkClothGLShade {
  roughness: number;
  sheen: number;
  translucency: number;
  metalness: number;
  glow: number;
  light: readonly [number, number, number];
  half: readonly [number, number, number];
}

const VERTEX = `#version 300 es
layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aBody;
layout(location = 3) in vec3 aSheen;
layout(location = 4) in float aAlpha;
uniform vec2 uView;
out vec3 vNormal;
out vec3 vBody;
out vec3 vSheen;
out float vAlpha;
void main() {
  vNormal = aNormal;
  vBody = aBody;
  vSheen = aSheen;
  vAlpha = aAlpha;
  gl_Position = vec4(aPosition.x / uView.x * 2.0 - 1.0, 1.0 - aPosition.y / uView.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vBody;
in vec3 vSheen;
in float vAlpha;
uniform vec3 uLight;
uniform vec3 uHalf;
// roughness, sheen, translucency, metalness
uniform vec4 uFabric;
uniform float uGlow;
out vec4 outColor;

// Soft roll-off so highlights saturate instead of clipping flat.
vec3 roll(vec3 c) {
  return clamp(c / (1.0 + max(vec3(0.0), c - 0.8) * 0.8), 0.0, 1.0);
}

void main() {
  float size = length(vNormal);
  vec3 n = size > 1e-5 ? vNormal / size : vec3(0.0, 0.0, 1.0);
  // Whichever side faces the viewer is the side we light.
  if (n.z < 0.0) n = -n;
  float facing = dot(n, uLight);
  float diffuse = 0.3 + 0.7 * max(0.0, facing);
  // Light on the far side of thin silk glows through it.
  float through = max(0.0, -facing) * uFabric.z * 0.9;
  float grazing = 1.0 - n.z;
  float sheenAmount = uFabric.y * 0.55 * grazing * grazing;
  float shininess = 6.0 + 90.0 * (1.0 - uFabric.x) * (1.0 - uFabric.x);
  float highlight = pow(max(0.0, dot(n, uHalf)), shininess) *
    (0.15 + 0.7 * (1.0 - uFabric.x) + 0.4 * uFabric.w);
  vec3 specular = 1.0 + (vBody - 1.0) * uFabric.w;
  vec3 color = vBody * (diffuse * (1.0 - 0.5 * uFabric.w) + through + uGlow) +
    vSheen * sheenAmount + specular * highlight;
  // The room reflected in the weave: a little everywhere, a broad soft lobe
  // and strongest where the cloth turns edge-on. It shows most on dark cloth,
  // which reads by this alone; pale cloth would wash out under it.
  float fresnel = 0.04 + 0.96 * pow(1.0 - n.z, 5.0);
  float soft = pow(max(0.0, dot(n, uHalf)), 3.0);
  float dark = clamp(1.15 - dot(vBody, vec3(0.3, 0.59, 0.11)), 0.25, 1.0);
  color += (0.12 + 0.5 * fresnel + 0.3 * soft) * (1.0 - 0.6 * uFabric.x) * dark * specular;
  float alpha = clamp(vAlpha, 0.0, 1.0);
  outColor = vec4(roll(color) * alpha, alpha);
}`;

export class SilkClothGL {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vertices: WebGLBuffer;
  private readonly indices: WebGLBuffer;
  private vertexCapacity = 0;
  private indexCapacity = 0;
  private readonly uniforms: Record<string, WebGLUniformLocation | null> = {};

  /** A painter, or null when this context has no WebGL2. */
  static create(): SilkClothGL | null {
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
        antialias: true,
        depth: false,
        preserveDrawingBuffer: true,
      }) as WebGL2RenderingContext | null;
      if (!gl) return null;
      return new SilkClothGL(canvas, gl);
    } catch {
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement | OffscreenCanvas, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.program = link(gl, VERTEX, FRAGMENT);
    for (const name of ["uView", "uLight", "uHalf", "uFabric", "uGlow"]) {
      this.uniforms[name] = gl.getUniformLocation(this.program, name);
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    this.vertices = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
    const stride = SILK_GL_VERTEX_FLOATS * 4;
    const layout: [number, number, number][] = [
      [0, 2, 0],
      [1, 3, 2],
      [2, 3, 5],
      [3, 3, 8],
      [4, 1, 11],
    ];
    for (const [location, size, offset] of layout) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * 4);
    }
    this.indices = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);
  }

  get lost(): boolean {
    return this.gl.isContextLost();
  }

  /** Clear to transparent and draw the triangles; the result is on `canvas`. */
  draw(
    width: number,
    height: number,
    vertices: Float32Array,
    indices: Uint32Array,
    shade: SilkClothGLShade
  ): void {
    const gl = this.gl;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (indices.length === 0) return;

    gl.useProgram(this.program);
    const u = this.uniforms;
    gl.uniform2f(u.uView!, width, height);
    gl.uniform3f(u.uLight!, ...shade.light);
    gl.uniform3f(u.uHalf!, ...shade.half);
    gl.uniform4f(u.uFabric!, shade.roughness, shade.sheen, shade.translucency, shade.metalness);
    gl.uniform1f(u.uGlow!, shade.glow);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
    if (vertices.byteLength > this.vertexCapacity) {
      this.vertexCapacity = vertices.byteLength;
      gl.bufferData(gl.ARRAY_BUFFER, this.vertexCapacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);
    if (indices.byteLength > this.indexCapacity) {
      this.indexCapacity = indices.byteLength;
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indexCapacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, indices);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
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
      throw new Error(`silk shader: ${gl.getShaderInfoLog(shader)}`);
    }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`silk shader: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}
