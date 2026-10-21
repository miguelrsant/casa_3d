import { Color, DataTexture, NearestFilter, RedFormat, UnsignedByteType, Vector2, Vector4 } from 'three';
import type { House, Rect } from '../data/schema';
import { ZONES, zoneIndex } from '../data/schema';

const RES = 0.1; // metros por texel

export const palette = {
  paper: new Color('#E8E5DF'),
  ink: new Color('#262522'),
  poche: new Color('#33312D'),
  orange: new Color('#E2512A'),
  glow: new Color('#FF6A14'),
};

/** Uniforms compartilhados por todos os materiais com revelação (mesmos objetos → uma atualização serve a todos). */
export const RV = {
  rvZoneMap: { value: null as DataTexture | null },
  rvZoneBounds: { value: new Vector4() },
  rvReveal: { value: new Float32Array(32) },
  rvTile: { value: new Vector2(1.2, 0.9) },
  rvPaper: { value: palette.paper.clone() },
  rvPoche: { value: palette.poche.clone() },
  rvInk: { value: palette.ink.clone() },
  // laranja emissivo em HDR (vai para o bloom)
  rvOrange: { value: palette.glow.clone().multiplyScalar(2.4) },
};

/** Pinta o mapa de zonas: terreno → áreas externas → ambientes. */
export function buildZoneMap(h: House): DataTexture {
  const { x0, z0, x1, z1 } = h.site;
  const w = Math.round((x1 - x0) / RES);
  const d = Math.round((z1 - z0) / RES);
  const data = new Uint8Array(w * d).fill(zoneIndex('site'));

  const paint = (rect: Rect, zone: number) => {
    const i0 = Math.max(0, Math.floor((rect.x0 - x0) / RES));
    const i1 = Math.min(w, Math.ceil((rect.x1 - x0) / RES));
    const j0 = Math.max(0, Math.floor((rect.z0 - z0) / RES));
    const j1 = Math.min(d, Math.ceil((rect.z1 - z0) / RES));
    for (let j = j0; j < j1; j++) data.fill(zone, j * w + i0, j * w + i1);
  };

  // áreas grandes primeiro, pequenas por cima
  const outdoor = [...h.outdoor].sort(
    (a, b) => (b.rect.x1 - b.rect.x0) * (b.rect.z1 - b.rect.z0) - (a.rect.x1 - a.rect.x0) * (a.rect.z1 - a.rect.z0),
  );
  for (const o of outdoor) paint(o.rect, zoneIndex(o.zone));
  for (const r of h.rooms) paint(r.rect, zoneIndex(r.zone));

  const tex = new DataTexture(data, w, d, RedFormat, UnsignedByteType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  RV.rvZoneMap.value = tex;
  RV.rvZoneBounds.value.set(x0, z0, 1 / (x1 - x0), 1 / (z1 - z0));
  return tex;
}

/** Zona de um ponto da planta (mesma regra do shader), útil na CPU. */
export function zoneAt(h: House, x: number, z: number): number {
  for (const r of h.rooms) if (x >= r.rect.x0 && x <= r.rect.x1 && z >= r.rect.z0 && z <= r.rect.z1) return zoneIndex(r.zone);
  let best = -1;
  let bestArea = Infinity;
  for (const o of h.outdoor) {
    const { x0, z0, x1, z1 } = o.rect;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) {
      const a = (x1 - x0) * (z1 - z0);
      if (a < bestArea) {
        bestArea = a;
        best = zoneIndex(o.zone);
      }
    }
  }
  return best >= 0 ? best : zoneIndex('site');
}

export const ZONE_COUNT = ZONES.length;
