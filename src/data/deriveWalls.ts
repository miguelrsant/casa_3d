import type { House, Opening, Room, WallFinish } from './schema';
import { facadeFinishes } from './house';

const EPS = 1e-6;

export interface WallSpan {
  line: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  /** Ambiente do lado negativo (x < at ou z < at). */
  neg: Room | null;
  /** Ambiente do lado positivo (x > at ou z > at). */
  pos: Room | null;
  thickness: number;
  height: number;
  exterior: boolean;
  openings: Opening[];
}

interface Edge {
  from: number;
  to: number;
  room: Room;
}

const key = (line: string, at: number) => `${line}:${at.toFixed(3)}`;

/**
 * Deriva as paredes a partir das bordas dos ambientes:
 * borda compartilhada → parede interna; borda voltada para fora → fachada.
 * Bordas listadas em `openEdges` não geram parede.
 */
export function deriveWalls(h: House): WallSpan[] {
  const neg = new Map<string, Edge[]>();
  const pos = new Map<string, Edge[]>();
  const lines = new Map<string, { line: 'x' | 'z'; at: number }>();
  const push = (m: Map<string, Edge[]>, line: 'x' | 'z', at: number, e: Edge) => {
    const k = key(line, at);
    lines.set(k, { line, at });
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(e);
  };

  for (const room of h.rooms) {
    const { x0, z0, x1, z1 } = room.rect;
    push(pos, 'z', z0, { from: x0, to: x1, room }); // borda norte: ambiente do lado +z
    push(neg, 'z', z1, { from: x0, to: x1, room }); // borda sul
    push(pos, 'x', x0, { from: z0, to: z1, room }); // borda oeste
    push(neg, 'x', x1, { from: z0, to: z1, room }); // borda leste
  }

  const spans: WallSpan[] = [];
  for (const [k, { line, at }] of lines) {
    const negE = neg.get(k) ?? [];
    const posE = pos.get(k) ?? [];
    const open = h.openEdges.filter((o) => o.line === line && Math.abs(o.at - at) < EPS);
    const ops = h.openings.filter((o) => o.line === line && Math.abs(o.at - at) < EPS);

    const bps = new Set<number>();
    for (const e of [...negE, ...posE]) {
      bps.add(e.from);
      bps.add(e.to);
    }
    for (const o of open) {
      bps.add(o.from);
      bps.add(o.to);
    }
    const pts = [...bps].sort((a, b) => a - b);

    let cur: WallSpan | null = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (b - a < EPS) continue;
      const mid = (a + b) / 2;
      const n = negE.find((e) => e.from - EPS <= mid && mid <= e.to + EPS)?.room ?? null;
      const p = posE.find((e) => e.from - EPS <= mid && mid <= e.to + EPS)?.room ?? null;
      const isOpen = open.some((o) => o.from - EPS <= mid && mid <= o.to + EPS);
      if ((!n && !p) || isOpen) {
        cur = null;
        continue;
      }
      if (cur && cur.neg === n && cur.pos === p && Math.abs(cur.to - a) < EPS) {
        cur.to = b;
        continue;
      }
      const exterior: boolean = !n || !p;
      cur = {
        line,
        at,
        from: a,
        to: b,
        neg: n,
        pos: p,
        exterior,
        thickness: exterior ? h.wall.exterior : h.wall.interior,
        height: Math.max(n?.ceiling ?? 0, p?.ceiling ?? 0) + (exterior ? h.wall.parapet : 0),
        openings: [],
      };
      spans.push(cur);
    }

    for (const o of ops) {
      const s = spans.find(
        (sp) => sp.line === line && Math.abs(sp.at - at) < EPS && sp.from - EPS <= o.from && o.to <= sp.to + EPS,
      );
      if (s) s.openings.push(o);
    }
  }
  for (const s of spans) s.openings.sort((a, b) => a.from - b.from);
  return spans;
}

/** Aberturas que não couberam inteiras numa parede (devem ser zero). */
export function orphanOpenings(h: House, spans: WallSpan[]): Opening[] {
  const placed = new Set(spans.flatMap((s) => s.openings.map((o) => o.id)));
  return h.openings.filter((o) => !placed.has(o.id));
}

/** Acabamento da face de uma parede voltada para o lado `side` (−1 ou +1). */
export function faceFinish(span: WallSpan, side: -1 | 1, along: number): WallFinish {
  const room = side < 0 ? span.neg : span.pos;
  if (room) {
    const f = room.featureWalls?.find((w) => w.line === span.line && Math.abs(w.at - span.at) < EPS);
    return f ? f.finish : room.wall;
  }
  const ff = facadeFinishes.find(
    (f) => f.line === span.line && Math.abs(f.at - span.at) < EPS && f.from - EPS <= along && along <= f.to + EPS,
  );
  return ff ? ff.finish : 'plaster';
}

export interface Junction {
  /** Ajuste no início (from) e no fim (to): positivo estende, negativo encolhe. */
  startAdj: number;
  endAdj: number;
}

/**
 * Regra de encontro: paredes na linha 'z' (correm em x) "donas" dos cantos se estendem;
 * paredes na linha 'x' (correm em z) param na face da parede perpendicular.
 */
export function junctions(spans: WallSpan[]): Map<WallSpan, Junction> {
  const out = new Map<WallSpan, Junction>();
  const perpAt = (s: WallSpan, end: number) =>
    spans.filter(
      (o) =>
        o.line !== s.line &&
        Math.abs(o.at - end) < EPS &&
        o.from - EPS <= s.at &&
        s.at <= o.to + EPS,
    );
  const collinear = (s: WallSpan, end: number) =>
    spans.find(
      (o) =>
        o !== s &&
        o.line === s.line &&
        Math.abs(o.at - s.at) < EPS &&
        (Math.abs(o.from - end) < EPS || Math.abs(o.to - end) < EPS),
    );

  for (const s of spans) {
    const adj = (end: number): number => {
      const perp = perpAt(s, end);
      if (!perp.length) return 0;
      const cont = collinear(s, end);
      const tMax = Math.max(...perp.map((p) => p.thickness));
      const tMin = Math.min(...perp.map((p) => p.thickness));
      if (s.line === 'z') {
        if (cont && cont.thickness >= s.thickness) return cont.thickness > s.thickness ? tMax / 2 : 0;
        return tMax / 2;
      }
      if (cont) return 0;
      return -tMin / 2;
    };
    out.set(s, { startAdj: adj(s.from), endAdj: adj(s.to) });
  }
  return out;
}
