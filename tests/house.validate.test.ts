import { describe, expect, it } from 'vitest';
import { house } from '../src/data/house';
import { deriveWalls, junctions } from '../src/data/deriveWalls';
import { area, validateHouse } from '../src/data/validate';

describe('Casa Brisa — planta', () => {
  it('passa no validador sem erros', () => {
    const rep = validateHouse(house);
    expect(rep.errors).toEqual([]);
  });

  it('tem 605,5 m² fechados (556,5 m² úteis + garagem)', () => {
    const rep = validateHouse(house);
    expect(rep.enclosedArea).toBeCloseTo(605.5, 6);
    expect(rep.usefulArea).toBeCloseTo(556.5, 6);
  });

  it('cobre o perímetro: as áreas batem com as medidas', () => {
    const estar = house.rooms.find((r) => r.id === 'estar')!;
    expect(area(estar.rect)).toBe(104);
    const hall = house.rooms.find((r) => r.id === 'hall')!;
    expect(area(hall.rect)).toBe(48);
  });

  it('deriva paredes internas e de fachada com espessuras corretas', () => {
    const spans = deriveWalls(house);
    expect(spans.length).toBeGreaterThan(30);
    const pivotWall = spans.find((s) => s.openings.some((o) => o.id === 'pivot'))!;
    expect(pivotWall.exterior).toBe(true);
    expect(pivotWall.thickness).toBe(0.3);
    const lavaboDoor = spans.find((s) => s.openings.some((o) => o.id === 'hall-lavabo'))!;
    expect(lavaboDoor.exterior).toBe(false);
    expect(lavaboDoor.thickness).toBe(0.15);
    // estar | jantar é integrado: nenhuma parede em x = 13 entre z 4 e 12
    expect(spans.some((s) => s.line === 'x' && s.at === 13 && s.from < 12 && s.to > 4)).toBe(false);
  });

  it('calcula encontros de paredes sem deixar vãos nos cantos', () => {
    const spans = deriveWalls(house);
    const j = junctions(spans);
    // canto noroeste da cozinha: a parede z=4 se estende 0,15 para oeste
    const north = spans.find((s) => s.line === 'z' && s.at === 4 && s.from === 0)!;
    expect(j.get(north)!.startAdj).toBeCloseTo(0.15);
    const west = spans.find((s) => s.line === 'x' && s.at === 0 && s.from === 4)!;
    expect(j.get(west)!.startAdj).toBeCloseTo(-0.15);
  });
});
