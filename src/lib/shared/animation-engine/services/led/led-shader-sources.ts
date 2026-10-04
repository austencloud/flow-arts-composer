/**
 * LED Shader Sources
 *
 * GLSL for the photometric LED pipeline. Every stage below is the shader half
 * of a normalization defined in `domain/led-photometry.ts`; none of them carries
 * a tuning constant of its own.
 *
 * 1. Streak     - one normalized Gaussian capsule per LED sub-step
 * 2. Accumulate - exponential shutter decay + normalized deposit
 * 3. Downsample - 13-tap mip chain, partial Karis on the first level only
 * 4. Upsample   - 3x3 tent, mixed into the level above by the glare weight
 * 5. Display    - lerp composite, AgX tone map, straight-alpha output
 */

// ─── Shared Vertex Shader (fullscreen quad) ───────────────────────────────────

export const FULLSCREEN_VERT = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// One instance is one sub-step of one LED: the capsule swept between two
// consecutive points on that LED's path this frame. Geometry is in device
// pixels, because the photometry is in device pixels - sigma, chord length and
// linear density all lose meaning under a viewbox-space quad.
//
// The quad is padded by 3 sigma on every side so the Gaussian's tail is not
// clipped by the quad boundary rather than by its own falloff.

export const LED_STREAK_VERT = `#version 300 es
precision highp float;

// Per-vertex: quad corners (-1 to 1)
in vec2 a_position;

// Per-instance attributes
in vec2 a_segA;        // sub-step start, device pixels
in vec2 a_segB;        // sub-step end, device pixels
in vec3 a_color;       // RGB [0,1]
in float a_density;    // linear energy density along the path
in float a_sigma;      // effective footprint sigma, device pixels
in float a_capStart;   // 1 = round cap, 0 = butt cap
in float a_capEnd;
in vec2 a_cutStart;    // butt cap at segA: normal of the cut, pointing along the path
in vec2 a_cutEnd;      // butt cap at segB: likewise

uniform vec2 u_resolution; // canvas size in device pixels

out vec2 v_pixelPos;
flat out vec2 v_segA;
flat out vec2 v_segB;
flat out vec3 v_color;
flat out float v_density;
flat out float v_sigma;
flat out float v_capStart;
flat out float v_capEnd;
flat out vec2 v_cutStart;
flat out vec2 v_cutEnd;

void main() {
  v_segA = a_segA;
  v_segB = a_segB;
  v_color = a_color;
  v_density = a_density;
  v_sigma = a_sigma;
  v_capStart = a_capStart;
  v_capEnd = a_capEnd;
  v_cutStart = a_cutStart;
  v_cutEnd = a_cutEnd;

  vec2 dir = a_segB - a_segA;
  float segLen = length(dir);
  vec2 axis = segLen > 1e-4 ? dir / segLen : vec2(1.0, 0.0);
  vec2 perp = vec2(-axis.y, axis.x);

  vec2 center = (a_segA + a_segB) * 0.5;
  float pad = a_sigma * 3.0;
  float halfLen = segLen * 0.5 + pad;

  vec2 pixelPos = center
    + axis * (a_position.x * halfLen)
    + perp * (a_position.y * pad);

  v_pixelPos = pixelPos;

  // Pixel space is y-down; clip space is y-up.
  vec2 clipPos = (pixelPos / u_resolution) * 2.0 - 1.0;
  clipPos.y = -clipPos.y;

  gl_Position = vec4(clipPos, 0.0, 1.0);
}
`;

export const LED_STREAK_FRAG = `#version 300 es
precision highp float;

in vec2 v_pixelPos;
flat in vec2 v_segA;
flat in vec2 v_segB;
flat in vec3 v_color;
flat in float v_density;
flat in float v_sigma;
flat in float v_capStart;
flat in float v_capEnd;
flat in vec2 v_cutStart;
flat in vec2 v_cutEnd;

out vec4 fragColor;

const float INV_SQRT_TWO_PI = 0.3989422804014327;

void main() {
  vec2 pa = v_pixelPos - v_segA;
  vec2 ba = v_segB - v_segA;
  float baLenSq = dot(ba, ba);
  bool hasLength = baLenSq > 1e-6;
  float t = hasLength ? dot(pa, ba) / baLenSq : 0.0;

  // Butt caps at a sub-step join, round caps only where the path ends.
  // Rounding both would deposit the join's half-Gaussian twice. Two chords
  // that meet share one cut, so the outside of a curve gets no gap and the
  // inside no doubled sliver; see writeJoinCuts in web-gl-led-renderer.ts.
  if (hasLength && v_capStart < 0.5 && dot(pa, v_cutStart) < 0.0) discard;
  if (hasLength && v_capEnd < 0.5 && dot(v_pixelPos - v_segB, v_cutEnd) > 0.0) discard;

  float d = length(pa - ba * clamp(t, 0.0, 1.0));
  float s = max(v_sigma, 1e-4);
  if (d > s * 4.0) discard;

  // Normalized cross-section: integrates to 1 across the perpendicular, so the
  // splat integrates to exactly the density the CPU computed.
  float profile = exp(-0.5 * d * d / (s * s)) * INV_SQRT_TWO_PI / s;
  float energy = v_density * profile;

  fragColor = vec4(v_color * energy, energy);
}
`;

// Replaces the per-frame decay multiplier, which was framerate-dependent: the
// same value produced different trails at 30 and 60fps. Decay is exp(-dt/tau)
// and the deposit is divided by the sum of the weights the shutter will apply.

export const LED_ACCUMULATE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_deposit;
uniform sampler2D u_history;
uniform float u_decay;        // exp(-dt / timeConstant)
uniform float u_depositScale; // 1 / SHUTTER_GAIN_REFERENCE_S, fixed detector gain

out vec4 fragColor;

void main() {
  vec4 history = texture(u_history, v_uv);
  vec4 deposit = texture(u_deposit, v_uv);
  fragColor = history * u_decay + deposit * u_depositScale;
}
`;

// A box shutter holds every contribution at full weight until it falls off the
// end of the exposure. An exponential accumulator cannot represent that at any
// decay rate, and a ring buffer of one texture per frame is unaffordable — 2.5s
// at 60fps is 150 full-resolution HDR targets.
//
// Instead there are two plain additive accumulators, each cleared every
// `2 * exposure` seconds and staggered one exposure apart, so one is always at
// least half full. Each holds an exact integral over its own age; this pass
// blends them under complementary triangular weights.
//
//   w(age) = 1 - |age/exposure - 1|
//
// Because the two ages differ by exactly one exposure, those triangles sum to 1
// at every instant, each reaches 0 exactly when its buffer is cleared, and the
// age-weighted mean `wA*ageA + wB*ageB` comes out to exactly one exposure —
// which is what makes a steadily swept pattern hold one brightness instead of
// breathing with the clear cycle. Nothing pops on the reset.
//
// The division is by a fixed reference time, not by the window: a camera
// integrates at a constant gain, which is why a longer exposure paints more of
// the arc instead of fading each pass toward the floor. Dividing by the window
// made a 2.5s exposure read about 20x dimmer than the same pass under 0.12s of
// visual persistence, and the light-painted disc disappeared. The eye path now
// divides by the same constant for the same reason. See
// `SHUTTER_GAIN_REFERENCE_S`.
//
// The remaining cost is that a contribution older than the younger buffer is
// carried by only one of the two, so the tail is a soft ramp rather than a
// cliff. That is the honest trade for bounded memory; it still reads as a long
// exposure, and a decayed fake does not.

export const LED_BOX_RESOLVE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_boxA;
uniform sampler2D u_boxB;
uniform float u_weightA;  // triangular window, u_weightA + u_weightB == 1
uniform float u_weightB;
uniform float u_invGain;  // 1 / SHUTTER_GAIN_REFERENCE_S, fixed sensor gain

out vec4 fragColor;

void main() {
  vec4 a = texture(u_boxA, v_uv);
  vec4 b = texture(u_boxB, v_uv);
  fragColor = (a * u_weightA + b * u_weightB) * u_invGain;
}
`;

// 13-tap kernel, Froyok/LearnOpenGL layout. No threshold and no knee: a
// threshold would make glare depend on how bright an LED happens to be, and the
// whole HDR buffer is emitter light already.

export const BLOOM_DOWNSAMPLE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform float u_karis; // 1.0 on the first level only

out vec4 fragColor;

vec3 sanitize(vec3 c) {
  // Half-float overflow produces inf/NaN, and one bad texel would otherwise
  // bloom across the whole frame.
  c = mix(c, vec3(0.0), notEqual(c, c));
  c = clamp(c, vec3(0.0), vec3(65504.0));
  return max(c, vec3(1e-4));
}

vec3 tap(vec2 offset) {
  return sanitize(texture(u_source, v_uv + u_texelSize * offset).rgb);
}

float karisWeight(vec3 c) {
  return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)));
}

void main() {
  vec3 a = tap(vec2(-2.0,  2.0));
  vec3 b = tap(vec2( 0.0,  2.0));
  vec3 c = tap(vec2( 2.0,  2.0));
  vec3 d = tap(vec2(-2.0,  0.0));
  vec3 e = tap(vec2( 0.0,  0.0));
  vec3 f = tap(vec2( 2.0,  0.0));
  vec3 g = tap(vec2(-2.0, -2.0));
  vec3 h = tap(vec2( 0.0, -2.0));
  vec3 i = tap(vec2( 2.0, -2.0));
  vec3 j = tap(vec2(-1.0,  1.0));
  vec3 k = tap(vec2( 1.0,  1.0));
  vec3 l = tap(vec2(-1.0, -1.0));
  vec3 m = tap(vec2( 1.0, -1.0));

  vec3 plain = e * 0.125
             + (a + c + g + i) * 0.03125
             + (b + d + f + h) * 0.0625
             + (j + k + l + m) * 0.125;

  // Partial Karis: firefly suppression applied per box, and only on the first
  // level. Applying it at every level averages the tiny LED cores away - here
  // the fireflies ARE the subject.
  vec3 g0 = (a + b + d + e) * 0.03125;
  vec3 g1 = (b + c + e + f) * 0.03125;
  vec3 g2 = (d + e + g + h) * 0.03125;
  vec3 g3 = (e + f + h + i) * 0.03125;
  vec3 g4 = (j + k + l + m) * 0.125;
  vec3 karis = g0 * karisWeight(g0)
             + g1 * karisWeight(g1)
             + g2 * karisWeight(g2)
             + g3 * karisWeight(g3)
             + g4 * karisWeight(g4);

  fragColor = vec4(mix(plain, karis, u_karis), 1.0);
}
`;

// 3x3 tent. The caller blends the result into the level above with constant
// alpha equal to the glare weight, which is the `mix(up, tent(lower), w)` the
// geometric falloff needs; additive accumulation would flatten the kernel and
// turn every LED into a formless blob.

export const BLOOM_UPSAMPLE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_source;
uniform vec2 u_tentOffset; // UV radius, aspect-corrected, resolution-independent

out vec4 fragColor;

void main() {
  vec2 ts = u_tentOffset;

  vec4 sum = vec4(0.0);
  sum += texture(u_source, v_uv + vec2(-ts.x, -ts.y)) * 1.0;
  sum += texture(u_source, v_uv + vec2(  0.0, -ts.y)) * 2.0;
  sum += texture(u_source, v_uv + vec2( ts.x, -ts.y)) * 1.0;
  sum += texture(u_source, v_uv + vec2(-ts.x,   0.0)) * 2.0;
  sum += texture(u_source, v_uv)                      * 4.0;
  sum += texture(u_source, v_uv + vec2( ts.x,   0.0)) * 2.0;
  sum += texture(u_source, v_uv + vec2(-ts.x,  ts.y)) * 1.0;
  sum += texture(u_source, v_uv + vec2(  0.0,  ts.y)) * 2.0;
  sum += texture(u_source, v_uv + vec2( ts.x,  ts.y)) * 1.0;

  fragColor = sum / 16.0;
}
`;

// The only tone map in the pipeline, applied once, last. AgX is the published
// minimal fit (three.js / Filament / Benjamin Wrensch): it desaturates toward
// white as a channel clips, which is what makes an LED core read as blinding
// while its halo keeps hue.

export const LED_DISPLAY_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloomStrength;
uniform float u_exposure;

out vec4 fragColor;

const mat3 AGX_IN = mat3(0.856627153315983,0.137318972929847,0.11189821299995, 0.0951212405381588,0.761241990602591,0.0767994186031903, 0.0482516061458583,0.101439036467562,0.811302368396859);
const mat3 AGX_OUT = mat3(1.1271005818144368,-0.1413297634984383,-0.14132976349843826, -0.11060664309660323,1.157823702216272,-0.11060664309660294, -0.016493938717834573,-0.016493938717834257,1.2519364065950405);
const mat3 SRGB_TO_2020 = mat3(0.6274,0.0691,0.0164, 0.3293,0.9195,0.0880, 0.0433,0.0113,0.8956);
const mat3 REC2020_TO_SRGB = mat3(1.6605,-0.1246,-0.0182, -0.5876,1.1329,-0.1006, -0.0728,-0.0083,1.1187);
const float AGX_MIN_EV = -12.47393, AGX_MAX_EV = 4.026069;

vec3 agxCurve(vec3 x){ vec3 x2=x*x, x4=x2*x2; return 15.5*x4*x2 - 40.14*x4*x + 31.96*x4 - 6.868*x2*x + 0.4298*x2 + 0.1191*x - 0.00232; }

// The published AgX "look", applied between the curve and the outset matrix as
// in the Blender and three.js implementations. Base AgX is deliberately flat —
// it is a working space, not a finished image — and shipping it without a look
// is what made overlapping rainbow passes average to neutral grey instead of
// staying coloured. Punchy: unit slope, a little gamma, saturation above one.
vec3 agxLook(vec3 c){
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = pow(max(c, vec3(0.0)), vec3(1.35));
  return luma + 1.4 * (c - luma);
}

vec3 agx(vec3 c){ c = SRGB_TO_2020*c; c = AGX_IN*c; c = max(c, 1e-10); c = (log2(c)-AGX_MIN_EV)/(AGX_MAX_EV-AGX_MIN_EV); c = clamp(c,0.0,1.0); c = agxCurve(c); c = agxLook(c); c = AGX_OUT*c; c = pow(max(vec3(0.0),c), vec3(2.2)); c = REC2020_TO_SRGB*c; return clamp(c,0.0,1.0); }

void main() {
  vec3 scene = texture(u_scene, v_uv).rgb;
  vec3 bloom = texture(u_bloom, v_uv).rgb;

  // Added, not lerped. Scattering puts light where the source is not, so a lerp
  // could only dilute the scene and the effect had no glow at all.
  vec3 combined = scene + bloom * u_bloomStrength;
  combined = mix(combined, vec3(0.0), notEqual(combined, combined));

  // Exposure before the tone map, so cores reach AgX's shoulder and blow out to
  // white while their halos keep hue. That contrast is what reads as a lamp.
  vec3 mapped = agx(max(combined, vec3(0.0)) * u_exposure);

  // Straight alpha, because the context is premultipliedAlpha:false. Alpha is
  // the peak channel rather than Rec.709 luminance: reconstruction divides RGB
  // by alpha, and luminance sits below the peak for any saturated hue, so a
  // luminance alpha would push blue past 1.0 and clip it.
  float a = max(mapped.r, max(mapped.g, mapped.b));
  vec3 rgb = a > 0.001 ? mapped / a : vec3(0.0);
  fragColor = vec4(rgb, a);
}
`;
