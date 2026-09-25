import { FIRE_PROP_VISIBILITY } from "../fire/fire-prop-visibility";

/**
 * FluidShaderSources
 *
 * GLSL 300 es shader programs for a multi-pass Navier-Stokes fluid simulation
 * with shared transport plus Fire and Smoke material passes.
 *
 * Architecture: Each frame runs ~30 draw calls through this pipeline:
 *   1. Splat injection (fuel + velocity at tip positions)
 *   2. Velocity self-advection
 *   3. Curl computation → vorticity confinement
 *   4. Buoyancy (temperature drives upward force)
 *   5. Combustion (fuel → heat) + cooling
 *   6. Divergence of velocity
 *   7. Jacobi pressure iterations (20-40x)
 *   8. Gradient subtraction (pressure → velocity correction)
 *   9. Temperature + fuel advection through velocity field
 *   10. Display render (temperature → blackbody color)
 *
 * References:
 *   - GPU Gems Ch. 38 (Harris, 2004)
 *   - "Simulating Fluids, Fire, and Smoke in Real-Time" (Andrew Chan)
 *   - Pavel Dobryakov's WebGL-Fluid-Simulation
 */

// Shared vertex shader: fullscreen quad via gl_VertexID

export const VERTEX_SHADER = `#version 300 es
precision highp float;

const vec2 POSITIONS[6] = vec2[6](
  vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
  vec2(-1.0,  1.0), vec2(1.0, -1.0), vec2(1.0,  1.0)
);

out vec2 v_uv;

void main() {
  vec2 pos = POSITIONS[gl_VertexID];
  v_uv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

// Draws the alpha of a real prop sprite into a screen-space matte. The same
// fullscreen vertex shader is scissored to each rotated sprite's bounds, so
// tunnel copies cost only the pixels they cover rather than a full-screen pass.
export const PROP_VISIBILITY_MATTE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_propSprite;
uniform vec2 u_targetSize;
uniform vec2 u_center;
uniform vec2 u_size;
uniform float u_angle;
uniform float u_flipped;
uniform float u_opacity;

void main() {
  vec2 pixel = vec2(gl_FragCoord.x, u_targetSize.y - gl_FragCoord.y);
  vec2 delta = pixel - u_center;
  float c = cos(u_angle);
  float s = sin(u_angle);
  vec2 local = vec2(
    c * delta.x + s * delta.y,
    -s * delta.x + c * delta.y
  );
  if (u_flipped > 0.5) local.x = -local.x;

  vec2 spriteUv = local / max(u_size, vec2(0.0001)) + 0.5;
  if (any(lessThan(spriteUv, vec2(0.0))) || any(greaterThan(spriteUv, vec2(1.0)))) {
    discard;
  }

  vec4 sprite = texture(u_propSprite, vec2(spriteUv.x, 1.0 - spriteUv.y));
  float matte = sprite.a * clamp(u_opacity, 0.0, 1.0);
  if (matte < 0.001) discard;
  fragColor = vec4(sprite.rgb * matte, matte);
}
`;

// Injects up to 32 swept-tip samples in one draw. Every contribution is
// additive, so this is mathematically equivalent to the old one-draw-per-splat
// path without forcing hundreds of framebuffer swaps during fast motion.
export const SPLAT_BATCH_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_target;
uniform vec2 u_points[32];
uniform vec3 u_values[32];
uniform float u_radii[32];
uniform int u_count;

void main() {
  vec3 addition = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= u_count) break;
    vec2 delta = v_uv - u_points[i];
    float radius = max(u_radii[i], 0.00001);
    float weight = exp(-dot(delta, delta) / (radius * radius));
    addition += u_values[i] * weight;
  }
  fragColor = texture(u_target, v_uv) + vec4(addition, 0.0);
}
`;

// Advection: Semi-Lagrangian backtracing.
// Moves a field (velocity, temperature, fuel) through the velocity field.

export const ADVECTION_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_velocity;  // velocity field
uniform sampler2D u_source;    // field to advect (can be velocity itself)
uniform vec2 u_texelSize;      // 1.0 / simResolution
uniform float u_dt;            // timestep
uniform float u_dissipation;   // decay factor (0.99 = slow fade, 0.9 = fast fade)

void main() {
  vec2 vel = texture(u_velocity, v_uv).xy;
  // Backtrace: where did this fluid come from?
  vec2 prevUV = v_uv - u_dt * vel * u_texelSize;
  fragColor = u_dissipation * texture(u_source, prevUV);
}
`;

// Limited MacCormack correction. Forward and reverse advection recover the
// detail lost by first-order backtracing; the source-neighbour clamp prevents
// overshoot from creating negative fuel or bright ringing around flame edges.
export const MACCORMACK_CORRECTION_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_velocity;
uniform sampler2D u_source;
uniform sampler2D u_forward;
uniform sampler2D u_reverse;
uniform vec2 u_texelSize;
uniform float u_dt;
uniform float u_dissipation;

void main() {
  vec2 velocity = texture(u_velocity, v_uv).xy;
  vec2 previousUV = clamp(v_uv - u_dt * velocity * u_texelSize, vec2(0.0), vec2(1.0));

  vec2 sourceCoord = previousUV / u_texelSize - 0.5;
  vec2 baseCoord = floor(sourceCoord) + 0.5;
  vec2 uv00 = baseCoord * u_texelSize;
  vec2 uv10 = uv00 + vec2(u_texelSize.x, 0.0);
  vec2 uv01 = uv00 + vec2(0.0, u_texelSize.y);
  vec2 uv11 = uv00 + u_texelSize;

  vec4 s00 = texture(u_source, uv00);
  vec4 s10 = texture(u_source, uv10);
  vec4 s01 = texture(u_source, uv01);
  vec4 s11 = texture(u_source, uv11);
  vec4 lower = min(min(s00, s10), min(s01, s11));
  vec4 upper = max(max(s00, s10), max(s01, s11));

  vec4 forwardValue = texture(u_forward, v_uv);
  vec4 reverseValue = texture(u_reverse, v_uv);
  vec4 sourceValue = texture(u_source, v_uv);
  vec4 corrected = forwardValue + 0.5 * (sourceValue - reverseValue);
  fragColor = clamp(corrected, lower, upper) * u_dissipation;
}
`;

// Curl: compute the scalar curl (vorticity) of 2D velocity field.
// curl = dVy/dx - dVx/dy

export const CURL_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_velocity;
uniform vec2 u_texelSize;

void main() {
  float vL = texture(u_velocity, v_uv - vec2(u_texelSize.x, 0.0)).y;
  float vR = texture(u_velocity, v_uv + vec2(u_texelSize.x, 0.0)).y;
  float vB = texture(u_velocity, v_uv - vec2(0.0, u_texelSize.y)).x;
  float vT = texture(u_velocity, v_uv + vec2(0.0, u_texelSize.y)).x;
  float curl = (vR - vL) - (vT - vB);
  fragColor = vec4(curl * 0.5, 0.0, 0.0, 1.0);
}
`;

// Vorticity confinement: restore small-scale rotational detail
// lost to numerical diffusion. Adds force along curl gradient.

export const VORTICITY_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_velocity;
uniform sampler2D u_curl;
uniform vec2 u_texelSize;
uniform float u_dt;
uniform float u_strength;    // vorticity confinement coefficient
uniform float u_time;        // seconds, for flickering pulse

void main() {
  float cL = texture(u_curl, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float cR = texture(u_curl, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float cB = texture(u_curl, v_uv - vec2(0.0, u_texelSize.y)).x;
  float cT = texture(u_curl, v_uv + vec2(0.0, u_texelSize.y)).x;
  float cC = texture(u_curl, v_uv).x;

  // Gradient of absolute curl
  vec2 grad = vec2(abs(cR) - abs(cL), abs(cT) - abs(cB)) * 0.5;
  float len = max(length(grad), 1e-5);
  vec2 N = grad / len;

  // Time-varying vorticity pulse: real flames flicker at ~10-15 Hz due to
  // periodic vortex shedding. Modulating the confinement strength at this
  // frequency creates a natural pulsing amplification of rotational detail
  // that matches the physical vortex shedding cycle.
  float pulse = 1.0 + 0.4 * sin(u_time * 2.0 * 3.14159 * 12.0)   // ~12 Hz primary
                     + 0.2 * sin(u_time * 2.0 * 3.14159 * 7.3);  // ~7 Hz secondary

  // Force perpendicular to curl gradient
  vec2 force = u_strength * pulse * vec2(N.y, -N.x) * cC;

  vec2 vel = texture(u_velocity, v_uv).xy;
  fragColor = vec4(vel + force * u_dt, 0.0, 1.0);
}
`;

// Buoyancy: hot fluid rises, cool fluid sinks.
// Applies vertical force proportional to temperature.

export const BUOYANCY_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_velocity;
uniform sampler2D u_temperature;
uniform sampler2D u_density;
uniform float u_dt;
uniform float u_buoyancy;          // buoyancy strength
uniform float u_densityWeight;     // smoke mass opposing thermal lift
uniform float u_ambientTemp;       // baseline temperature
uniform float u_terminalVelocity;  // max velocity magnitude from buoyancy/gravity
uniform float u_gravity;           // constant vertical force (negative = downward)

void main() {
  vec2 vel = texture(u_velocity, v_uv).xy;
  float temp = texture(u_temperature, v_uv).x;
  float density = texture(u_density, v_uv).x;

  // Thermal lift competes with the weight of dense smoke. Fire supplies a
  // zero density weight; Smoke uses the second Boussinesq term.
  float buoyForce = u_buoyancy * (temp - u_ambientTemp) - u_densityWeight * density;

  // Gravity: constant vertical force on any heated fluid.
  // Only acts on fluid with some temperature (prevents drift in empty space).
  float gravForce = u_gravity * step(0.01, temp);

  float totalForce = buoyForce + gravForce;

  // Terminal velocity: attenuate force when velocity is already moving in the
  // same direction as the force, preventing runaway accumulation.
  // Works symmetrically for both upward (buoyancy) and downward (gravity) forces.
  float speedInForceDir = sign(totalForce) * vel.y;
  float attenuation = max(0.0, 1.0 - speedInForceDir / u_terminalVelocity);
  vel.y += totalForce * attenuation * u_dt;

  fragColor = vec4(vel, 0.0, 1.0);
}
`;

// Curl noise turbulence: divergence-free velocity perturbation
// that targets flame boundaries (where temperature gradient is steep).
//
// Real fire flickers because buoyancy-driven shear layers (hot rising
// gas next to cool ambient air) trigger Kelvin-Helmholtz instability.
// On a coarse grid, numerical dissipation kills this instability before
// it can grow. Curl noise injects physically-plausible vorticity at the
// flame boundary to compensate - divergence-free by construction, so
// the pressure solver passes it through untouched.
//
// Reference: Bridson et al., "Curl-Noise for Procedural Fluid Flow"
// (SIGGRAPH 2007)

export const CURL_NOISE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_velocity;
uniform sampler2D u_temperature;
uniform vec2 u_texelSize;
uniform float u_dt;
uniform float u_time;
uniform float u_strength;      // curl noise amplitude

// 2D gradient noise (Perlin-style) - less blocky than value noise,
// avoids the axis-aligned artifacts that look artificial in fire.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 gradHash(vec2 p) {
  float h = hash(p);
  float angle = h * 6.2831853;
  return vec2(cos(angle), sin(angle));
}

float gradientNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float n00 = dot(gradHash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0));
  float n10 = dot(gradHash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float n01 = dot(gradHash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float n11 = dot(gradHash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}

// 3-octave FBM of gradient noise, used as a scalar potential field.
// The curl of this field gives us divergence-free velocity.
float noisePotential(vec2 p, float time) {
  float n = 0.0;
  float amp = 0.5;
  float freq = 5.0;
  // Scroll with time so the turbulence evolves. Different speeds per
  // octave prevent visible repetition.
  vec2 drift = vec2(time * 0.6, time * 0.9);
  for (int i = 0; i < 3; i++) {
    n += amp * gradientNoise(p * freq + drift);
    freq *= 2.2;
    amp *= 0.45;
    drift *= 1.5;
  }
  return n;
}

void main() {
  vec2 vel = texture(u_velocity, v_uv).xy;
  float temp = texture(u_temperature, v_uv).x;

  // Compute temperature gradient magnitude - this tells us where
  // the flame boundary is (steep gradient = hot/cold interface).
  float tL = texture(u_temperature, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float tR = texture(u_temperature, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float tB = texture(u_temperature, v_uv - vec2(0.0, u_texelSize.y)).x;
  float tT = texture(u_temperature, v_uv + vec2(0.0, u_texelSize.y)).x;
  float gradMag = length(vec2(tR - tL, tT - tB)) * 0.5;

  // Spatial mask: turbulence is strongest at the flame boundary
  // (high temperature gradient) and fades to zero in uniform regions.
  // Also require some heat so we don't perturb empty space.
  float boundaryMask = smoothstep(0.0, 0.8, gradMag * 6.0);
  float heatMask = smoothstep(0.0, 0.15, temp);
  float mask = boundaryMask * heatMask;

  if (mask > 0.001) {
    // Curl of the noise potential: in 2D, curl(psi) = (dpsi/dy, -dpsi/dx).
    // Finite-difference the potential field to get divergence-free velocity.
    float eps = 0.003; // finite difference step in UV space
    float psiR = noisePotential(v_uv + vec2(eps, 0.0), u_time);
    float psiL = noisePotential(v_uv - vec2(eps, 0.0), u_time);
    float psiT = noisePotential(v_uv + vec2(0.0, eps), u_time);
    float psiB = noisePotential(v_uv - vec2(0.0, eps), u_time);

    float dpdx = (psiR - psiL) / (2.0 * eps);
    float dpdy = (psiT - psiB) / (2.0 * eps);

    // curl(psi) = (dpsi/dy, -dpsi/dx)
    vec2 curlForce = vec2(dpdy, -dpdx);

    vel += curlForce * u_strength * mask * u_dt;
  }

  fragColor = vec4(vel, 0.0, 1.0);
}
`;

// Combustion + Cooling: fuel burns to produce heat,
// temperature decays via Stefan-Boltzmann-inspired cooling.
// Packed: temperature.x = temperature, fuel stored separately.

export const COMBUSTION_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_temperature;
uniform sampler2D u_fuel;
uniform float u_dt;
uniform float u_burnRate;       // how fast fuel converts to heat
uniform float u_burnTemp;       // temperature at which fuel ignites
uniform float u_fuelEfficiency; // heat produced per unit fuel burned
uniform float u_coolingRate;    // radiative cooling coefficient
uniform float u_ambientTemp;    // baseline temperature
uniform float u_useReaction;    // 0 = legacy heat-only model, 1 = coupled model

// Packed temperature field:
//   R = temperature
//   G = reaction age (fresh 0 -> cooling 1)
//   B = fuel consumed this pass (read immediately by FUEL_CONSUMPTION_FRAG)

void main() {
  float temp = texture(u_temperature, v_uv).x;
  float reaction = clamp(texture(u_temperature, v_uv).y, 0.0, 1.0);
  float fuel = texture(u_fuel, v_uv).x;

  // Combustion: fuel contributes heat proportional to its density
  float burnAmount = 0.0;
  if (temp > u_burnTemp && fuel > 0.0) {
    burnAmount = min(fuel, u_burnRate * u_dt);
  }

  // Spontaneous combustion for freshly injected fuel (bootstrap ignition)
  if (fuel > 0.5) {
    burnAmount = max(burnAmount, min(fuel * 0.3, u_burnRate * u_dt * 2.0));
  }

  float newTemp = temp + burnAmount * u_fuelEfficiency;

  // Radiative cooling toward ambient
  float cooling = u_coolingRate * (newTemp - u_ambientTemp) * u_dt;
  newTemp = max(u_ambientTemp, newTemp - cooling);

  float isReactive = step(0.0001, max(newTemp - u_ambientTemp, burnAmount));
  float reactionRate = mix(0.55, 1.9, smoothstep(0.0, 0.08, burnAmount));
  float newReaction = clamp(reaction + u_dt * reactionRate * isReactive, 0.0, 1.0);
  newReaction = mix(0.0, newReaction, u_useReaction);

  fragColor = vec4(newTemp, newReaction, burnAmount * u_useReaction, 1.0);
}
`;

export const FUEL_CONSUMPTION_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_fuel;
uniform sampler2D u_temperature;

void main() {
  vec4 fuel = texture(u_fuel, v_uv);
  float consumed = max(texture(u_temperature, v_uv).b, 0.0);
  fuel.r = max(0.0, fuel.r - consumed);
  fragColor = fuel;
}
`;

// Divergence: compute velocity field divergence for pressure solve.
// div(v) = dVx/dx + dVy/dy

export const DIVERGENCE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_velocity;
uniform vec2 u_texelSize;

void main() {
  float vL = texture(u_velocity, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float vR = texture(u_velocity, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float vB = texture(u_velocity, v_uv - vec2(0.0, u_texelSize.y)).y;
  float vT = texture(u_velocity, v_uv + vec2(0.0, u_texelSize.y)).y;
  float divergence = 0.5 * ((vR - vL) + (vT - vB));
  fragColor = vec4(divergence, 0.0, 0.0, 1.0);
}
`;

// Jacobi iteration: iteratively solve pressure Poisson equation.
// Laplacian(p) = divergence(v)
// Each iteration relaxes toward the solution.

export const JACOBI_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
uniform vec2 u_texelSize;

void main() {
  float pL = texture(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float pR = texture(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float pB = texture(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).x;
  float pT = texture(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).x;
  float div = texture(u_divergence, v_uv).x;

  // Jacobi iteration: p_new = (sum of neighbors - divergence) / 4
  float pressure = (pL + pR + pB + pT - div) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

// Gradient subtraction: make velocity divergence-free.
// v_new = v - gradient(pressure)

export const GRADIENT_SUBTRACT_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_velocity;
uniform sampler2D u_pressure;
uniform vec2 u_texelSize;

void main() {
  float pL = texture(u_pressure, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float pR = texture(u_pressure, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float pB = texture(u_pressure, v_uv - vec2(0.0, u_texelSize.y)).x;
  float pT = texture(u_pressure, v_uv + vec2(0.0, u_texelSize.y)).x;

  vec2 vel = texture(u_velocity, v_uv).xy;
  vel -= 0.5 * vec2(pR - pL, pT - pB);
  fragColor = vec4(vel, 0.0, 1.0);
}
`;

// Clear: fill a texture with a uniform value.

export const CLEAR_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec4 u_clearValue;

void main() {
  fragColor = u_clearValue;
}
`;

// Display: two-layer fire rendering.
//   Layer 1: Fluid sim trail (wake behind the moving wick)
//   Layer 2: Wick cores (always-bright flame at each tip position)
//
// The wick itself is always on fire - constant bright flame.
// Speed only affects how long the trailing wake extends behind it.

export const DISPLAY_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_temperature;
uniform sampler2D u_fuel;
uniform sampler2D u_colorField;
uniform float u_displayIntensity;
uniform float u_useReaction;
uniform vec2 u_texelSize;
uniform float u_colorBlend; // 0.0 = natural, 0.5 = tinted, 1.0 = colored
uniform float u_time;       // seconds, for FBM noise animation

// Per-fuel-source color curve (replaces hardcoded blackbody ramp)
uniform vec3 u_colorCold;   // FireColorCurve.coldColor
uniform vec3 u_colorMid;    // FireColorCurve.midColor
uniform vec3 u_colorHot;    // FireColorCurve.hotColor
uniform vec3 u_colorCore;   // FireColorCurve.coreColor

// Wick core rendering uniforms (up to 16 tips for multi-point props like fans)
uniform vec2 u_tipPositions[16];
uniform float u_tipFlameScales[16];
uniform vec3 u_tipColors[16];
uniform int u_tipCount;
uniform vec2 u_aspectCorrect;

// ---- FBM noise for high-frequency fire detail ----
// Adds flickering that the low-res simulation grid can't capture.
// 2D value noise with smooth interpolation.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f); // smoothstep interpolation
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// 3-octave FBM scrolling upward to match fire's natural rise.
// Returns value in [0, 1] range.
float fireNoise(vec2 uv, float time) {
  float n = 0.0;
  float amp = 0.5;
  float freq = 8.0;
  // Scroll upward: fire rises, noise moves with it
  vec2 scroll = vec2(0.0, -time * 1.5);
  for (int i = 0; i < 3; i++) {
    n += amp * valueNoise(uv * freq + scroll);
    freq *= 2.2;
    amp *= 0.45;
    scroll *= 1.8;
  }
  return n;
}

// Natural fire color ramp driven by per-fuel-source uniforms
vec3 blackbodyColor(float t) {
  vec3 color;
  if (t < 0.4) {
    color = u_colorCold * (t / 0.4);
  } else if (t < 1.0) {
    float f = (t - 0.4) / 0.6;
    color = mix(u_colorCold, u_colorMid, f);
  } else if (t < 2.0) {
    float f = (t - 1.0);
    color = mix(u_colorMid, u_colorHot, f);
  } else if (t < 3.5) {
    float f = (t - 2.0) / 1.5;
    color = mix(u_colorHot, u_colorCore, f);
  } else {
    float f = clamp((t - 3.5) / 2.0, 0.0, 1.0);
    color = mix(u_colorCore, vec3(1.0, 0.98, 0.9), f);
  }
  return color;
}

// Fully colored blackbody: temperature ramp entirely in prop color.
// Same fire structure, different palette. Hot core stays white.
vec3 coloredBlackbody(float t, vec3 propColor) {
  vec3 darkBase = propColor * 0.15;
  vec3 brightMid = propColor;
  vec3 hotCore = mix(propColor, vec3(1.0), 0.7);

  vec3 color;
  if (t < 0.4) {
    color = darkBase * (t / 0.4);
  } else if (t < 1.0) {
    float f = (t - 0.4) / 0.6;
    color = mix(darkBase, brightMid * 0.6, f);
  } else if (t < 2.0) {
    float f = (t - 1.0);
    color = mix(brightMid * 0.6, brightMid, f);
  } else if (t < 3.5) {
    float f = (t - 2.0) / 1.5;
    color = mix(brightMid, hotCore, f);
  } else {
    float f = clamp((t - 3.5) / 2.0, 0.0, 1.0);
    color = mix(hotCore, vec3(1.0, 0.98, 0.95), f);
  }
  return color;
}

void main() {
  vec4 thermal = texture(u_temperature, v_uv);
  float temp = thermal.x;
  float reaction = clamp(thermal.y, 0.0, 1.0);
  float fuel = texture(u_fuel, v_uv).x;

  vec3 color = vec3(0.0);
  float alpha = 0.0;

  // --- Layer 1: Fluid sim trail ---
  float fireIntensity = temp + fuel * 0.5;
  fireIntensity *= u_displayIntensity;
  float thermalBoundary = 0.0;
  float reactionBoundary = 0.0;
  float thermalCurvature = 0.0;
  float transportedDetail = 0.0;

  // The legacy profile keeps its display-space FBM for a faithful comparison.
  // Production detail comes from fields carried by the flow: reaction age and
  // the local thermal boundary. This moves with the flame instead of sliding
  // through it as a screen-space pattern.
  if (fireIntensity > 0.05) {
    if (u_useReaction < 0.5) {
      float noise = fireNoise(v_uv, u_time);
      fireIntensity *= 0.7 + 0.3 * noise;
    } else {
      vec4 leftThermal = texture(u_temperature, v_uv - vec2(u_texelSize.x, 0.0));
      vec4 rightThermal = texture(u_temperature, v_uv + vec2(u_texelSize.x, 0.0));
      vec4 bottomThermal = texture(u_temperature, v_uv - vec2(0.0, u_texelSize.y));
      vec4 topThermal = texture(u_temperature, v_uv + vec2(0.0, u_texelSize.y));
      thermalBoundary = clamp(
        length(vec2(rightThermal.x - leftThermal.x, topThermal.x - bottomThermal.x)) * 0.35,
        0.0,
        1.0
      );
      reactionBoundary = clamp(
        length(vec2(rightThermal.y - leftThermal.y, topThermal.y - bottomThermal.y)) * 1.45,
        0.0,
        1.0
      );
      thermalCurvature = clamp(
        abs(leftThermal.x + rightThermal.x + bottomThermal.x + topThermal.x - 4.0 * temp) * 0.62,
        0.0,
        1.0
      );
      transportedDetail = clamp(
        thermalBoundary * 0.5 + reactionBoundary * 0.32 + thermalCurvature * 0.72,
        0.0,
        1.0
      );
      float coherentDetail = 0.93
        + 0.09 * sin(reaction * 23.0 + fuel * 10.0 + thermalCurvature * 17.0);
      fireIntensity *= coherentDetail * mix(0.97, 1.1, transportedDetail);
    }
  }

  if (fireIntensity > 0.1) {
    vec3 trailColor;
    // The coupled solver carries physically useful structure at lower scalar
    // values than the legacy display ramp was authored for. Remap presentation
    // temperature here rather than over-driving the simulation itself.
    float colorHeat = u_useReaction > 0.5 ? fireIntensity * 1.18 : fireIntensity;
    if (u_colorBlend > 0.01) {
      vec3 fieldColor = texture(u_colorField, v_uv).rgb;
      float maxC = max(fieldColor.r, max(fieldColor.g, fieldColor.b));
      if (maxC > 0.01) {
        fieldColor /= maxC;
      }
      vec3 natural = blackbodyColor(colorHeat);
      vec3 colored = coloredBlackbody(colorHeat, fieldColor);
      trailColor = mix(natural, colored, u_colorBlend);
    } else {
      trailColor = blackbodyColor(colorHeat);
    }
    if (u_useReaction > 0.5) {
      float coolingEdge = smoothstep(0.35, 1.0, reaction);
      vec3 cooled = u_colorCold * (0.32 + 0.38 * fireIntensity);
      trailColor = mix(trailColor * mix(1.12, 0.76, reaction), cooled, coolingEdge * 0.42);
    }
    float trailAlpha = smoothstep(0.1, 0.8, fireIntensity);
    if (u_useReaction > 0.5) {
      // A volume-density response keeps low-temperature pockets visible while
      // allowing the hot body to become nearly opaque. This is what makes the
      // prop read as passing through fire instead of carrying a ghostly veil.
      float coolingPorosity = smoothstep(0.2, 0.86, reaction)
        * smoothstep(0.12, 0.82, transportedDetail);
      float edgeScallop = 0.86
        + 0.14 * sin(reaction * 31.0 + thermalCurvature * 19.0 + fuel * 13.0);
      float edgeWeight = 1.0 - smoothstep(0.42, 0.95, fireIntensity);
      float edgeDensity = mix(1.0, edgeScallop, edgeWeight)
        * mix(1.0, 0.82, coolingPorosity);
      trailAlpha *= edgeDensity;
      float opticalAlpha = 1.0 - exp(-max(fireIntensity - 0.025, 0.0) * 3.4);
      opticalAlpha *= edgeDensity;
      trailAlpha = max(trailAlpha, opticalAlpha);
      color = trailColor;
    } else {
      // Preserve the original profile exactly for the comparison renderer.
      color = trailColor * trailAlpha;
    }
    alpha = trailAlpha;

    if (u_useReaction > 0.5) {
      // Preserve the older renderer's broad, smoky personality as a cooler
      // advected envelope. It is field-driven, so the pockets roll with the
      // fluid instead of becoming display-space noise.
      float emberEnvelope = smoothstep(0.1, 0.48, fireIntensity)
        * (1.0 - smoothstep(1.15, 2.25, fireIntensity));
      float emberAge = smoothstep(0.18, 0.95, reaction);
      float rollingPocket = smoothstep(0.04, 0.68, transportedDetail)
        * mix(0.65, 1.0, emberAge);
      vec3 envelopeTint = mix(u_colorCold * 0.65, u_colorMid * 0.42, rollingPocket);
      color += envelopeTint * emberEnvelope * (0.45 + rollingPocket * 0.55)
        * u_displayIntensity;
      alpha = max(alpha, emberEnvelope * (0.52 + rollingPocket * 0.24));

      // White belongs in small, moving pockets inside the hottest transported
      // material. A broad mask turns the entire ribbon cream and leaves bloom
      // with no orange structure to reveal.
      float hotVolume = smoothstep(1.15, 2.8, fireIntensity);
      float deepInterior = 1.0 - smoothstep(0.2, 0.8, transportedDetail);
      float fresh = 1.0 - smoothstep(0.48, 0.94, reaction);
      float fuelRich = smoothstep(0.025, 0.34, fuel);
      float transportedCore = hotVolume * hotVolume * hotVolume
        * deepInterior * deepInterior
        * mix(0.06, 1.0, max(fresh, fuelRich * 0.86));

      // Only carried heat creates the white center. A separate tip-aligned
      // spine can stay bright after the surrounding flame thins to a pixel.
      float whiteCore = transportedCore;
      vec3 coreTint = mix(vec3(1.0, 0.68, 0.2), vec3(1.0, 0.985, 0.92), whiteCore);
      color += coreTint * whiteCore * 2.3 * u_displayIntensity;
      alpha = max(alpha, whiteCore * 0.94);
    }
  }

  // --- Layer 2: Liquid Fire wick cores ---
  // Natural Fire is already opaque and white-hot where the transported field
  // is hottest. Another tip shape stamps a smaller flame inside the real one,
  // so only the preserved Liquid preset draws source geometry here.
  if (u_useReaction < 0.5) {
    for (int i = 0; i < 16; i++) {
      if (i >= u_tipCount) break;

      float fs = u_tipFlameScales[i];
      vec2 delta = (v_uv - u_tipPositions[i]) * u_aspectCorrect;
      vec3 tipColor = mix(u_colorHot, u_tipColors[i], u_colorBlend);

      // Liquid Fire keeps the original circular source presentation intact.
      float dist2 = dot(delta, delta);
      float coreR = 0.006 * fs;
      float core = exp(-dist2 / (coreR * coreR));
      vec3 coreColor = vec3(1.0, 0.95, 0.85) * core * 4.0 * u_displayIntensity;
      float bodyR = 0.018 * fs;
      float body = exp(-dist2 / (bodyR * bodyR));
      vec3 bodyColor = tipColor * body * 2.5 * u_displayIntensity;
      float glowR = 0.035 * fs;
      float glow = exp(-dist2 / (glowR * glowR));
      vec3 glowTint = mix(u_colorMid, u_tipColors[i] * 0.4, u_colorBlend);
      vec3 glowColor = glowTint * glow * 1.2 * u_displayIntensity;
      color += coreColor + bodyColor + glowColor;
      alpha = max(alpha, max(core, max(body * 0.9, glow * 0.5)));
    }
  }

  alpha = min(alpha, 1.0);
  fragColor = vec4(color * alpha, alpha);
}
`;

// Bloom composite: scene + bloom → final output
// Combines the fire display pass with the bloom mip chain.

export const BLOOM_COMPOSITE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloomStrength;
uniform float u_useFilmic;
uniform float u_exposure;
uniform float u_ditherStrength;
uniform sampler2D u_propVisibilityMatte;
uniform float u_propVisibilityEnabled;
uniform vec2 u_tipPositions[16];
uniform float u_tipFlameScales[16];
uniform int u_tipCount;
uniform vec2 u_aspectCorrect;

float acesToneScale(float value) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((value * (a * value + b)) / (value * (c * value + d) + e), 0.0, 1.0);
}

vec3 huePreservingToneMap(vec3 hdr) {
  hdr = max(hdr * u_exposure, vec3(0.0));
  float luminance = max(dot(hdr, vec3(0.2126, 0.7152, 0.0722)), 0.00001);
  float mappedLuminance = acesToneScale(luminance);
  vec3 mapped = hdr * (mappedLuminance / luminance);
  float peak = max(mapped.r, max(mapped.g, mapped.b));
  return peak > 1.0 ? mapped / peak : mapped;
}

// Stable triangular-PDF dither. Kept below one 8-bit code value so it breaks
// dark-edge banding without becoming visible grain in motion.
float ditherNoise(vec2 pixel) {
  float a = fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
  float b = fract(52.9829189 * fract(dot(pixel + vec2(17.0, 43.0), vec2(0.06711056, 0.00583715))));
  return a - b;
}

void main() {
  vec4 scene = texture(u_scene, v_uv);
  vec4 bloom = texture(u_bloom, v_uv);

  vec4 combined = scene + bloom * u_bloomStrength;
  vec3 visiblePropColor = vec3(0.0);
  float propHeatBlend = 0.0;

  // Dense flame may cross the prop, but it must not replace the prop. The
  // matte uses the exact painted sprite alpha, so open fan/hoop areas and
  // asymmetric silhouettes stay untouched. Calm flame remains fully opaque;
  // only the piled-up optical density that hides the prop is reduced.
  if (u_propVisibilityEnabled > 0.5) {
    vec4 propVisibility = texture(u_propVisibilityMatte, v_uv);
    float propMatte = propVisibility.a;
    float peakEmission = max(combined.r, max(combined.g, combined.b));
    float densitySignal = max(
      clamp(combined.a, 0.0, 1.0),
      clamp(peakEmission * ${FIRE_PROP_VISIBILITY.emissionWeight.toFixed(2)}, 0.0, 1.0)
    );
    float severity = smoothstep(
      ${FIRE_PROP_VISIBILITY.densityStart.toFixed(2)},
      ${FIRE_PROP_VISIBILITY.densityFull.toFixed(2)},
      densitySignal
    );

    // The wick is allowed to disappear into its ignition flame. Protecting the
    // shaft remains the priority, so this exemption falls off within roughly
    // one prop-width of each emitter.
    float tipFreedom = 0.0;
    if (propMatte > 0.001 && severity > 0.001) {
      for (int i = 0; i < 16; i++) {
        if (i >= u_tipCount) break;
        vec2 delta = (v_uv - u_tipPositions[i]) * u_aspectCorrect;
        float radius = 0.018 * u_tipFlameScales[i];
        tipFreedom = max(
          tipFreedom,
          1.0 - smoothstep(radius * 0.35, radius, length(delta))
        );
      }
    }

    float denseCapMix = smoothstep(
      ${FIRE_PROP_VISIBILITY.denseCapStart.toFixed(2)},
      1.0,
      severity
    );
    float alphaCap = mix(
      ${FIRE_PROP_VISIBILITY.softAlphaCap.toFixed(2)},
      ${FIRE_PROP_VISIBILITY.denseAlphaCap.toFixed(2)},
      denseCapMix
    );
    float capScale = combined.a > alphaCap
      ? alphaCap / max(combined.a, 0.00001)
      : 1.0;
    float protection = propMatte * severity
      * (1.0 - tipFreedom * ${FIRE_PROP_VISIBILITY.tipFreedom.toFixed(2)});
    float propVisibilityScale = mix(1.0, capScale, protection);
    visiblePropColor = propVisibility.rgb / max(propMatte, 0.00001);
    propHeatBlend = protection * ${FIRE_PROP_VISIBILITY.heatColorRetention.toFixed(2)};
    combined *= propVisibilityScale;
  }

  float a = min(combined.a, 1.0);
  // Dense fire heats the prop's own color instead of replacing it with a gray
  // transparency window. A small red lift suggests incandescence while the
  // real blue/red sprite remains recognizable through the foreground flame.
  vec3 heatedPropColor = clamp(
    visiblePropColor * 1.08 + vec3(0.14, 0.025, 0.0),
    0.0,
    1.0
  );
  if (u_useFilmic < 0.5) {
    vec3 legacyColor = min(combined.rgb / max(a, 0.00001), vec3(1.0));
    legacyColor = mix(legacyColor, heatedPropColor, propHeatBlend);
    fragColor = vec4(legacyColor * a, a);
    return;
  }

  vec3 straightHdr = combined.rgb / max(a, 0.00001);
  vec3 mapped = huePreservingToneMap(straightHdr);
  mapped = mix(mapped, heatedPropColor, propHeatBlend);
  mapped += ditherNoise(gl_FragCoord.xy) * u_ditherStrength;
  mapped = clamp(mapped, 0.0, 1.0);
  fragColor = vec4(mapped * a, a);
}
`;
