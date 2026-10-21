import {
  BufferGeometry,
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Group,
} from 'three';
import { patchMaterial } from '../render/materials/patchMaterial';
import { LAWN_MEAN, terrainMaterial } from '../render/materials/library';
import { LAYER_INK } from './builder';
import { rng } from './vegetation';

/** Ruído de valor simples (CPU) para o relevo. */
function vnoise(x: number, z: number, seed = 1) {
  const h = (i: number, j: number) => {
    let n = (i * 374761393 + j * 668265263 + seed * 1442695041) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
}
function fbm(x: number, z: number, oct = 5) {
  let s = 0;
  let a = 0.5;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise(x, z, o + 3);
    x *= 2.03;
    z *= 2.03;
    a *= 0.5;
  }
  return s;
}

const CENTER = { x: 18, z: 16 };

/** Divisões de [a, b] com passo de até `step` (inclui as pontas). */
function steps(a: number, b: number, step: number): number[] {
  const n = Math.max(1, Math.round((b - a) / step));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}
const SEA = -2.2;

/** Linha da costa (z) em função de x: o mar fica ao norte (−z). */
const coast = (x: number) => -150 + 35 * Math.sin(x / 95) + 22 * Math.sin(x / 41 + 1.3);

export function heightAt(x: number, z: number): number {
  const dx = x - CENTER.x;
  const dz = z - CENTER.z;
  const d = Math.hypot(dx, dz);
  const flat = Math.min(1, Math.max(0, (d - 75) / 60));
  const cz = coast(x);
  const land = Math.min(1, Math.max(0, (z - cz + 25) / 55));
  const hills = 3 + 85 * Math.min(1, Math.max(0, (d - 180) / 650)) * (0.45 + 0.75 * fbm(x / 260, z / 260));
  const detail = (fbm(x / 60, z / 60) - 0.5) * 6;
  const h = land * (hills + detail * flat) + (1 - land) * (SEA - 6);
  return -0.07 + flat * (h + 0.07);
}

export interface Landscape {
  update(siteReveal: number): void;
}

/**
 * Terreno ao redor do lote: uma única malha em grade com um furo no lote.
 * As linhas da grade passam pela divisa, então os vértices das bordas são compartilhados.
 * (Eram quatro placas com malhas diferentes: as bordas não coincidiam e, onde o relevo sobe, abriam frestas
 * finas que o traço do desenho contornava como linhas soltas — uma delas passava atrás do logo.)
 */
function terrainGrid(X0: number, Z0: number, X1: number, Z1: number, site: { x0: number; z0: number; x1: number; z1: number }, outer: number, inner: number) {
  const xs = [...steps(X0, site.x0, outer), ...steps(site.x0, site.x1, inner).slice(1), ...steps(site.x1, X1, outer).slice(1)];
  const zs = [...steps(Z0, site.z0, outer), ...steps(site.z0, site.z1, inner).slice(1), ...steps(site.z1, Z1, outer).slice(1)];
  const nx = xs.length;
  const pos = new Float32Array(nx * zs.length * 3);
  for (let j = 0; j < zs.length; j++) for (let i = 0; i < nx; i++) pos.set([xs[i], 0, zs[j]], (j * nx + i) * 3);
  const idx: number[] = [];
  for (let j = 0; j < zs.length - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cz = (zs[j] + zs[j + 1]) / 2;
      if (cx > site.x0 && cx < site.x1 && cz > site.z0 && cz < site.z1) continue; // o lote tem o próprio gramado
      const a = j * nx + i;
      const c = a + nx;
      idx.push(a, c, a + 1, c, c + 1, a + 1);
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(nx * zs.length * 2), 2));
  g.setIndex(idx);
  return g;
}

/** `forest`: copas da mata distante · `cell`: multiplica o passo da malha do terreno. */
export function buildLandscape(group: Group, site: { x0: number; z0: number; x1: number; z1: number }, opts = { forest: 2600, cell: 1 }): Landscape {
  // --- terreno em volta do lote, com bordas coincidindo com a divisa ---
  const R = 1200;
  const X0 = CENTER.x - R;
  const X1 = CENTER.x + R;
  const Z0 = CENTER.z - R;
  const Z1 = CENTER.z + R;
  const geo = terrainGrid(X0, Z0, X1, Z1, site, 10 * opts.cell, 6 * opts.cell);
  const pos = geo.getAttribute('position');
  const colors: number[] = [];
  const sand = new Color('#cbb894');
  const grass = new Color('#5f8240');
  const forest = new Color('#3d5a2c');
  const rock = new Color('#6e6a5c');
  const c = new Color();
  const uvAttr = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
    uvAttr.setXY(i, x, z); // em metros, como o gramado do lote
    const n = fbm(x / 35, z / 35, 3);
    // areia só perto da costa (a cota plana em volta do lote caía na faixa da praia e ficava bege)
    const nearCoast = Math.min(1, Math.max(0, 1 - (z - coast(x) - 30) / 40));
    const beach = Math.max(0, 1 - Math.abs(y - SEA - 1.2) / 3.2) * nearCoast;
    c.copy(grass).lerp(forest, Math.min(1, Math.max(0, (y - 6) / 26)) * 0.9 + n * 0.2);
    if (y > 60) c.lerp(rock, Math.min(1, (y - 60) / 40) * 0.35);
    c.lerp(sand, beach);
    c.multiplyScalar(0.85 + n * 0.3);
    // tinta sobre a textura: branca perto da divisa, a cor do relevo longe dela
    const edge = Math.hypot(Math.max(site.x0 - x, 0, x - site.x1), Math.max(site.z0 - z, 0, z - site.z1));
    const far = Math.min(1, Math.max(0, (edge - 30) / 110));
    const w = far * far * (3 - 2 * far);
    colors.push(1 + (c.r / LAWN_MEAN.r - 1) * w, 1 + (c.g / LAWN_MEAN.g - 1) * w, 1 + (c.b / LAWN_MEAN.b - 1) * w);
  }
  geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new Mesh(geo, terrainMaterial());
  terrain.receiveShadow = true;
  terrain.layers.enable(LAYER_INK);
  // mesmo ID de traço do gramado do lote: sem linha na divisa
  const ink = new Float32Array(pos.count).fill(4);
  geo.setAttribute('inkId', new Float32BufferAttribute(ink, 1));
  // todas as malhas da camada de traço precisam dos mesmos atributos
  // (o driver nouveau trava a GPU quando um programa lê um atributo ausente em parte das malhas)
  geo.setAttribute('revealSeed', new Float32BufferAttribute(new Float32Array(pos.count), 1));
  group.add(terrain);

  // --- mar ---
  const seaGeo = new CircleGeometry(3600, 64);
  seaGeo.rotateX(-Math.PI / 2);
  seaGeo.translate(CENTER.x, SEA, CENTER.z);
  const seaCount = seaGeo.getAttribute('position').count;
  seaGeo.setAttribute('inkId', new Float32BufferAttribute(new Float32Array(seaCount).fill(6), 1));
  seaGeo.setAttribute('revealSeed', new Float32BufferAttribute(new Float32Array(seaCount), 1));
  const seaMat = patchMaterial(new MeshStandardMaterial({ color: new Color('#1d4a57'), roughness: 0.14, metalness: 0, envMapIntensity: 1.3 }), { hatch: [4, 6, 2.5, 0.35] });
  const sea = new Mesh(seaGeo, seaMat);
  sea.layers.enable(LAYER_INK);
  group.add(sea);

  // --- mata distante: copas simples instanciadas sobre os morros ---
  const blob = new IcosahedronGeometry(1, 1);
  const bp = blob.getAttribute('position');
  for (let i = 0; i < bp.count; i++) {
    const v = new Vector3().fromBufferAttribute(bp, i);
    const k = 1 + (vnoise(v.x * 3 + 5, v.z * 3 + v.y * 2) - 0.5) * 0.45;
    bp.setXYZ(i, v.x * k, v.y * k * 0.8 + 0.6, v.z * k);
  }
  blob.computeVertexNormals();
  const treeMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  const N = opts.forest;
  // menos copas, um pouco mais largas: a mata continua fechada vista do alto
  const spread = Math.sqrt(2600 / N);
  const trees = new InstancedMesh(blob, treeMat, N);
  trees.instanceMatrix.setUsage(DynamicDrawUsage);
  const r = rng(77);
  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const p = new Vector3();
  const tint = new Color();
  let placed = 0;
  for (let tries = 0; placed < N && tries < N * 6; tries++) {
    const a = r() * Math.PI * 2;
    const d = 95 + Math.pow(r(), 0.7) * 900;
    const x = CENTER.x + Math.cos(a) * d;
    const z = CENTER.z + Math.sin(a) * d;
    const y = heightAt(x, z);
    if (y < SEA + 1.5) continue;
    if (fbm(x / 120, z / 120, 3) < 0.38 && d < 400) continue; // clareiras perto da casa
    const sc = (2.2 + r() * 2.8) * (d > 400 ? 1.6 : 1);
    p.set(x, y - 0.4, z);
    s.set(sc * spread, sc * (0.8 + r() * 0.5), sc * spread);
    q.setFromAxisAngle(new Vector3(0, 1, 0), r() * Math.PI * 2);
    m.compose(p, q, s);
    trees.setMatrixAt(placed, m);
    tint.setHSL(0.25 + r() * 0.06, 0.35 + r() * 0.2, 0.18 + r() * 0.12);
    trees.setColorAt(placed, tint);
    placed++;
  }
  trees.count = placed;
  trees.castShadow = false;
  trees.receiveShadow = false;
  trees.frustumCulled = false;
  group.add(trees);

  return {
    update(siteReveal) {
      trees.visible = siteReveal > 0.5;
    },
  };
}
