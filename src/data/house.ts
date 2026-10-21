import type { House, Rect } from './schema';

const r = (x0: number, z0: number, x1: number, z1: number): Rect => ({ x0, z0, x1, z1 });

/**
 * Casa Brisa — planta original (modernismo tropical, térrea).
 * Eixos X: A–F = 0 / 7 / 13 / 19 / 26 / 34 · Eixos Z: 1–5 = 0 / 4 / 12 / 20 / 25.
 */
export const house: House = {
  name: 'CASA BRISA',
  site: r(-12, -22, 48, 54),
  wall: { exterior: 0.3, interior: 0.15, parapet: 0.45 },

  grid: {
    x: [
      { name: 'A', at: 0 },
      { name: 'B', at: 7 },
      { name: 'C', at: 13 },
      { name: 'D', at: 19 },
      { name: 'E', at: 26 },
      { name: 'F', at: 34 },
    ],
    z: [
      { name: '1', at: 0 },
      { name: '2', at: 4 },
      { name: '3', at: 12 },
      { name: '4', at: 20 },
      { name: '5', at: 25 },
    ],
  },

  rooms: [
    { id: 'hall', name: 'HALL', rect: r(13, 12, 19, 20), ceiling: 4.2, zone: 'hall', floor: 'travertine', wall: 'plaster', ceilingFinish: 'plaster' },
    {
      id: 'estar', name: 'ESTAR', rect: r(13, 4, 26, 12), ceiling: 3.6, zone: 'estar', floor: 'travertine', wall: 'plaster', ceilingFinish: 'slats',
      featureWalls: [{ line: 'x', at: 26, finish: 'stone' }],
    },
    { id: 'jantar', name: 'JANTAR', rect: r(7, 4, 13, 12), ceiling: 3.6, zone: 'jantar', floor: 'travertine', wall: 'plaster', ceilingFinish: 'slats' },
    { id: 'cozinha', name: 'COZINHA', rect: r(0, 4, 7, 12), ceiling: 3.2, zone: 'cozinha', floor: 'travertine', wall: 'plaster', ceilingFinish: 'plaster' },
    { id: 'adega', name: 'ADEGA', rect: r(7, 12, 13, 16), ceiling: 3.0, zone: 'adega', floor: 'wood', wall: 'wood', ceilingFinish: 'plaster' },
    { id: 'despensa', name: 'DESPENSA', rect: r(0, 12, 4, 15), ceiling: 2.7, zone: 'servico', floor: 'porcelain', wall: 'plaster', ceilingFinish: 'plaster' },
    { id: 'lavanderia', name: 'LAVANDERIA', rect: r(0, 15, 4, 18), ceiling: 2.7, zone: 'servico', floor: 'porcelain', wall: 'tile', ceilingFinish: 'plaster' },
    { id: 'mudroom', name: 'MUDROOM', rect: r(4, 12, 7, 18), ceiling: 2.7, zone: 'servico', floor: 'porcelain', wall: 'plaster', ceilingFinish: 'plaster' },
    { id: 'garagem', name: 'GARAGEM', rect: r(0, 18, 7, 25), ceiling: 2.8, zone: 'garagem', floor: 'concrete', wall: 'concrete', ceilingFinish: 'plaster' },
    { id: 'deposito', name: 'DEPÓSITO', rect: r(7, 16, 10, 20), ceiling: 2.7, zone: 'servico', floor: 'porcelain', wall: 'plaster', ceilingFinish: 'plaster' },
    { id: 'lavabo', name: 'LAVABO', rect: r(10, 16, 13, 20), ceiling: 3.0, zone: 'servico', floor: 'stone', wall: 'tile', ceilingFinish: 'plaster' },
    { id: 'galeria', name: 'GALERIA', rect: r(19, 18.5, 26, 20), ceiling: 2.8, zone: 'galeria', floor: 'travertine', wall: 'plaster', ceilingFinish: 'plaster', label: false },
    { id: 'circulacao', name: 'CIRCULAÇÃO', rect: r(26, 6, 27.5, 25), ceiling: 2.8, zone: 'circulacao', floor: 'wood', wall: 'plaster', ceilingFinish: 'plaster', label: false },
    {
      id: 'suite', name: 'SUÍTE', rect: r(26, 0, 34, 6), ceiling: 3.2, zone: 'suite', floor: 'wood', wall: 'plaster', ceilingFinish: 'plaster',
      featureWalls: [{ line: 'z', at: 6, finish: 'wood' }],
    },
    { id: 'closet', name: 'CLOSET', rect: r(27.5, 6, 34, 9), ceiling: 2.8, zone: 'closet', floor: 'wood', wall: 'wood', ceilingFinish: 'plaster' },
    { id: 'banho', name: 'BANHO', rect: r(27.5, 9, 34, 14), ceiling: 3.0, zone: 'banho', floor: 'stone', wall: 'tile', ceilingFinish: 'plaster' },
    { id: 'quarto2', name: 'QUARTO 2', rect: r(27.5, 14, 34, 18), ceiling: 3.0, zone: 'quartos', floor: 'wood', wall: 'plaster', ceilingFinish: 'plaster' },
    { id: 'banho2', name: 'BANHO 2', rect: r(27.5, 18, 34, 21), ceiling: 2.8, zone: 'quartos', floor: 'stone', wall: 'tile', ceilingFinish: 'plaster' },
    { id: 'quarto3', name: 'QUARTO 3', rect: r(27.5, 21, 34, 25), ceiling: 3.0, zone: 'quartos', floor: 'wood', wall: 'plaster', ceilingFinish: 'plaster' },
  ],

  outdoor: [
    { id: 'court', name: 'PÁTIO', rect: r(7, 20, 26, 25), zone: 'court', kind: 'court', floor: 'pavers', label: false },
    { id: 'reflecting', name: "ESPELHO D'ÁGUA", rect: r(8.5, 20.8, 24.5, 24.2), zone: 'court', kind: 'reflecting', floor: 'water', level: -0.06 },
    { id: 'path', name: 'CAMINHO', rect: r(15, 25, 17, 29), zone: 'court', kind: 'path', floor: 'pavers', label: false },
    { id: 'pergolado', name: 'PERGOLADO', rect: r(0, 0, 7, 4), zone: 'pergolado', kind: 'pergola', floor: 'deck', roof: 3.2 },
    { id: 'varanda', name: 'VARANDA', rect: r(7, 0, 26, 4), zone: 'varanda', kind: 'veranda', floor: 'travertine', roof: 3.6 },
    { id: 'deck', name: 'DECK', rect: r(0, -4, 40, 0), zone: 'deck', kind: 'deck', floor: 'travertine', label: false },
    { id: 'deckW', name: 'DECK', rect: r(8, -11, 10, -4), zone: 'deck', kind: 'deck', floor: 'travertine', label: false },
    { id: 'deckE', name: 'DECK', rect: r(22, -11, 24, -4), zone: 'deck', kind: 'deck', floor: 'travertine', label: false },
    { id: 'deckN', name: 'DECK', rect: r(10, -11, 22, -9), zone: 'deck', kind: 'deck', floor: 'travertine', label: false },
    { id: 'piscina', name: 'PISCINA', rect: r(10, -9, 22, -4), zone: 'piscina', kind: 'pool', floor: 'water', level: -0.08 },
    { id: 'lounge', name: 'LOUNGE DO FOGO', rect: r(26, -10, 32, -4), zone: 'lounge', kind: 'lounge', floor: 'stone', level: -0.45 },
    { id: 'jardimSuite', name: 'JARDIM DA SUÍTE', rect: r(34, 0, 40, 14), zone: 'jardimSuite', kind: 'garden', floor: 'lawn' },
    { id: 'jardimInterno', name: 'JARDIM INTERNO', rect: r(19, 12, 26, 18.5), zone: 'jardimInterno', kind: 'garden', floor: 'gravel' },
  ],

  openEdges: [
    { line: 'x', at: 13, from: 4, to: 12 }, // estar | jantar
    { line: 'x', at: 7, from: 4, to: 12 }, // jantar | cozinha
  ],

  openings: [
    // Hall
    { id: 'pivot', kind: 'pivot', line: 'z', at: 20, from: 15.2, to: 16.8, head: 3.4 },
    { id: 'hall-estar', kind: 'void', line: 'z', at: 12, from: 14.5, to: 17.5, head: 3.2 },
    { id: 'hall-jardim', kind: 'glass', line: 'x', at: 19, from: 12.3, to: 18.3, head: 4.0 },
    { id: 'hall-galeria', kind: 'void', line: 'x', at: 19, from: 18.5, to: 20, head: 2.8 },
    { id: 'hall-lavabo', kind: 'door', line: 'x', at: 13, from: 17.0, to: 17.9, head: 2.3, hinge: 'from', swing: -1 },
    // Estar / jantar / cozinha
    { id: 'estar-varanda', kind: 'slide', line: 'z', at: 4, from: 13.3, to: 25.7, head: 3.4 },
    { id: 'estar-jardim', kind: 'glass', line: 'z', at: 12, from: 19.3, to: 25.7, head: 3.4 },
    { id: 'jantar-varanda', kind: 'slide', line: 'z', at: 4, from: 7.3, to: 12.7, head: 3.4, passAt: 12.1 },
    { id: 'jantar-adega', kind: 'glass', line: 'z', at: 12, from: 7.5, to: 12.5, head: 2.9 },
    { id: 'cozinha-pergolado', kind: 'slide', line: 'z', at: 4, from: 0.5, to: 6.5, head: 3.0 },
    { id: 'cozinha-despensa', kind: 'door', line: 'z', at: 12, from: 1.5, to: 2.4, head: 2.2, hinge: 'from', swing: 1 },
    { id: 'cozinha-mudroom', kind: 'door', line: 'z', at: 12, from: 5.0, to: 5.9, head: 2.2, hinge: 'to', swing: 1 },
    { id: 'cozinha-janela', kind: 'window', line: 'x', at: 0, from: 6.0, to: 10.0, sill: 1.05, head: 2.5 },
    // Serviço
    { id: 'mud-lav', kind: 'door', line: 'x', at: 4, from: 16.0, to: 16.9, head: 2.2, hinge: 'from', swing: -1 },
    { id: 'mud-garagem', kind: 'door', line: 'z', at: 18, from: 5.0, to: 5.9, head: 2.2, hinge: 'from', swing: 1 },
    { id: 'lav-janela', kind: 'window', line: 'x', at: 0, from: 15.6, to: 17.4, sill: 1.2, head: 2.2 },
    { id: 'garagem-portao', kind: 'garage', line: 'z', at: 25, from: 1.0, to: 6.0, head: 2.4 },
    { id: 'garagem-deposito', kind: 'door', line: 'x', at: 7, from: 18.6, to: 19.5, head: 2.2, hinge: 'to', swing: 1 },
    // Galeria / circulação
    { id: 'galeria-jardim', kind: 'glass', line: 'z', at: 18.5, from: 19.2, to: 25.8, head: 2.7 },
    { id: 'galeria-circ', kind: 'void', line: 'x', at: 26, from: 18.5, to: 20, head: 2.6 },
    { id: 'circ-jardim', kind: 'glass', line: 'x', at: 26, from: 12.2, to: 18.3, head: 2.7 },
    { id: 'circ-brise', kind: 'brise', line: 'x', at: 26, from: 20.2, to: 24.8, head: 2.8 },
    { id: 'circ-suite', kind: 'door', line: 'z', at: 6, from: 26.2, to: 27.3, head: 2.4, hinge: 'from', swing: -1 },
    { id: 'circ-q2', kind: 'door', line: 'x', at: 27.5, from: 14.6, to: 15.5, head: 2.3, hinge: 'from', swing: 1 },
    { id: 'circ-b2', kind: 'door', line: 'x', at: 27.5, from: 20.0, to: 20.9, head: 2.3, hinge: 'to', swing: 1 },
    { id: 'circ-q3', kind: 'door', line: 'x', at: 27.5, from: 21.6, to: 22.5, head: 2.3, hinge: 'from', swing: 1 },
    // Suíte
    { id: 'suite-deck', kind: 'slide', line: 'z', at: 0, from: 26.5, to: 33.5, head: 3.0, passAt: 30.5 },
    { id: 'suite-jardim', kind: 'glass', line: 'x', at: 34, from: 0.5, to: 5.5, head: 3.0 },
    { id: 'suite-closet', kind: 'void', line: 'z', at: 6, from: 32.0, to: 33.2, head: 2.4 },
    { id: 'closet-banho', kind: 'void', line: 'z', at: 9, from: 32.0, to: 33.2, head: 2.4 },
    { id: 'banho-vidro', kind: 'glass', line: 'x', at: 34, from: 9.3, to: 12.6, head: 2.8 },
    { id: 'banho-jardim', kind: 'slide', line: 'x', at: 34, from: 12.7, to: 13.8, head: 2.6, passAt: 13.25 },
    // Quartos
    { id: 'q2-janela', kind: 'window', line: 'x', at: 34, from: 14.6, to: 17.4, sill: 0.5, head: 2.6 },
    { id: 'b2-janela', kind: 'window', line: 'x', at: 34, from: 18.8, to: 20.2, sill: 1.5, head: 2.4 },
    { id: 'q3-janela', kind: 'window', line: 'x', at: 34, from: 21.5, to: 24.5, sill: 0.5, head: 2.6 },
    { id: 'q3-sul', kind: 'window', line: 'z', at: 25, from: 28.5, to: 33.0, sill: 0.9, head: 2.6 },
  ],
};

/** Acabamento de fachada por trecho (o padrão é reboco branco). */
export const facadeFinishes: { line: 'x' | 'z'; at: number; from: number; to: number; finish: 'stone' | 'wood' | 'concrete' }[] = [
  { line: 'z', at: 20, from: 7, to: 26, finish: 'stone' }, // fachada do pátio de entrada
  { line: 'x', at: 7, from: 20, to: 25, finish: 'stone' },
  { line: 'z', at: 25, from: 0, to: 7, finish: 'wood' }, // garagem em ripado
  { line: 'x', at: 26, from: 0, to: 4, finish: 'wood' }, // fecho da varanda
];

/** Acesso de carros: rotatória com palmeira-imperial, pátio da garagem e rua. */
export const drive = {
  center: [16, 38] as [number, number],
  outer: 9,
  inner: 3.5,
  apron: r(0, 25, 9, 35),
  street: r(13.5, 46, 18.5, 54),
};

/** Muro-cascata ao norte da piscina e muros do jardim da suíte. */
export const landscapeWalls = [
  { id: 'cascata', rect: r(13, -9.6, 19, -9.0), height: 2.6, finish: 'stone' as const, zone: 'piscina' as const },
  { id: 'muroSuiteL', rect: r(39.85, 0, 40.15, 14.15), height: 2.4, finish: 'plaster' as const, zone: 'jardimSuite' as const },
  { id: 'muroSuiteS', rect: r(34, 13.85, 40.15, 14.15), height: 2.4, finish: 'plaster' as const, zone: 'jardimSuite' as const },
];
