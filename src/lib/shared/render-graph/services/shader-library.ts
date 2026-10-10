export interface CompiledProgram {
  program: WebGLProgram;
  attribs: Record<string, number>;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

interface ProgramSpec {
  vertex: string;
  fragment: string;
  attribs: readonly string[];
  uniforms: readonly string[];
}

const FULLSCREEN_VERT = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 p = vec2(
    (gl_VertexID == 1) ? 3.0 : -1.0,
    (gl_VertexID == 2) ? 3.0 : -1.0
  );
  v_uv = (p + 1.0) * 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const DECAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform float u_alphaFactor;
uniform float u_alphaSubtract;
out vec4 fragColor;
void main() {
  vec4 c = texture(u_src, v_uv) * u_alphaFactor;
  fragColor = max(c - vec4(u_alphaSubtract), vec4(0.0));
}
`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec4 u_tint;
out vec4 fragColor;
void main() {
  fragColor = texture(u_src, v_uv) * u_tint;
}
`;

const TRAIL_MESH_VERT = `#version 300 es
precision highp float;
in vec2 a_position;
in float a_z;
in float a_edge_t;
in float a_alpha;
out float v_edge_t;
out float v_alpha;
void main() {
  v_edge_t = a_edge_t;
  v_alpha = a_alpha;
  float zClip = a_z * 2.0 - 1.0;
  gl_Position = vec4(a_position, zClip, 1.0);
}
`;

const TRAIL_MESH_FRAG = `#version 300 es
precision highp float;
in float v_edge_t;
in float v_alpha;
uniform vec3 u_color;
uniform float u_aaWidth;
out vec4 fragColor;
void main() {
  float t = abs(v_edge_t);
  float a = (1.0 - smoothstep(1.0 - u_aaWidth, 1.0, t)) * v_alpha;
  fragColor = vec4(u_color * a, a);
}
`;

const GAUSSIAN_BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_direction;
uniform float u_stride;
out vec4 fragColor;
const float W0 = 0.2042;
const float W1 = 0.1802;
const float W2 = 0.1238;
const float W3 = 0.0663;
const float W4 = 0.0276;
void main() {
  vec2 step = u_direction * u_stride;
  vec4 sum = texture(u_src, v_uv) * W0;
  sum += texture(u_src, v_uv + step) * W1;
  sum += texture(u_src, v_uv - step) * W1;
  sum += texture(u_src, v_uv + step * 2.0) * W2;
  sum += texture(u_src, v_uv - step * 2.0) * W2;
  sum += texture(u_src, v_uv + step * 3.0) * W3;
  sum += texture(u_src, v_uv - step * 3.0) * W3;
  sum += texture(u_src, v_uv + step * 4.0) * W4;
  sum += texture(u_src, v_uv - step * 4.0) * W4;
  fragColor = sum;
}
`;

const TRAIL_COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_sharp;
uniform sampler2D u_blur;
uniform float u_glowMix;
out vec4 fragColor;
void main() {
  vec4 sharp = texture(u_sharp, v_uv);
  vec4 blur = texture(u_blur, v_uv);
  fragColor = clamp(sharp + blur * u_glowMix, vec4(0.0), vec4(1.0));
}
`;

const FIRE_VERTEX = `#version 300 es
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

const FIRE_SPLAT_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_target;   
uniform vec2 u_point;          
uniform vec3 u_splatValue;     
uniform float u_radius;        

void main() {
  vec4 existing = texture(u_target, v_uv);
  vec2 delta = v_uv - u_point;
  float dist2 = dot(delta, delta);
  float splat = exp(-dist2 / (u_radius * u_radius));
  fragColor = existing + vec4(u_splatValue * splat, 0.0);
}
`;

const FIRE_ADVECTION_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_velocity;  
uniform sampler2D u_source;    
uniform vec2 u_texelSize;      
uniform float u_dt;            
uniform float u_dissipation;   

void main() {
  vec2 vel = texture(u_velocity, v_uv).xy;
  vec2 prevUV = v_uv - u_dt * vel * u_texelSize;
  fragColor = u_dissipation * texture(u_source, prevUV);
}
`;

const FIRE_CURL_FRAG = `#version 300 es
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

const FIRE_VORTICITY_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_velocity;
uniform sampler2D u_curl;
uniform vec2 u_texelSize;
uniform float u_dt;
uniform float u_strength;    
uniform float u_time;        

void main() {
  float cL = texture(u_curl, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float cR = texture(u_curl, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float cB = texture(u_curl, v_uv - vec2(0.0, u_texelSize.y)).x;
  float cT = texture(u_curl, v_uv + vec2(0.0, u_texelSize.y)).x;
  float cC = texture(u_curl, v_uv).x;

  vec2 grad = vec2(abs(cR) - abs(cL), abs(cT) - abs(cB)) * 0.5;
  float len = max(length(grad), 1e-5);
  vec2 N = grad / len;

  float pulse = 1.0 + 0.4 * sin(u_time * 2.0 * 3.14159 * 12.0)   
                     + 0.2 * sin(u_time * 2.0 * 3.14159 * 7.3);  

  vec2 force = u_strength * pulse * vec2(N.y, -N.x) * cC;

  vec2 vel = texture(u_velocity, v_uv).xy;
  fragColor = vec4(vel + force * u_dt, 0.0, 1.0);
}
`;

const FIRE_BUOYANCY_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_velocity;
uniform sampler2D u_temperature;
uniform float u_dt;
uniform float u_buoyancy;          
uniform float u_ambientTemp;       
uniform float u_terminalVelocity;  
uniform float u_gravity;           

void main() {
  vec2 vel = texture(u_velocity, v_uv).xy;
  float temp = texture(u_temperature, v_uv).x;

  float buoyForce = u_buoyancy * (temp - u_ambientTemp);

  float gravForce = u_gravity * step(0.01, temp);

  float totalForce = buoyForce + gravForce;

  float speedInForceDir = sign(totalForce) * vel.y;
  float attenuation = max(0.0, 1.0 - speedInForceDir / u_terminalVelocity);
  vel.y += totalForce * attenuation * u_dt;

  fragColor = vec4(vel, 0.0, 1.0);
}
`;

const FIRE_CURL_NOISE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_velocity;
uniform sampler2D u_temperature;
uniform vec2 u_texelSize;
uniform float u_dt;
uniform float u_time;
uniform float u_strength;      

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
  float n10 = dot(gradHash(i + vec2(1.0, 1.0)), f - vec2(1.0, 0.0));
  float n01 = dot(gradHash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float n11 = dot(gradHash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));

  return mix(mix(n00, n10, u.x), mix(n01, n11, u.x), u.y);
}

float noisePotential(vec2 p, float time) {
  float n = 0.0;
  float amp = 0.5;
  float freq = 5.0;
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

  float tL = texture(u_temperature, v_uv - vec2(u_texelSize.x, 0.0)).x;
  float tR = texture(u_temperature, v_uv + vec2(u_texelSize.x, 0.0)).x;
  float tB = texture(u_temperature, v_uv - vec2(0.0, u_texelSize.y)).x;
  float tT = texture(u_temperature, v_uv + vec2(0.0, u_texelSize.y)).x;
  float gradMag = length(vec2(tR - tL, tT - tB)) * 0.5;

  float boundaryMask = smoothstep(0.0, 0.8, gradMag * 6.0);
  float heatMask = smoothstep(0.0, 0.15, temp);
  float mask = boundaryMask * heatMask;

  if (mask > 0.001) {
    float eps = 0.003;
    float psiR = noisePotential(v_uv + vec2(eps, 0.0), u_time);
    float psiL = noisePotential(v_uv - vec2(eps, 0.0), u_time);
    float psiT = noisePotential(v_uv + vec2(0.0, eps), u_time);
    float psiB = noisePotential(v_uv - vec2(0.0, eps), u_time);

    float dpdx = (psiR - psiL) / (2.0 * eps);
    float dpdy = (psiT - psiB) / (2.0 * eps);

    vec2 curlForce = vec2(dpdy, -dpdx);

    vel += curlForce * u_strength * mask * u_dt;
  }

  fragColor = vec4(vel, 0.0, 1.0);
}
`;

const FIRE_COMBUSTION_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_temperature;
uniform sampler2D u_fuel;
uniform float u_dt;
uniform float u_burnRate;       
uniform float u_burnTemp;       
uniform float u_fuelEfficiency; 
uniform float u_coolingRate;    
uniform float u_ambientTemp;    

void main() {
  float temp = texture(u_temperature, v_uv).x;
  float fuel = texture(u_fuel, v_uv).x;

  float burnAmount = 0.0;
  if (temp > u_burnTemp && fuel > 0.0) {
    burnAmount = min(fuel, u_burnRate * u_dt);
  }

  if (fuel > 0.5) {
    burnAmount = max(burnAmount, min(fuel * 0.3, u_burnRate * u_dt * 2.0));
  }

  float newTemp = temp + burnAmount * u_fuelEfficiency;

  float cooling = u_coolingRate * (newTemp - u_ambientTemp) * u_dt;
  newTemp = max(u_ambientTemp, newTemp - cooling);

  fragColor = vec4(newTemp, 0.0, 0.0, 1.0);
}
`;

const FIRE_DIVERGENCE_FRAG = `#version 300 es
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

const FIRE_JACOBI_FRAG = `#version 300 es
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

  float pressure = (pL + pR + pB + pT - div) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

const FIRE_GRADIENT_SUBTRACT_FRAG = `#version 300 es
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

const FIRE_CLEAR_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec4 u_clearValue;

void main() {
  fragColor = u_clearValue;
}
`;

const FIRE_DISPLAY_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_temperature;
uniform sampler2D u_fuel;
uniform sampler2D u_colorField;
uniform float u_displayIntensity;
uniform float u_colorBlend; 
uniform float u_time;       

uniform vec3 u_colorCold;   
uniform vec3 u_colorMid;    
uniform vec3 u_colorHot;    
uniform vec3 u_colorCore;   

uniform vec2 u_tipPositions[16];
uniform float u_tipSpeeds[16];
uniform float u_tipFlameScales[16];
uniform vec3 u_tipColors[16];
uniform int u_tipCount;
uniform vec2 u_aspectCorrect;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f); 
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fireNoise(vec2 uv, float time) {
  float n = 0.0;
  float amp = 0.5;
  float freq = 8.0;
  vec2 scroll = vec2(0.0, -time * 1.5);
  for (int i = 0; i < 3; i++) {
    n += amp * valueNoise(uv * freq + scroll);
    freq *= 2.2;
    amp *= 0.45;
    scroll *= 1.8;
  }
  return n;
}

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
  float temp = texture(u_temperature, v_uv).x;
  float fuel = texture(u_fuel, v_uv).x;

  vec3 color = vec3(0.0);
  float alpha = 0.0;

  float fireIntensity = temp + fuel * 0.5;
  fireIntensity *= u_displayIntensity;

  if (fireIntensity > 0.05) {
    float noise = fireNoise(v_uv, u_time);
    fireIntensity *= 0.7 + 0.3 * noise;
  }

  if (fireIntensity > 0.1) {
    vec3 trailColor;
    if (u_colorBlend > 0.01) {
      vec3 fieldColor = texture(u_colorField, v_uv).rgb;
      float maxC = max(fieldColor.r, max(fieldColor.g, fieldColor.b));
      if (maxC > 0.01) {
        fieldColor /= maxC;
      }
      vec3 natural = blackbodyColor(fireIntensity);
      vec3 colored = coloredBlackbody(fireIntensity, fieldColor);
      trailColor = mix(natural, colored, u_colorBlend);
    } else {
      trailColor = blackbodyColor(fireIntensity);
    }
    float trailAlpha = smoothstep(0.1, 0.8, fireIntensity);
    color = trailColor * trailAlpha;
    alpha = trailAlpha;
  }

  for (int i = 0; i < 16; i++) {
    if (i >= u_tipCount) break;

    float fs = u_tipFlameScales[i];
    vec2 delta = (v_uv - u_tipPositions[i]) * u_aspectCorrect;
    float dist2 = dot(delta, delta);

    vec3 tipColor = mix(u_colorHot, u_tipColors[i], u_colorBlend);

    float coreR = 0.006 * fs;
    float coreR2 = coreR * coreR;
    float core = exp(-dist2 / coreR2);
    vec3 coreColor = vec3(1.0, 0.95, 0.85) * core * 4.0 * u_displayIntensity;

    float bodyR = 0.018 * fs;
    float bodyR2 = bodyR * bodyR;
    float body = exp(-dist2 / bodyR2);
    vec3 bodyColor = tipColor * body * 2.5 * u_displayIntensity;

    float glowR = 0.035 * fs;
    float glowR2 = glowR * glowR;
    float glow = exp(-dist2 / glowR2);
    vec3 glowTint = mix(u_colorMid, u_tipColors[i] * 0.4, u_colorBlend);
    vec3 glowColor = glowTint * glow * 1.2 * u_displayIntensity;

    color += coreColor + bodyColor + glowColor;
    alpha = max(alpha, max(core, max(body * 0.9, glow * 0.5)));
  }

  alpha = min(alpha, 1.0);
  fragColor = vec4(color * alpha, alpha);
}
`;

const FIRE_BLOOM_COMPOSITE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloomStrength;

void main() {
  vec4 scene = texture(u_scene, v_uv);
  vec4 bloom = texture(u_bloom, v_uv);

  vec4 combined = scene + bloom * u_bloomStrength;

  fragColor = vec4(combined.rgb, max(combined.a, max(combined.r, max(combined.g, combined.b))));
}
`;

const BLOOM_DOWNSAMPLE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_source;
uniform vec2 u_texelSize;

out vec4 fragColor;

void main() {
  vec4 A = texture(u_source, v_uv + u_texelSize * vec2(-1.0, -1.0));
  vec4 B = texture(u_source, v_uv + u_texelSize * vec2( 0.0, -1.0));
  vec4 C = texture(u_source, v_uv + u_texelSize * vec2( 1.0, -1.0));
  vec4 D = texture(u_source, v_uv + u_texelSize * vec2(-0.5, -0.5));
  vec4 E = texture(u_source, v_uv);
  vec4 F = texture(u_source, v_uv + u_texelSize * vec2( 0.5, -0.5));
  vec4 G = texture(u_source, v_uv + u_texelSize * vec2(-1.0,  0.0));
  vec4 H = texture(u_source, v_uv + u_texelSize * vec2( 1.0,  0.0));
  vec4 I = texture(u_source, v_uv + u_texelSize * vec2(-0.5,  0.5));
  vec4 J = texture(u_source, v_uv + u_texelSize * vec2( 0.0,  1.0));
  vec4 K = texture(u_source, v_uv + u_texelSize * vec2( 0.5,  0.5));
  vec4 L = texture(u_source, v_uv + u_texelSize * vec2(-1.0,  1.0));
  vec4 M = texture(u_source, v_uv + u_texelSize * vec2( 1.0,  1.0));

  fragColor = E * 0.125
            + (D + F + I + K) * 0.125
            + (B + G + H + J) * 0.0625
            + (A + C + L + M) * 0.03125;
}
`;

const BLOOM_UPSAMPLE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform float u_bloomRadius; 

out vec4 fragColor;

void main() {
  vec2 ts = u_texelSize * u_bloomRadius;

  vec4 sum = vec4(0.0);
  sum += texture(u_source, v_uv + vec2(-ts.x, -ts.y)) * 1.0;
  sum += texture(u_source, v_uv + vec2( 0.0,  -ts.y)) * 2.0;
  sum += texture(u_source, v_uv + vec2( ts.x, -ts.y)) * 1.0;
  sum += texture(u_source, v_uv + vec2(-ts.x,  0.0))  * 2.0;
  sum += texture(u_source, v_uv)                       * 4.0;
  sum += texture(u_source, v_uv + vec2( ts.x,  0.0))  * 2.0;
  sum += texture(u_source, v_uv + vec2(-ts.x,  ts.y)) * 1.0;
  sum += texture(u_source, v_uv + vec2( 0.0,   ts.y)) * 2.0;
  sum += texture(u_source, v_uv + vec2( ts.x,  ts.y)) * 1.0;

  fragColor = sum / 16.0;
}
`;

const LED_SPRITE_VERT = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_ledPos;
in vec2 a_ledPrevPos;
in vec3 a_ledColor;
in float a_brightness;
in float a_glowRadius;
uniform vec2 u_resolution;
uniform vec2 u_viewboxSize;
out vec2 v_viewboxPos;
flat out vec2 v_capA;
flat out vec2 v_capB;
flat out float v_glowRadius;
flat out vec3 v_color;
flat out float v_brightness;
void main() {
  v_capA = a_ledPrevPos;
  v_capB = a_ledPos;
  v_glowRadius = a_glowRadius;
  v_color = a_ledColor;
  v_brightness = a_brightness;
  vec2 dir = a_ledPos - a_ledPrevPos;
  float segLen = length(dir);
  vec2 axis = segLen > 1e-4 ? dir / segLen : vec2(1.0, 0.0);
  vec2 perp = vec2(-axis.y, axis.x);
  vec2 center = (a_ledPrevPos + a_ledPos) * 0.5;
  float pad = a_glowRadius * 1.05;
  float halfLen = segLen * 0.5 + pad;
  float halfWid = pad;
  vec2 worldOffset = axis * (a_position.x * halfLen) + perp * (a_position.y * halfWid);
  vec2 worldPos = center + worldOffset;
  v_viewboxPos = worldPos;
  vec2 clipPos = (worldPos / u_viewboxSize) * 2.0 - 1.0;
  clipPos.y = -clipPos.y;
  gl_Position = vec4(clipPos, 0.0, 1.0);
}
`;

const LED_SPRITE_FRAG = `#version 300 es
precision highp float;
in vec2 v_viewboxPos;
flat in vec2 v_capA;
flat in vec2 v_capB;
flat in float v_glowRadius;
flat in vec3 v_color;
flat in float v_brightness;
out vec4 fragColor;
void main() {
  vec2 p = v_viewboxPos;
  vec2 pa = p - v_capA;
  vec2 ba = v_capB - v_capA;
  float baLenSq = dot(ba, ba);
  float h = baLenSq > 1e-6 ? clamp(dot(pa, ba) / baLenSq, 0.0, 1.0) : 0.0;
  vec2 closest = v_capA + ba * h;
  float dist = length(p - closest);
  float nd = dist / v_glowRadius;
  float edgeFade = 1.0 - smoothstep(0.6, 1.0, nd);
  if (edgeFade < 0.001) discard;
  float glow = 1.0 / (1.0 + 7.5 * nd * nd);
  float core = exp(-nd * nd * 20.0);
  float combined = (glow + core * 0.5) * edgeFade;
  vec3 color = v_color * combined * v_brightness;
  fragColor = vec4(color, combined * v_brightness);
}
`;

const LED_TRAIL_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_currentFrame;
uniform sampler2D u_previousTrail;
uniform float u_fadeRate;
out vec4 fragColor;
void main() {
  vec4 current = texture(u_currentFrame, v_uv);
  vec4 trail = texture(u_previousTrail, v_uv);
  fragColor = max(current, trail * u_fadeRate);
}
`;

const LED_DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_ledTrail;
uniform sampler2D u_bloom;
uniform float u_bloomIntensity;
out vec4 fragColor;
void main() {
  vec4 led = texture(u_ledTrail, v_uv);
  vec4 bloom = texture(u_bloom, v_uv);
  vec4 combined = led + bloom * u_bloomIntensity;
  fragColor = vec4(combined.rgb, max(combined.r, max(combined.g, combined.b)));
}
`;

const PARTICLE_SPRITE_VERT = `#version 300 es
precision highp float;
in vec2 a_position;
in vec4 a_color;
in float a_size;
in float a_rotation;
in float a_shape;
in float a_age;
uniform vec2 u_resolution;
out vec4 v_color;
flat out float v_rotation;
flat out float v_shape;
flat out float v_age;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  gl_PointSize = clamp(a_size * u_resolution.y * 0.5, 1.0, 256.0);
  v_color = a_color;
  v_rotation = a_rotation;
  v_shape = a_shape;
  v_age = a_age;
}
`;

const PARTICLE_SPRITE_FRAG = `#version 300 es
precision highp float;
in vec4 v_color;
flat in float v_rotation;
flat in float v_shape;
flat in float v_age;
out vec4 fragColor;
void main() {
  vec2 pc = gl_PointCoord - 0.5;
  float c = cos(v_rotation);
  float s = sin(v_rotation);
  vec2 p = vec2(pc.x * c - pc.y * s, pc.x * s + pc.y * c);
  float dist;
  int shape = int(v_shape + 0.5);
  if (shape == 0) {
    dist = length(p) * 2.0;
  } else if (shape == 1) {
    vec2 d = abs(p) * 2.0;
    dist = max(d.x, d.y);
  } else if (shape == 2) {
    vec2 d = abs(p);
    d.x *= 0.4;
    dist = length(d) * 2.0;
  } else if (shape == 3) {
    float r = length(p) * 2.0;
    float t = atan(p.y, p.x);
    dist = r * (1.0 - 0.3 * cos(t));
  } else if (shape == 4) {
    vec2 d = abs(p) * 2.0;
    dist = max(d.x * 0.866 + d.y * 0.5, d.y);
  } else {
    vec2 d = abs(p) * 2.0;
    float cr = min(d.x, d.y);
    dist = mix(cr, length(d), 0.6);
  }
  float alpha = 1.0 - smoothstep(0.85, 1.0, dist);
  if (alpha < 0.001) discard;
  vec3 col = v_color.rgb * v_color.a * alpha;
  fragColor = vec4(col, v_color.a * alpha);
}
`;

const EFFECT_HALO_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_sources[16];
uniform vec4 u_colors[16];
uniform float u_radii[16];
uniform float u_pulseFactors[16];
uniform int u_sourceCount;
uniform float u_intensity;
uniform int u_falloffMode;
out vec4 fragColor;
void main() {
  vec2 ndc = v_uv * 2.0 - 1.0;
  vec3 accum = vec3(0.0);
  float maxA = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= u_sourceCount) break;
    vec2 delta = ndc - u_sources[i];
    float dist = length(delta);
    float r = u_radii[i] * u_pulseFactors[i];
    float r2 = max(r * r, 1e-6);
    float f;
    if (u_falloffMode == 0) {
      f = exp(-dist * dist / (r2 * 0.5));
    } else if (u_falloffMode == 1) {
      f = 1.0 / (1.0 + dist * dist / (r2 * 0.1));
    } else {
      float rd = abs(dist - r);
      f = exp(-rd * rd / (r2 * 0.02));
    }
    float a = f * u_colors[i].a;
    accum += u_colors[i].rgb * a;
    maxA = max(maxA, a);
  }
  accum *= u_intensity;
  maxA = min(maxA * u_intensity, 1.0);
  fragColor = vec4(accum, maxA);
}
`;

const EFFECT_RING_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_centers[16];
uniform float u_ringRadii[16];
uniform float u_ages[16];
uniform vec4 u_ringColors[16];
uniform int u_ringCount;
uniform float u_intensity;
uniform float u_thickness;
uniform int u_style;
out vec4 fragColor;
void main() {
  vec2 ndc = v_uv * 2.0 - 1.0;
  vec3 accum = vec3(0.0);
  float maxA = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= u_ringCount) break;
    float dist = length(ndc - u_centers[i]);
    float ringDist = abs(dist - u_ringRadii[i]);
    float ageFade = 1.0 - u_ages[i];
    float a;
    if (u_style == 0) {
      a = (1.0 - smoothstep(u_thickness * 0.5, u_thickness, ringDist)) * ageFade;
    } else {
      a = exp(-ringDist * ringDist / max(u_thickness * u_thickness, 1e-6)) * ageFade;
    }
    a *= u_ringColors[i].a;
    accum += u_ringColors[i].rgb * a;
    maxA = max(maxA, a);
  }
  accum *= u_intensity;
  maxA = min(maxA * u_intensity, 1.0);
  fragColor = vec4(accum, maxA);
}
`;

const EFFECT_FROST_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_seeds[16];
uniform float u_seedRadii[16];
uniform float u_crystallinity[16];
uniform vec4 u_seedColors[16];
uniform int u_seedCount;
uniform float u_intensity;
out vec4 fragColor;
void main() {
  vec2 ndc = v_uv * 2.0 - 1.0;
  vec3 accum = vec3(0.0);
  float maxA = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= u_seedCount) break;
    vec2 delta = ndc - u_seeds[i];
    float dist = length(delta);
    float r = u_seedRadii[i];
    if (dist > r * 1.2 || r < 0.001) continue;
    float angle = atan(delta.y, delta.x);
    float sym = 3.0 + u_crystallinity[i] * 3.0;
    float angular = pow(abs(cos(angle * sym)), 2.0 + u_crystallinity[i] * 4.0);
    float branch = pow(abs(cos(angle * sym * 4.0)), 6.0) * 0.4 * u_crystallinity[i];
    float pattern = angular + branch;
    float edgeWidth = max(r * 0.15, 0.005);
    float edgeMask = smoothstep(edgeWidth, 0.0, abs(dist - r));
    float coreMask = smoothstep(0.01, 0.0, dist);
    float frost = max(pattern * edgeMask, coreMask);
    float a = frost * u_seedColors[i].a;
    accum += u_seedColors[i].rgb * a;
    maxA = max(maxA, a);
  }
  accum *= u_intensity;
  maxA = min(maxA * u_intensity, 1.0);
  fragColor = vec4(accum, maxA);
}
`;

const PROGRAMS: Record<string, ProgramSpec> = {
  decay: {
    vertex: FULLSCREEN_VERT,
    fragment: DECAY_FRAG,
    attribs: [],
    uniforms: ["u_src", "u_alphaFactor", "u_alphaSubtract"],
  },
  composite: {
    vertex: FULLSCREEN_VERT,
    fragment: COMPOSITE_FRAG,
    attribs: [],
    uniforms: ["u_src", "u_tint"],
  },
  "trail-mesh": {
    vertex: TRAIL_MESH_VERT,
    fragment: TRAIL_MESH_FRAG,
    attribs: ["a_position", "a_z", "a_edge_t", "a_alpha"],
    uniforms: ["u_color", "u_aaWidth"],
  },
  "gaussian-blur": {
    vertex: FULLSCREEN_VERT,
    fragment: GAUSSIAN_BLUR_FRAG,
    attribs: [],
    uniforms: ["u_src", "u_direction", "u_stride"],
  },
  "trail-composite": {
    vertex: FULLSCREEN_VERT,
    fragment: TRAIL_COMPOSITE_FRAG,
    attribs: [],
    uniforms: ["u_sharp", "u_blur", "u_glowMix"],
  },
  "fire-splat": {
    vertex: FIRE_VERTEX,
    fragment: FIRE_SPLAT_FRAG,
    attribs: [],
    uniforms: ["u_target", "u_point", "u_splatValue", "u_radius"],
  },
  "fire-advection": {
    vertex: FIRE_VERTEX,
    fragment: FIRE_ADVECTION_FRAG,
    attribs: [],
    uniforms: ["u_velocity", "u_source", "u_texelSize", "u_dt", "u_dissipation"],
  },
  "fire-curl": {
    vertex: FIRE_VERTEX,
    fragment: FIRE_CURL_FRAG,
    attribs: [],
    uniforms: ["u_velocity", "u_texelSize"],
  },
  "fire-vorticity": {
    vertex: FIRE_VERTEX,
    fragment: FIRE_VORTICITY_FRAG,
    attribs: [],
    uniforms: ["u_velocity", "u_curl", "u_texelSize", "u_dt", "u_strength", "u_time"],
  },
  "fire-buoyancy": {
    vertex: FIRE_VERTEX,
    fragment: FIRE_BUOYANCY_FRAG,
    attribs: [],
    uniforms: [
      "u_velocity", "u_temperature", "u_dt", "u_buoyancy",
      "u_ambientTemp", "u_terminalVelocity", "u_gravity",
    ],
  },
  "fire-curl-noise": {
    vertex: FIRE_VERTEX,
    fragment: FIRE_CURL_NOISE_FRAG,
    attribs: [],
    uniforms: ["u_velocity", "u_temperature", "u_texelSize", "u_dt", "u_time", "u_strength"],
  },
  "fire-combustion": {
    vertex: FIRE_VERTEX,
    fragment: FIRE_COMBUSTION_FRAG,
    attribs: [],
    uniforms: [
      "u_temperature", "u_fuel", "u_dt", "u_burnRate",
      "u_burnTemp", "u_fuelEfficiency", "u_coolingRate", "u_ambientTemp",
    ],
  },
  "fire-divergence": {
    vertex: FIRE_VERTEX,
    fragment: FIRE_DIVERGENCE_FRAG,
    attribs: [],
    uniforms: ["u_velocity", "u_texelSize"],
  },
  "fire-jacobi": {
    vertex: FIRE_VERTEX,
    fragment: FIRE_JACOBI_FRAG,
    attribs: [],
    uniforms: ["u_pressure", "u_divergence", "u_texelSize"],
  },
  "fire-gradient-subtract": {
    vertex: FIRE_VERTEX,
    fragment: FIRE_GRADIENT_SUBTRACT_FRAG,
    attribs: [],
    uniforms: ["u_velocity", "u_pressure", "u_texelSize"],
  },
  "fire-clear": {
    vertex: FIRE_VERTEX,
    fragment: FIRE_CLEAR_FRAG,
    attribs: [],
    uniforms: ["u_clearValue"],
  },
  "fire-display": {
    vertex: FIRE_VERTEX,
    fragment: FIRE_DISPLAY_FRAG,
    attribs: [],
    uniforms: [
      "u_temperature", "u_fuel", "u_colorField",
      "u_displayIntensity", "u_colorBlend", "u_time",
      "u_colorCold", "u_colorMid", "u_colorHot", "u_colorCore",
      "u_tipPositions", "u_tipSpeeds", "u_tipFlameScales", "u_tipColors",
      "u_tipCount", "u_aspectCorrect",
    ],
  },
  "fire-bloom-composite": {
    vertex: FIRE_VERTEX,
    fragment: FIRE_BLOOM_COMPOSITE_FRAG,
    attribs: [],
    uniforms: ["u_scene", "u_bloom", "u_bloomStrength"],
  },
  "led-sprite": {
    vertex: LED_SPRITE_VERT,
    fragment: LED_SPRITE_FRAG,
    attribs: ["a_position", "a_ledPos", "a_ledPrevPos", "a_ledColor", "a_brightness", "a_glowRadius"],
    uniforms: ["u_resolution", "u_viewboxSize"],
  },
  "led-trail-accumulate": {
    vertex: FULLSCREEN_VERT,
    fragment: LED_TRAIL_FRAG,
    attribs: [],
    uniforms: ["u_currentFrame", "u_previousTrail", "u_fadeRate"],
  },
  "led-display": {
    vertex: FULLSCREEN_VERT,
    fragment: LED_DISPLAY_FRAG,
    attribs: [],
    uniforms: ["u_ledTrail", "u_bloom", "u_bloomIntensity"],
  },
  "particle-sprite": {
    vertex: PARTICLE_SPRITE_VERT,
    fragment: PARTICLE_SPRITE_FRAG,
    attribs: ["a_position", "a_color", "a_size", "a_rotation", "a_shape", "a_age"],
    uniforms: ["u_resolution"],
  },
  "bloom-downsample": {
    vertex: FULLSCREEN_VERT,
    fragment: BLOOM_DOWNSAMPLE_FRAG,
    attribs: [],
    uniforms: ["u_source", "u_texelSize"],
  },
  "bloom-upsample": {
    vertex: FULLSCREEN_VERT,
    fragment: BLOOM_UPSAMPLE_FRAG,
    attribs: [],
    uniforms: ["u_source", "u_texelSize", "u_bloomRadius"],
  },
  "effect-halo": {
    vertex: FULLSCREEN_VERT,
    fragment: EFFECT_HALO_FRAG,
    attribs: [],
    uniforms: [
      "u_sources", "u_colors", "u_radii", "u_pulseFactors",
      "u_sourceCount", "u_intensity", "u_falloffMode",
    ],
  },
  "effect-ring": {
    vertex: FULLSCREEN_VERT,
    fragment: EFFECT_RING_FRAG,
    attribs: [],
    uniforms: [
      "u_centers", "u_ringRadii", "u_ages", "u_ringColors",
      "u_ringCount", "u_intensity", "u_thickness", "u_style",
    ],
  },
  "effect-frost": {
    vertex: FULLSCREEN_VERT,
    fragment: EFFECT_FROST_FRAG,
    attribs: [],
    uniforms: [
      "u_seeds", "u_seedRadii", "u_crystallinity", "u_seedColors",
      "u_seedCount", "u_intensity",
    ],
  },
};

/** A program whose compile and link were sent but whose status is unread. */
interface PendingProgram {
  program: WebGLProgram;
  vs: WebGLShader;
  fs: WebGLShader;
  spec: ProgramSpec;
}

interface ParallelShaderCompile {
  COMPLETION_STATUS_KHR: number;
}

/** Longest stretch settle() spends reading statuses before it yields. */
const SETTLE_SLICE_MS = 8;
/** Wait between settle() passes while the driver is still compiling. */
const SETTLE_POLL_MS = 8;

export class ShaderLibrary {
  private readonly gl: WebGL2RenderingContext;
  private readonly cache = new Map<string, CompiledProgram>();
  private readonly pending = new Map<string, PendingProgram>();
  private readonly parallel: ParallelShaderCompile | null;
  private disposed = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    // Enabling the extension lets the driver compile on its own threads.
    this.parallel = gl.getExtension(
      "KHR_parallel_shader_compile"
    ) as ParallelShaderCompile | null;
  }

  get(name: keyof typeof PROGRAMS | string): CompiledProgram {
    const cached = this.cache.get(name);
    if (cached) return cached;

    const pending = this.pending.get(name);
    if (pending) return this.finalize(name, pending);

    const spec = PROGRAMS[name];
    if (!spec) throw new Error(`ShaderLibrary: unknown program "${name}"`);
    return this.finalize(name, this.dispatch(name, spec));
  }

  /**
   * Send compile and link for each program without reading any status.
   * Status, attribute and uniform reads wait for the driver; reading them
   * one program at a time held the main thread ~200 ms whenever an animation
   * canvas mounted. settle() or the first get() reads them later.
   */
  compileInBackground(names: readonly string[]): void {
    for (const name of names) {
      if (this.cache.has(name) || this.pending.has(name)) continue;
      const spec = PROGRAMS[name];
      if (!spec) throw new Error(`ShaderLibrary: unknown program "${name}"`);
      this.pending.set(name, this.dispatch(name, spec));
    }
  }

  /**
   * Resolve once every background program is checked, yielding between
   * passes so the page keeps painting. With KHR_parallel_shader_compile it
   * reads only programs whose non-blocking COMPLETION_STATUS_KHR says done;
   * without it each read waits, so a pass stops after a short slice. Rejects
   * on the first failed program, as a synchronous compile would throw.
   */
  async settle(): Promise<void> {
    const gl = this.gl;
    while (this.pending.size > 0 && !this.disposed) {
      const started = performance.now();
      for (const [name, pending] of this.pending) {
        if (
          this.parallel &&
          !gl.getProgramParameter(
            pending.program,
            this.parallel.COMPLETION_STATUS_KHR
          )
        ) {
          continue;
        }
        this.finalize(name, pending);
        if (performance.now() - started >= SETTLE_SLICE_MS) break;
      }
      if (this.pending.size > 0 && !this.disposed) {
        await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const { program } of this.cache.values()) {
      this.gl.deleteProgram(program);
    }
    for (const { program, vs, fs } of this.pending.values()) {
      this.gl.deleteProgram(program);
      this.gl.deleteShader(vs);
      this.gl.deleteShader(fs);
    }
    this.cache.clear();
    this.pending.clear();
  }

  private dispatch(name: string, spec: ProgramSpec): PendingProgram {
    const gl = this.gl;
    const vs = this.createShader(gl.VERTEX_SHADER, spec.vertex, `${name}.vert`);
    const fs = this.createShader(gl.FRAGMENT_SHADER, spec.fragment, `${name}.frag`);

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      throw new Error(`ShaderLibrary: gl.createProgram returned null for "${name}"`);
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    return { program, vs, fs, spec };
  }

  private finalize(name: string, pending: PendingProgram): CompiledProgram {
    const gl = this.gl;
    const { program, vs, fs, spec } = pending;
    this.pending.delete(name);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      // A shader that failed to compile also fails the link; report it first.
      const reason =
        this.compileFailure(vs, `${name}.vert`) ??
        this.compileFailure(fs, `${name}.frag`) ??
        `link failed for "${name}": ${gl.getProgramInfoLog(program) ?? "(no log)"}`;
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      throw new Error(`ShaderLibrary: ${reason}`);
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const attribs: Record<string, number> = {};
    for (const attrName of spec.attribs) {
      attribs[attrName] = gl.getAttribLocation(program, attrName);
    }
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const uniformName of spec.uniforms) {
      uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
    }

    const compiled = { program, attribs, uniforms };
    this.cache.set(name, compiled);
    return compiled;
  }

  private createShader(type: number, source: string, label: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error(`ShaderLibrary: gl.createShader returned null for "${label}"`);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }

  private compileFailure(shader: WebGLShader, label: string): string | null {
    const gl = this.gl;
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    return `compile failed for "${label}": ${gl.getShaderInfoLog(shader) ?? "(no log)"}`;
  }
}
