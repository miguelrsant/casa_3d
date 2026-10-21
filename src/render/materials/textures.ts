import {
  LinearMipmapLinearFilter,
  LinearFilter,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';

/**
 * Texturas 100% procedurais, "assadas" na GPU no carregamento.
 * Cada definição descreve um campo de altura H(p), cor A(p,h), rugosidade R(p,h) e AO O(p,h),
 * com p em metros dentro de um ladrilho de tamanho S (ruído periódico → sem emendas).
 */

const NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 grad2(vec2 c) { float a = hash12(c) * 6.2831853; return vec2(cos(a), sin(a)); }
// período inteiro na grade: um período fracionário (ex.: 2,4) deixava uma emenda na borda do ladrilho
vec2 wrapPeriod(inout vec2 p, vec2 per) {
  vec2 P = max(floor(per + 0.5), vec2(1.0));
  p *= P / per;
  return P;
}
float gnoise(vec2 p, vec2 per) {
  per = wrapPeriod(p, per);
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 a = mod(i, per), b = mod(i + vec2(1.0, 0.0), per), c = mod(i + vec2(0.0, 1.0), per), d = mod(i + vec2(1.0, 1.0), per);
  float va = dot(grad2(a), f);
  float vb = dot(grad2(b), f - vec2(1.0, 0.0));
  float vc = dot(grad2(c), f - vec2(0.0, 1.0));
  float vd = dot(grad2(d), f - vec2(1.0, 1.0));
  return mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y) * 1.4;
}
float fbm(vec2 p, vec2 per, int oct) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * gnoise(p, per);
    p *= 2.0;
    per *= 2.0;
    a *= 0.5;
  }
  return s;
}
// F1, F2 e id da célula (periódico)
vec3 voronoi(vec2 p, vec2 per) {
  per = wrapPeriod(p, per);
  vec2 i = floor(p);
  vec2 f = fract(p);
  float F1 = 8.0, F2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 c = mod(i + g, per);
    vec2 o = vec2(hash12(c), hash12(c + 17.31));
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < F1) { F2 = F1; F1 = d; id = hash12(c + 3.17); }
    else if (d < F2) { F2 = d; }
  }
  return vec3(sqrt(F1), sqrt(F2), id);
}
// junta de ladrilhos: 0 na junta, 1 no meio. cell = tamanho; off = deslocamento por fiada
vec4 tiles(vec2 p, vec2 cell, float rowOffset, float joint) {
  float row = floor(p.y / cell.y);
  vec2 q = vec2(p.x + rowOffset * row * cell.x, p.y);
  vec2 id = floor(q / cell);
  vec2 f = q / cell - id;
  vec2 d = min(f, 1.0 - f) * cell; // distância às bordas em metros
  float j = smoothstep(0.0, joint, min(d.x, d.y));
  return vec4(j, hash12(id + row * 13.7), id);
}
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
`;

interface TexDef {
  /** Tamanho do ladrilho de textura em metros (x, y). */
  S: [number, number];
  normal: number;
  glsl: string;
}

const defs: Record<string, TexDef> = {
  plaster: {
    S: [2, 2],
    normal: 1.0,
    glsl: /* glsl */ `
      float H(vec2 p) { return fbm(p * 3.0, vec2(6.0), 3) * 0.0012 + fbm(p * 22.0, vec2(44.0), 3) * 0.0005 + gnoise(p * 90.0, vec2(180.0)) * 0.00015; }
      vec3 A(vec2 p, float h) {
        float m = fbm(p * 1.5, vec2(3.0), 4);
        vec3 c = mix(vec3(0.925, 0.915, 0.895), vec3(0.955, 0.945, 0.925), 0.5 + m);
        return c * (0.985 + h * 18.0);
      }
      float R(vec2 p, float h) { return 0.86 + fbm(p * 5.0, vec2(10.0), 3) * 0.08; }
      float O(vec2 p, float h) { return 1.0; }`,
  },
  concrete: {
    S: [2.4, 2.4],
    normal: 1.6,
    glsl: /* glsl */ `
      // concreto aparente com fôrmas de tábua (0,15 m) e furos de tirante
      float board(vec2 p) { return floor(p.y / 0.15); }
      float H(vec2 p) {
        float b = board(p);
        float seam = smoothstep(0.0, 0.006, abs(fract(p.y / 0.15) - 0.0) * 0.15) * smoothstep(0.0, 0.006, abs(1.0 - fract(p.y / 0.15)) * 0.15);
        float grain = gnoise(vec2(p.x * 2.0 + b * 7.0, p.y * 60.0), vec2(4.8, 144.0)) * 0.0006;
        vec2 tie = mod(p, vec2(0.6, 0.6)) - 0.3;
        float hole = 1.0 - smoothstep(0.012, 0.018, length(tie));
        return grain - (1.0 - seam) * 0.0015 - hole * 0.004 + fbm(p * 4.0, vec2(9.6), 3) * 0.0008;
      }
      vec3 A(vec2 p, float h) {
        float b = board(p);
        float tone = hash12(vec2(b, 3.0)) * 0.06;
        float m = fbm(p * 2.0, vec2(4.8), 4) * 0.06;
        vec3 c = vec3(0.70, 0.685, 0.655) * (0.94 + tone + m);
        vec2 tie = mod(p, vec2(0.6, 0.6)) - 0.3;
        c *= mix(0.55, 1.0, smoothstep(0.012, 0.02, length(tie)));
        return c;
      }
      float R(vec2 p, float h) { return 0.82 + fbm(p * 6.0, vec2(14.4), 3) * 0.1; }
      float O(vec2 p, float h) { return clamp(1.0 + h * 120.0, 0.6, 1.0); }`,
  },
  stone: {
    S: [2, 2],
    normal: 2.4,
    glsl: /* glsl */ `
      // pedra moledo: fiadas de 0,125 m com pedras de comprimento irregular
      vec4 stoneCell(vec2 p) {
        float ch = 0.125;
        float row = floor(p.y / ch);
        float fy = fract(p.y / ch) * ch;
        float L = 0.4;
        float x = p.x + hash12(vec2(mod(row, 16.0), 1.0)) * L;
        float k = floor(x / L);
        float j0 = (hash12(vec2(mod(row, 16.0), mod(k, 5.0))) - 0.5) * 0.55 * L;
        float j1 = (hash12(vec2(mod(row, 16.0), mod(k + 1.0, 5.0))) - 0.5) * 0.55 * L;
        float b0 = k * L + j0;
        float b1 = (k + 1.0) * L + j1;
        float id = k;
        if (x < b0) { b1 = b0; id = k - 1.0; b0 = (k - 1.0) * L + (hash12(vec2(mod(row, 16.0), mod(k - 1.0, 5.0))) - 0.5) * 0.55 * L; }
        else if (x > b1) { b0 = b1; id = k + 1.0; b1 = (k + 2.0) * L + (hash12(vec2(mod(row, 16.0), mod(k + 2.0, 5.0))) - 0.5) * 0.55 * L; }
        float ex = min(x - b0, b1 - x);
        float ey = min(fy, ch - fy);
        float edge = min(ex, ey);
        return vec4(edge, hash12(vec2(mod(row, 16.0), mod(id, 5.0)) + 7.0), row, id);
      }
      float H(vec2 p) {
        vec4 c = stoneCell(p);
        float face = smoothstep(0.004, 0.02, c.x);
        return face * (0.006 + c.y * 0.006) + fbm(p * 11.0, vec2(22.0), 4) * 0.0025 * face;
      }
      vec3 A(vec2 p, float h) {
        vec4 c = stoneCell(p);
        float face = smoothstep(0.003, 0.009, c.x);
        float t = c.y;
        vec3 col = t < 0.4 ? vec3(0.80, 0.70, 0.57) : t < 0.7 ? vec3(0.74, 0.67, 0.58) : t < 0.88 ? vec3(0.72, 0.55, 0.41) : vec3(0.56, 0.51, 0.45);
        col *= 0.88 + fbm(p * 6.0, vec2(12.0), 4) * 0.22 + gnoise(p * 40.0, vec2(80.0)) * 0.05;
        return mix(vec3(0.58, 0.54, 0.48), col, face);
      }
      float R(vec2 p, float h) { return 0.88; }
      float O(vec2 p, float h) { return mix(0.5, 1.0, smoothstep(0.003, 0.02, stoneCell(p).x)); }`,
  },
  wood: {
    S: [2, 2],
    normal: 0.8,
    glsl: /* glsl */ `
      // assoalho: réguas de 0,14 m ao longo de x, emendas desencontradas
      vec4 plank(vec2 p) {
        float row = floor(p.y / 0.14);
        float len = 1.0 + floor(hash12(vec2(row, 1.0)) * 2.0) * 0.5;
        float off = hash12(vec2(row, 2.0)) * len;
        float x = p.x + off;
        float id = floor(x / len);
        float fx = fract(x / len) * len;
        float fy = fract(p.y / 0.14) * 0.14;
        float d = min(min(fx, len - fx), min(fy, 0.14 - fy));
        return vec4(smoothstep(0.0, 0.0015, d), hash12(vec2(row, id)), row, id);
      }
      float H(vec2 p) { vec4 k = plank(p); return (k.x - 1.0) * 0.0012 + gnoise(vec2(p.x * 2.0, p.y * 70.0) + k.y * 9.0, vec2(4.0, 140.0)) * 0.0002; }
      vec3 A(vec2 p, float h) {
        vec4 k = plank(p);
        float g = gnoise(vec2(p.x * 1.6 + k.y * 13.0, p.y * 55.0), vec2(3.2, 110.0));
        float rings = sin((p.y * 90.0 + g * 6.0 + k.y * 20.0)) * 0.5 + 0.5;
        vec3 c = mix(vec3(0.56, 0.38, 0.25), vec3(0.66, 0.47, 0.32), k.y);
        c *= 0.86 + rings * 0.1 + g * 0.08;
        return mix(c * 0.55, c, k.x);
      }
      float R(vec2 p, float h) { return 0.48 + gnoise(p * 8.0, vec2(16.0)) * 0.08; }
      float O(vec2 p, float h) { return mix(0.6, 1.0, plank(p).x); }`,
  },
  woodPanel: {
    S: [2, 2],
    normal: 0.5,
    glsl: /* glsl */ `
      float H(vec2 p) { return gnoise(vec2(p.x * 60.0, p.y * 1.5), vec2(120.0, 3.0)) * 0.0003; }
      vec3 A(vec2 p, float h) {
        float g = gnoise(vec2(p.x * 45.0, p.y * 1.2), vec2(90.0, 2.4));
        float f = fbm(vec2(p.x * 8.0, p.y * 0.6), vec2(16.0, 1.2), 3);
        vec3 c = vec3(0.60, 0.41, 0.27) * (0.9 + g * 0.1 + f * 0.12);
        return c;
      }
      float R(vec2 p, float h) { return 0.5; }
      float O(vec2 p, float h) { return 1.0; }`,
  },
  travertine: {
    S: [2.4, 2.4],
    normal: 1.0,
    glsl: /* glsl */ `
      vec4 T(vec2 p) { return tiles(p, vec2(1.2, 0.6), 0.5, 0.0025); }
      float H(vec2 p) {
        vec4 t = T(p);
        vec3 v = voronoi(p * 38.0, vec2(91.2));
        float pore = (1.0 - smoothstep(0.03, 0.09, v.x)) * step(0.72, v.z);
        return (t.x - 1.0) * 0.0015 - pore * 0.0006;
      }
      vec3 A(vec2 p, float h) {
        vec4 t = T(p);
        float veins = sin(p.y * 22.0 + fbm(p * vec2(1.4, 3.0), vec2(3.36, 7.2), 5) * 7.0 + t.y * 6.0) * 0.5 + 0.5;
        vec3 c = mix(vec3(0.84, 0.78, 0.68), vec3(0.79, 0.72, 0.61), veins * 0.7);
        c *= 0.95 + t.y * 0.07;
        vec3 v = voronoi(p * 38.0, vec2(91.2));
        float pore = (1.0 - smoothstep(0.03, 0.09, v.x)) * step(0.72, v.z);
        c *= 1.0 - pore * 0.25;
        return mix(c * 0.78, c, t.x);
      }
      float R(vec2 p, float h) { return 0.42 + T(p).y * 0.1; }
      float O(vec2 p, float h) { return mix(0.7, 1.0, T(p).x); }`,
  },
  porcelain: {
    S: [1.8, 1.8],
    normal: 0.7,
    glsl: /* glsl */ `
      vec4 T(vec2 p) { return tiles(p, vec2(0.9, 0.9), 0.0, 0.0018); }
      float H(vec2 p) { return (T(p).x - 1.0) * 0.001; }
      vec3 A(vec2 p, float h) { vec4 t = T(p); vec3 c = vec3(0.83, 0.82, 0.79) * (0.97 + t.y * 0.04 + fbm(p * 3.0, vec2(5.4), 3) * 0.04); return mix(c * 0.85, c, t.x); }
      float R(vec2 p, float h) { return 0.3; }
      float O(vec2 p, float h) { return mix(0.8, 1.0, T(p).x); }`,
  },
  tile: {
    S: [0.6, 0.6],
    normal: 1.4,
    glsl: /* glsl */ `
      // cerâmica artesanal 7,5 × 15 cm, em amarração
      vec4 T(vec2 p) { return tiles(p, vec2(0.15, 0.075), 0.5, 0.0018); }
      float H(vec2 p) { vec4 t = T(p); return (t.x - 1.0) * 0.0012 + gnoise(p * 30.0 + t.y * 7.0, vec2(18.0)) * 0.0003 * t.x; }
      vec3 A(vec2 p, float h) { vec4 t = T(p); vec3 c = mix(vec3(0.90, 0.88, 0.84), vec3(0.84, 0.86, 0.84), t.y) * (0.96 + gnoise(p * 20.0, vec2(12.0)) * 0.04); return mix(vec3(0.72, 0.70, 0.66), c, t.x); }
      float R(vec2 p, float h) { return mix(0.7, 0.18, T(p).x); }
      float O(vec2 p, float h) { return mix(0.7, 1.0, T(p).x); }`,
  },
  pavers: {
    S: [1.6, 1.6],
    normal: 1.4,
    glsl: /* glsl */ `
      vec4 T(vec2 p) { return tiles(p, vec2(0.4, 0.2), 0.5, 0.004); }
      float H(vec2 p) { vec4 t = T(p); return (t.x - 1.0) * 0.004 + fbm(p * 10.0, vec2(16.0), 3) * 0.0012; }
      vec3 A(vec2 p, float h) { vec4 t = T(p); vec3 c = mix(vec3(0.72, 0.69, 0.63), vec3(0.64, 0.62, 0.58), t.y) * (0.92 + fbm(p * 6.0, vec2(9.6), 4) * 0.16); return mix(vec3(0.4, 0.39, 0.36), c, t.x); }
      float R(vec2 p, float h) { return 0.92; }
      float O(vec2 p, float h) { return mix(0.55, 1.0, T(p).x); }`,
  },
  deck: {
    S: [2, 2],
    normal: 1.2,
    glsl: /* glsl */ `
      // deck em cumaru: réguas de 0,14 m ao longo de y (z no mundo), frestas de 6 mm
      vec4 D(vec2 p) {
        float col = floor(p.x / 0.14);
        float fx = fract(p.x / 0.14) * 0.14;
        float gap = smoothstep(0.0, 0.003, min(fx, 0.14 - fx) - 0.003);
        return vec4(gap, hash12(vec2(col, 5.0)), col, 0.0);
      }
      float H(vec2 p) { vec4 d = D(p); return (d.x - 1.0) * 0.006 + gnoise(vec2(p.x * 70.0, p.y * 2.0) + d.y * 5.0, vec2(140.0, 4.0)) * 0.0003; }
      vec3 A(vec2 p, float h) {
        vec4 d = D(p);
        float g = gnoise(vec2(p.x * 50.0, p.y * 1.4 + d.y * 9.0), vec2(100.0, 2.8));
        vec3 c = mix(vec3(0.42, 0.27, 0.18), vec3(0.52, 0.34, 0.22), d.y) * (0.88 + g * 0.12);
        return mix(vec3(0.08, 0.06, 0.05), c, d.x);
      }
      float R(vec2 p, float h) { return 0.62; }
      float O(vec2 p, float h) { return mix(0.3, 1.0, D(p).x); }`,
  },
  lawn: {
    S: [4, 4],
    normal: 1.2,
    glsl: /* glsl */ `
      float H(vec2 p) { return fbm(p * 18.0, vec2(72.0), 4) * 0.004; }
      vec3 A(vec2 p, float h) {
        float m = fbm(p * 0.8, vec2(3.2), 4);
        float f = fbm(p * 25.0, vec2(100.0), 3);
        vec3 c = mix(vec3(0.33, 0.43, 0.20), vec3(0.42, 0.50, 0.24), 0.5 + m);
        c = mix(c, vec3(0.50, 0.52, 0.30), smoothstep(0.25, 0.6, m) * 0.4);
        return c * (0.85 + f * 0.3);
      }
      float R(vec2 p, float h) { return 0.95; }
      float O(vec2 p, float h) { return 0.9 + h * 25.0; }`,
  },
  gravel: {
    S: [1, 1],
    normal: 2.0,
    glsl: /* glsl */ `
      float H(vec2 p) { vec3 v = voronoi(p * 32.0, vec2(32.0)); return (1.0 - smoothstep(0.1, 0.5, v.x)) * 0.004; }
      vec3 A(vec2 p, float h) { vec3 v = voronoi(p * 32.0, vec2(32.0)); vec3 c = mix(vec3(0.78, 0.74, 0.67), vec3(0.62, 0.60, 0.57), v.z); return c * mix(0.6, 1.0, smoothstep(0.1, 0.4, v.y - v.x)); }
      float R(vec2 p, float h) { return 0.95; }
      float O(vec2 p, float h) { vec3 v = voronoi(p * 32.0, vec2(32.0)); return mix(0.55, 1.0, smoothstep(0.0, 0.35, v.y - v.x)); }`,
  },
  pool: {
    S: [0.5, 0.5],
    normal: 1.0,
    glsl: /* glsl */ `
      // pastilha 2,5 cm em tons de verde-água
      vec4 T(vec2 p) { return tiles(p, vec2(0.025, 0.025), 0.0, 0.0012); }
      float H(vec2 p) { return (T(p).x - 1.0) * 0.0008; }
      vec3 A(vec2 p, float h) { vec4 t = T(p); vec3 c = mix(vec3(0.38, 0.72, 0.70), vec3(0.24, 0.58, 0.60), t.y); c = mix(c, vec3(0.62, 0.84, 0.80), step(0.9, t.y) * 0.6); return mix(vec3(0.86, 0.88, 0.85), c, t.x); }
      float R(vec2 p, float h) { return mix(0.6, 0.15, T(p).x); }
      float O(vec2 p, float h) { return 1.0; }`,
  },
  linen: {
    S: [0.5, 0.5],
    normal: 0.6,
    glsl: /* glsl */ `
      float H(vec2 p) { float a = sin(p.x * 900.0) * sin(p.y * 900.0); return a * 0.00008 + gnoise(p * 40.0, vec2(20.0)) * 0.0001; }
      vec3 A(vec2 p, float h) { float w = gnoise(vec2(p.x * 300.0, p.y * 6.0), vec2(150.0, 3.0)) * 0.5 + gnoise(vec2(p.x * 6.0, p.y * 300.0), vec2(3.0, 150.0)) * 0.5; return vec3(0.93, 0.90, 0.85) * (0.94 + w * 0.08); }
      float R(vec2 p, float h) { return 0.96; }
      float O(vec2 p, float h) { return 1.0; }`,
  },
  cobble: {
    S: [2, 2],
    normal: 1.8,
    glsl: /* glsl */ `
      vec3 C(vec2 p) { return voronoi(p * vec2(7.0, 7.0), vec2(14.0)); }
      float H(vec2 p) { vec3 v = C(p); return smoothstep(0.0, 0.16, v.y - v.x) * 0.008; }
      vec3 A(vec2 p, float h) { vec3 v = C(p); vec3 c = mix(vec3(0.38, 0.37, 0.35), vec3(0.30, 0.29, 0.28), v.z) * (0.9 + fbm(p * 9.0, vec2(18.0), 3) * 0.2); return mix(vec3(0.22, 0.21, 0.2), c, smoothstep(0.0, 0.1, v.y - v.x)); }
      float R(vec2 p, float h) { return 0.9; }
      float O(vec2 p, float h) { vec3 v = C(p); return mix(0.5, 1.0, smoothstep(0.0, 0.15, v.y - v.x)); }`,
  },
};

export type TexName = keyof typeof defs;

export interface TexSet {
  map: Texture;
  normalMap: Texture;
  orm: Texture;
  repeat: Vector2;
  normal: number;
}

const BIG = new Set<TexName>(['plaster', 'concrete', 'stone', 'wood', 'travertine', 'deck', 'pavers', 'lawn']);

/**
 * Assa todas as texturas. `scale` 1 = alta (1024/512), 0.5 = média, 0.25 = baixa.
 * Uma textura por quadro: a página não congela e nenhuma chamada fica longa a ponto de o driver derrubar a GPU.
 */
export async function bakeTextures(renderer: WebGLRenderer, scale: number, onProgress?: (p: number) => void): Promise<Record<TexName, TexSet>> {
  const scene = new Scene();
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new ShaderMaterial({
    uniforms: { uS: { value: new Vector2() }, uTexel: { value: 0 }, uMode: { value: 0 }, uNormal: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'void main(){}',
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const prevTarget = renderer.getRenderTarget();
  const out = {} as Record<TexName, TexSet>;

  const entries = Object.entries(defs) as [TexName, TexDef][];
  for (const [k, [name, def]] of entries.entries()) {
    mat.fragmentShader = /* glsl */ `
      precision highp float;
      uniform vec2 uS;
      uniform float uTexel;
      uniform int uMode;
      uniform float uNormal;
      varying vec2 vUv;
      ${NOISE}
      ${def.glsl}
      void main() {
        vec2 p = vUv * uS;
        float h = H(p);
        if (uMode == 0) {
          gl_FragColor = vec4(srgb(clamp(A(p, h), 0.0, 1.0)), 1.0);
        } else if (uMode == 1) {
          vec2 e = vec2(uTexel) * uS;
          float hx = H(p + vec2(e.x, 0.0)) - H(p - vec2(e.x, 0.0));
          float hy = H(p + vec2(0.0, e.y)) - H(p - vec2(0.0, e.y));
          vec3 n = normalize(vec3(-hx / (2.0 * e.x) * uNormal, -hy / (2.0 * e.y) * uNormal, 1.0));
          gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
        } else {
          gl_FragColor = vec4(clamp(O(p, h), 0.0, 1.0), clamp(R(p, h), 0.04, 1.0), 0.0, 1.0);
        }
      }`;
    mat.needsUpdate = true;
    const big = BIG.has(name);
    const sizes = [big ? 1024 : 512, big ? 1024 : 512, 512].map((s) => Math.max(128, Math.round(s * scale)));
    const tex: Texture[] = [];
    for (let mode = 0; mode < 3; mode++) {
      const size = sizes[mode];
      const rt = new WebGLRenderTarget(size, size, {
        generateMipmaps: true,
        minFilter: LinearMipmapLinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      });
      const t = rt.texture;
      t.wrapS = t.wrapT = RepeatWrapping;
      t.anisotropy = aniso;
      t.colorSpace = mode === 0 ? SRGBColorSpace : NoColorSpace;
      mat.uniforms.uS.value.set(def.S[0], def.S[1]);
      mat.uniforms.uTexel.value = 1 / size;
      mat.uniforms.uMode.value = mode;
      mat.uniforms.uNormal.value = def.normal;
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      tex.push(t);
    }
    const repeat = new Vector2(1 / def.S[0], 1 / def.S[1]);
    for (const t of tex) t.repeat.copy(repeat);
    out[name] = { map: tex[0], normalMap: tex[1], orm: tex[2], repeat, normal: def.normal };
    renderer.setRenderTarget(prevTarget);
    onProgress?.((k + 1) / entries.length);
    await new Promise((r) => requestAnimationFrame(r));
  }
  renderer.setRenderTarget(prevTarget);
  mat.dispose();
  quad.geometry.dispose();
  return out;
}
