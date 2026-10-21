import type { House, Rect } from './schema';
import { deriveWalls, orphanOpenings } from './deriveWalls';

export const area = (r: Rect) => (r.x1 - r.x0) * (r.z1 - r.z0);

const overlap = (a: Rect, b: Rect) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-6 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-6;

export interface Report {
  errors: string[];
  enclosedArea: number;
  usefulArea: number;
}

/** Confere a planta: sem sobreposições, aberturas dentro das paredes, folgas mínimas. */
export function validateHouse(h: House): Report {
  const errors: string[] = [];
  const rooms = h.rooms;

  for (let i = 0; i < rooms.length; i++) {
    const a = rooms[i];
    if (a.rect.x1 <= a.rect.x0 || a.rect.z1 <= a.rect.z0) errors.push(`${a.id}: retângulo inválido`);
    for (let j = i + 1; j < rooms.length; j++) {
      if (overlap(a.rect, rooms[j].rect)) errors.push(`${a.id} sobrepõe ${rooms[j].id}`);
    }
    for (const o of h.outdoor) {
      if (o.kind === 'pool' || o.kind === 'reflecting') continue;
      if (overlap(a.rect, o.rect)) errors.push(`${a.id} sobrepõe área externa ${o.id}`);
    }
  }

  const spans = deriveWalls(h);
  for (const o of orphanOpenings(h, spans)) errors.push(`abertura ${o.id} não cabe inteira em nenhuma parede`);

  for (const s of spans) {
    for (let i = 0; i < s.openings.length; i++) {
      const o = s.openings[i];
      if (o.to - o.from < 0.6) errors.push(`abertura ${o.id} estreita demais (${(o.to - o.from).toFixed(2)} m)`);
      const head = o.head ?? 2.2;
      if (head > s.height + 1e-6) errors.push(`abertura ${o.id}: verga (${head}) acima da parede (${s.height})`);
      const next = s.openings[i + 1];
      if (next && next.from < o.to + 0.1) errors.push(`aberturas ${o.id} e ${next.id} encostadas/sobrepostas`);
    }
  }

  const enclosedArea = rooms.reduce((acc, r) => acc + area(r.rect), 0);
  const garage = rooms.find((r) => r.id === 'garagem');
  const usefulArea = enclosedArea - (garage ? area(garage.rect) : 0);
  return { errors, enclosedArea, usefulArea };
}

/** Testa se o segmento a→b (planta) cruza alguma parede fora dos vãos passáveis. */
export function crossesWall(h: House, a: [number, number], b: [number, number]): string | null {
  const spans = deriveWalls(h);
  const passable = new Set(['door', 'pivot', 'slide', 'void', 'garage']);
  for (const s of spans) {
    // linha da parede: 'x' → x = at; 'z' → z = at
    const [pa, pb] = s.line === 'x' ? [a[0], b[0]] : [a[1], b[1]];
    if ((pa - s.at) * (pb - s.at) > 0) continue; // não cruza a linha
    if (Math.abs(pb - pa) < 1e-9) continue;
    const t = (s.at - pa) / (pb - pa);
    const along = s.line === 'x' ? a[1] + (b[1] - a[1]) * t : a[0] + (b[0] - a[0]) * t;
    if (along < s.from - 1e-6 || along > s.to + 1e-6) continue;
    const ok = s.openings.some((o) => passable.has(o.kind) && o.from + 0.2 <= along && along <= o.to - 0.2);
    if (!ok) return `cruza parede ${s.line}=${s.at} em ${along.toFixed(2)} (${s.neg?.id ?? 'fora'} | ${s.pos?.id ?? 'fora'})`;
  }
  return null;
}
