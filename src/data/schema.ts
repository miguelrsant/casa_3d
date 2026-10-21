// Tipos da planta. Convenção: metros; x = leste, z = sul (norte = −z), y = cima.
// Origem no cruzamento dos eixos A/1. Medidas eixo a eixo; paredes centradas nas bordas.

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Zonas de revelação: cada uma tem um progresso 0→1 ligado ao scroll. Máximo 32. */
export const ZONES = [
  'site', // terreno, gramados, acesso de carros, anotações externas
  'court', // pátio de entrada, espelho d'água, caminho
  'hall',
  'jardimInterno',
  'estar',
  'jantar',
  'cozinha',
  'adega',
  'varanda',
  'pergolado',
  'deck',
  'piscina',
  'suite',
  'closet',
  'banho',
  'jardimSuite',
  'lounge',
  'galeria',
  'circulacao',
  'servico',
  'garagem',
  'quartos',
] as const;
export type ZoneName = (typeof ZONES)[number];
export const zoneIndex = (z: ZoneName): number => ZONES.indexOf(z);

export type FloorFinish =
  | 'travertine'
  | 'wood'
  | 'porcelain'
  | 'stone'
  | 'concrete'
  | 'deck'
  | 'lawn'
  | 'pavers'
  | 'gravel'
  | 'water';

export type WallFinish = 'plaster' | 'concrete' | 'stone' | 'wood' | 'tile';

export interface Room {
  id: string;
  /** Nome no rótulo do piso (maiúsculas). */
  name: string;
  rect: Rect;
  ceiling: number;
  zone: ZoneName;
  floor: FloorFinish;
  wall: WallFinish;
  ceilingFinish: 'plaster' | 'slats';
  /** Desenhar o rótulo no piso (padrão: sim). */
  label?: boolean;
  /** Acabamento de uma parede específica (ex.: parede de pedra do estar). */
  featureWalls?: { line: 'x' | 'z'; at: number; finish: WallFinish }[];
}

export type OutdoorKind =
  | 'deck'
  | 'lawn'
  | 'court'
  | 'garden'
  | 'pergola'
  | 'veranda'
  | 'lounge'
  | 'path'
  | 'drive'
  | 'pool'
  | 'reflecting';

export interface OutdoorArea {
  id: string;
  name: string;
  rect: Rect;
  zone: ZoneName;
  kind: OutdoorKind;
  floor: FloorFinish;
  /** Cota do piso (m). Padrão 0. */
  level?: number;
  label?: boolean;
  /** Altura da cobertura (varanda, pergolado). */
  roof?: number;
}

export type OpeningKind =
  | 'door' // porta de giro
  | 'pivot' // porta pivotante
  | 'slide' // porta de correr de vidro
  | 'glass' // pano de vidro fixo do piso ao teto
  | 'window' // janela com peitoril
  | 'void' // vão livre
  | 'garage' // portão seccional
  | 'brise'; // brise de madeira

export interface Opening {
  id: string;
  kind: OpeningKind;
  /** 'x' → parede na linha x = at (corre ao longo de z); 'z' → linha z = at (corre ao longo de x). */
  line: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  sill?: number;
  head?: number;
  /** Portas de giro: lado da dobradiça e para qual lado (−/+ da linha) a folha abre. */
  hinge?: 'from' | 'to';
  swing?: -1 | 1;
  /** Portas de correr: ponto (ao longo da parede) por onde o percurso passa — a folha ali fica aberta. */
  passAt?: number;
}

/** Bordas sem parede (ambientes integrados). */
export interface OpenEdge {
  line: 'x' | 'z';
  at: number;
  from: number;
  to: number;
}

export interface GridAxis {
  name: string;
  at: number;
}

export interface CameraKey {
  /** Posição no scroll (0–1). */
  t: number;
  pos: [number, number, number];
  target: [number, number, number];
  fov?: number;
  /** 'hold' desacelera ao chegar e ao sair; 'via' passa direto. */
  ease?: 'hold' | 'via';
}

export interface Stop {
  id: string;
  /** 1–7 (0 = chegada, sem callout). */
  index: number;
  title: string;
  /** Ambiente principal (medidas e área do callout). */
  room: string;
  /** Zonas reveladas nesta parada, com o intervalo de t da revelação. */
  reveal: { zones: ZoneName[]; t0: number; t1: number }[];
  /** Trecho em que a câmera está "respirando" (callout visível). */
  dwell: [number, number];
  /** Ponto 3D do marcador [+]. */
  marker: [number, number, number];
  /** Linha de especificação (complemento depois das medidas). */
  extra: string;
  /** Texto da ficha técnica. */
  text: string;
  finishes: string[];
}

export interface House {
  name: string;
  site: Rect;
  grid: { x: GridAxis[]; z: GridAxis[] };
  rooms: Room[];
  outdoor: OutdoorArea[];
  openings: Opening[];
  openEdges: OpenEdge[];
  wall: { exterior: number; interior: number; parapet: number };
}
