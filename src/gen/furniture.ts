import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  MeshStandardMaterial,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  SphereGeometry,
  Vector2,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { miscMaterial } from '../render/materials/library';
import { patchMaterial } from '../render/materials/patchMaterial';
import { Builder, newInkId } from './builder';

/** Materiais emissivos que acendem à noite (intensidade controlada pelo app). */
export const glowMaterials: { mat: Material & { emissiveIntensity: number }; day: number; night: number }[] = [];

let seedCounter = 1;
const nextSeed = () => ((seedCounter = (seedCounter * 16807) % 2147483647), (seedCounter % 997) / 997 + 0.001);

const rboxCache = new Map<string, BufferGeometry>();
function rboxGeo(w: number, h: number, d: number, r: number): BufferGeometry {
  const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}`;
  let g = rboxCache.get(k);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
    rboxCache.set(k, g);
  }
  return g;
}

const T = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
const RY = (a: number) => new Matrix4().makeRotationY(a);
const S = (x: number, y: number, z: number) => new Matrix4().makeScale(x, y, z);

/** Ajudante para montar móveis no Builder (coordenadas locais em metros; a frente olha para +z). */
export class Kit {
  constructor(readonly b: Builder) {}

  /** Uma peça: novo contorno no desenho e revelação inteira de uma vez. */
  piece(x: number, z: number, rotY: number, fn: () => void, y = 0) {
    const prevInk = this.b.inkId;
    const prevSeed = this.b.seed;
    this.b.inkId = newInkId();
    this.b.seed = nextSeed();
    this.b.push(T(x, y, z).multiply(RY(rotY)));
    fn();
    this.b.pop();
    this.b.inkId = prevInk;
    this.b.seed = prevSeed;
  }

  /** Sub-peça (outro contorno, mesma revelação). */
  part(fn: () => void) {
    const prev = this.b.inkId;
    this.b.inkId = newInkId();
    fn();
    this.b.inkId = prev;
  }

  box(w: number, h: number, d: number, mat: Material, x = 0, y = 0, z = 0) {
    this.b.solid([x - w / 2, y, z - d / 2], [x + w / 2, y + h, z + d / 2], mat, true);
  }
  rbox(w: number, h: number, d: number, r: number, mat: Material, x = 0, y = 0, z = 0, rot?: Matrix4) {
    const m = T(x, y + h / 2, z);
    if (rot) m.multiply(rot);
    this.b.geometry(rboxGeo(w, h, d, r), mat, m);
  }
  cyl(rt: number, rb: number, h: number, mat: Material, x = 0, y = 0, z = 0, seg = 20) {
    this.b.geometry(new CylinderGeometry(rt, rb, h, seg, 1), mat, T(x, y + h / 2, z));
  }
  sphere(r: number, mat: Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    this.b.geometry(new SphereGeometry(r, 18, 12), mat, T(x, y, z).multiply(S(sx, sy, sz)));
  }
  lathe(profile: [number, number][], mat: Material, x = 0, y = 0, z = 0, sx = 1, sz = 1, seg = 28) {
    const g = new LatheGeometry(profile.map(([r, h]) => new Vector2(r, h)), seg);
    this.b.geometry(g, mat, T(x, y, z).multiply(S(sx, 1, sz)));
  }
}

const M = {
  fabric: () => miscMaterial('fabric'),
  warm: () => miscMaterial('fabricWarm'),
  dark: () => miscMaterial('fabricDark'),
  terra: () => miscMaterial('fabricTerracotta'),
  olive: () => miscMaterial('fabricOlive'),
  wood: () => miscMaterial('wood'),
  woodLight: () => miscMaterial('woodLight'),
  woodDark: () => miscMaterial('woodDark'),
  stone: () => miscMaterial('stoneLight'),
  quartz: () => miscMaterial('quartzite'),
  metal: () => miscMaterial('metalDark'),
  brass: () => miscMaterial('brass'),
  ceramic: () => miscMaterial('ceramic'),
  black: () => miscMaterial('black'),
  rattan: () => miscMaterial('rattan'),
  white: () => miscMaterial('white'),
  red: () => miscMaterial('paintRed'),
  sand: () => miscMaterial('paintSand'),
  ink: () => miscMaterial('paintBlack'),
  chrome: () => miscMaterial('chrome'),
  car: () => miscMaterial('car'),
  carLight: () => miscMaterial('carLight'),
  tire: () => miscMaterial('tire'),
};

// ---------------------------------------------------------------- peças

export function sofa(k: Kit, w: number, d = 1.0, mat = M.warm(), pillows = M.terra()) {
  const seatH = 0.42;
  k.rbox(w, 0.2, d, 0.04, M.woodDark(), 0, 0.02, 0); // base
  k.rbox(0.22, 0.62, d, 0.08, mat, -w / 2 + 0.11, 0.2, 0); // braços
  k.rbox(0.22, 0.62, d, 0.08, mat, w / 2 - 0.11, 0.2, 0);
  const inner = w - 0.44;
  const n = Math.max(1, Math.round(inner / 0.95));
  const cw = inner / n;
  for (let i = 0; i < n; i++) {
    const cx = -inner / 2 + cw * (i + 0.5);
    k.part(() => k.rbox(cw - 0.02, 0.2, d - 0.26, 0.07, mat, cx, 0.22, 0.12)); // assento
    k.part(() => k.rbox(cw - 0.03, 0.46, 0.24, 0.09, mat, cx, seatH, -d / 2 + 0.16, RY(0).multiply(new Matrix4().makeRotationX(-0.12)))); // encosto
  }
  k.part(() => k.rbox(0.42, 0.4, 0.14, 0.06, pillows, -inner / 2 + 0.3, seatH + 0.02, -d / 2 + 0.36, new Matrix4().makeRotationX(-0.25).multiply(RY(0.2))));
  k.part(() => k.rbox(0.42, 0.4, 0.14, 0.06, M.olive(), inner / 2 - 0.3, seatH + 0.02, -d / 2 + 0.36, new Matrix4().makeRotationX(-0.25).multiply(RY(-0.25))));
}

export function armchair(k: Kit, mat = M.fabric(), frame = M.wood()) {
  k.rbox(0.82, 0.08, 0.82, 0.02, frame, 0, 0.2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.05, 0.2, 0.05, frame, sx * 0.36, 0, sz * 0.36);
  k.part(() => k.rbox(0.74, 0.16, 0.66, 0.06, mat, 0, 0.28, 0.04));
  k.part(() => k.rbox(0.74, 0.44, 0.18, 0.07, mat, 0, 0.36, -0.3, new Matrix4().makeRotationX(-0.18)));
  k.part(() => k.rbox(0.12, 0.28, 0.7, 0.04, frame, -0.39, 0.28, 0));
  k.part(() => k.rbox(0.12, 0.28, 0.7, 0.04, frame, 0.39, 0.28, 0));
}

export function rattanChair(k: Kit) {
  k.lathe([[0.0, 0.0], [0.34, 0.02], [0.4, 0.3], [0.42, 0.42], [0.0, 0.42]], M.rattan(), 0, 0, 0, 1, 1, 22);
  k.part(() => k.rbox(0.6, 0.1, 0.56, 0.05, M.fabric(), 0, 0.42, 0.02));
  k.part(() => k.rbox(0.66, 0.42, 0.12, 0.05, M.rattan(), 0, 0.46, -0.3, new Matrix4().makeRotationX(-0.2)));
}

export function coffeeTable(k: Kit, w = 1.4, d = 0.8) {
  k.rbox(w, 0.06, d, 0.02, M.stone(), 0, 0.34, 0);
  k.rbox(w * 0.7, 0.34, d * 0.55, 0.02, M.woodDark(), 0, 0, 0);
}

export function sideTable(k: Kit) {
  k.cyl(0.24, 0.24, 0.03, M.stone(), 0, 0.5, 0);
  k.cyl(0.05, 0.12, 0.5, M.brass(), 0, 0, 0, 14);
}

export function rug(k: Kit, w: number, d: number, mat = M.sand()) {
  k.box(w, 0.012, d, mat, 0, 0.002, 0);
}

export function diningTable(k: Kit, len: number, wid = 1.05) {
  k.rbox(wid, 0.05, len, 0.01, M.wood(), 0, 0.71, 0);
  k.box(wid * 0.6, 0.71, 0.08, M.woodDark(), 0, 0, -len / 2 + 0.45);
  k.box(wid * 0.6, 0.71, 0.08, M.woodDark(), 0, 0, len / 2 - 0.45);
}

export function chair(k: Kit, mat = M.warm()) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.035, 0.44, 0.035, M.metal(), sx * 0.19, 0, sz * 0.19);
  k.rbox(0.46, 0.07, 0.46, 0.025, mat, 0, 0.44, 0);
  k.part(() => k.rbox(0.44, 0.42, 0.06, 0.025, mat, 0, 0.5, -0.21, new Matrix4().makeRotationX(-0.08)));
}

export function stool(k: Kit) {
  k.cyl(0.19, 0.19, 0.05, M.woodDark(), 0, 0.72, 0);
  k.cyl(0.022, 0.022, 0.72, M.metal(), 0, 0, 0, 10);
  k.cyl(0.2, 0.2, 0.02, M.metal(), 0, 0, 0);
  k.cyl(0.17, 0.17, 0.015, M.brass(), 0, 0.3, 0);
}

/** Pendente: fio + cúpula/globo que brilha à noite. */
export function pendant(k: Kit, ceiling: number, drop: number, kind: 'dome' | 'globe' | 'cyl', size = 0.22) {
  const y = ceiling - drop;
  k.cyl(0.004, 0.004, drop, M.black(), 0, y, 0, 6);
  if (kind === 'globe') {
    k.sphere(size, glow('#fff1d6', 0.15, 4), 0, y - size, 0);
  } else if (kind === 'dome') {
    k.lathe([[0.01, 0], [size * 0.6, -0.02], [size, -size * 0.55], [size * 0.98, -size * 0.58]], M.brass(), 0, y, 0);
    k.sphere(size * 0.32, glow('#fff1d6', 0.1, 6), 0, y - size * 0.45, 0);
  } else {
    k.cyl(size * 0.5, size * 0.5, size * 1.2, M.ink(), 0, y - size * 1.2, 0, 18);
    k.cyl(size * 0.45, size * 0.45, 0.01, glow('#fff1d6', 0.1, 6), 0, y - size * 1.21, 0, 18);
  }
}

const glowCache = new Map<string, Material & { emissiveIntensity: number }>();
/** Material emissivo (lâmpadas): `day` e `night` são as intensidades. */
export function glow(color: string, day: number, night: number) {
  const key = `${color}|${day}|${night}`;
  let m = glowCache.get(key);
  if (!m) {
    // material novo já com a revelação (clone() não copia o onBeforeCompile)
    m = patchMaterial(new MeshStandardMaterial({ color: new Color(color), emissive: new Color(color), emissiveIntensity: day, roughness: 0.4 }));
    glowCache.set(key, m);
    glowMaterials.push({ mat: m, day, night });
  }
  return m;
}

export function floorLampArc(k: Kit, reach = 1.6) {
  k.cyl(0.2, 0.2, 0.06, M.stone(), 0, 0, 0, 24);
  // arco em segmentos
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 0.62;
    const a1 = ((i + 1) / n) * Math.PI * 0.62;
    const r = reach;
    const x0 = r - Math.cos(a0) * r;
    const y0 = 0.06 + Math.sin(a0) * 2.0;
    const x1 = r - Math.cos(a1) * r;
    const y1 = 0.06 + Math.sin(a1) * 2.0;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ang = Math.atan2(x1 - x0, y1 - y0);
    k.b.geometry(new CylinderGeometry(0.012, 0.012, len, 6), M.brass(), T((x0 + x1) / 2, (y0 + y1) / 2, 0).multiply(new Matrix4().makeRotationZ(-ang)));
  }
  const ex = reach - Math.cos(Math.PI * 0.62) * reach;
  const ey = 0.06 + Math.sin(Math.PI * 0.62) * 2.0;
  k.lathe([[0.01, 0], [0.12, -0.03], [0.24, -0.16], [0.235, -0.17]], M.brass(), ex, ey, 0);
  k.sphere(0.06, glow('#fff1d6', 0.2, 6), ex, ey - 0.1, 0);
}

export function vase(k: Kit, h: number, r: number, mat = M.ceramic()) {
  k.lathe([[0.0, 0], [r * 0.6, 0], [r, h * 0.35], [r * 0.85, h * 0.75], [r * 0.35, h * 0.92], [r * 0.4, h], [0.0, h]], mat, 0, 0, 0, 1, 1, 24);
}

export function bowl(k: Kit, r: number, mat = M.ceramic()) {
  k.lathe([[0.0, 0], [r * 0.5, 0], [r, r * 0.5], [r * 0.95, r * 0.52], [0.0, r * 0.1]], mat, 0, 0, 0);
}

export function art(k: Kit, w: number, h: number, scheme: 'circle' | 'blocks' | 'lines') {
  k.box(w, h, 0.04, M.woodDark(), 0, 0, 0);
  k.part(() => k.box(w - 0.08, h - 0.08, 0.02, M.white(), 0, 0.04, 0.02));
  if (scheme === 'circle') {
    k.part(() => k.b.geometry(new CylinderGeometry(w * 0.18, w * 0.18, 0.01, 28).rotateX(Math.PI / 2), M.red(), T(0, h * 0.45, 0.035)));
    k.part(() => k.box(w * 0.55, h * 0.28, 0.01, M.ink(), 0, h * 0.62, 0.035));
  } else if (scheme === 'blocks') {
    k.part(() => k.box(w * 0.6, h * 0.35, 0.01, M.sand(), -w * 0.08, h * 0.15, 0.035));
    k.part(() => k.box(w * 0.3, h * 0.3, 0.01, M.terra(), w * 0.18, h * 0.55, 0.035));
  } else {
    for (let i = 0; i < 4; i++) k.part(() => k.box(w * 0.65, 0.025, 0.01, M.ink(), 0, h * (0.25 + i * 0.15), 0.035));
  }
}

export function shelf(k: Kit, w: number, h: number, d: number) {
  const wood = M.wood();
  const t = 0.035;
  k.box(t, h, d, wood, -w / 2 + t / 2, 0, 0);
  k.box(t, h, d, wood, w / 2 - t / 2, 0, 0);
  const levels = Math.round(h / 0.38);
  for (let i = 0; i <= levels; i++) k.box(w, t, d, wood, 0, (i * (h - t)) / levels, 0);
  // livros e objetos
  const colors = [M.terra(), M.olive(), M.sand(), M.ink(), M.white(), M.warm()];
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
  for (let i = 0; i < levels; i++) {
    const y = (i * (h - t)) / levels + t;
    let x = -w / 2 + 0.06;
    while (x < w / 2 - 0.12) {
      if (rnd() < 0.18) {
        k.part(() => {
          k.b.push(T(x + 0.1, y, 0));
          vase(k, 0.18 + rnd() * 0.12, 0.06, rnd() < 0.5 ? M.ceramic() : M.ink());
          k.b.pop();
        });
        x += 0.28;
        continue;
      }
      const bw = 0.025 + rnd() * 0.03;
      const bh = 0.2 + rnd() * 0.1;
      k.part(() => k.box(bw, bh, d * 0.75, colors[Math.floor(rnd() * colors.length)], x + bw / 2, y, 0));
      x += bw + 0.004;
      if (rnd() < 0.08) x += 0.12;
    }
  }
}

export function cabinet(k: Kit, w: number, h: number, d: number, top: Material | null, front = M.woodLight(), doors = 2) {
  k.box(w, h, d, front, 0, 0.08, 0);
  k.box(w - 0.04, 0.08, d - 0.06, M.black(), 0, 0, -0.03);
  const dw = w / doors;
  for (let i = 0; i < doors; i++) {
    const cx = -w / 2 + dw * (i + 0.5);
    k.part(() => k.box(dw - 0.008, h - 0.008, 0.02, front, cx, 0.084, d / 2));
  }
  if (top) k.part(() => k.box(w + 0.02, 0.04, d + 0.03, top, 0, h + 0.08, 0.01));
}

export function bed(k: Kit, w: number, len: number) {
  k.rbox(w + 0.1, 0.3, len + 0.1, 0.05, M.warm(), 0, 0.08, 0);
  k.box(w - 0.1, 0.08, len - 0.1, M.black(), 0, 0, 0);
  k.part(() => k.rbox(w, 0.24, len, 0.08, M.white(), 0, 0.36, 0));
  k.part(() => k.rbox(w + 0.04, 0.12, len * 0.62, 0.06, M.fabric(), 0, 0.55, len * 0.17));
  k.part(() => k.rbox(w + 0.06, 0.04, len * 0.22, 0.02, M.terra(), 0, 0.66, len * 0.32));
  for (const sx of [-1, 1]) {
    k.part(() => k.rbox(w * 0.42, 0.3, 0.16, 0.07, M.white(), sx * w * 0.24, 0.6, -len / 2 + 0.22, new Matrix4().makeRotationX(-0.35)));
  }
  k.part(() => k.rbox(w * 0.36, 0.22, 0.12, 0.06, M.terra(), 0, 0.62, -len / 2 + 0.42, new Matrix4().makeRotationX(-0.3)));
  // cabeceira estofada
  k.part(() => k.rbox(w + 0.6, 1.05, 0.12, 0.05, M.warm(), 0, 0.2, -len / 2 - 0.06));
}

export function nightstand(k: Kit) {
  k.box(0.5, 0.42, 0.4, M.woodLight(), 0, 0.08, 0);
  k.box(0.46, 0.08, 0.36, M.black(), 0, 0, 0);
  k.part(() => k.box(0.48, 0.008, 0.01, M.woodDark(), 0, 0.29, 0.2));
  k.part(() => {
    k.lathe([[0, 0], [0.09, 0], [0.11, 0.12], [0.06, 0.22], [0.02, 0.26], [0, 0.26]], M.ceramic(), 0.05, 0.5, -0.02);
    k.lathe([[0.16, 0], [0.12, 0.2], [0.0, 0.2]], glow('#ffe9c7', 0.08, 3.5), 0.05, 0.76, -0.02);
  });
}

export function tub(k: Kit) {
  // banheira oval (lathe escalado)
  k.lathe([[0.0, 0.0], [0.34, 0.0], [0.44, 0.12], [0.47, 0.42], [0.48, 0.58], [0.44, 0.6], [0.4, 0.42], [0.3, 0.12], [0.0, 0.1]], M.ceramic(), 0, 0, 0, 0.9, 1.9, 36);
  k.part(() => k.cyl(0.015, 0.015, 1.0, M.brass(), 0, 0, 0.98, 8));
  k.part(() => k.box(0.2, 0.02, 0.02, M.brass(), 0, 0.98, 0.9));
}

export function vanity(k: Kit, w: number) {
  k.box(w, 0.5, 0.55, M.woodDark(), 0, 0.35, 0);
  k.part(() => k.box(w + 0.02, 0.04, 0.58, M.quartz(), 0, 0.85, 0.01));
  for (const sx of [-1, 1]) {
    k.part(() => k.lathe([[0, 0], [0.19, 0.0], [0.21, 0.12], [0.19, 0.14], [0.0, 0.02]], M.ceramic(), sx * w * 0.25, 0.89, 0.02));
    k.part(() => k.cyl(0.012, 0.012, 0.28, M.brass(), sx * w * 0.25, 0.89, -0.22, 8));
  }
}

export function lounger(k: Kit) {
  k.box(0.7, 0.25, 1.9, M.woodDark(), 0, 0, 0.1);
  k.part(() => k.rbox(0.66, 0.1, 1.3, 0.04, M.white(), 0, 0.25, 0.4));
  k.part(() => k.rbox(0.66, 0.1, 0.7, 0.04, M.white(), 0, 0.38, -0.55, new Matrix4().makeRotationX(0.55)));
  k.part(() => k.rbox(0.4, 0.12, 0.25, 0.05, M.terra(), 0, 0.62, -0.72, new Matrix4().makeRotationX(0.55)));
}

export function umbrella(k: Kit, r = 1.4) {
  k.cyl(0.25, 0.25, 0.06, M.stone(), 0, 0, 0);
  k.cyl(0.025, 0.025, 2.5, M.woodDark(), 0, 0, 0, 8);
  k.lathe([[0.0, 0.0], [r, -0.42], [r * 0.98, -0.46], [0.0, -0.06]], M.warm(), 0, 2.6, 0, 1, 1, 12);
}

export function outdoorSofa(k: Kit, w: number) {
  k.box(w, 0.3, 0.95, M.woodDark(), 0, 0, 0);
  sofaCushions(k, w);
}

function sofaCushions(k: Kit, w: number) {
  const n = Math.max(1, Math.round(w / 0.9));
  const cw = w / n;
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + cw * (i + 0.5);
    k.part(() => k.rbox(cw - 0.02, 0.16, 0.72, 0.06, M.white(), cx, 0.3, 0.1));
    k.part(() => k.rbox(cw - 0.03, 0.45, 0.2, 0.08, M.white(), cx, 0.38, -0.33, new Matrix4().makeRotationX(-0.12)));
  }
}

export function firePit(k: Kit) {
  k.lathe([[0.0, 0.0], [0.25, 0.0], [0.3, 0.12], [0.6, 0.36], [0.62, 0.42], [0.56, 0.4], [0.0, 0.32]], M.metal(), 0, 0, 0, 1, 1, 36);
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4;
    const r = 0.12 + (i % 5) * 0.08;
    k.part(() => k.sphere(0.07, miscMaterial('stoneDark'), Math.cos(a) * r, 0.38, Math.sin(a) * r, 1, 0.6, 1));
  }
}

export function car(k: Kit, light: boolean) {
  const body = light ? M.carLight() : M.car();
  k.rbox(1.86, 0.62, 4.6, 0.18, body, 0, 0.3, 0);
  k.part(() => k.rbox(1.62, 0.5, 2.5, 0.2, M.black(), 0, 0.82, 0.15));
  k.part(() => k.rbox(1.66, 0.06, 2.3, 0.03, body, 0, 1.3, 0.15));
  for (const sx of [-1, 1])
    for (const sz of [-1.4, 1.45]) {
      k.part(() => {
        k.b.geometry(new CylinderGeometry(0.34, 0.34, 0.24, 20).rotateZ(Math.PI / 2), M.tire(), T(sx * 0.82, 0.34, sz));
        k.b.geometry(new CylinderGeometry(0.21, 0.21, 0.25, 16).rotateZ(Math.PI / 2), M.chrome(), T(sx * 0.83, 0.34, sz));
      });
    }
  k.part(() => k.box(1.4, 0.08, 0.04, glow('#fff3dc', 0.2, 0.2), 0, 0.62, 2.3));
  k.part(() => k.box(1.5, 0.06, 0.04, glow('#ff3b2a', 0.4, 0.6), 0, 0.68, -2.3));
}

export function hammock(k: Kit, len = 3.4, wid = 1.2) {
  // rede: superfície em catenária presa a dois postes de madeira
  for (const sz of [-1, 1]) k.part(() => k.box(0.1, 1.9, 0.1, M.woodDark(), 0, 0, sz * len * 0.62));
  const nx = 10;
  const nz = 24;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nz; j++) {
    const v = j / nz;
    const z = (v - 0.5) * len;
    const sag = 1.45 - 0.72 * Math.sin(v * Math.PI);
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const curl = Math.sin(u * Math.PI) * 0.18 * Math.sin(v * Math.PI);
      pos.push((u - 0.5) * wid * (0.35 + 0.65 * Math.sin(v * Math.PI)), sag - curl, z);
    }
  }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const back = g.clone();
  const bi = back.getIndex()!.array as Uint16Array | Uint32Array;
  for (let i = 0; i < bi.length; i += 3) [bi[i + 1], bi[i + 2]] = [bi[i + 2], bi[i + 1]];
  back.computeVertexNormals();
  k.part(() => {
    k.b.geometry(g, M.terra());
    k.b.geometry(back, M.terra());
  });
  for (const sz of [-1, 1]) k.part(() => k.cyl(0.006, 0.006, 0.01, M.black(), 0, 1.6, sz * len * 0.6));
}

export function grill(k: Kit, w: number) {
  k.box(w, 0.9, 0.75, M.stone(), 0, 0, 0);
  k.part(() => k.box(w + 0.04, 0.05, 0.8, M.quartz(), 0, 0.9, 0));
  k.part(() => k.box(0.9, 0.5, 0.6, M.metal(), -w / 2 + 0.6, 0.95, -0.05));
  k.part(() => k.box(0.7, 1.5, 0.6, M.stone(), -w / 2 + 0.6, 1.45, -0.05));
}

export function stringLights(k: Kit, x0: number, x1: number, z0: number, z1: number, y: number) {
  const bulb = glow('#ffd59a', 0.3, 9);
  const nRows = 4;
  for (let r = 0; r < nRows; r++) {
    const z = z0 + ((r + 0.5) / nRows) * (z1 - z0);
    const n = Math.round((x1 - x0) / 0.5);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = x0 + u * (x1 - x0);
      const sag = Math.sin(u * Math.PI) * 0.25;
      k.part(() => k.sphere(0.035, bulb, x, y - sag - 0.06, z));
    }
    // fio
    for (let i = 0; i < n; i++) {
      const ua = i / n;
      const ub = (i + 1) / n;
      const xa = x0 + ua * (x1 - x0);
      const xb = x0 + ub * (x1 - x0);
      const ya = y - Math.sin(ua * Math.PI) * 0.25;
      const yb = y - Math.sin(ub * Math.PI) * 0.25;
      const len = Math.hypot(xb - xa, yb - ya);
      k.b.geometry(new CylinderGeometry(0.004, 0.004, len, 4).rotateZ(Math.PI / 2), M.black(), T((xa + xb) / 2, (ya + yb) / 2, z).multiply(new Matrix4().makeRotationZ(Math.atan2(yb - ya, xb - xa))));
    }
  }
}

export interface Furnishings {
  root: Group;
  fans: Mesh[];
}

/** Ventilador de teto (objeto próprio: gira). */
function fan(x: number, z: number, y: number): Mesh {
  const b = new Builder();
  b.inkId = newInkId();
  const k = new Kit(b);
  k.cyl(0.012, 0.012, 0.35, M.black(), 0, -0.35, 0, 6);
  k.cyl(0.12, 0.12, 0.12, M.black(), 0, -0.45, 0, 16);
  for (let i = 0; i < 3; i++) {
    b.push(new Matrix4().makeRotationY((i * Math.PI * 2) / 3));
    k.box(0.14, 0.012, 0.7, M.woodDark(), 0, -0.4, 0.45);
    b.pop();
  }
  const meshes = [...b.build().values()].flat();
  const merged = meshes[0];
  for (const m of meshes.slice(1)) merged.add(m);
  merged.position.set(x, y, z);
  return merged;
}

/** Mobiliário de toda a casa (coordenadas da planta). */
export function furnish(): Furnishings {
  const root = new Group();
  root.name = 'furniture';
  const b = new Builder();
  const k = new Kit(b);
  const PI = Math.PI;

  // --- hall ---
  b.group = 'furn:hall';
  k.piece(13.55, 15.5, PI / 2, () => cabinet(k, 2.8, 0.42, 0.42, M.stone(), M.woodDark(), 4));
  k.piece(13.55, 14.6, 0, () => vase(k, 0.62, 0.2, M.ceramic()), 0.92);
  k.piece(13.55, 16.6, 0, () => bowl(k, 0.16, M.ink()), 0.92);
  k.piece(13.18, 16.0, PI / 2, () => art(k, 1.4, 1.8, 'circle'), 1.25);
  k.piece(16.4, 15.4, 0, () => rug(k, 3.2, 2.2, M.sand()));
  for (const [px, pz, drop] of [
    [16.0, 15.2, 1.4],
    [16.5, 15.7, 1.9],
    [15.6, 16.0, 2.2],
    [16.2, 16.4, 1.7],
    [16.8, 15.1, 2.4],
  ])
    k.piece(px, pz, 0, () => pendant(k, 4.2, drop, 'globe', 0.16 + (drop % 0.5) * 0.12));

  // --- estar ---
  b.group = 'furn:estar';
  k.piece(19.6, 9.6, PI, () => sofa(k, 3.6, 1.05));
  k.piece(17.4, 6.2, -0.35, () => armchair(k, M.warm(), M.wood()));
  k.piece(21.8, 6.2, 0.35, () => armchair(k, M.warm(), M.wood()));
  k.piece(19.6, 7.7, 0, () => coffeeTable(k, 1.6, 0.9));
  k.piece(19.6, 7.8, 0, () => rug(k, 5.2, 4.0, M.sand()));
  k.piece(16.9, 9.7, 0, () => sideTable(k));
  k.piece(15.8, 9.9, PI * 0.5, () => floorLampArc(k, 1.7));
  k.piece(25.4, 8.2, -PI / 2, () => cabinet(k, 3.2, 0.45, 0.45, M.stone(), M.woodDark(), 4));
  k.piece(25.45, 7.2, 0, () => vase(k, 0.45, 0.14, M.terra()), 0.98);
  k.piece(25.45, 9.3, 0, () => vase(k, 0.3, 0.1, M.ink()), 0.98);
  k.piece(25.82, 8.2, -PI / 2, () => art(k, 2.0, 1.3, 'blocks'), 1.6);
  k.piece(13.6, 8.6, PI / 2, () => shelf(k, 3.0, 2.3, 0.4));
  k.piece(19.0, 7.6, 0, () => vase(k, 0.24, 0.08, M.ink()), 0.4);

  // --- jantar ---
  b.group = 'furn:jantar';
  k.piece(10, 8.1, 0, () => diningTable(k, 3.0, 1.1));
  for (let i = 0; i < 4; i++) {
    const z = 6.95 + i * 0.78;
    k.piece(9.2, z, PI / 2, () => chair(k));
    k.piece(10.8, z, -PI / 2, () => chair(k));
  }
  k.piece(10, 6.3, 0, () => chair(k, M.olive()));
  k.piece(10, 9.9, PI, () => chair(k, M.olive()));
  for (const z of [7.0, 8.1, 9.2]) k.piece(10, z, 0, () => pendant(k, 3.6, 1.55, 'dome', 0.28));
  k.piece(10, 7.6, 0, () => vase(k, 0.3, 0.1, M.ceramic()), 0.76);
  k.piece(10, 8.7, 0, () => bowl(k, 0.18, M.woodDark()), 0.76);

  // --- cozinha ---
  b.group = 'furn:cozinha';
  k.piece(3.4, 8.0, PI / 2, () => {
    cabinet(k, 3.6, 0.82, 1.1, M.quartz(), M.woodLight(), 6);
  });
  for (const z of [6.9, 7.65, 8.4, 9.15]) k.piece(4.45, z, -PI / 2, () => stool(k));
  k.piece(0.42, 8.0, PI / 2, () => cabinet(k, 7.0, 0.82, 0.62, M.quartz(), M.woodLight(), 9));
  k.piece(0.33, 11.3, PI / 2, () => cabinet(k, 1.3, 2.4, 0.62, null, M.woodLight(), 2));
  for (const z of [7.1, 8.0, 8.9]) k.piece(3.4, z, 0, () => pendant(k, 3.2, 1.3, 'cyl', 0.13));
  k.piece(3.2, 7.4, 0, () => bowl(k, 0.17, M.ceramic()), 0.92);
  k.piece(3.6, 8.9, 0, () => vase(k, 0.34, 0.1, M.terra()), 0.92);

  // --- adega ---
  b.group = 'furn:adega';
  k.piece(10, 15.7, PI, () => shelf(k, 5.6, 2.6, 0.35));
  k.piece(10, 13.9, 0, () => diningTable(k, 1.4, 0.7));

  // --- varanda e pergolado ---
  b.group = 'furn:varanda';
  k.piece(19.6, 2.9, PI, () => outdoorSofa(k, 3.0));
  k.piece(17.2, 1.1, PI / 2 + 0.3, () => armchair(k, M.white(), M.woodDark()));
  k.piece(22.0, 1.1, -PI / 2 - 0.3, () => armchair(k, M.white(), M.woodDark()));
  k.piece(19.6, 1.5, 0, () => coffeeTable(k, 1.4, 0.8));
  k.piece(24.6, 2.0, 0, () => hammock(k, 3.0, 1.2));
  b.group = 'furn:pergolado';
  k.piece(0.45, 1.9, PI / 2, () => grill(k, 3.6));
  k.piece(4.2, 2.0, 0, () => diningTable(k, 2.4, 1.0));
  for (let i = 0; i < 3; i++) {
    const z = 1.15 + i * 0.85;
    k.piece(3.4, z, PI / 2, () => chair(k, M.white()));
    k.piece(5.0, z, -PI / 2, () => chair(k, M.white()));
  }
  k.piece(0, 0, 0, () => stringLights(k, 0.3, 6.7, 0.2, 3.8, 3.0));

  // --- deck e piscina ---
  b.group = 'furn:deck';
  // espreguiçadeiras dentro da prainha (rasa), voltadas para o norte
  for (const x of [11.6, 13.0, 14.4]) k.piece(x, -4.98, PI, () => lounger(k), -0.32);
  k.piece(12.3, -2.0, 0, () => umbrella(k, 1.5));
  k.piece(8.9, -6.6, -PI / 2, () => lounger(k));

  // --- lounge do fogo (rebaixado) ---
  b.group = 'furn:lounge';
  const ly = -0.45;
  k.piece(29, -9.45, 0, () => outdoorSofa(k, 5.4), ly);
  k.piece(26.55, -7, PI / 2, () => outdoorSofa(k, 3.8), ly);
  k.piece(29, -4.55, PI, () => outdoorSofa(k, 4.4), ly);
  k.piece(29, -7, 0, () => firePit(k), ly);

  // --- suíte ---
  b.group = 'furn:suite';
  k.piece(29.6, 4.75, PI, () => bed(k, 1.9, 2.1));
  k.piece(28.15, 5.55, PI, () => nightstand(k));
  k.piece(31.05, 5.55, PI, () => nightstand(k));
  k.piece(29.6, 2.9, PI, () => cabinet(k, 1.6, 0.36, 0.45, null, M.warm(), 1));
  k.piece(29.6, 3.9, 0, () => rug(k, 3.2, 3.6, M.warm()));
  k.piece(33.0, 1.4, -PI * 0.75, () => rattanChair(k));
  k.piece(29.6, 5.88, PI, () => art(k, 1.1, 0.8, 'lines'), 1.55);
  b.group = 'furn:closet';
  k.piece(30.75, 6.3, PI, () => shelf(k, 6.2, 2.4, 0.55));
  k.piece(30.75, 7.5, 0, () => cabinet(k, 2.2, 0.82, 0.7, M.quartz(), M.woodDark(), 4));
  b.group = 'furn:banho';
  k.piece(32.42, 11.6, 0, () => tub(k));
  k.piece(27.8, 11.2, PI / 2, () => vanity(k, 2.4));
  k.piece(27.62, 11.2, PI / 2, () => {
    k.box(2.3, 1.05, 0.03, M.brass(), 0, 0, 0);
    k.part(() => k.box(2.24, 0.99, 0.01, miscMaterial('mirror'), 0, 0.03, 0.02));
  }, 1.15);

  // --- quartos ---
  b.group = 'furn:quartos';
  k.piece(32.6, 16.0, -PI / 2, () => bed(k, 1.6, 2.0));
  k.piece(32.6, 23.0, -PI / 2, () => bed(k, 1.6, 2.0));
  k.piece(28.5, 19.5, PI / 2, () => vanity(k, 1.4));

  // --- garagem ---
  b.group = 'furn:garagem';
  k.piece(1.95, 21.4, PI, () => car(k, false));
  k.piece(5.05, 21.4, PI, () => car(k, true));

  // --- galeria ---
  b.group = 'furn:galeria';
  k.piece(22.5, 19.55, PI, () => cabinet(k, 2.2, 0.38, 0.4, M.stone(), M.woodDark(), 1));
  k.piece(24.6, 19.5, 0, () => vase(k, 0.9, 0.18, M.terra()));

  for (const meshes of b.build().values()) for (const m of meshes) root.add(m);

  const fans = [fan(15.5, 2.0, 3.55), fan(21.4, 2.0, 3.55)];
  for (const f of fans) root.add(f);
  return { root, fans };
}
