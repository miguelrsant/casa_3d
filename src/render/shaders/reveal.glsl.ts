import { hashGlsl } from './common.glsl';

/**
 * Revelação por zona: cada fragmento descobre o ambiente pelo mapa de zonas (visto de cima),
 * escolhe uma grade de blocos pelo eixo dominante da normal e compara um hash do bloco
 * com o progresso daquele ambiente. Usado pelos materiais PBR e pelo passe de traço.
 */
export const revealParsGlsl = /* glsl */ `
${hashGlsl}
uniform sampler2D rvZoneMap;
uniform vec4 rvZoneBounds; // x0, z0, 1/largura, 1/profundidade
uniform float rvReveal[32];
uniform vec2 rvTile;

int rvZoneAt(vec3 wp, vec3 wn) {
  vec2 xz = wp.xz + wn.xz * 0.2;
  vec2 uv = (xz - rvZoneBounds.xy) * rvZoneBounds.zw;
  // limitado ao tamanho de rvReveal: índice fora do array trava o shader em alguns drivers (nouveau)
  return clamp(int(texture2D(rvZoneMap, uv).r * 255.0 + 0.5), 0, 31);
}

// x: revelado (0/1) · y: frescor (1 = acabou de revelar) · z: borda do bloco (0..1)
vec3 rvState(vec3 wp, vec3 wn, float seed) {
  int zi = rvZoneAt(wp, wn);
  float p = rvReveal[zi];
  vec3 an = abs(wn);
  vec2 tuv;
  float ax;
  if (an.y >= an.x && an.y >= an.z) { tuv = wp.xz; ax = 0.0; }
  else if (an.x >= an.z) { tuv = wp.zy; ax = 1.0; }
  else { tuv = wp.xy; ax = 2.0; }
  vec2 q = tuv / rvTile;
  vec2 w = fwidth(q) * 1.9;
  vec2 cell = floor(q);
  float h = seed > 0.0
    ? fract(seed * 0.61803398875 + float(zi) * 0.137)
    : rvHash12(cell + vec2(ax * 31.7, float(zi) * 7.3));
  h = 0.02 + 0.9 * h;
  float pe = p * 1.18; // em p = 1 nenhum bloco continua "fresco"
  float revealed = step(h, pe);
  float fresh = revealed * (1.0 - smoothstep(0.0, 0.14, pe - h));
  vec2 f = fract(q);
  vec2 b = smoothstep(vec2(0.0), w, f) * smoothstep(vec2(0.0), w, 1.0 - f);
  float border = seed > 0.0 ? 0.0 : 1.0 - b.x * b.y;
  return vec3(revealed, fresh, border);
}
`;

/** Aparência de "desenho": papel, poché no topo das paredes, hachuras de piso, vidro hachurado. */
export const drawingParsGlsl = /* glsl */ `
uniform vec3 rvPaper;
uniform vec3 rvPoche;
uniform vec3 rvInk;
uniform vec3 rvOrange;
uniform vec4 rvHatch;   // x: tipo · yz: escala (m) · w: intensidade
uniform float rvPocheOn;
uniform float rvGlassOn;

vec4 rvDrawColor(vec3 wp, vec3 wn) {
  vec2 p = wp.xz / max(rvHatch.yz, vec2(1e-3));
  vec2 fw = max(fwidth(p), vec2(1e-5));
  // vidro: linhas diagonais finas (convenção de desenho)
  float gq = (wp.x + wp.z) * 0.55 + wp.y * 0.55;
  float gfw = max(fwidth(gq), 1e-5);
  float gl = 1.0 - min(abs(fract(gq) - 0.5) / gfw, 1.0);
  gl *= step(0.5, fract(floor(gq) * 0.5 + 0.25)); // uma faixa sim, outra não
  if (rvGlassOn > 0.5) return vec4(rvInk, gl * 0.55);

  if (rvPocheOn > 0.5 && wn.y > 0.6) return vec4(rvPoche, 1.0);

  vec3 c = rvPaper;
  int kind = int(rvHatch.x + 0.5);
  if (kind > 0 && wn.y > 0.6) {
    float fade = 1.0 - smoothstep(0.12, 0.45, max(fw.x, fw.y));
    float line = 0.0;
    if (kind == 1) {
      vec2 g = abs(fract(p - 0.5) - 0.5) / fw;
      line = 1.0 - min(min(g.x, g.y), 1.0);
    } else if (kind == 2) {
      line = 1.0 - min(abs(fract(p.y - 0.5) - 0.5) / fw.y, 1.0);
    } else if (kind == 3) {
      vec2 cell = floor(p);
      vec2 jit = vec2(rvHash12(cell), rvHash12(cell + 17.0)) - 0.5;
      vec2 fp = fract(p) - 0.5 - jit * 0.6;
      line = (1.0 - smoothstep(0.5, 1.3, length(fp / fw))) * step(0.45, rvHash12(cell + 3.0));
    } else if (kind == 4) {
      float wv = sin(p.x * 3.14159 + sin(p.y * 1.7) * 1.3) * 0.12;
      line = (1.0 - min(abs(fract(p.y + wv - 0.5) - 0.5) / fw.y, 1.0)) * step(0.45, fract(p.x * 0.23 + floor(p.y) * 0.37));
    } else if (kind == 5) {
      line = 1.0 - min(abs(fract(p.x - 0.5) - 0.5) / fw.x, 1.0);
    }
    c = mix(c, rvInk, clamp(line, 0.0, 1.0) * rvHatch.w * fade);
  }
  return vec4(c, 1.0);
}
`;

// --- trechos injetados nos materiais do three (MeshStandard/MeshPhysical) ---

export const rvVertexPars = /* glsl */ `
attribute float revealSeed;
varying vec3 vRvPos;
varying vec3 vRvNormal;
varying float vRvSeed;
`;

export const rvVertexMain = /* glsl */ `
{
  vec4 rvW = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    rvW = batchingMatrix * rvW;
  #endif
  #ifdef USE_INSTANCING
    rvW = instanceMatrix * rvW;
  #endif
  rvW = modelMatrix * rvW;
  vRvPos = rvW.xyz;
  vRvNormal = inverseTransformDirection(transformedNormal, viewMatrix);
  vRvSeed = revealSeed;
}
`;

export const rvFragmentPars = /* glsl */ `
${revealParsGlsl}
${drawingParsGlsl}
varying vec3 vRvPos;
varying vec3 vRvNormal;
varying float vRvSeed;
vec3 rvS;
`;

export const rvFragmentEarly = /* glsl */ `
vec3 rvN = normalize(vRvNormal);
rvS = rvState(vRvPos, rvN, vRvSeed);
vec4 rvDraw = rvDrawColor(vRvPos, rvN);
if (rvS.x < 0.5) {
  gl_FragColor = rvDraw;
  return;
}
`;

export const rvFragmentEmissive = /* glsl */ `
totalEmissiveRadiance += rvOrange * rvS.y * (rvS.z * 4.0 + 0.06);
`;
