import { Color, Group, MeshBasicMaterial, Vector2 } from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { Text } from 'troika-three-text';
import monoUrl from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff?url';
import type { House, Opening, Rect } from '../data/schema';
import { zoneIndex } from '../data/schema';
import { palette, zoneAt } from '../render/zones';

export const fmt = (n: number) => n.toFixed(2).replace('.', ',');
export const fmtArea = (a: number) => (Number.isInteger(a) ? `${a}` : a.toFixed(1).replace('.', ','));

const Y = 0.012; // um pouco acima do piso

interface Label {
  text: Text;
  zone: number;
  base: number;
}

interface LineSet {
  obj: LineSegments2;
  mat: LineMaterial;
  zone: number;
  base: number;
}

export interface Annotations {
  group: Group;
  /** Atualiza opacidades a partir do progresso de revelação por zona. */
  update(reveal: Float32Array, siteFade: number): void;
  setResolution(w: number, h: number): void;
  sync(): Promise<void>;
}

const inkColor = new Color().copy(palette.ink);

function makeText(str: string, size: number, x: number, z: number, opts: { spacing?: number; anchorX?: 'center' | 'left' | 'right'; rotZ?: number } = {}): Text {
  const t = new Text();
  t.text = str;
  t.font = monoUrl;
  t.fontSize = size;
  t.letterSpacing = opts.spacing ?? 0.12;
  t.anchorX = opts.anchorX ?? 'center';
  t.anchorY = 'middle';
  t.color = inkColor;
  t.material = new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
  t.rotation.x = -Math.PI / 2;
  if (opts.rotZ) t.rotation.z = opts.rotZ;
  t.position.set(x, Y, z);
  t.renderOrder = 2;
  return t;
}

function circle(out: number[], cx: number, cz: number, r: number, seg = 28) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    out.push(cx + Math.cos(a0) * r, Y, cz + Math.sin(a0) * r, cx + Math.cos(a1) * r, Y, cz + Math.sin(a1) * r);
  }
}

function seg(out: number[], x0: number, z0: number, x1: number, z1: number) {
  out.push(x0, Y, z0, x1, Y, z1);
}

/** Arco e folha de uma porta de giro na planta. */
function doorSymbol(out: number[], o: Opening) {
  const w = o.to - o.from;
  const hingeAt = o.hinge === 'to' ? o.to : o.from;
  const dir = o.hinge === 'to' ? -1 : 1;
  const sw = o.swing ?? 1;
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * (Math.PI / 2);
    const a1 = ((i + 1) / n) * (Math.PI / 2);
    if (o.line === 'z') {
      out.push(
        hingeAt + dir * Math.cos(a0) * w, Y, o.at + sw * Math.sin(a0) * w,
        hingeAt + dir * Math.cos(a1) * w, Y, o.at + sw * Math.sin(a1) * w,
      );
    } else {
      out.push(
        o.at + sw * Math.sin(a0) * w, Y, hingeAt + dir * Math.cos(a0) * w,
        o.at + sw * Math.sin(a1) * w, Y, hingeAt + dir * Math.cos(a1) * w,
      );
    }
  }
  if (o.line === 'z') seg(out, hingeAt, o.at, hingeAt, o.at + sw * w);
  else seg(out, o.at, hingeAt, o.at + sw * w, hingeAt);
}

/** Cadeia de cotas ao longo de x (em z fixo) ou de z (em x fixo), com marcas inclinadas. */
function chain(lines: number[], texts: Text[], axis: 'x' | 'z', at: number, stops: number[], size: number, labelSide: -1 | 1) {
  const a = stops[0];
  const c = stops[stops.length - 1];
  if (axis === 'x') seg(lines, a - 0.6, at, c + 0.6, at);
  else seg(lines, at, a - 0.6, at, c + 0.6);
  for (const s of stops) {
    // marca de cota (traço inclinado a 45°)
    if (axis === 'x') seg(lines, s - 0.22, at + 0.22, s + 0.22, at - 0.22);
    else seg(lines, at - 0.22, s + 0.22, at + 0.22, s - 0.22);
    if (axis === 'x') seg(lines, s, at - 0.35, s, at + 0.35);
    else seg(lines, at - 0.35, s, at + 0.35, s);
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const m = (stops[i] + stops[i + 1]) / 2;
    const len = stops[i + 1] - stops[i];
    const t =
      axis === 'x'
        ? makeText(fmt(len), size, m, at + labelSide * size * 0.9)
        : makeText(fmt(len), size, at + labelSide * size * 0.9, m, { rotZ: Math.PI / 2 });
    texts.push(t);
  }
}

export function buildAnnotations(h: House, plants: { species: string; x: number; z: number; r: number }[] = []): Annotations {
  const group = new Group();
  group.name = 'annotations';
  const labels: Label[] = [];
  const zoneLines = new Map<number, number[]>();
  const linesFor = (zone: number) => {
    if (!zoneLines.has(zone)) zoneLines.set(zone, []);
    return zoneLines.get(zone)!;
  };

  const addRoomLabel = (name: string, rect: Rect, zone: number) => {
    const w = rect.x1 - rect.x0;
    const d = rect.z1 - rect.z0;
    const cx = (rect.x0 + rect.x1) / 2;
    const cz = (rect.z0 + rect.z1) / 2;
    const size = Math.min(0.55, Math.max(0.22, Math.min(w, d) * 0.1));
    const t1 = makeText(name, size, cx, cz - size * 0.45, { spacing: 0.16 });
    const t2 = makeText(`${fmtArea(w * d)} m²   ${fmt(w)} × ${fmt(d)}`, size * 0.5, cx, cz + size * 0.55, { spacing: 0.06 });
    labels.push({ text: t1, zone, base: 0.92 }, { text: t2, zone, base: 0.85 });
  };

  for (const r of h.rooms) if (r.label !== false) addRoomLabel(r.name, r.rect, zoneIndex(r.zone));
  for (const o of h.outdoor) if (o.label !== false) addRoomLabel(o.name, o.rect, zoneIndex(o.zone));

  // portas de giro
  for (const o of h.openings) {
    if (o.kind !== 'door') continue;
    const w = o.to - o.from;
    const sw = o.swing ?? 1;
    const mid = (o.from + o.to) / 2;
    const px = o.line === 'z' ? mid : o.at + sw * w * 0.5;
    const pz = o.line === 'z' ? o.at + sw * w * 0.5 : mid;
    doorSymbol(linesFor(zoneAt(h, px, pz)), o);
  }

  // símbolos de vegetação (convenção de planta baixa)
  for (const p of plants) {
    const out = linesFor(zoneAt(h, p.x, p.z));
    if (p.species === 'royal' || p.species === 'coconut' || p.species === 'areca') {
      circle(out, p.x, p.z, p.r, 30);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.2;
        seg(out, p.x + Math.cos(a) * p.r * 0.18, p.z + Math.sin(a) * p.r * 0.18, p.x + Math.cos(a) * p.r * 0.92, p.z + Math.sin(a) * p.r * 0.92);
      }
    } else if (p.species === 'canopy' || p.species === 'ipe' || p.species === 'jabuticaba') {
      const n = 40;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        const r0 = p.r * (0.9 + 0.1 * Math.cos(a0 * 9));
        const r1 = p.r * (0.9 + 0.1 * Math.cos(a1 * 9));
        seg(out, p.x + Math.cos(a0) * r0, p.z + Math.sin(a0) * r0, p.x + Math.cos(a1) * r1, p.z + Math.sin(a1) * r1);
      }
      circle(out, p.x, p.z, 0.12, 10);
    } else {
      circle(out, p.x, p.z, p.r, 18);
      seg(out, p.x - p.r * 0.4, p.z, p.x + p.r * 0.4, p.z);
      seg(out, p.x, p.z - p.r * 0.4, p.x, p.z + p.r * 0.4);
    }
  }

  // cotas e eixos (zona do terreno: somem quando a casa "vira real")
  const site = zoneIndex('site');
  const dimLines = linesFor(site);
  const dimTexts: Text[] = [];
  const xs = h.grid.x.map((g) => g.at);
  const zs = h.grid.z.map((g) => g.at);
  chain(dimLines, dimTexts, 'x', -13.2, xs, 0.42, -1);
  chain(dimLines, dimTexts, 'x', -14.8, [xs[0], xs[xs.length - 1]], 0.42, -1);
  chain(dimLines, dimTexts, 'z', -3.6, zs, 0.42, -1);
  chain(dimLines, dimTexts, 'z', -5.2, [zs[0], zs[zs.length - 1]], 0.42, -1);
  chain(dimLines, dimTexts, 'z', 43.4, [0, 14, 25], 0.42, 1);
  for (const t of dimTexts) labels.push({ text: t, zone: site, base: 0.9 });

  const dashed: number[] = [];
  for (const g of h.grid.x) {
    circle(dimLines, g.at, -17.2, 0.62);
    labels.push({ text: makeText(g.name, 0.6, g.at, -17.2, { spacing: 0 }), zone: site, base: 0.95 });
    seg(dashed, g.at, -16.4, g.at, -11.5);
  }
  for (const g of h.grid.z) {
    circle(dimLines, -7.2, g.at, 0.62);
    labels.push({ text: makeText(g.name, 0.6, -7.2, g.at, { spacing: 0 }), zone: site, base: 0.95 });
    seg(dashed, -6.4, g.at, -1.2, g.at);
  }

  for (const l of labels) group.add(l.text);

  const res = new Vector2(1, 1);
  const sets: LineSet[] = [];
  const addSet = (pos: number[], zone: number, base: number, dashedLine = false) => {
    if (!pos.length) return;
    const geo = new LineSegmentsGeometry();
    geo.setPositions(pos);
    const mat = new LineMaterial({
      color: inkColor.getHex(),
      linewidth: dashedLine ? 0.8 : 1.1,
      transparent: true,
      opacity: base,
      depthWrite: false,
      dashed: dashedLine,
      dashSize: 0.5,
      gapSize: 0.32,
      resolution: res,
      worldUnits: false,
    });
    const obj = new LineSegments2(geo, mat);
    if (dashedLine) obj.computeLineDistances();
    obj.renderOrder = 2;
    obj.frustumCulled = false;
    group.add(obj);
    sets.push({ obj, mat, zone, base });
  };
  for (const [zone, pos] of zoneLines) addSet(pos, zone, 0.9);
  addSet(dashed, site, 0.45, true);

  return {
    group,
    update(reveal, siteFade) {
      for (const l of labels) {
        const p = l.zone === site ? Math.max(reveal[l.zone], siteFade) : reveal[l.zone];
        const a = l.base * (1 - smooth(p));
        l.text.fillOpacity = a;
        l.text.visible = a > 0.01;
      }
      for (const s of sets) {
        const p = s.zone === site ? Math.max(reveal[s.zone], siteFade) : reveal[s.zone];
        const a = s.base * (1 - smooth(p));
        s.mat.opacity = a;
        s.obj.visible = a > 0.01;
      }
    },
    setResolution(w, hh) {
      res.set(w, hh);
      for (const s of sets) s.mat.resolution.set(w, hh);
    },
    sync() {
      return Promise.all(labels.map((l) => new Promise<void>((ok) => l.text.sync(() => ok())))).then(() => undefined);
    },
  };
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x * 1.6));
  return t * t * (3 - 2 * t);
};
