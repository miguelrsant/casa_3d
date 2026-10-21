import { Vector3 } from 'three';
import { ZONES, zoneIndex } from '../data/schema';
import { cameraKeys, finale, finaleWave, stops, sunKeys, type Key } from './stops';

export interface HeroPose {
  pos: Vector3;
  target: Vector3;
  fov: number;
}

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
const easeIn = (u: number) => u * u;
const easeOut = (u: number) => 1 - (1 - u) * (1 - u);

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();

function keyPos(k: Key, hero: HeroPose, out: Vector3) {
  return k.hero ? out.copy(hero.pos) : out.set(...k.pos);
}
function keyTarget(k: Key, hero: HeroPose, out: Vector3) {
  return k.hero ? out.copy(hero.target) : out.set(...k.target);
}
function keyFov(k: Key, hero: HeroPose, prev: number) {
  return k.hero ? hero.fov : (k.fov ?? prev);
}

/** Catmull-Rom centrípeta entre p1 e p2. */
function catmull(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, u: number, out: Vector3) {
  const alpha = 0.5;
  const t01 = Math.pow(p0.distanceTo(p1) + 1e-4, alpha);
  const t12 = Math.pow(p1.distanceTo(p2) + 1e-4, alpha);
  const t23 = Math.pow(p2.distanceTo(p3) + 1e-4, alpha);
  const m1 = new Vector3()
    .subVectors(p2, p1)
    .add(new Vector3().subVectors(p1, p0).multiplyScalar(t12 / t01))
    .sub(new Vector3().subVectors(p2, p0).multiplyScalar(t12 / (t01 + t12)));
  const m2 = new Vector3()
    .subVectors(p2, p1)
    .add(new Vector3().subVectors(p3, p2).multiplyScalar(t12 / t23))
    .sub(new Vector3().subVectors(p3, p1).multiplyScalar(t12 / (t12 + t23)));
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return out
    .copy(p1)
    .multiplyScalar(h00)
    .addScaledVector(m1, h10)
    .addScaledVector(p2, h01)
    .addScaledVector(m2, h11);
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
    } as SceneState);
  t = clamp01(t);
  s.t = t;

  // --- câmera ---
  const K = cameraKeys;
  let i = 0;
  while (i < K.length - 2 && t > K[i + 1].t) i++;
  const k1 = K[i];
  const k2 = K[i + 1];
  const k0 = K[Math.max(0, i - 1)];
  const k3 = K[Math.min(K.length - 1, i + 2)];
  let u = clamp01((t - k1.t) / Math.max(1e-6, k2.t - k1.t));
  const h1 = k1.ease === 'hold';
  const h2 = k2.ease === 'hold';
  u = h1 && h2 ? easeInOut(u) : h1 ? easeIn(u) : h2 ? easeOut(u) : u;

  keyPos(k0, hero, _a);
  keyPos(k1, hero, _b);
  keyPos(k2, hero, _c);
  keyPos(k3, hero, _d);
  catmull(h1 ? _b : _a, _b, _c, h2 ? _c : _d, u, s.pos);
  keyTarget(k0, hero, _a);
  keyTarget(k1, hero, _b);
  keyTarget(k2, hero, _c);
  keyTarget(k3, hero, _d);
  catmull(h1 ? _b : _a, _b, _c, h2 ? _c : _d, u, s.target);

  if (!fovs.length) {
    let prev = 50;
    for (const k of K) {
      if (!k.hero) prev = keyFov(k, hero, prev);
      fovs.push(prev);
    }
  }
  const f1 = k1.hero ? hero.fov : fovs[i];
  const f2 = k2.hero ? hero.fov : fovs[i + 1];
  s.fov = f1 + (f2 - f1) * u;
  s.hero = (k1.hero ? 1 - u : 0) + (k2.hero ? u : 0);
  if (k1.hero && k2.hero) s.hero = 1;

  // "cima" da câmera: norte (−z) quando olha para baixo, y no resto
  const dir = _a.subVectors(s.target, s.pos).normalize();
  const down = smooth(0.86, 0.995, -dir.y);
  s.up.set(0, 1 - down, -down).normalize();

  // --- extrusão, céu, sol ---
  s.extrude = 0.012 + 0.988 * smooth(0.036, 0.104, t) * (1 - smooth(0.952, 0.956, t));
  s.sky = smooth(0.136, 0.152, t) * (1 - smooth(0.952, 0.956, t));
  let j = 0;
  while (j < sunKeys.length - 2 && t > sunKeys[j + 1].t) j++;
  const a = sunKeys[j];
  const b = sunKeys[j + 1];
  const su = easeInOut(clamp01((t - a.t) / (b.t - a.t)));
  s.sunAz = a.az + (b.az - a.az) * su;
  s.sunEl = a.el + (b.el - a.el) * su;
  s.night = smooth(4, -2.5, s.sunEl);
  s.exposure = 1 + 1.25 * s.night;
  s.pivot = smooth(0.128, 0.146, t);

  // --- revelação ---
  s.reveal.fill(0);
  for (const st of stops) for (const r of st.reveal) for (const z of r.zones) s.reveal[zoneIndex(z)] = smooth(r.t0, r.t1, t);
  finaleWave.zones.forEach((z, n) => {
    const d = (finaleWave.t1 - finaleWave.t0) * 0.5;
    const t0 = finaleWave.t0 + (n / finaleWave.zones.length) * d;
    s.reveal[zoneIndex(z)] = Math.max(s.reveal[zoneIndex(z)], smooth(t0, t0 + d, t));
  });
  // depois do papel, tudo volta a ser desenho
  const back = 1 - smooth(0.952, 0.956, t);
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

  s.hudLight = (t > 0.585 && t < 0.66) || (t > 0.705 && t < 0.905);
  s.heroText = 1 - smooth(0.004, 0.03, t);
  s.cta = smooth(finale.cta[0], finale.cta[1], t);
  s.roll = smooth(finale.roll[0], finale.roll[1], t);
  s.aerialLabels = smooth(finale.aerialLabels[0], finale.aerialLabels[0] + 0.012, t) * (1 - smooth(finale.roll[0], finale.roll[0] + 0.01, t));
  return s;
}

/** Índice da parada "ativa" para o contador (0 = antes da primeira). */
export function counterAt(t: number): number {
  let c = 0;
  for (const st of stops) if (st.index > 0 && t >= st.dwell[0] - 0.01) c = st.index;
  return c;
}
