import { Color, DoubleSide, MeshStandardMaterial, Vector2 } from 'three';
import type { FloorFinish, WallFinish } from '../../data/schema';
import { patchMaterial, type DrawOptions } from './patchMaterial';
import type { TexName, TexSet } from './textures';

interface Def {
  /** Cor (ou tinta multiplicada sobre a textura). */
  color: string;
  roughness: number;
  metalness?: number;
  tex?: TexName;
  normalScale?: number;
  extra?: Partial<MeshStandardMaterial>;
}

const HATCH: Record<FloorFinish, [number, number, number, number]> = {
  travertine: [1, 1.2, 0.6, 0.32],
  porcelain: [1, 0.9, 0.9, 0.28],
  stone: [1, 0.6, 0.6, 0.28],
  wood: [2, 1, 0.2, 0.2],
  concrete: [1, 3, 3, 0.14],
  deck: [5, 0.15, 1, 0.28],
  lawn: [3, 0.55, 0.55, 0.4],
  pavers: [1, 0.4, 0.2, 0.26],
  gravel: [3, 0.22, 0.22, 0.4],
  water: [4, 1.1, 0.45, 0.5],
};

const WALLS: Record<WallFinish, Def> = {
  plaster: { color: '#ffffff', roughness: 1, tex: 'plaster' },
  concrete: { color: '#ffffff', roughness: 1, tex: 'concrete' },
  stone: { color: '#ffffff', roughness: 1, tex: 'stone' },
  wood: { color: '#ffffff', roughness: 1, tex: 'woodPanel' },
  tile: { color: '#ffffff', roughness: 1, tex: 'tile' },
};

const FLOORS: Record<FloorFinish, Def> = {
  travertine: { color: '#ffffff', roughness: 1, tex: 'travertine' },
  wood: { color: '#ffffff', roughness: 1, tex: 'wood' },
  porcelain: { color: '#ffffff', roughness: 1, tex: 'porcelain' },
  stone: { color: '#cfc4b3', roughness: 1.3, tex: 'porcelain' },
  concrete: { color: '#b9b4ab', roughness: 0.75, tex: 'plaster' },
  deck: { color: '#ffffff', roughness: 1, tex: 'deck' },
  lawn: { color: '#ffffff', roughness: 1, tex: 'lawn' },
  pavers: { color: '#ffffff', roughness: 1, tex: 'pavers' },
  gravel: { color: '#ffffff', roughness: 1, tex: 'gravel' },
  water: { color: '#0d1719', roughness: 0.03 },
};

const MISC: Record<string, Def> = {
  ceiling: { color: '#fbfaf7', roughness: 1, tex: 'plaster' },
  slats: { color: '#d9b48c', roughness: 1, tex: 'woodPanel' },
  frame: { color: '#2B2B2A', roughness: 0.45, metalness: 0.5 },
  door: { color: '#c79a72', roughness: 1, tex: 'woodPanel' },
  pivot: { color: '#b08260', roughness: 1, tex: 'woodPanel' },
  garageDoor: { color: '#e0b48a', roughness: 1, tex: 'woodPanel' },
  fabric: { color: '#ffffff', roughness: 1, tex: 'linen' },
  fabricWarm: { color: '#e3cdb0', roughness: 1, tex: 'linen' },
  fabricDark: { color: '#6a655e', roughness: 1, tex: 'linen' },
  fabricTerracotta: { color: '#c47a55', roughness: 1, tex: 'linen' },
  fabricOlive: { color: '#9a9a6a', roughness: 1, tex: 'linen' },
  wood: { color: '#ffffff', roughness: 1, tex: 'woodPanel' },
  woodLight: { color: '#f1d2ae', roughness: 1, tex: 'woodPanel' },
  woodDark: { color: '#7d5b46', roughness: 1, tex: 'woodPanel' },
  metalDark: { color: '#222222', roughness: 0.4, metalness: 0.7 },
  brass: { color: '#B08D57', roughness: 0.3, metalness: 1 },
  ceramic: { color: '#F1EFEA', roughness: 0.25 },
  stoneDark: { color: '#ffffff', roughness: 1, tex: 'cobble' },
  stoneLight: { color: '#efe7da', roughness: 1, tex: 'travertine' },
  quartzite: { color: '#f4f1ec', roughness: 0.28, tex: 'porcelain' },
  terracotta: { color: '#B5653E', roughness: 0.85 },
  pool: { color: '#ffffff', roughness: 1, tex: 'pool' },
  poolWater: { color: '#1e6c74', roughness: 0.04, extra: { emissive: new Color('#25c6bd'), emissiveIntensity: 0 } },
  black: { color: '#151515', roughness: 0.5 },
  rattan: { color: '#c9a36f', roughness: 0.8 },
  leaf: { color: '#4f6b33', roughness: 0.65, extra: { side: DoubleSide } },
  leafDark: { color: '#3b5228', roughness: 0.65, extra: { side: DoubleSide } },
  trunk: { color: '#7c6f60', roughness: 0.95 },
  bougainvillea: { color: '#c43d7e', roughness: 0.7, extra: { side: DoubleSide } },
  car: { color: '#2b2f33', roughness: 0.25, metalness: 0.6 },
  carLight: { color: '#c9ccd0', roughness: 0.25, metalness: 0.6 },
  tire: { color: '#141414', roughness: 0.9 },
  chrome: { color: '#d8d8d8', roughness: 0.1, metalness: 1 },
  mirror: { color: '#ffffff', roughness: 0.02, metalness: 1 },
  white: { color: '#f3f1ec', roughness: 0.6 },
  paintRed: { color: '#a8442f', roughness: 0.7 },
  paintSand: { color: '#d8c3a0', roughness: 0.8 },
  paintBlack: { color: '#1d1c1b', roughness: 0.7 },
};

let TEX: Record<TexName, TexSet> | null = null;
const cache = new Map<string, MeshStandardMaterial>();

/** Recebe as texturas assadas (chamar antes de construir a cena). */
export function initLibrary(tex: Record<TexName, TexSet>) {
  TEX = tex;
}

function make(def: Def, draw: DrawOptions, name: string): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    color: new Color(def.color),
    roughness: def.roughness,
    metalness: def.metalness ?? 0,
    ...def.extra,
  });
  m.name = name;
  if (def.tex && TEX) {
    const t = TEX[def.tex];
    m.map = t.map;
    m.normalMap = t.normalMap;
    m.roughnessMap = t.orm;
    m.aoMap = t.orm;
    m.aoMapIntensity = 1;
    const ns = def.normalScale ?? 1;
    m.normalScale = new Vector2(ns, ns);
  }
  return patchMaterial(m, draw);
}

export function wallMaterial(f: WallFinish): MeshStandardMaterial {
  const k = `wall:${f}`;
  if (!cache.has(k)) cache.set(k, make(WALLS[f], { poche: true }, k));
  return cache.get(k)!;
}

export function floorMaterial(f: FloorFinish): MeshStandardMaterial {
  const k = `floor:${f}`;
  if (!cache.has(k)) {
    const m = make(FLOORS[f], { hatch: HATCH[f] }, k);
    if (GLOW_FLOORS.has(f)) {
      m.emissive.set('#ffb36b');
      m.emissiveIntensity = 0;
      m.emissiveMap = m.map;
      nightFloors.push(m);
    }
    cache.set(k, m);
  }
  return cache.get(k)!;
}

/** Pisos que recebem o brilho quente das luzes da casa à noite (vista de fora/de cima). */
const GLOW_FLOORS = new Set<FloorFinish>(['travertine', 'wood', 'porcelain', 'stone']);
export const nightFloors: MeshStandardMaterial[] = [];

export function miscMaterial(name: string): MeshStandardMaterial {
  const k = `misc:${name}`;
  if (!cache.has(k)) {
    const def = MISC[name];
    if (!def) throw new Error(`material desconhecido: ${name}`);
    cache.set(k, make(def, {}, k));
  }
  return cache.get(k)!;
}

/** Gramado do terreno: no desenho é papel liso (o pontilhado fica só nos jardins). */
export function siteGroundMaterial(): MeshStandardMaterial {
  const k = 'site';
  if (!cache.has(k)) cache.set(k, make(FLOORS.lawn, {}, k));
  return cache.get(k)!;
}

/**
 * Terreno em volta do lote: o mesmo gramado com textura (UV em metros), tingido por vértice só longe
 * da divisa (morros, mata, praia). Perto do lote o tom é branco: a grama continua sem emenda.
 */
export function terrainMaterial(): MeshStandardMaterial {
  const k = 'terrain';
  if (!cache.has(k)) {
    const m = make(FLOORS.lawn, {}, k);
    m.vertexColors = true;
    cache.set(k, m);
  }
  return cache.get(k)!;
}

/** Albedo médio (linear) da textura do gramado: o tingimento do terreno divide por ele. */
export const LAWN_MEAN = new Color(0.17, 0.22, 0.056);

export function glassMaterial(): MeshStandardMaterial {
  const k = 'glass';
  if (!cache.has(k)) {
    const m = new MeshStandardMaterial({
      color: new Color('#8f9c9e'),
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: DoubleSide,
      envMapIntensity: 1.1,
    });
    m.name = k;
    cache.set(k, patchMaterial(m, { glass: true }));
  }
  return cache.get(k)!;
}

export function allMaterials(): MeshStandardMaterial[] {
  return [...cache.values()];
}
