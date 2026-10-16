/**
 * GPU passes for the 3D smoke fluid. The grid lives in a flat atlas: each z
 * slice is one NX x NY tile, tiles laid left to right then bottom to top, so
 * one full-screen draw updates the whole volume (Harris, GPU Gems 38).
 *
 * Units: cells for position, metres per second for velocity. Pressure and
 * divergence use the usual folded grid scale, so the projection is exact
 * for any cell size.
 *
 * Walls: the floor (j = 0) is solid; the sides and top are open, so smoke
 * and air leave the box instead of piling against it.
 */

export const SMOKE_FLUID_VERTEX = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const GRID = /* glsl */ `
  precision highp float;
  precision highp int;

  uniform vec3 uGrid;
  uniform float uColumns;
  uniform vec2 uAtlas;

  vec2 tileOrigin(float k) {
    float row = floor((k + 0.5) / uColumns);
    return vec2(k - row * uColumns, row) * uGrid.xy;
  }

  /** Cell of this fragment; false for the unused tiles past the last slice. */
  bool cellOf(vec2 fragCoord, out ivec3 cell) {
    vec2 p = floor(fragCoord);
    vec2 tile = floor((p + 0.5) / uGrid.xy);
    vec2 inTile = p - tile * uGrid.xy;
    float k = tile.y * uColumns + tile.x;
    cell = ivec3(int(inTile.x), int(inTile.y), int(k));
    return k < uGrid.z - 0.5;
  }

  bool inside(ivec3 c) {
    return all(greaterThanEqual(c, ivec3(0))) && all(lessThan(c, ivec3(uGrid)));
  }

  /**
   * Cells to the edge of the open air the smoke may use: a round column with
   * a domed top inside the box, so drained smoke never outlines a box.
   * Returns (to the column's side, to its top).
   */
  vec2 envelope(vec3 p) {
    vec2 mid = 0.5 * uGrid.xz;
    float r = length((p.xz - mid) / mid);
    float side = (1.0 - r) * min(mid.x, mid.y);
    float top = uGrid.y * (1.0 - 0.22 * r * r) - p.y;
    return vec2(side, top);
  }

  vec4 fetchCell(sampler2D field, ivec3 c) {
    c = clamp(c, ivec3(0), ivec3(uGrid) - 1);
    return texelFetch(field, ivec2(tileOrigin(float(c.z))) + c.xy, 0);
  }

  /** Trilinear sample at a cell-space point; cell centres sit at i + 0.5. */
  vec4 sampleGrid(sampler2D field, vec3 p) {
    vec3 q = clamp(p, vec3(0.5), uGrid - 0.5);
    float z = q.z - 0.5;
    float k0 = floor(z);
    float k1 = min(k0 + 1.0, uGrid.z - 1.0);
    vec4 a = texture(field, (tileOrigin(k0) + q.xy) / uAtlas);
    vec4 b = texture(field, (tileOrigin(k1) + q.xy) / uAtlas);
    return mix(a, b, z - k0);
  }
`;

/**
 * Prop heads moving through the air: each source is a capsule from where the
 * head was to where it is. Scalars add (smoke and heat); velocity is pulled
 * toward the head's own velocity, the way a solid drags the air it passes.
 */
export const SMOKE_FLUID_SPLAT = /* glsl */ `
  ${GRID}
  #define MAX_SOURCES 16
  uniform sampler2D uField;
  uniform int uCount;
  uniform vec3 uStart[MAX_SOURCES];
  uniform vec3 uEnd[MAX_SOURCES];
  uniform float uRadius[MAX_SOURCES];
  uniform vec4 uValue[MAX_SOURCES];
  uniform float uBlend;
  out vec4 outColor;

  void main() {
    ivec3 cell;
    if (!cellOf(gl_FragCoord.xy, cell)) { outColor = vec4(0.0); return; }
    vec4 value = fetchCell(uField, cell);
    vec3 p = vec3(cell) + 0.5;
    for (int i = 0; i < MAX_SOURCES; i++) {
      if (i >= uCount) break;
      vec3 a = uStart[i];
      vec3 ab = uEnd[i] - a;
      float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
      vec3 d = p - (a + ab * t);
      float r = uRadius[i];
      float g = exp(-dot(d, d) / (r * r));
      if (g < 1e-3) continue;
      if (uBlend > 0.5) value.xyz = mix(value.xyz, uValue[i].xyz, clamp(uValue[i].w * g, 0.0, 1.0));
      else value += uValue[i] * g;
    }
    outColor = value;
  }
`;

/** Semi-Lagrangian advection: trace back along the velocity and sample. */
export const SMOKE_FLUID_ADVECT = /* glsl */ `
  ${GRID}
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform float uDtOverH;
  uniform vec4 uKeep;
  out vec4 outColor;

  void main() {
    ivec3 cell;
    if (!cellOf(gl_FragCoord.xy, cell)) { outColor = vec4(0.0); return; }
    vec3 p = vec3(cell) + 0.5;
    vec3 v = fetchCell(uVelocity, cell).xyz;
    outColor = sampleGrid(uSource, p - v * uDtOverH) * uKeep;
  }
`;

/**
 * MacCormack correction for the smoke itself (Selle et al. 2008): forward and
 * backward traces cancel most of the blur semi-Lagrangian adds, clamped to the
 * neighbours of the traced point so it never overshoots. Also thins smoke and
 * heat as they near the open walls, so they fade on the way out.
 */
export const SMOKE_FLUID_MACCORMACK = /* glsl */ `
  ${GRID}
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform sampler2D uForward;
  uniform sampler2D uBackward;
  uniform float uDtOverH;
  uniform vec4 uKeep;
  uniform float uSponge;
  uniform float uSideBand;
  uniform float uTopBand;
  out vec4 outColor;

  void main() {
    ivec3 cell;
    if (!cellOf(gl_FragCoord.xy, cell)) { outColor = vec4(0.0); return; }
    vec3 p = vec3(cell) + 0.5;
    vec3 v = fetchCell(uVelocity, cell).xyz;
    vec4 forward = fetchCell(uForward, cell);
    vec4 corrected = forward + 0.5 * (fetchCell(uSource, cell) - fetchCell(uBackward, cell));
    vec3 q = clamp(p - v * uDtOverH, vec3(0.5), uGrid - 0.5) - 0.5;
    ivec3 base = ivec3(floor(q));
    vec4 lo = vec4(1e9);
    vec4 hi = vec4(-1e9);
    for (int n = 0; n < 8; n++) {
      ivec3 c = base + ivec3(n & 1, (n >> 1) & 1, (n >> 2) & 1);
      vec4 s = fetchCell(uSource, c);
      lo = min(lo, s);
      hi = max(hi, s);
    }
    // Keep the correction only where it stays inside the traced neighbourhood.
    vec4 result = clamp(corrected, lo, hi) * uKeep;
    // The floor is a solid wall; only the sides and the top drain smoke.
    vec2 room = envelope(p);
    float edge = clamp(min(room.x / max(uSideBand, 1.0), room.y / max(uTopBand, 1.0)), 0.0, 1.0);
    result *= exp(-uSponge * (1.0 - edge) * (1.0 - edge));
    // Only smoke and heat use this pass, and neither goes negative.
    outColor = max(result, vec4(0.0));
  }
`;

export const SMOKE_FLUID_CURL = /* glsl */ `
  ${GRID}
  uniform sampler2D uVelocity;
  out vec4 outColor;

  void main() {
    ivec3 c;
    if (!cellOf(gl_FragCoord.xy, c)) { outColor = vec4(0.0); return; }
    vec3 l = fetchCell(uVelocity, c - ivec3(1, 0, 0)).xyz;
    vec3 r = fetchCell(uVelocity, c + ivec3(1, 0, 0)).xyz;
    vec3 b = fetchCell(uVelocity, c - ivec3(0, 1, 0)).xyz;
    vec3 t = fetchCell(uVelocity, c + ivec3(0, 1, 0)).xyz;
    vec3 k = fetchCell(uVelocity, c - ivec3(0, 0, 1)).xyz;
    vec3 f = fetchCell(uVelocity, c + ivec3(0, 0, 1)).xyz;
    vec3 curl = 0.5 * vec3(
      (t.z - b.z) - (f.y - k.y),
      (f.x - k.x) - (r.z - l.z),
      (r.y - l.y) - (t.x - b.x)
    );
    outColor = vec4(curl, length(curl));
  }
`;

/**
 * Body forces. Warm air rises and smoke-laden air is heavier (Boussinesq,
 * Fedkiw et al. 2001); vorticity confinement gives back the small eddies the
 * grid smears away. Air also loses a little speed to its own viscosity.
 */
export const SMOKE_FLUID_FORCES = /* glsl */ `
  ${GRID}
  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform sampler2D uScalars;
  uniform float uDt;
  uniform float uConfinement;
  uniform float uLift;
  uniform float uWeight;
  uniform float uKeep;
  out vec4 outColor;

  void main() {
    ivec3 c;
    if (!cellOf(gl_FragCoord.xy, c)) { outColor = vec4(0.0); return; }
    vec3 v = fetchCell(uVelocity, c).xyz;
    vec4 w = fetchCell(uCurl, c);
    vec3 grad = 0.5 * vec3(
      fetchCell(uCurl, c + ivec3(1, 0, 0)).w - fetchCell(uCurl, c - ivec3(1, 0, 0)).w,
      fetchCell(uCurl, c + ivec3(0, 1, 0)).w - fetchCell(uCurl, c - ivec3(0, 1, 0)).w,
      fetchCell(uCurl, c + ivec3(0, 0, 1)).w - fetchCell(uCurl, c - ivec3(0, 0, 1)).w
    );
    vec3 force = vec3(0.0);
    float g = length(grad);
    if (g > 1e-5) force += uConfinement * cross(grad / g, w.xyz);
    vec2 s = fetchCell(uScalars, c).xy;
    force.y += uLift * s.y - uWeight * s.x;
    v = (v + force * uDt) * uKeep;
    outColor = vec4(v, 0.0);
  }
`;

const VELOCITY_NEIGHBOURS = /* glsl */ `
  // Open walls copy the edge cell; the solid floor mirrors it.
  vec3 velocityAt(sampler2D field, ivec3 c) {
    vec3 v = fetchCell(field, c).xyz;
    if (c.y < 0) v.y = -v.y;
    return v;
  }
`;

export const SMOKE_FLUID_DIVERGENCE = /* glsl */ `
  ${GRID}
  ${VELOCITY_NEIGHBOURS}
  uniform sampler2D uVelocity;
  out vec4 outColor;

  void main() {
    ivec3 c;
    if (!cellOf(gl_FragCoord.xy, c)) { outColor = vec4(0.0); return; }
    float div = 0.5 * (
      velocityAt(uVelocity, c + ivec3(1, 0, 0)).x - velocityAt(uVelocity, c - ivec3(1, 0, 0)).x +
      velocityAt(uVelocity, c + ivec3(0, 1, 0)).y - velocityAt(uVelocity, c - ivec3(0, 1, 0)).y +
      velocityAt(uVelocity, c + ivec3(0, 0, 1)).z - velocityAt(uVelocity, c - ivec3(0, 0, 1)).z
    );
    outColor = vec4(div, 0.0, 0.0, 0.0);
  }
`;

const PRESSURE_NEIGHBOURS = /* glsl */ `
  // Zero pressure beyond the open walls; the floor reflects (no flow through).
  float pressureAt(sampler2D field, ivec3 c, float centre) {
    if (c.y < 0) return centre;
    if (!inside(c)) return 0.0;
    return fetchCell(field, c).x;
  }
`;

export const SMOKE_FLUID_JACOBI = /* glsl */ `
  ${GRID}
  ${PRESSURE_NEIGHBOURS}
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  out vec4 outColor;

  void main() {
    ivec3 c;
    if (!cellOf(gl_FragCoord.xy, c)) { outColor = vec4(0.0); return; }
    float centre = fetchCell(uPressure, c).x;
    float sum =
      pressureAt(uPressure, c + ivec3(1, 0, 0), centre) +
      pressureAt(uPressure, c - ivec3(1, 0, 0), centre) +
      pressureAt(uPressure, c + ivec3(0, 1, 0), centre) +
      pressureAt(uPressure, c - ivec3(0, 1, 0), centre) +
      pressureAt(uPressure, c + ivec3(0, 0, 1), centre) +
      pressureAt(uPressure, c - ivec3(0, 0, 1), centre);
    outColor = vec4((sum - fetchCell(uDivergence, c).x) / 6.0, 0.0, 0.0, 0.0);
  }
`;

export const SMOKE_FLUID_GRADIENT = /* glsl */ `
  ${GRID}
  ${PRESSURE_NEIGHBOURS}
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  out vec4 outColor;

  void main() {
    ivec3 c;
    if (!cellOf(gl_FragCoord.xy, c)) { outColor = vec4(0.0); return; }
    float centre = fetchCell(uPressure, c).x;
    vec3 grad = 0.5 * vec3(
      pressureAt(uPressure, c + ivec3(1, 0, 0), centre) - pressureAt(uPressure, c - ivec3(1, 0, 0), centre),
      pressureAt(uPressure, c + ivec3(0, 1, 0), centre) - pressureAt(uPressure, c - ivec3(0, 1, 0), centre),
      pressureAt(uPressure, c + ivec3(0, 0, 1), centre) - pressureAt(uPressure, c - ivec3(0, 0, 1), centre)
    );
    vec3 v = fetchCell(uVelocity, c).xyz - grad;
    if (c.y == 0) v.y = max(v.y, 0.0);
    outColor = vec4(v, 0.0);
  }
`;

/**
 * Light reaching each cell: march toward the key light through the smoke.
 * Done once per frame on the grid so the ray march reads one value instead of
 * marching a shadow ray at every sample.
 */
export const SMOKE_FLUID_LIGHT = /* glsl */ `
  ${GRID}
  uniform sampler2D uScalars;
  uniform vec3 uLightStep;
  uniform float uExtinctionPerStep;
  out vec4 outColor;

  void main() {
    ivec3 c;
    if (!cellOf(gl_FragCoord.xy, c)) { outColor = vec4(1.0); return; }
    vec3 p = vec3(c) + 0.5;
    float optical = 0.0;
    for (int i = 1; i <= 20; i++) {
      vec3 q = p + uLightStep * float(i);
      if (any(lessThan(q, vec3(0.0))) || any(greaterThan(q, uGrid))) break;
      optical += sampleGrid(uScalars, q).x;
    }
    outColor = vec4(exp(-optical * uExtinctionPerStep), 0.0, 0.0, 1.0);
  }
`;

/** Moves a field by whole cells when the domain recentres on a performer. */
export const SMOKE_FLUID_SHIFT = /* glsl */ `
  ${GRID}
  uniform sampler2D uSource;
  uniform vec3 uOffset;
  out vec4 outColor;

  void main() {
    ivec3 c;
    if (!cellOf(gl_FragCoord.xy, c)) { outColor = vec4(0.0); return; }
    ivec3 from = c + ivec3(uOffset);
    outColor = inside(from) ? fetchCell(uSource, from) : vec4(0.0);
  }
`;
