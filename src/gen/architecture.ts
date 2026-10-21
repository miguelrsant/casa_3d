import { CylinderGeometry, Group, Matrix4, Mesh, RingGeometry, type Material, type Object3D } from 'three';
import type { House, Opening, Rect, Room } from '../data/schema';
import { zoneIndex } from '../data/schema';
import { deriveWalls, faceFinish, junctions, type WallSpan } from '../data/deriveWalls';
import { drive, landscapeWalls } from '../data/house';
import { floorMaterial, glassMaterial, miscMaterial, siteGroundMaterial, wallMaterial } from '../render/materials/library';
import { Builder, LAYER_INK, newInkId, type FaceMats } from './builder';

export interface Ceiling {
  id: string;
  /** Altura do forro (antes da extrusão). */
  y: number;
  meshes: Mesh[];
}

export interface Slats {
  id: string;
  zone: number;
  y: number;
  meshes: Mesh[];
}

export interface Architecture {
  /** Tudo o que "cresce" na extrusão (paredes, forros, portas, piscina...). */
  root: Group;
  /** Terreno e pisos externos (não escalam). */
  ground: Group;
  ceilings: Ceiling[];
  /** Ripados: fora do traço, aparecem quando o ambiente é revelado. */
  slats: Slats[];
  pivot: Group;
  /** Portas que abrem com o scroll (`anim` na planta): `set(0)` fechada, `set(1)` aberta. */
  doors: AnimDoor[];
  spans: WallSpan[];
}

export interface AnimDoor {
  id: string;
  group: Group;
  set(open: number): void;
}

/** Retângulo menos buracos → lista de retângulos (decomposição em grade). */
export function subtractRects(base: Rect, holes: Rect[]): Rect[] {
  const xs = new Set([base.x0, base.x1]);
  const zs = new Set([base.z0, base.z1]);
  for (const h of holes) {
    if (h.x0 > base.x0 && h.x0 < base.x1) xs.add(h.x0);
    if (h.x1 > base.x0 && h.x1 < base.x1) xs.add(h.x1);
    if (h.z0 > base.z0 && h.z0 < base.z1) zs.add(h.z0);
    if (h.z1 > base.z0 && h.z1 < base.z1) zs.add(h.z1);
  }
  const X = [...xs].sort((a, b) => a - b);
  const Z = [...zs].sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let j = 0; j < Z.length - 1; j++) {
    let run: Rect | null = null;
    for (let i = 0; i < X.length - 1; i++) {
      const cx = (X[i] + X[i + 1]) / 2;
      const cz = (Z[j] + Z[j + 1]) / 2;
      const inHole = holes.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1);
      if (inHole) {
        run = null;
        continue;
      }
      if (run && Math.abs(run.x1 - X[i]) < 1e-9) run.x1 = X[i + 1];
      else {
        run = { x0: X[i], z0: Z[j], x1: X[i + 1], z1: Z[j + 1] };
        out.push(run);
      }
    }
  }
  return out;
}

function slab(b: Builder, r: Rect, top: number, thick: number, mat: Material) {
  b.box([r.x0, top - thick, r.z0], [r.x1, top, r.z1], { py: mat, px: mat, nx: mat, pz: mat, nz: mat });
}

/** Faces internas de uma bacia (piscina, espelho d'água, lounge rebaixado). */
function basin(b: Builder, r: Rect, depth: number, wallMat: Material, floorMat: Material, rim = 0) {
  const y0 = -depth;
  b.quad(floorMat, [[r.x0, y0, r.z1], [r.x1, y0, r.z1], [r.x1, y0, r.z0], [r.x0, y0, r.z0]], [0, 1, 0], [[r.x0, -r.z1], [r.x1, -r.z1], [r.x1, -r.z0], [r.x0, -r.z0]]);
  const top = rim;
  // parede norte (face voltada para +z)
  b.quad(wallMat, [[r.x0, y0, r.z0], [r.x1, y0, r.z0], [r.x1, top, r.z0], [r.x0, top, r.z0]], [0, 0, 1], [[r.x0, y0], [r.x1, y0], [r.x1, top], [r.x0, top]]);
  // parede sul (face voltada para −z)
  b.quad(wallMat, [[r.x1, y0, r.z1], [r.x0, y0, r.z1], [r.x0, top, r.z1], [r.x1, top, r.z1]], [0, 0, -1], [[-r.x1, y0], [-r.x0, y0], [-r.x0, top], [-r.x1, top]]);
  // parede oeste (face voltada para +x)
  b.quad(wallMat, [[r.x0, y0, r.z1], [r.x0, y0, r.z0], [r.x0, top, r.z0], [r.x0, top, r.z1]], [1, 0, 0], [[-r.z1, y0], [-r.z0, y0], [-r.z0, top], [-r.z1, top]]);
  // parede leste (face voltada para −x)
  b.quad(wallMat, [[r.x1, y0, r.z0], [r.x1, y0, r.z1], [r.x1, top, r.z1], [r.x1, top, r.z0]], [-1, 0, 0], [[r.z0, y0], [r.z1, y0], [r.z1, top], [r.z0, top]]);
}

function wallBox(b: Builder, s: WallSpan, a: number, c: number, y0: number, y1: number, caps: boolean) {
  const t = s.thickness / 2;
  const mid = (a + c) / 2;
  const negMat = wallMaterial(faceFinish(s, -1, mid));
  const posMat = wallMaterial(faceFinish(s, 1, mid));
  const top = wallMaterial('plaster');
  const capMat = wallMaterial(s.neg?.wall ?? s.pos?.wall ?? 'plaster');
  const mats: FaceMats =
    s.line === 'z'
      ? { nz: negMat, pz: posMat, py: top, ny: y0 > 0.01 ? capMat : null, px: caps ? capMat : null, nx: caps ? capMat : null }
      : { nx: negMat, px: posMat, py: top, ny: y0 > 0.01 ? capMat : null, pz: caps ? capMat : null, nz: caps ? capMat : null };
  if (s.line === 'z') b.box([a, y0, s.at - t], [c, y1, s.at + t], mats);
  else b.box([s.at - t, y0, a], [s.at + t, y1, c], mats);
}

/** Caixa ao longo da linha de uma parede: `along` [a,c], espessura centrada em at+offset. */
function alongBox(b: Builder, line: 'x' | 'z', at: number, a: number, c: number, y0: number, y1: number, thick: number, mat: Material, offset = 0) {
  const t = thick / 2;
  if (line === 'z') b.solid([a, y0, at + offset - t], [c, y1, at + offset + t], mat, true);
  else b.solid([at + offset - t, y0, a], [at + offset + t, y1, c], mat, true);
}

function glazing(b: Builder, o: Opening, sill: number, head: number, panelMax: number, offset = 0) {
  const frame = miscMaterial('frame');
  const glass = glassMaterial();
  const w = o.to - o.from;
  const n = Math.max(1, Math.ceil(w / panelMax));
  const pw = w / n;
  const fr = 0.045;
  b.inkId = newInkId();
  alongBox(b, o.line, o.at, o.from, o.to, sill, sill + fr, 0.08, frame, offset); // base
  alongBox(b, o.line, o.at, o.from, o.to, head - fr, head, 0.08, frame, offset); // topo
  for (let i = 0; i <= n; i++) {
    const p = o.from + i * pw;
    alongBox(b, o.line, o.at, Math.max(o.from, p - fr / 2), Math.min(o.to, p + fr / 2), sill, head, 0.08, frame, offset);
  }
  // vidro (transparente, fora do passe de traço)
  const g = b.group;
  b.group = `${g}:glass`;
  alongBox(b, o.line, o.at, o.from, o.to, sill + fr, head - fr, 0.012, glass, offset);
  b.group = g;
}

/** Folha de giro em objeto próprio, com a dobradiça na origem: gira de fechada (0) até 95° (1) para o lado `swing`. */
function animDoor(s: WallSpan, o: Opening, head: number): AnimDoor {
  const group = new Group();
  group.name = `door:${o.id}`;
  const db = new Builder();
  db.inkId = newInkId();
  const w = o.to - o.from;
  const hingeAt = o.hinge === 'to' ? o.to : o.from;
  const dir = o.hinge === 'to' ? -1 : 1;
  const sw = o.swing ?? 1;
  const leaf = miscMaterial('pivot');
  const brass = miscMaterial('brass');
  // folha um pouco menor que o vão (folga de 1 cm), puxador vertical em latão nas duas faces
  const a0 = dir > 0 ? 0.01 : -w + 0.01;
  const a1 = dir > 0 ? w - 0.01 : -0.01;
  const hx = dir > 0 ? w - 0.12 : -w + 0.12;
  if (s.line === 'z') {
    db.solid([a0, 0.005, -0.022], [a1, head - 0.01, 0.022], leaf);
    db.solid([hx - 0.015, 0.85, -0.06], [hx + 0.015, 1.35, 0.06], brass);
    group.position.set(hingeAt, 0, o.at);
  } else {
    db.solid([-0.022, 0.005, a0], [0.022, head - 0.01, a1], leaf);
    db.solid([-0.06, 0.85, hx - 0.015], [0.06, 1.35, hx + 0.015], brass);
    group.position.set(o.at, 0, hingeAt);
  }
  for (const meshes of db.build().values()) for (const m of meshes) group.add(m);
  const max = (95 * Math.PI) / 180;
  const sign = s.line === 'z' ? -dir * sw : dir * sw;
  return {
    id: o.id,
    group,
    set(open) {
      group.rotation.y = sign * max * open;
    },
  };
}

function openingGeometry(b: Builder, s: WallSpan, o: Opening, sill: number, head: number, pivot: Group, doors: AnimDoor[]) {
  switch (o.kind) {
    case 'glass':
      glazing(b, o, 0, head, 1.6);
      break;
    case 'window':
      glazing(b, o, sill, head, 1.4);
      break;
    case 'slide': {
      // folhas de correr em dois trilhos; a primeira fica aberta (recolhida atrás da vizinha)
      const w = o.to - o.from;
      const n = Math.max(1, Math.round(w / 2.1));
      const pw = w / n;
      const passIdx = o.passAt !== undefined ? Math.min(n - 1, Math.floor((o.passAt - o.from) / pw)) : -1;
      for (let i = 0; i < n; i++) {
        let a = o.from + i * pw;
        const track = i % 2 === 0 ? -0.035 : 0.035;
        if (i === passIdx) {
          // folha da passagem: corrida para trás da vizinha (ou some, se for folha única)
          if (n === 1) continue;
          a += (i > 0 ? -1 : 1) * pw * 0.92;
        } else if (passIdx < 0 && i === 0 && n > 1) a += pw * 0.92; // folha aberta
        const leaf: Opening = { ...o, from: a, to: a + pw + 0.02 };
        glazing(b, leaf, 0, head, 3, track);
      }
      break;
    }
    case 'door': {
      if (o.anim) {
        const d = animDoor(s, o, head);
        pivot.parent!.add(d.group);
        doors.push(d);
        break;
      }
      const leafMat = miscMaterial('door');
      const w = o.to - o.from;
      const hingeAt = o.hinge === 'to' ? o.to : o.from;
      const dir = o.hinge === 'to' ? -1 : 1;
      const ang = (70 * Math.PI) / 180;
      const m = new Matrix4();
      // folha entreaberta (70°), girando a partir da dobradiça para o lado `swing`
      const sw = o.swing ?? 1;
      if (s.line === 'z') {
        m.makeTranslation(hingeAt, 0, o.at).multiply(new Matrix4().makeRotationY(-dir * sw * ang));
        b.inkId = newInkId();
        b.push(m);
        b.solid([dir > 0 ? 0 : -w, 0, -0.02], [dir > 0 ? w : 0, head - 0.01, 0.02], leafMat);
        b.pop();
      } else {
        m.makeTranslation(o.at, 0, hingeAt).multiply(new Matrix4().makeRotationY(dir * sw * ang));
        b.inkId = newInkId();
        b.push(m);
        b.solid([-0.02, 0, dir > 0 ? 0 : -w], [0.02, head - 0.01, dir > 0 ? w : 0], leafMat);
        b.pop();
      }
      break;
    }
    case 'pivot': {
      // porta pivotante: objeto próprio (anima com o scroll)
      const pb = new Builder();
      pb.inkId = newInkId();
      const w = o.to - o.from;
      const axis = o.from + w * 0.28;
      pb.solid([o.from - axis, 0, -0.045], [o.to - axis, head - 0.01, 0.045], miscMaterial('pivot'));
      // puxador vertical
      pb.solid([o.to - axis - 0.18, 0.9, 0.045], [o.to - axis - 0.14, 2.3, 0.085], miscMaterial('brass'));
      for (const meshes of pb.build().values()) for (const m of meshes) pivot.add(m);
      pivot.position.set(axis, 0, o.at);
      break;
    }
    case 'garage': {
      const mat = miscMaterial('garageDoor');
      b.inkId = newInkId();
      for (let y = 0; y < head - 0.01; y += 0.3) alongBox(b, o.line, o.at, o.from, o.to, y, Math.min(head - 0.01, y + 0.28), 0.06, mat);
      break;
    }
    case 'brise': {
      const mat = miscMaterial('wood');
      b.inkId = newInkId();
      for (let p = o.from + 0.06; p < o.to - 0.03; p += 0.14) alongBox(b, o.line, o.at, p - 0.022, p + 0.022, 0, head, 0.2, mat);
      break;
    }
    case 'void':
      break;
  }
}

/** Rasgos de luz no forro (vão por onde o sol entra). */
const SKYLIGHTS: Record<string, Rect[]> = {
  hall: [{ x0: 13.3, z0: 12.4, x1: 13.95, z1: 19.6 }],
};

function ceilingFor(b: Builder, id: string, r: Rect, y: number, finish: 'plaster' | 'slats') {
  b.group = `ceil:${id}`;
  b.inkId = 3;
  const m = miscMaterial('ceiling');
  const slots = SKYLIGHTS[id] ?? [];
  for (const p of subtractRects(r, slots)) b.box([p.x0, y, p.z0], [p.x1, y + 0.08, p.z1], { ny: m, py: m });
  for (const sl of slots) {
    // laterais do rasgo (espessura da laje)
    b.box([sl.x0, y, sl.z0], [sl.x1, y + 0.45, sl.z1], { px: null, nx: null });
    b.solid([sl.x0 - 0.02, y, sl.z0], [sl.x0, y + 0.45, sl.z1], m);
    b.solid([sl.x1, y, sl.z0], [sl.x1 + 0.02, y + 0.45, sl.z1], m);
  }
  if (finish === 'slats') {
    b.group = `slats:${id}`;
    const sm = miscMaterial('slats');
    const inset = 0.12;
    for (let x = r.x0 + inset; x < r.x1 - inset; x += 0.16) {
      b.box([x, y - 0.045, r.z0 + inset], [x + 0.045, y, r.z1 - inset], { ny: sm, px: sm, nx: sm });
    }
  }
}

export function buildArchitecture(h: House): Architecture {
  const root = new Group();
  root.name = 'house';
  const ground = new Group();
  ground.name = 'ground';
  const pivot = new Group();
  pivot.name = 'pivot';
  root.add(pivot);
  const doors: AnimDoor[] = [];

  const b = new Builder();
  const spans = deriveWalls(h);
  const junc = junctions(spans);

  // --- paredes ---
  b.group = 'walls';
  b.inkId = 1;
  for (const s of spans) {
    const j = junc.get(s)!;
    const from = s.from - j.startAdj;
    const to = s.to + j.endAdj;
    let cur = from;
    for (const o of s.openings) {
      const sill = o.kind === 'window' ? (o.sill ?? 0.9) : 0;
      const head = Math.min(o.head ?? 2.2, s.height);
      if (o.from > cur + 1e-6) wallBox(b, s, cur, o.from, 0, s.height, true);
      if (sill > 0) wallBox(b, s, o.from, o.to, 0, sill, false);
      if (head < s.height - 1e-6) wallBox(b, s, o.from, o.to, head, s.height, false);
      const g = b.group;
      b.group = 'openings';
      openingGeometry(b, s, o, sill, head, pivot, doors);
      b.group = g;
      b.inkId = 1;
      cur = o.to;
    }
    if (to > cur + 1e-6) wallBox(b, s, cur, to, 0, s.height, true);
  }

  // degraus de forro entre ambientes integrados com pés-direitos diferentes
  for (const e of h.openEdges) {
    const side = (sgn: -1 | 1): Room | undefined =>
      h.rooms.find((r) =>
        e.line === 'x'
          ? (sgn < 0 ? Math.abs(r.rect.x1 - e.at) < 1e-6 : Math.abs(r.rect.x0 - e.at) < 1e-6) && r.rect.z0 <= e.from + 1e-6 && r.rect.z1 >= e.to - 1e-6
          : (sgn < 0 ? Math.abs(r.rect.z1 - e.at) < 1e-6 : Math.abs(r.rect.z0 - e.at) < 1e-6) && r.rect.x0 <= e.from + 1e-6 && r.rect.x1 >= e.to - 1e-6,
      );
    const a = side(-1);
    const c = side(1);
    if (a && c && Math.abs(a.ceiling - c.ceiling) > 0.01) {
      b.group = `ceil:${(a.ceiling < c.ceiling ? a : c).id}`;
      b.inkId = 3;
      alongBox(b, e.line, e.at, e.from, e.to, Math.min(a.ceiling, c.ceiling), Math.max(a.ceiling, c.ceiling), 0.12, miscMaterial('ceiling'));
    }
  }

  // --- pisos internos ---
  b.inkId = 2;
  for (const r of h.rooms) {
    b.group = `floor:${r.zone}`;
    slab(b, r.rect, 0, 0.12, floorMaterial(r.floor));
  }

  // --- forros ---
  for (const r of h.rooms) ceilingFor(b, r.id, r.rect, r.ceiling, r.ceilingFinish);
  const varanda = h.outdoor.find((o) => o.id === 'varanda')!;
  ceilingFor(b, 'varanda', varanda.rect, varanda.roof ?? 3.6, 'slats');
  const pergola = h.outdoor.find((o) => o.id === 'pergolado')!;
  {
    b.group = 'ceil:pergolado';
    b.inkId = newInkId();
    const sm = miscMaterial('slats');
    const y = pergola.roof ?? 3.2;
    const r = pergola.rect;
    for (let z = r.z0 + 0.1; z < r.z1; z += 0.32) b.solid([r.x0, y - 0.18, z], [r.x1, y, z + 0.06], sm, true);
    b.solid([r.x0 - 0.1, y - 0.3, r.z0], [r.x0 + 0.1, y, r.z1], sm, true);
  }
  // pilares da varanda e do pergolado (eixos B, C, D em z = 0) e laje da varanda
  b.group = 'walls';
  b.inkId = 1;
  for (const x of [0.15, 7, 13, 19]) b.solid([x - 0.12, 0, -0.12], [x + 0.12, 3.6, 0.12], wallMaterial('plaster'));
  b.group = 'ceil:varanda';
  b.solid([varanda.rect.x0, 3.68, varanda.rect.z0 - 0.35], [varanda.rect.x1 + 0.15, 3.98, varanda.rect.z1], wallMaterial('plaster'));

  // --- muros de paisagismo (cascata, jardim da suíte) ---
  b.group = 'walls';
  for (const w of landscapeWalls) {
    b.inkId = newInkId();
    b.solid([w.rect.x0, 0, w.rect.z0], [w.rect.x1, w.height, w.rect.z1], wallMaterial(w.finish));
  }

  // --- piscina, espelho d'água e lounge rebaixado ---
  const pool = h.outdoor.find((o) => o.kind === 'pool')!;
  b.group = 'pool';
  b.inkId = newInkId();
  basin(b, pool.rect, 1.45, miscMaterial('pool'), miscMaterial('pool'));
  // prainha (degrau raso ao sul)
  b.box([pool.rect.x0, -1.45, pool.rect.z1 - 2.0], [pool.rect.x1, -0.32, pool.rect.z1], { py: miscMaterial('pool'), nz: miscMaterial('pool') });
  const refl = h.outdoor.find((o) => o.kind === 'reflecting')!;
  b.group = 'reflecting';
  b.inkId = newInkId();
  basin(b, refl.rect, 0.32, miscMaterial('black'), miscMaterial('black'));
  const lounge = h.outdoor.find((o) => o.kind === 'lounge')!;
  b.group = 'lounge';
  b.inkId = newInkId();
  basin(b, lounge.rect, -(lounge.level ?? -0.45), wallMaterial('stone'), floorMaterial('stone'));

  // --- superfícies d'água (provisórias: material PBR; shader próprio na fase de efeitos) ---
  b.group = 'water';
  b.inkId = newInkId();
  const water = floorMaterial('water');
  b.quad(miscMaterial('poolWater'), [[pool.rect.x0, -0.08, pool.rect.z1], [pool.rect.x1, -0.08, pool.rect.z1], [pool.rect.x1, -0.08, pool.rect.z0], [pool.rect.x0, -0.08, pool.rect.z0]], [0, 1, 0], [[pool.rect.x0, -pool.rect.z1], [pool.rect.x1, -pool.rect.z1], [pool.rect.x1, -pool.rect.z0], [pool.rect.x0, -pool.rect.z0]]);
  b.inkId = newInkId();
  b.quad(water, [[refl.rect.x0, -0.06, refl.rect.z1], [refl.rect.x1, -0.06, refl.rect.z1], [refl.rect.x1, -0.06, refl.rect.z0], [refl.rect.x0, -0.06, refl.rect.z0]], [0, 1, 0], [[refl.rect.x0, -refl.rect.z1], [refl.rect.x1, -refl.rect.z1], [refl.rect.x1, -refl.rect.z0], [refl.rect.x0, -refl.rect.z0]]);
  // pisantes sobre o espelho d'água
  b.group = 'court';
  for (const zc of [21.4, 22.5, 23.6]) {
    b.inkId = newInkId();
    b.solid([15.1, -0.3, zc - 0.4], [16.9, 0.02, zc + 0.4], miscMaterial('stoneDark'));
  }

  // forros agrupados por ambiente (escondidos quando a câmera passa acima)
  const ceilings: Ceiling[] = [];
  const slats: Slats[] = [];
  for (const [group, meshes] of b.build()) {
    if (group.startsWith('slats:')) {
      const id = group.slice(6);
      const room = h.rooms.find((r) => r.id === id);
      const out = h.outdoor.find((o) => o.id === id);
      for (const m of meshes) m.layers.disable(LAYER_INK);
      slats.push({ id, zone: zoneIndex((room?.zone ?? out?.zone)!), y: room?.ceiling ?? out?.roof ?? 3, meshes });
    }
    if (group.startsWith('ceil:')) {
      const id = group.slice(5);
      const room = h.rooms.find((r) => r.id === id);
      const out = h.outdoor.find((o) => o.id === id);
      const y = room?.ceiling ?? out?.roof ?? 3;
      ceilings.push({ id, y, meshes });
    }
    for (const m of meshes) root.add(m);
  }

  // --- terreno e pisos externos (fora da extrusão) ---
  const g = new Builder();
  g.inkId = 4;
  g.group = 'ground';
  const holes = [pool.rect, refl.rect, lounge.rect];
  // terreno: o lote (com buracos) + um entorno grande, para a borda nunca aparecer
  for (const r of subtractRects(h.site, holes)) slab(g, r, -0.03, 0.05, siteGroundMaterial());
  for (const o of h.outdoor) {
    if (o.kind === 'pool' || o.kind === 'reflecting' || o.kind === 'lounge') continue;
    g.inkId = o.kind === 'deck' ? 5 : newInkId();
    const top = o.kind === 'garden' ? -0.01 : 0;
    const finish = o.kind === 'veranda' ? 'travertine' : o.floor;
    const cut = holes.filter((hr) => hr !== o.rect);
    for (const r of subtractRects(o.rect, cut)) slab(g, r, top, 0.06, floorMaterial(finish));
  }
  // acesso de carros: pátio da garagem, rotatória e rua
  g.inkId = newInkId();
  slab(g, drive.apron, -0.005, 0.05, miscMaterial('stoneDark'));
  slab(g, drive.street, -0.005, 0.05, miscMaterial('stoneDark'));
  const ring = new RingGeometry(drive.inner, drive.outer, 64, 1);
  ring.rotateX(-Math.PI / 2);
  ring.translate(drive.center[0], -0.004, drive.center[1]);
  g.geometry(ring, miscMaterial('stoneDark'));
  const curb = new CylinderGeometry(drive.inner, drive.inner, 0.12, 48, 1, true);
  curb.translate(drive.center[0], 0.02, drive.center[1]);
  g.geometry(curb, floorMaterial('stone'));
  for (const meshes of g.build({ castShadow: false }).values()) for (const m of meshes) ground.add(m);

  return { root, ground, ceilings, slats, pivot, doors, spans };
}

/** Garante que objetos novos (fora do Builder) entrem no passe de traço. */
export function markInk(o: Object3D) {
  o.traverse((c) => {
    if ((c as Mesh).isMesh) c.layers.enable(LAYER_INK);
  });
}
