import type { CameraKey, Stop, ZoneName } from '../data/schema';

/**
 * Linha do tempo do scroll (t de 0 a 1).
 * As chaves "hero" usam o enquadramento calculado a partir do slot da planta no DOM.
 */
export const HERO = 'hero' as const;
/** `hero`: enquadramento da planta no slot do DOM · `aerial`: o lote inteiro centralizado na tela (ambos calculados pelo app). */
export type Key = (CameraKey & { hero?: false; aerial?: false }) | { t: number; hero: true; aerial?: false; ease?: 'hold' | 'via' } | { t: number; aerial: true; hero?: false; ease?: 'hold' | 'via' };

export const cameraKeys: Key[] = [
  { t: 0.0, hero: true, ease: 'hold' },
  { t: 0.035, hero: true, ease: 'hold' },
  { t: 0.075, pos: [17, 52, 22.4], target: [17, 0, 21.6], fov: 26, ease: 'via' },
  { t: 0.1, pos: [16, 15, 43], target: [16, 2.2, 22], fov: 40, ease: 'via' },
  // chegada
  { t: 0.125, pos: [16, 1.6, 31], target: [16, 2, 20], fov: 50, ease: 'hold' },
  { t: 0.155, pos: [16, 1.6, 30.4], target: [16, 2, 20], fov: 50, ease: 'hold' },
  { t: 0.17, pos: [16, 1.6, 25.2], target: [16, 1.9, 18], ease: 'via' },
  { t: 0.181, pos: [16, 1.6, 22.2], target: [16, 1.9, 14], ease: 'via' },
  { t: 0.193, pos: [16, 1.6, 20.0], target: [16.2, 1.85, 10], ease: 'via' },
  // 01 · entrada
  { t: 0.205, pos: [16, 1.6, 18.8], target: [16.6, 1.8, 6], fov: 52, ease: 'hold' },
  { t: 0.235, pos: [16, 1.6, 18.5], target: [16.6, 1.8, 6], fov: 52, ease: 'hold' },
  // sobe até a vista de planta do estar e desce
  { t: 0.25, pos: [16.6, 3.9, 16.4], target: [17.6, 1.4, 8], ease: 'via' },
  { t: 0.268, pos: [19.5, 24, 9.2], target: [19.5, 0, 8.4], fov: 48, ease: 'via' },
  { t: 0.285, pos: [23, 7, 11], target: [12, 1, 7], ease: 'via' },
  // 02 · estar
  { t: 0.3, pos: [24.6, 1.6, 10.9], target: [8, 1.3, 7], fov: 52, ease: 'hold' },
  { t: 0.33, pos: [24.2, 1.6, 10.8], target: [8, 1.3, 7], fov: 52, ease: 'hold' },
  { t: 0.35, pos: [18, 1.6, 10.2], target: [4, 1.2, 7], ease: 'via' },
  // 03 · cozinha e jantar
  { t: 0.365, pos: [12.4, 1.6, 10.8], target: [2.5, 1.1, 6], fov: 52, ease: 'hold' },
  { t: 0.395, pos: [12.1, 1.6, 10.6], target: [2.5, 1.1, 6], fov: 52, ease: 'hold' },
  { t: 0.41, pos: [12.2, 1.6, 6.5], target: [12, 1.5, -2], ease: 'via' },
  { t: 0.422, pos: [12.0, 1.6, 3.2], target: [16, 1.4, -1], ease: 'via' },
  // 04 · varanda
  { t: 0.435, pos: [11.5, 1.6, 2.4], target: [25, 1.2, -0.5], fov: 52, ease: 'hold' },
  { t: 0.465, pos: [11.3, 1.6, 2.2], target: [25, 1.2, -0.5], fov: 52, ease: 'hold' },
  { t: 0.482, pos: [17.5, 1.6, -1.4], target: [22, 1.2, -6], ease: 'via' },
  // 05 · piscina (olhando para oeste: pôr do sol atrás da piscina)
  { t: 0.495, pos: [24.5, 1.6, -2.6], target: [10, 1.1, -8.5], fov: 54, ease: 'hold' },
  { t: 0.53, pos: [24.7, 1.6, -2.4], target: [10, 1.1, -8.5], fov: 54, ease: 'hold' },
  { t: 0.548, pos: [26.8, 1.6, -1.8], target: [32, 1.4, 0], ease: 'via' },
  { t: 0.565, pos: [29.4, 1.6, -1.3], target: [31.5, 1.4, 3], ease: 'via' },
  { t: 0.578, pos: [30.6, 1.6, -0.3], target: [30, 1.2, 5], ease: 'via' },
  // 06 · suíte (quarto → closet → banho)
  { t: 0.592, pos: [32.8, 1.6, 0.9], target: [28.6, 0.9, 5.2], fov: 54, ease: 'hold' },
  { t: 0.612, pos: [32.7, 1.6, 1.1], target: [28.6, 0.9, 5.2], fov: 54, ease: 'hold' },
  // vira para a porta do closet, que abre enquanto a câmera chega (ver `doorKeys`)
  { t: 0.623, pos: [32.5, 1.6, 3.0], target: [32.3, 1.5, 7.5], fov: 52, ease: 'via' },
  { t: 0.634, pos: [32.4, 1.6, 5.4], target: [29.0, 1.4, 7.8], ease: 'via' },
  // closet: estante à direita, armários à esquerda, espelho ao fundo e a porta do banho
  { t: 0.644, pos: [32.5, 1.6, 7.55], target: [27.6, 1.25, 7.7], fov: 54, ease: 'hold' },
  { t: 0.656, pos: [32.4, 1.6, 7.55], target: [27.6, 1.25, 7.7], fov: 54, ease: 'hold' },
  // atravessa o closet até a porta do banho, que abre
  // (só vira para o banho depois de passar do armário, senão a câmera encara a porta do armário)
  { t: 0.666, pos: [30.0, 1.6, 7.45], target: [28.4, 1.4, 9.6], ease: 'via' },
  { t: 0.675, pos: [28.4, 1.6, 8.35], target: [29.2, 1.4, 11.5], ease: 'via' },
  // banho: banheira solta de frente para o pano de vidro e o jardim
  { t: 0.685, pos: [28.7, 1.6, 9.95], target: [33.6, 1.15, 11.9], fov: 54, ease: 'hold' },
  { t: 0.701, pos: [28.8, 1.6, 10.0], target: [33.6, 1.15, 11.9], fov: 54, ease: 'hold' },
  { t: 0.715, pos: [31.2, 1.6, 12.75], target: [35.5, 1.4, 13.25], ease: 'via' },
  { t: 0.728, pos: [35.2, 1.6, 13.25], target: [37, 1.4, 6], ease: 'via' },
  { t: 0.745, pos: [36.2, 1.6, 2.5], target: [33, 1.3, -6], ease: 'via' },
  { t: 0.76, pos: [35, 1.6, -3.0], target: [28, 1.0, -7], ease: 'via' },
  // 07 · lounge do fogo
  { t: 0.775, pos: [31.2, 1.15, -6], target: [16, 1.2, -7.5], fov: 54, ease: 'hold' },
  { t: 0.81, pos: [31.0, 1.15, -6.1], target: [16, 1.2, -7.5], fov: 54, ease: 'hold' },
  { t: 0.84, pos: [24, 24, 8], target: [19, 0, 10], fov: 40, ease: 'via' },
  // vista aérea do lote inteiro (centralizada) → papel → planta
  { t: 0.875, aerial: true, ease: 'hold' },
  // o papel é o desenho visto desta mesma câmera: a planta desenrola exatamente sobre a casa.
  // Depois, já em desenho, a planta desliza até o enquadramento do hero
  { t: 0.95, aerial: true, ease: 'hold' },
  { t: 0.978, hero: true, ease: 'hold' },
  { t: 1.0, hero: true, ease: 'hold' },
];

type Reveal = { zones: ZoneName[]; t0: number; t1: number };
const rv = (zones: ZoneName[], t0: number, t1: number): Reveal => ({ zones, t0, t1 });

export const stops: Stop[] = [
  {
    id: 'chegada',
    index: 0,
    title: 'A CHEGADA',
    room: 'hall',
    reveal: [rv(['court'], 0.13, 0.15), rv(['site'], 0.133, 0.153)],
    dwell: [0.125, 0.155],
    marker: [16, 3.2, 20.4],
    extra: '',
    text: '',
    finishes: [],
  },
  {
    id: 'entrada',
    index: 1,
    title: 'A ENTRADA',
    room: 'hall',
    reveal: [rv(['hall'], 0.195, 0.225), rv(['jardimInterno'], 0.2, 0.228), rv(['galeria'], 0.205, 0.23)],
    dwell: [0.205, 0.235],
    marker: [17.4, 3.1, 13.2],
    extra: 'RASGO DE LUZ ZENITAL',
    text: 'Quem chega atravessa o espelho d’água sobre pisantes e entra por uma porta pivotante de 3,40 m. O hall tem pé-direito de 4,20 m e se abre, à direita, para o jardim interno da jabuticabeira.',
    finishes: ['Piso em travertino levigado', 'Paredes em reboco fino branco', 'Porta pivotante em freijó', 'Pano de vidro do piso ao teto'],
  },
  {
    id: 'estar',
    index: 2,
    title: 'O ESTAR',
    room: 'estar',
    reveal: [rv(['estar'], 0.29, 0.318)],
    dwell: [0.3, 0.33],
    marker: [16.2, 3.0, 6.2],
    extra: 'FORRO RIPADO',
    text: 'Treze metros de estar sob um forro ripado de madeira. Toda a fachada norte corre e desaparece, e a sala vira varanda. A parede de pedra a leste ancora o conjunto.',
    finishes: ['Forro ripado em cumaru', 'Parede em pedra moledo', 'Piso em travertino', 'Esquadrias de correr em alumínio grafite'],
  },
  {
    id: 'cozinha',
    index: 3,
    title: 'COZINHA E JANTAR',
    room: 'jantar',
    reveal: [rv(['jantar'], 0.352, 0.378), rv(['cozinha'], 0.356, 0.384), rv(['adega'], 0.36, 0.39)],
    dwell: [0.365, 0.395],
    marker: [5.0, 3.0, 7.6],
    extra: 'MESA PARA 10',
    text: 'Cozinha aberta com ilha de 3,60 m e mesa para dez. A adega envidraçada fica à vista do jantar, e a porta de correr leva direto ao pergolado gourmet.',
    finishes: ['Ilha em quartzito', 'Marcenaria em freijó', 'Adega climatizada', 'Pendentes em latão'],
  },
  {
    id: 'varanda',
    index: 4,
    title: 'A VARANDA',
    room: 'varanda',
    reveal: [rv(['varanda'], 0.425, 0.45), rv(['pergolado'], 0.43, 0.455)],
    dwell: [0.435, 0.465],
    marker: [19.5, 2.9, 1.0],
    extra: 'COBERTA',
    text: 'Dezenove metros de varanda coberta, com sofás, rede e o pergolado gourmet ao lado. É o lugar onde a casa passa a maior parte do dia.',
    finishes: ['Forro ripado contínuo', 'Piso em travertino', 'Pergolado em madeira', 'Churrasqueira e bancada em pedra'],
  },
  {
    id: 'piscina',
    index: 5,
    title: 'A PISCINA',
    room: 'piscina',
    reveal: [rv(['deck'], 0.482, 0.505), rv(['piscina'], 0.488, 0.515)],
    dwell: [0.495, 0.53],
    marker: [16, 2.6, -8.2],
    extra: 'PRAINHA E CASCATA',
    text: 'Doze metros de piscina com prainha rasa ao longo do deck e um muro de pedra de onde cai a cascata. Ao fim da tarde, o sol se põe do outro lado da água.',
    finishes: ['Revestimento em pastilha verde-água', 'Borda em travertino', 'Muro-cascata em pedra', 'Iluminação subaquática'],
  },
  {
    id: 'suite',
    index: 6,
    title: 'A SUÍTE',
    room: 'suite',
    // closet e banho revelam com a porta ainda fechada: o ambiente é escolhido por fragmento (pelo mapa de zonas),
    // então revelar enquanto a folha gira deixava a porta metade desenho, metade madeira, com bordas laranja no vão
    reveal: [rv(['suite'], 0.58, 0.605), rv(['closet'], 0.6, 0.613), rv(['banho'], 0.645, 0.655)],
    dwell: [0.592, 0.7],
    marker: [29.6, 2.6, 4.6],
    extra: 'COM CLOSET E BANHO',
    text: 'A suíte abre para o deck e para um jardim murado só seu. Uma porta de freijó leva ao closet, com janela para o jardim, e outra ao banho, com a banheira solta de frente para o vidro e ducha ao ar livre.',
    finishes: ['Piso em madeira', 'Cabeceira em painel ripado', 'Portas de giro em freijó', 'Banho em pedra e cerâmica', 'Ducha externa no jardim'],
  },
  {
    id: 'lounge',
    index: 7,
    title: 'O LOUNGE DO FOGO',
    room: 'lounge',
    // o jardim da suíte já aparece revelado pelo vidro do banho
    reveal: [rv(['jardimSuite'], 0.676, 0.698), rv(['lounge'], 0.755, 0.782)],
    dwell: [0.775, 0.81],
    marker: [29, 1.6, -7.4],
    extra: 'REBAIXADO 0,45 M',
    text: 'Um lounge rebaixado ao redor do fogo, com banco em U e vista para a piscina iluminada. É aqui que a noite começa.',
    finishes: ['Banco em concreto com almofadas', 'Fire pit em aço', 'Piso em pedra', 'Paisagismo tropical'],
  },
];

/** Portas que abrem quando a câmera chega (id da abertura em `house.openings` → intervalo de t). */
export const doorKeys: { id: string; t: [number, number] }[] = [
  { id: 'suite-closet', t: [0.615, 0.631] },
  { id: 'closet-banho', t: [0.657, 0.672] },
];

/**
 * Revelação final (o que ainda está em desenho), em onda, enquanto a câmera está no lounge olhando para a piscina.
 * Esses ambientes ficam atrás da câmera: na subida para a vista aérea já está tudo pronto
 * (antes, os quartos ainda viravam render, com as bordas laranja, no meio da subida).
 */
export const finaleWave = {
  zones: ['circulacao', 'servico', 'garagem', 'quartos'] as ZoneName[],
  t0: 0.783,
  t1: 0.807,
};

/**
 * Fim do percurso: o papel desenrola e tudo volta ao desenho.
 * O papel é um "print" do desenho com a câmera da vista aérea (igual à de `roll[1]`), então cobre a casa no mesmo lugar.
 * `back` (volta ao desenho) tem de acabar antes de `roll` chegar a 1: com o papel já fora da tela,
 * um quadro no meio da volta mostrava blocos revelados (com a borda laranja) piscando sobre a planta.
 * O papel cobre a tela inteira a partir de ~91% do intervalo de `roll` em 16:9 (~93% em 21:9): a troca da
 * câmera e a volta ao desenho acontecem por baixo dele.
 */
export const finale = {
  aerialLabels: [0.872, 0.898] as [number, number],
  roll: [0.898, 0.95] as [number, number],
  back: [0.947, 0.95] as [number, number],
  cta: [0.96, 0.99] as [number, number],
};

/** Sol ao longo do percurso (azimute, elevação): fim de tarde, por volta das 17 h, do começo ao fim. */
export const sunKeys: { t: number; az: number; el: number }[] = [
  // direção artística: sudoeste na chegada (luz na fachada sul) e noroeste dentro de casa
  // (sol entrando pelos panos de vidro do norte). Na piscina e no lounge a câmera olha para oeste:
  // lá o sol vem de sudoeste, de lado (de frente, às 17 h, estoura a imagem)
  { t: 0.0, az: 225, el: 24 },
  { t: 0.125, az: 225, el: 24 },
  { t: 0.205, az: 245, el: 22 },
  { t: 0.3, az: 288, el: 20 },
  { t: 0.365, az: 292, el: 18 },
  { t: 0.435, az: 296, el: 17 },
  { t: 0.495, az: 238, el: 16 },
  { t: 0.592, az: 290, el: 16 },
  { t: 0.675, az: 288, el: 16 },
  { t: 0.775, az: 222, el: 15 },
  { t: 0.87, az: 235, el: 20 },
  { t: 1.0, az: 235, el: 20 },
];
