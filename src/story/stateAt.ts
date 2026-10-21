import { Vector3 } from 'three';
import { ZONES, zoneIndex, type CameraKey } from '../data/schema';
import { cameraKeys, doorKeys, finale, finaleWave, stops, sunKeys, type Key } from './stops';

export interface Pose {
  pos: Vector3;
  target: Vector3;
  fov: number;
}

/** Enquadramento do hero (slot da planta) e, opcionalmente, a vista aérea do lote inteiro (tela cheia). */
export interface HeroPose extends Pose {
  aerial?: Pose;
}

/** Vista aérea padrão (quando o app não calculou uma para a tela atual). */
const AERIAL_FALLBACK: Pose = { pos: new Vector3(18, 170, 16), target: new Vector3(18, 0, 16), fov: 30 };

export interface SceneState {
  t: number;
  pos: Vector3;
  target: Vector3;
  up: Vector3;
  fov: number;
  /** 1 = enquadramento do hero (slot da planta), 0 = tela cheia. */
  hero: number;
  extrude: number;
  reveal: Float32Array;
  sky: number;
  sunAz: number;
  sunEl: number;
  night: number;
  exposure: number;
  pivot: number;
  /** Abertura de cada porta de `doorKeys` (0 = fechada, 1 = aberta), na mesma ordem. */
  doors: number[];
  /** Parada atual (índice em `stops`) e visibilidade do callout (0–1). */
  stop: number;
  callout: number;
  heroText: number;
  cta: number;
  roll: number;
  aerialLabels: number;
  /** Anotações externas (cotas/eixos) já apagadas. */
  siteFade: number;
  /** HUD em texto claro (cenas escuras). */
  hudLight: boolean;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOut = (u: number) => u * u * (3 - 2 * u);

const _a = new Vector3();
const _v = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3()];

type Channel = (n: number, out: Vector3) => Vector3;

function keyPose(k: Key, hero: HeroPose): Pose | null {
  if (k.hero) return hero;
  if (k.aerial) return hero.aerial ?? AERIAL_FALLBACK;
  return null;
}
function keyVec(k: Key, hero: HeroPose, which: 'pos' | 'target', out: Vector3) {
  const p = keyPose(k, hero);
  return p ? out.copy(p[which]) : out.set(...(k as CameraKey)[which]);
}

/**
 * A altura é interpolada em escala logarítmica: descer de 250 m para 50 m tem a mesma
 * "velocidade de zoom" do começo ao fim (em metros, a descida parecia parada e depois despencava).
 */
const LOG_Y = 4;

/**
 * Derivada em t de um canal numa chave intermediária: parábola pelos três pontos,
 * limitada como numa cúbica monótona (sem passar da chave nem voltar para trás).
 */
function slope(a: number, b: number, c: number, d0: number, d1: number) {
  const s0 = (b - a) / d0;
  const s1 = (c - b) / d1;
  if (s0 * s1 <= 0) return 0;
  const m = (s0 * d1 + s1 * d0) / (d0 + d1);
  const lim = 3 * Math.min(Math.abs(s0), Math.abs(s1));
  return Math.sign(m) * Math.min(Math.abs(m), lim);
}

/** Velocidade da chave i (por unidade de t): zero nas paradas ("hold") e nas pontas. */
function keyVelocity(i: number, ch: Channel, out: Vector3) {
  const K = cameraKeys;
  if (i <= 0 || i >= K.length - 1 || K[i].ease === 'hold') return out.set(0, 0, 0);
  const d0 = K[i].t - K[i - 1].t;
  const d1 = K[i + 1].t - K[i].t;
  const a = ch(i - 1, _v[2]);
  const b = ch(i, _v[3]);
  const c = ch(i + 1, _v[4]);
  return out.set(slope(a.x, b.x, c.x, d0, d1), slope(a.y, b.y, c.y, d0, d1), slope(a.z, b.z, c.z, d0, d1));
}

/** Hermite cúbica entre as chaves i e i+1 com velocidade contínua em t: sem solavanco ao passar pelas chaves. */
function hermite(i: number, u: number, ch: Channel, out: Vector3) {
  const dt = cameraKeys[i + 1].t - cameraKeys[i].t;
  const v1 = keyVelocity(i, ch, _v[0]).multiplyScalar(dt);
  const v2 = keyVelocity(i + 1, ch, _v[1]).multiplyScalar(dt);
  const u2 = u * u;
  const u3 = u2 * u;
  out.copy(ch(i, _v[2])).multiplyScalar(2 * u3 - 3 * u2 + 1);
  out.addScaledVector(ch(i + 1, _v[2]), -2 * u3 + 3 * u2);
  return out.addScaledVector(v1, u3 - 2 * u2 + u).addScaledVector(v2, u3 - u2);
}

const fovs: number[] = [];

/** Estado da cena para uma posição `t` do scroll. Função pura (exceto pelos objetos de saída). */
export function stateAt(t: number, hero: HeroPose, out?: SceneState): SceneState {
  const s: SceneState =
    out ??
    ({
      pos: new Vector3(),
      target: new Vector3(),
      up: new Vector3(),
      reveal: new Float32Array(32),
      doors: [] as number[],
    } as SceneState);
  t = clamp01(t);
  s.t = t;

  // --- câmera ---
  const K = cameraKeys;
  let i = 0;
  while (i < K.length - 2 && t > K[i + 1].t) i++;
  const u = clamp01((t - K[i].t) / Math.max(1e-6, K[i + 1].t - K[i].t));
  if (!fovs.length) {
    let prev = 50;
    for (const k of K) {
      if (!k.hero && !k.aerial) prev = k.fov ?? prev;
      fovs.push(prev);
    }
  }
  const posCh: Channel = (n, o) => {
    keyVec(K[n], hero, 'pos', o);
    return o.setY(Math.log(o.y + LOG_Y));
  };
  const tgtCh: Channel = (n, o) => keyVec(K[n], hero, 'target', o);
  const fovCh: Channel = (n, o) => o.set(keyPose(K[n], hero)?.fov ?? fovs[n], 0, 0);
  hermite(i, u, posCh, s.pos);
  s.pos.setY(Math.exp(s.pos.y) - LOG_Y);
  hermite(i, u, tgtCh, s.target);
  s.fov = hermite(i, u, fovCh, _a).x;
  // enquadramento do hero ↔ tela cheia: sempre com entrada e saída suaves
  const e = easeInOut(u);
  s.hero = (K[i].hero ? 1 - e : 0) + (K[i + 1].hero ? e : 0);

  // "cima" da câmera: norte (−z) quando olha para baixo, y no resto
  const dir = _a.subVectors(s.target, s.pos).normalize();
  const down = smooth(0.86, 0.995, -dir.y);
  s.up.set(0, 1 - down, -down).normalize();

  // --- extrusão, céu, sol ---
  s.extrude = 0.012 + 0.988 * smooth(0.036, 0.104, t) * (1 - smooth(finale.back[0], finale.back[1], t));
  s.sky = smooth(0.136, 0.152, t) * (1 - smooth(finale.back[0], finale.back[1], t));
  let j = 0;
  while (j < sunKeys.length - 2 && t > sunKeys[j + 1].t) j++;
  const a = sunKeys[j];
  const b = sunKeys[j + 1];
  const su = easeInOut(clamp01((t - a.t) / (b.t - a.t)));
  s.sunAz = a.az + (b.az - a.az) * su;
  s.sunEl = a.el + (b.el - a.el) * su;
  s.night = smooth(4, -2.5, s.sunEl);
  s.exposure = 1.15 + 1.25 * s.night;
  s.pivot = smooth(0.128, 0.146, t);
  for (let n = 0; n < doorKeys.length; n++) s.doors[n] = smooth(doorKeys[n].t[0], doorKeys[n].t[1], t);

  // --- revelação ---
  s.reveal.fill(0);
  for (const st of stops) for (const r of st.reveal) for (const z of r.zones) s.reveal[zoneIndex(z)] = smooth(r.t0, r.t1, t);
  finaleWave.zones.forEach((z, n) => {
    const d = (finaleWave.t1 - finaleWave.t0) * 0.5;
    const t0 = finaleWave.t0 + (n / finaleWave.zones.length) * d;
    s.reveal[zoneIndex(z)] = Math.max(s.reveal[zoneIndex(z)], smooth(t0, t0 + d, t));
  });
  // depois do papel, tudo volta a ser desenho
  const back = 1 - smooth(finale.back[0], finale.back[1], t);
  for (let z = 0; z < ZONES.length; z++) s.reveal[z] *= back;
  s.siteFade = s.reveal[zoneIndex('site')];

  // --- parada e callout ---
  s.stop = -1;
  s.callout = 0;
  for (let n = 0; n < stops.length; n++) {
    const st = stops[n];
    const [d0, d1] = st.dwell;
    if (t >= d0 - 0.02 && t <= d1 + 0.012) {
      s.stop = n;
      s.callout = st.index > 0 ? smooth(d0 - 0.004, d0 + 0.012, t) * (1 - smooth(d1 - 0.004, d1 + 0.008, t)) : 0;
    }
  }

  s.heroText = 1 - smooth(0.004, 0.03, t);
  s.cta = smooth(finale.cta[0], finale.cta[1], t);
  s.roll = smooth(finale.roll[0], finale.roll[1], t);
  s.aerialLabels = smooth(finale.aerialLabels[0], finale.aerialLabels[0] + 0.012, t) * (1 - smooth(finale.roll[0], finale.roll[0] + 0.01, t));
  // o percurso é de dia (fim de tarde): HUD escuro, exceto na vista aérea sobre a mata
  s.hudLight = s.night > 0.5 || s.aerialLabels > 0.3;
  return s;
}

/** Índice da parada "ativa" para o contador (0 = antes da primeira). */
export function counterAt(t: number): number {
  let c = 0;
  for (const st of stops) if (st.index > 0 && t >= st.dwell[0] - 0.01) c = st.index;
  return c;
}
