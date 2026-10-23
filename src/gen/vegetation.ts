import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type Group,
} from 'three';
import type { House } from '../data/schema';
import { drive } from '../data/house';
import { zoneAt } from '../render/zones';

// ------------------------------------------------------------------ utilidades

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Acc {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  vert(p: Vector3, n: Vector3, c: Color) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(c.r, c.g, c.b);
    return this.pos.length / 3 - 1;
  }
  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Densidade das folhas (1 = completa). Menos folhas ficam maiores para cobrir a mesma copa. */
let DETAIL = 1;
export function setVegetationDetail(d: number) {
  DETAIL = MathUtils.clamp(d, 0.2, 1);
}
/**
 * Com DETAIL < 1, mantém só uma parte das folhas (sempre as mesmas, espalhadas pela sequência).
 * As folhas descartadas continuam consumindo o gerador aleatório: a versão de longe é a mesma planta
 * com menos folhas, e não outra árvore (a troca de detalhe na subida final mudava galhos e copa).
 */
const keepLeaf = (i: number) => DETAIL >= 1 || (i * 0.6180339887) % 1 < DETAIL;

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _n = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Faixa (folha/folíolo): pontos centrais, larguras e direção lateral. */
function strip(acc: Acc, pts: Vector3[], widths: number[], side: Vector3, c0: Color, c1: Color) {
  const ids: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    const fwd = _a.subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    _n.crossVectors(side, fwd).normalize();
    if (_n.y < 0) _n.negate();
    const col = c0.clone().lerp(c1, t);
    const w = widths[i];
    const l = acc.vert(_b.copy(pts[i]).addScaledVector(side, -w), _n, col);
    const r = acc.vert(_c.copy(pts[i]).addScaledVector(side, w), _n, col);
    ids.push([l, r]);
  }
  for (let i = 0; i < ids.length - 1; i++) {
    const [l0, r0] = ids[i];
    const [l1, r1] = ids[i + 1];
    acc.tri(l0, r0, r1);
    acc.tri(l0, r1, l1);
  }
}

/** Tronco/tubo afunilado com anéis (cores por vértice). */
function tube(acc: Acc, curve: CatmullRomCurve3, segs: number, radial: number, radius: (u: number) => number, color: (u: number) => Color) {
  const frames = curve.computeFrenetFrames(segs, false);
  const rings: number[][] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const p = curve.getPointAt(u);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r = radius(u);
    const ring: number[] = [];
    const col = color(u);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      _n.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a)).normalize();
      ring.push(acc.vert(_a.copy(p).addScaledVector(_n, r), _n, col));
    }
    rings.push(ring);
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < radial; j++) {
      const a = rings[i][j];
      const b = rings[i + 1][j];
      const c = rings[i + 1][j + 1];
      const d = rings[i][j + 1];
      acc.tri(a, b, c);
      acc.tri(a, c, d);
    }
}

// ------------------------------------------------------------------ partes

const G = {
  leaf: new Color('#4c6e2f'),
  leafLight: new Color('#7f9a45'),
  leafDark: new Color('#2f4a22'),
  leafYellow: new Color('#9a9a48'),
  palm: new Color('#5a7a34'),
  palmTip: new Color('#a5a556'),
  trunk: new Color('#8a8072'),
  trunkDark: new Color('#5e554b'),
  bark: new Color('#4a3a2e'),
  crownshaft: new Color('#6f8f3f'),
  cane: new Color('#9aa04c'),
  magenta: new Color('#c8327d'),
  magentaLight: new Color('#e05b9b'),
  red: new Color('#d0342a'),
  yellow: new Color('#e8b62a'),
  ipe: new Color('#e9c133'),
  coconut: new Color('#6d5a2a'),
  mata: new Color('#36552a'),
  mataDeep: new Color('#263f1d'),
};

/** Folha de palmeira: ráquis em arco com folíolos dos dois lados. */
function frond(acc: Acc, base: Vector3, az: number, elev: number, L: number, leaflet: number, n: number, droop: number, r: () => number, c0 = G.palm, c1 = G.palmTip) {
  const dir = new Vector3(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az));
  const side = new Vector3().crossVectors(dir, UP).normalize();
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  const at = (s: number) => new Vector3().copy(base).addScaledVector(dir, L * s).add(new Vector3(0, -droop * L * s * s, 0));
  const tint = c0.clone().multiplyScalar(0.85 + r() * 0.3);
  const tip = c1.clone().multiplyScalar(0.85 + r() * 0.25);
  const wk = DETAIL < 1 ? 1 / Math.sqrt(DETAIL) : 1;
  for (let i = 0; i < n; i++) {
    const keep = keepLeaf(i);
    const s = 0.1 + (0.88 * i) / n;
    const p = at(s);
    const t = at(Math.min(1, s + 0.01)).sub(at(Math.max(0, s - 0.01))).normalize();
    const len = leaflet * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * s)), 0.7) * (0.85 + r() * 0.3);
    for (const sd of [-1, 1]) {
      const d = new Vector3()
        .copy(t)
        .multiplyScalar(0.5)
        .addScaledVector(side, sd * 0.85)
        .add(new Vector3(0, -0.12 - r() * 0.15, 0))
        .normalize();
      const pts: Vector3[] = [];
      const ws: number[] = [];
      for (let k = 0; k <= 3; k++) {
        const u = k / 3;
        pts.push(new Vector3().copy(p).addScaledVector(d, len * u).add(new Vector3(0, -0.28 * len * u * u, 0)));
        ws.push(Math.max(0.004, 0.022 * (1 - u * 0.75) * (leaflet / 0.6)) * wk);
      }
      if (!keep) continue;
      const lateral = new Vector3().crossVectors(d, UP).normalize();
      if (lateral.lengthSq() < 1e-6) lateral.copy(t);
      strip(acc, pts, ws, lateral, tint, tip);
    }
  }
}

/** Folha larga (helicônia/bananeira): pecíolo + lâmina em arco. */
function paddleLeaf(acc: Acc, base: Vector3, az: number, tilt: number, stem: number, len: number, wid: number, r: () => number, color = G.leaf) {
  const dir = new Vector3(Math.sin(tilt) * Math.sin(az), Math.cos(tilt), Math.sin(tilt) * Math.cos(az)).normalize();
  const side = new Vector3().crossVectors(dir, UP).normalize();
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  // pecíolo
  const top = new Vector3().copy(base).addScaledVector(dir, stem);
  const sp = [base.clone(), base.clone().lerp(top, 0.5), top.clone()];
  strip(acc, sp, [0.015, 0.013, 0.011], side, G.leafDark, G.leaf);
  // lâmina
  const out = new Vector3().copy(dir).add(new Vector3(0, -0.15, 0)).normalize();
  const pts: Vector3[] = [];
  const ws: number[] = [];
  const N = 9;
  for (let k = 0; k <= N; k++) {
    const u = k / N;
    pts.push(new Vector3().copy(top).addScaledVector(out, len * u).add(new Vector3(0, -0.35 * len * u * u, 0)));
    ws.push(wid * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.95 + 0.04)), 0.65) * 0.5);
  }
  const c = color.clone().multiplyScalar(0.85 + r() * 0.3);
  strip(acc, pts, ws, side, c, c.clone().lerp(G.leafLight, 0.35));
}

/** Nuvem de folhas (arbustos, copas, primavera): cartões na superfície de um elipsoide com ruído. */
function cluster(acc: Acc, center: Vector3, rx: number, ry: number, rz: number, count: number, size: number, r: () => number, palette: Color[], weights?: number[]) {
  if (DETAIL < 1) size /= Math.sqrt(DETAIL);
  for (let i = 0; i < count; i++) {
    // ponto aleatório na esfera
    const u = r() * 2 - 1;
    const th = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const nrm = new Vector3(s * Math.cos(th), u, s * Math.sin(th));
    if (nrm.y < -0.6 && r() < 0.7) continue;
    const depth = 0.75 + r() * 0.3;
    const p = new Vector3(center.x + nrm.x * rx * depth, center.y + nrm.y * ry * depth, center.z + nrm.z * rz * depth);
    // cartão tangente
    const t1 = new Vector3().crossVectors(nrm, Math.abs(nrm.y) > 0.9 ? new Vector3(1, 0, 0) : UP).normalize();
    t1.applyAxisAngle(nrm, r() * Math.PI);
    const t2 = new Vector3().crossVectors(nrm, t1).normalize();
    let ci = 0;
    if (weights) {
      const x = r();
      let acc2 = 0;
      for (let k = 0; k < weights.length; k++) {
        acc2 += weights[k];
        if (x <= acc2) {
          ci = k;
          break;
        }
      }
    } else ci = Math.floor(r() * palette.length);
    const col = palette[ci].clone().multiplyScalar(0.8 + r() * 0.35);
    const w = size * (0.7 + r() * 0.6);
    const h = w * 0.55;
    if (!keepLeaf(i)) continue;
    const n = nrm.clone().lerp(UP, 0.25).normalize();
    const a = acc.vert(p.clone().addScaledVector(t1, -w).addScaledVector(t2, -h), n, col);
    const b = acc.vert(p.clone().addScaledVector(t1, w).addScaledVector(t2, -h), n, col);
    const c = acc.vert(p.clone().addScaledVector(t1, w).addScaledVector(t2, h), n, col);
    const d = acc.vert(p.clone().addScaledVector(t1, -w).addScaledVector(t2, h), n, col);
    acc.tri(a, b, c);
    acc.tri(a, c, d);
  }
}

// ------------------------------------------------------------------ espécies

interface Built {
  leaves: BufferGeometry;
  wood: BufferGeometry | null;
  height: number;
  radius: number;
}

function royalPalm(seed: number): Built {
  const r = rng(seed);
  const leaves = new Acc();
  const wood = new Acc();
  const H = 12 + r() * 3;
  const curve = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(0.05, H * 0.35, 0.02), new Vector3(-0.04, H * 0.7, 0.05), new Vector3(0, H, 0)]);
  tube(wood, curve, 30, 10, (u) => (0.3 - 0.06 * u + 0.05 * Math.sin(u * Math.PI) ) * (1 + 0.02 * Math.sin(u * 140)), (u) => G.trunk.clone().lerp(G.trunkDark, 0.4 + 0.3 * Math.sin(u * 60)));
  const cs = new CatmullRomCurve3([new Vector3(0, H, 0), new Vector3(0, H + 1.1, 0), new Vector3(0, H + 2.2, 0)]);
  tube(wood, cs, 6, 10, (u) => 0.26 - 0.1 * u, () => G.crownshaft);
  const top = new Vector3(0, H + 2.1, 0);
  const n = 15;
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + r() * 0.3;
    const elev = MathUtils.degToRad(70 - (i % 3) * 30 - r() * 15);
    frond(leaves, top, az, elev, 3.6 + r() * 0.8, 0.85, 46, 0.55 + r() * 0.2, r);
  }
  return { leaves: leaves.geometry(), wood: wood.geometry(), height: H + 4, radius: 4 };
}

function coconutPalm(seed: number): Built {
  const r = rng(seed);
  const leaves = new Acc();
  const wood = new Acc();
  const H = 7.5 + r() * 3;
  const lean = 1.2 + r() * 2.2;
  const la = r() * Math.PI * 2;
  const lx = Math.cos(la) * lean;
  const lz = Math.sin(la) * lean;
  const curve = new CatmullRomCurve3([
    new Vector3(0, 0, 0),
    new Vector3(lx * 0.35, H * 0.3, lz * 0.35),
    new Vector3(lx * 0.75, H * 0.65, lz * 0.75),
    new Vector3(lx, H, lz),
  ]);
  tube(wood, curve, 28, 9, (u) => (0.22 - 0.06 * u) * (1 + 0.05 * Math.max(0, Math.sin(u * 90))), (u) => G.trunk.clone().lerp(G.trunkDark, 0.5 + 0.5 * Math.sin(u * 45)));
  const top = new Vector3(lx, H, lz);
  const n = 17;
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + r() * 0.35;
    const elev = MathUtils.degToRad(55 - (i % 3) * 28 - r() * 18);
    frond(leaves, top, az, elev, 4.0 + r() * 0.9, 0.95, 50, 0.75 + r() * 0.25, r);
  }
  // cocos
  const cocos = new Acc();
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    cluster(cocos, new Vector3(lx + Math.cos(a) * 0.22, H - 0.25 - r() * 0.2, lz + Math.sin(a) * 0.22), 0.11, 0.12, 0.11, 18, 0.05, r, [G.coconut, G.palm]);
  }
  const lg = leaves.geometry();
  return { leaves: merge([lg, cocos.geometry()]), wood: wood.geometry(), height: H + 3, radius: 4.5 };
}

function arecaClump(seed: number): Built {
  const r = rng(seed);
  const leaves = new Acc();
  const wood = new Acc();
  const canes = 6 + Math.floor(r() * 5);
  let hMax = 0;
  for (let c = 0; c < canes; c++) {
    const a = r() * Math.PI * 2;
    const rad = r() * 0.35;
    const h = 2.0 + r() * 1.8;
    hMax = Math.max(hMax, h);
    const ox = Math.cos(a) * rad;
    const oz = Math.sin(a) * rad;
    const tx = ox * 2.2 + (r() - 0.5) * 0.4;
    const tz = oz * 2.2 + (r() - 0.5) * 0.4;
    const curve = new CatmullRomCurve3([new Vector3(ox, 0, oz), new Vector3((ox + tx) / 2, h * 0.55, (oz + tz) / 2), new Vector3(tx, h, tz)]);
    tube(wood, curve, 10, 6, (u) => 0.045 - 0.015 * u, (u) => G.cane.clone().multiplyScalar(0.8 + 0.3 * u));
    const top = new Vector3(tx, h, tz);
    const nf = 5 + Math.floor(r() * 3);
    for (let i = 0; i < nf; i++) {
      frond(leaves, top, r() * Math.PI * 2, MathUtils.degToRad(35 + r() * 35), 1.3 + r() * 0.5, 0.32, 22, 0.45, r, G.leaf, G.leafLight);
    }
  }
  return { leaves: leaves.geometry(), wood: wood.geometry(), height: hMax + 1, radius: 1.4 };
}

function fern(seed: number): Built {
  const r = rng(seed);
  const leaves = new Acc();
  const n = 12 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    frond(leaves, new Vector3(0, 0.08, 0), (i / n) * Math.PI * 2 + r() * 0.4, MathUtils.degToRad(40 + r() * 25), 0.75 + r() * 0.3, 0.13, 22, 0.7, r, G.leafLight, G.leafYellow);
  }
  return { leaves: leaves.geometry(), wood: null, height: 0.8, radius: 0.9 };
}

function heliconia(seed: number): Built {
  const r = rng(seed);
  const leaves = new Acc();
  const n = 7 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5;
    paddleLeaf(leaves, new Vector3(Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12), a, MathUtils.degToRad(12 + r() * 25), 0.7 + r() * 0.6, 1.2 + r() * 0.5, 0.32 + r() * 0.12, r);
  }
  // inflorescências (brácteas vermelhas/amarelas em zigue-zague)
  for (let f = 0; f < 3; f++) {
    const a = r() * Math.PI * 2;
    const base = new Vector3(Math.cos(a) * 0.2, 1.0 + r() * 0.5, Math.sin(a) * 0.2);
    for (let k = 0; k < 6; k++) {
      const p = base.clone().add(new Vector3(0, -k * 0.09, 0));
      const sd = k % 2 ? 1 : -1;
      const tip = p.clone().add(new Vector3(sd * 0.12, 0.05, 0));
      strip(leaves, [p, tip], [0.035, 0.005], new Vector3(0, 0, 1), G.red, G.yellow);
    }
  }
  return { leaves: leaves.geometry(), wood: null, height: 2.2, radius: 1.3 };
}

function monstera(seed: number): Built {
  const r = rng(seed);
  const leaves = new Acc();
  const n = 8 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5;
    paddleLeaf(leaves, new Vector3(0, 0, 0), a, MathUtils.degToRad(30 + r() * 30), 0.5 + r() * 0.4, 0.55 + r() * 0.2, 0.55 + r() * 0.15, r, G.leafDark);
  }
  return { leaves: leaves.geometry(), wood: null, height: 1.2, radius: 1.0 };
}

function shrub(seed: number, rx: number, ry: number, palette: Color[], weights?: number[], density = 900): Built {
  const r = rng(seed);
  const leaves = new Acc();
  cluster(leaves, new Vector3(0, ry * 0.95, 0), rx, ry, rx, Math.round(density * (rx * ry)), 0.09, r, palette, weights);
  cluster(leaves, new Vector3(0, ry * 0.95, 0), rx * 0.7, ry * 0.7, rx * 0.7, Math.round(density * 0.4 * rx * ry), 0.09, r, palette, weights);
  return { leaves: leaves.geometry(), wood: null, height: ry * 2, radius: rx };
}

/** `density` < 1: menos folhas, maiores (a mata em volta do lote só é vista de longe). */
function tree(seed: number, opts: { H: number; crown: number; colors: Color[]; weights?: number[]; bark?: Color; density?: number }): Built {
  const r = rng(seed);
  const dn = opts.density ?? 1;
  const leafSize = 1 / Math.sqrt(dn);
  const leaves = new Acc();
  const wood = new Acc();
  const H = opts.H * (0.85 + r() * 0.3);
  const trunk = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3((r() - 0.5) * 0.4, H * 0.3, (r() - 0.5) * 0.4), new Vector3((r() - 0.5) * 0.6, H * 0.55, (r() - 0.5) * 0.6)]);
  const bark = opts.bark ?? G.bark;
  tube(wood, trunk, 14, 8, (u) => 0.22 * (1 - u * 0.45) * (opts.H / 8), () => bark);
  const fork = trunk.getPointAt(1);
  const nb = 4 + Math.floor(r() * 3);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + r() * 0.6;
    const len = opts.crown * (0.6 + r() * 0.5);
    const end = new Vector3(fork.x + Math.cos(a) * len, fork.y + H * 0.3 + r() * H * 0.15, fork.z + Math.sin(a) * len);
    const mid = fork.clone().lerp(end, 0.5).add(new Vector3(0, 0.4, 0));
    tube(wood, new CatmullRomCurve3([fork.clone(), mid, end]), 8, 6, (u) => 0.12 * (1 - u * 0.7) * (opts.H / 8), () => bark);
    cluster(leaves, end.clone().add(new Vector3(0, 0.3, 0)), opts.crown * 0.55, opts.crown * 0.38, opts.crown * 0.55, Math.round(520 * opts.crown * opts.crown * 0.35 * dn), 0.1 * leafSize, r, opts.colors, opts.weights);
  }
  cluster(leaves, new Vector3(fork.x, fork.y + H * 0.42, fork.z), opts.crown * 0.8, opts.crown * 0.45, opts.crown * 0.8, Math.round(700 * opts.crown * opts.crown * 0.35 * dn), 0.11 * leafSize, r, opts.colors, opts.weights);
  return { leaves: leaves.geometry(), wood: wood.geometry(), height: H + opts.crown, radius: opts.crown * 1.2 };
}

function merge(gs: BufferGeometry[]): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (const g of gs) {
    const base = pos.length / 3;
    const pa = g.getAttribute('position').array;
    const na = g.getAttribute('normal').array;
    const ca = g.getAttribute('color').array;
    for (let i = 0; i < pa.length; i++) {
      pos.push(pa[i]);
      nor.push(na[i]);
      col.push(ca[i]);
    }
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i));
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

// ------------------------------------------------------------------ materiais com vento e translucidez

export const vegUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  uSunDir: { value: new Vector3(0, 1, 0) },
  uSunColor: { value: new Color(1, 1, 1) },
};

function vegMaterial(kind: 'leaf' | 'wood'): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    vertexColors: true,
    roughness: kind === 'leaf' ? 0.62 : 0.92,
    metalness: 0,
    side: kind === 'leaf' ? DoubleSide : FrontSide,
  });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, vegUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float hh = max(transformed.y, 0.0);
          vec3 basePos = vec3(0.0);
          #ifdef USE_INSTANCING
            basePos = instanceMatrix[3].xyz;
          #endif
          float ph = dot(basePos.xz, vec2(0.13, 0.17));
          float k = ${kind === 'leaf' ? '0.0045' : '0.0018'} * uWind * hh * hh / (1.0 + hh * 0.08);
          transformed.x += (sin(uTime * 1.3 + ph) + 0.5 * sin(uTime * 2.9 + ph * 1.7 + transformed.z)) * k;
          transformed.z += (cos(uTime * 1.1 + ph) + 0.5 * sin(uTime * 3.3 + transformed.x)) * k * 0.7;
        }`,
      );
    if (kind === 'leaf') {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir;\nuniform vec3 uSunColor;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            // translucidez barata: folha contra o sol brilha
            vec3 vd = normalize(-vViewPosition);
            vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
            float back = pow(max(dot(vd, sunV), 0.0), 3.0);
            totalEmissiveRadiance += diffuseColor.rgb * uSunColor * back * 0.55;
          }`,
        );
    }
  };
  m.customProgramCacheKey = () => `veg-${kind}`;
  return m;
}

// ------------------------------------------------------------------ plano de plantio

export type Species = 'royal' | 'coconut' | 'areca' | 'fern' | 'heliconia' | 'monstera' | 'shrub' | 'topiary' | 'bougainvillea' | 'jabuticaba' | 'ipe' | 'canopy' | 'mata';

export interface Plant {
  species: Species;
  x: number;
  z: number;
  y?: number;
  s?: number;
  rot?: number;
  variant?: number;
  /** Mata em volta do lote: fora do desenho da planta, só a geometria leve e lotes maiores. */
  forest?: boolean;
}

const P = (species: Species, x: number, z: number, s = 1, y = 0): Plant => ({ species, x, z, s, y });

export function plantingPlan(): Plant[] {
  const out: Plant[] = [];
  const r = rng(91);
  // rotatória e avenida de palmeiras-imperiais
  out.push(P('royal', 16, 38, 1.15));
  for (let i = 0; i < 8; i++) out.push(P('shrub', 16 + Math.cos(i * 0.785) * 2.3, 38 + Math.sin(i * 0.785) * 2.3, 0.75));
  for (const z of [44, 49, 54]) {
    out.push(P('royal', 12.4, z, 0.95 + r() * 0.15));
    out.push(P('royal', 19.6, z + 1.2, 0.95 + r() * 0.15));
  }
  // pátio de entrada: canteiros nas pontas do espelho d'água
  for (const [x, z] of [[7.6, 20.6], [7.7, 23.9], [25.3, 20.7], [25.4, 24.0]] as [number, number][]) out.push(P('areca', x, z, 1));
  for (const [x, z] of [[7.8, 22.3], [25.2, 22.4], [14.2, 25.6], [17.8, 25.7]] as [number, number][]) out.push(P('heliconia', x, z, 0.9));
  for (const [x, z] of [[13.6, 26.6], [18.4, 26.8], [13.8, 28.4], [18.2, 28.2]] as [number, number][]) out.push(P('fern', x, z, 1));
  // jardim interno: jabuticabeira, samambaias e costelas-de-adão
  out.push(P('jabuticaba', 22.6, 15.2, 1));
  for (const [x, z] of [[20.0, 13.0], [25.2, 13.1], [20.2, 17.7], [25.1, 17.6]] as [number, number][]) out.push(P('monstera', x, z, 0.9));
  for (const [x, z] of [[21.2, 12.8], [24.0, 17.9], [19.8, 15.4]] as [number, number][]) out.push(P('fern', x, z, 1.1));
  // jardim norte: coqueiros ao redor da piscina e do lounge
  for (const [x, z, s] of [[7.2, -10.6, 1], [24.8, -11.4, 1.1], [6.4, -5.2, 0.9], [33.4, -10.4, 1.05], [36.5, -2.6, 0.95], [-2.5, -7.5, 1]] as [number, number, number][]) out.push(P('coconut', x, z, s));
  for (let i = 0; i < 6; i++) out.push(P('heliconia', 12.5 + i * 1.3, -11.6 - r() * 0.6, 0.9 + r() * 0.3));
  for (const [x, z] of [[9.4, -11.4], [22.8, -11.6], [25.5, -10.6], [32.5, -11.2]] as [number, number][]) out.push(P('areca', x, z, 1));
  for (const [x, z] of [[33.0, -4.0], [25.6, -3.2], [32.9, -7.0]] as [number, number][]) out.push(P('shrub', x, z, 0.8));
  // primavera sobre o pergolado e no muro do jardim da suíte
  out.push(P('bougainvillea', 1.8, 0.4, 1, 2.9));
  out.push(P('bougainvillea', 5.6, 3.6, 0.9, 2.9));
  out.push(P('bougainvillea', 39.4, 6.0, 1));
  // jardim da suíte
  out.push(P('ipe', 37.2, 8.6, 1));
  // folga das paredes e do vidro do banho (a helicônia abre ~1,3 m e a samambaia ~0,8 m): as folhas não atravessam
  // o muro nem o vidro, e a saída do banho para o jardim (porta de correr em z 12,7–13,8) fica livre
  for (const [x, z] of [[38.4, 1.6], [38.4, 11.0], [36.3, 10.9]] as [number, number][]) out.push(P('heliconia', x, z, 0.95));
  for (const [x, z] of [[36.8, 12.9], [38.8, 12.9]] as [number, number][]) out.push(P('fern', x, z, 1));
  // lateral oeste (cozinha/garagem) e leste (quartos)
  for (const z of [5, 8.5, 11.5, 15.5]) out.push(P('topiary', -1.4, z, 0.8));
  for (const z of [15.5, 18.5, 22.5]) out.push(P('areca', 35.6, z, 0.9));
  out.push(P('ipe', -6.5, 10.5, 1.1));
  out.push(P('canopy', -6.0, 22.0, 1));
  out.push(P('canopy', 42.5, 20.0, 1.1));
  // cinturão de árvores no perímetro do lote
  for (let i = 0; i < 26; i++) {
    const side = i % 4;
    const u = (Math.floor(i / 4) + r() * 0.6) / 6.5;
    const x = side === 0 ? -10 + r() * 2 : side === 1 ? 45.5 + r() * 2 : -10 + u * 56;
    const z = side === 0 || side === 1 ? -20 + u * 72 : side === 2 ? -20 + r() * 2 : 52 + r() * 2;
    const species: Species = r() < 0.3 ? 'coconut' : 'canopy';
    const s = 0.85 + r() * 0.4;
    // a divisa sul é cortada pela rua de acesso: nada de árvore (nem copa de coqueiro) sobre o leito
    if (side === 3 && x > drive.street.x0 - 4.5 && x < drive.street.x1 + 4.5) continue;
    out.push(P(species, x, z, s));
  }
  return out.map((p, i) => ({ ...p, rot: rng(i + 7)() * Math.PI * 2, variant: i }));
}

/**
 * Mata em volta do lote (o que aparece na vista aérea do fim e ao fundo nas vistas do jardim):
 * grade com jitter, sem o lote (com folga), sem o corredor do acesso e com algumas clareiras.
 */
export function forestPlan(site: { x0: number; z0: number; x1: number; z1: number }, accessX: [number, number]): Plant[] {
  const out: Plant[] = [];
  const r = rng(4242);
  const STEP = 8;
  const M = 3; // folga até a divisa (as copas do cinturão do lote ficam por dentro)
  const X0 = site.x0 - 68;
  const X1 = site.x1 + 68;
  const Z0 = site.z0 - 30;
  const Z1 = site.z1 + 32;
  for (let gx = X0; gx <= X1; gx += STEP) {
    for (let gz = Z0; gz <= Z1; gz += STEP) {
      const x = gx + (r() - 0.5) * STEP * 0.9;
      const z = gz + (r() - 0.5) * STEP * 0.9;
      const scale = 1.05 + r() * 0.55;
      const roll = r();
      const spin = r();
      if (x > site.x0 - M && x < site.x1 + M && z > site.z0 - M && z < site.z1 + M) continue;
      if (z > site.z1 && x > accessX[0] && x < accessX[1]) continue; // a rua de acesso continua para o sul
      // clareiras suaves longe da divisa (a mata não vira um tapete uniforme)
      const edge = Math.max(site.x0 - x, x - site.x1, site.z0 - z, z - site.z1);
      const glade = Math.sin(x * 0.071 + 1.3) * Math.cos(z * 0.083 - 0.4) + Math.sin((x + z) * 0.041);
      if (edge > 14 && glade > 0.95) continue;
      const species: Species = roll < 0.08 ? 'ipe' : roll < 0.17 ? 'coconut' : 'mata';
      out.push({ species, x, z, s: scale, rot: spin * Math.PI * 2, variant: species === 'mata' ? out.length % 2 : 0, forest: true });
    }
  }
  return out;
}

interface Batch {
  leaves: InstancedMesh;
  wood: InstancedMesh | null;
  items: { plant: Plant; zone: number; base: Matrix4; delay: number }[];
  /** Geometria completa e a de longe (menos folhas, maiores). */
  near: Built;
  far: Built;
}

export interface Vegetation {
  group: Group;
  plants: Plant[];
  update(reveal: Float32Array, dt: number, eye: Vector3): void;
}

/** A partir desta distância (m, até a borda do lote de plantas) usa a geometria de longe. */
const LOD_FAR = 70;
const LOD_HYST = 4;
/** Fração das folhas na geometria de longe. */
const LOD_DETAIL = 0.3;

/** `dn` < 1 (mata em volta do lote): árvores com menos folhas, maiores. */
function build(species: Species, seed: number, dn = 1): Built {
  switch (species) {
    case 'royal':
      return royalPalm(seed);
    case 'coconut':
      return coconutPalm(seed);
    case 'areca':
      return arecaClump(seed);
    case 'fern':
      return fern(seed);
    case 'heliconia':
      return heliconia(seed);
    case 'monstera':
      return monstera(seed);
    case 'shrub':
      return shrub(seed, 0.75, 0.55, [G.leaf, G.leafDark, G.leafLight]);
    case 'topiary':
      return shrub(seed, 0.55, 0.55, [G.leafDark, G.leaf], undefined, 1300);
    case 'bougainvillea':
      return shrub(seed, 1.6, 0.6, [G.magenta, G.magentaLight, G.leaf], [0.45, 0.25, 0.3], 700);
    case 'jabuticaba':
      return tree(seed, { H: 5, crown: 2.6, colors: [G.leafDark, G.leaf], bark: new Color('#6b5a4a') });
    case 'ipe':
      return tree(seed, { H: 7, crown: 3.2, colors: [G.ipe, G.yellow, G.leaf], weights: [0.5, 0.25, 0.25], density: dn });
    case 'canopy':
      return tree(seed, { H: 8, crown: 3.6, colors: [G.leaf, G.leafDark, G.leafLight], density: dn });
    case 'mata':
      return tree(seed, { H: 10, crown: 4.2, colors: [G.mataDeep, G.mata, G.leafDark, G.leafLight], weights: [0.3, 0.35, 0.25, 0.1], density: dn });
  }
}

/** Gera a vegetação instanciada (variantes por espécie) e o controle de crescimento por zona. */
export function buildVegetation(h: House, group: Group, forest: Plant[] = []): Vegetation {
  const garden = plantingPlan();
  const plants = [...garden, ...forest];
  const leafMat = vegMaterial('leaf');
  const woodMat = vegMaterial('wood');
  const VARIANTS = 3;
  const batches: Batch[] = [];
  const bySpecies = new Map<string, Plant[]>();
  const CELL = 20; // m
  const FOREST_CELL = 60; // lotes maiores na mata: menos chamadas de desenho
  for (const p of plants) {
    const cell = p.forest ? FOREST_CELL : CELL;
    const key = `${p.forest ? 'forest+' : ''}${p.species}:${(p.variant ?? 0) % VARIANTS}:${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
    if (!bySpecies.has(key)) bySpecies.set(key, []);
    bySpecies.get(key)!.push(p);
  }
  const dummy = new Object3D();
  const built = new Map<string, { near: Built; far: Built }>();
  const detail = DETAIL;
  for (const [key, list] of bySpecies) {
    const [tag, v] = key.split(':');
    const isForest = tag.startsWith('forest+');
    const species = (isForest ? tag.slice('forest+'.length) : tag) as Species;
    const kind = `${tag}:${v}`;
    if (!built.has(kind)) {
      const seed = 1000 + Number(v) * 17 + species.length * 101 + (isForest ? 7 : 0);
      DETAIL = detail * LOD_DETAIL;
      const far = build(species, seed, isForest ? 0.12 : 1);
      DETAIL = detail;
      // a mata só é vista de longe: usa a geometria leve sempre
      const near = isForest ? far : build(species, seed);
      built.set(kind, { near, far });
    }
    const { near, far } = built.get(kind)!;
    const geo = near;
    const leaves = new InstancedMesh(geo.leaves, leafMat, list.length);
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    const wood = geo.wood ? new InstancedMesh(geo.wood, woodMat, list.length) : null;
    if (wood) {
      wood.castShadow = true;
      wood.receiveShadow = true;
    }
    const items = list.map((plant, i) => {
      dummy.position.set(plant.x, plant.y ?? 0, plant.z);
      dummy.rotation.set(0, plant.rot ?? 0, 0);
      dummy.scale.setScalar(plant.s ?? 1);
      dummy.updateMatrix();
      const base = dummy.matrix.clone();
      leaves.setMatrixAt(i, base);
      wood?.setMatrixAt(i, base);
      return { plant, zone: zoneAt(h, plant.x, plant.z), base, delay: rng(i + 3)() * 0.35 };
    });
    // limites com as plantas já crescidas (+ folga do "overshoot" e do vento): permite descartar
    // fora da câmera e fora da sombra; o lote é agrupado por região para o descarte valer
    for (const mesh of [leaves, wood]) {
      if (!mesh) continue;
      mesh.computeBoundingSphere();
      mesh.boundingSphere!.radius = mesh.boundingSphere!.radius * 1.12 + 0.3;
      const zero = new Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < list.length; i++) mesh.setMatrixAt(i, zero);
      mesh.instanceMatrix.needsUpdate = true;
    }
    group.add(leaves);
    if (wood) group.add(wood);
    batches.push({ leaves, wood, items, near, far });
  }

  const last = new Float32Array(32).fill(-1);
  const m = new Matrix4();
  const sc = new Vector3();
  const q = new Quaternion();
  const t = new Vector3();
  return {
    group,
    plants: garden,
    update(reveal, dt, eye) {
      vegUniforms.uTime.value += dt;
      for (const b of batches) {
        const s = b.leaves.boundingSphere!;
        const d = eye.distanceTo(s.center) - s.radius;
        const isFar = b.leaves.geometry === b.far.leaves;
        const wantFar = isFar ? d > LOD_FAR - LOD_HYST : d > LOD_FAR + LOD_HYST;
        if (wantFar === isFar) continue;
        const g = wantFar ? b.far : b.near;
        b.leaves.geometry = g.leaves;
        if (b.wood && g.wood) b.wood.geometry = g.wood;
      }
      let changed = false;
      for (let z = 0; z < 32; z++) if (Math.abs(reveal[z] - last[z]) > 1e-4) changed = true;
      if (!changed) return;
      for (const b of batches) {
        let dirty = false;
        for (let i = 0; i < b.items.length; i++) {
          const it = b.items[i];
          const p = reveal[it.zone];
          if (Math.abs(p - last[it.zone]) < 1e-4) continue;
          // cresce depois que o chão revelou (com atraso aleatório e um leve "overshoot")
          const g = MathUtils.clamp((p - 0.35 - it.delay * 0.5) / 0.4, 0, 1);
          const e = g <= 0 ? 0 : 1 + 2.4 * Math.pow(g - 1, 3) + 1.4 * Math.pow(g - 1, 2);
          it.base.decompose(t, q, sc);
          m.compose(t, q, sc.multiplyScalar(Math.max(0, e)));
          b.leaves.setMatrixAt(i, m);
          b.wood?.setMatrixAt(i, m);
          dirty = true;
        }
        if (dirty) {
          b.leaves.instanceMatrix.needsUpdate = true;
          if (b.wood) b.wood.instanceMatrix.needsUpdate = true;
        }
      }
      last.set(reveal.subarray(0, 32));
    },
  };
}

/** Raio do símbolo em planta (para o desenho). */
export function symbolRadius(p: Plant): number {
  const s = p.s ?? 1;
  switch (p.species) {
    case 'royal':
      return 3.6 * s;
    case 'coconut':
      return 3.8 * s;
    case 'areca':
      return 1.3 * s;
    case 'fern':
      return 0.8 * s;
    case 'heliconia':
      return 1.1 * s;
    case 'monstera':
      return 0.9 * s;
    case 'shrub':
    case 'topiary':
      return 0.7 * s;
    case 'bougainvillea':
      return 1.6 * s;
    case 'jabuticaba':
      return 2.6 * s;
    case 'ipe':
      return 3.2 * s;
    case 'canopy':
      return 3.6 * s;
    case 'mata':
      return 4.2 * s;
  }
}
