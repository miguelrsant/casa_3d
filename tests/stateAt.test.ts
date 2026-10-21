import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { stateAt, counterAt, type HeroPose } from '../src/story/stateAt';
import { cameraKeys, stops } from '../src/story/stops';
import { house } from '../src/data/house';
import { crossesWall } from '../src/data/validate';
import { zoneIndex } from '../src/data/schema';

const hero: HeroPose = { pos: new Vector3(18, 240, 6), target: new Vector3(18, 0, 6), fov: 12 };

describe('stateAt', () => {
  it('é determinístico: o mesmo t gera o mesmo estado (scroll reversível)', () => {
    const a = stateAt(0.4321, hero);
    const snapA = { pos: a.pos.toArray(), target: a.target.toArray(), reveal: [...a.reveal] };
    stateAt(0.9, hero);
    const b = stateAt(0.4321, hero);
    expect(b.pos.toArray()).toEqual(snapA.pos);
    expect(b.target.toArray()).toEqual(snapA.target);
    expect([...b.reveal]).toEqual(snapA.reveal);
  });

  it('começa e termina no enquadramento do hero, em desenho', () => {
    const s0 = stateAt(0, hero);
    expect(s0.hero).toBe(1);
    expect(s0.pos.distanceTo(hero.pos)).toBeLessThan(1e-6);
    expect(Math.max(...s0.reveal)).toBe(0);
    const s1 = stateAt(1, hero);
    expect(s1.hero).toBe(1);
    expect(Math.max(...s1.reveal)).toBe(0);
  });

  it('revela cada ambiente na sua parada e mantém revelado depois', () => {
    for (const st of stops) {
      for (const r of st.reveal) {
        const after = stateAt(r.t1 + 0.002, hero);
        for (const z of r.zones) expect(after.reveal[zoneIndex(z)]).toBeCloseTo(1, 3);
        const before = stateAt(r.t0 - 0.002, hero);
        for (const z of r.zones) expect(before.reveal[zoneIndex(z)]).toBe(0);
      }
    }
    // perto do fim (antes do papel), tudo revelado
    const s = stateAt(0.9, hero);
    for (let z = 0; z < 22; z++) expect(s.reveal[z]).toBeGreaterThan(0.99);
  });

  it('o contador acompanha as paradas', () => {
    expect(counterAt(0.05)).toBe(0);
    expect(counterAt(0.21)).toBe(1);
    expect(counterAt(0.31)).toBe(2);
    expect(counterAt(0.78)).toBe(7);
  });

  it('o caminho da câmera à altura dos olhos só atravessa paredes pelos vãos', () => {
    const errs: string[] = [];
    const N = 4000;
    let prev: [number, number] | null = null;
    for (let n = 0; n <= N; n++) {
      const t = n / N;
      const s = stateAt(t, hero);
      const p: [number, number] = [s.pos.x, s.pos.z];
      const low = s.pos.y < 3.2; // acima das paredes pode cruzar
      if (prev && low) {
        const e = crossesWall(house, prev, p);
        if (e) errs.push(`t=${t.toFixed(4)}: ${e}`);
      }
      prev = p;
    }
    expect(errs.slice(0, 5)).toEqual([]);
  });

  it('o detector de travessia acusa paredes de verdade', () => {
    expect(crossesWall(house, [16, 10], [16, 14])).toBeNull(); // vão hall → estar
    expect(crossesWall(house, [21, 10], [21, 14])).not.toBeNull(); // pano de vidro estar | jardim
    expect(crossesWall(house, [3, 3], [3, 5])).toBeNull(); // porta de correr da cozinha
    expect(crossesWall(house, [-1, 8], [1, 8])).not.toBeNull(); // janela da cozinha
  });

  it('as chaves de câmera estão em ordem crescente de t', () => {
    for (let i = 1; i < cameraKeys.length; i++) expect(cameraKeys[i].t).toBeGreaterThan(cameraKeys[i - 1].t);
  });
});
